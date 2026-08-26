begin;

do $$
begin
  if to_regclass('app.members') is null or to_regclass('app_private.outbox_events') is null then
    raise exception 'M0 must be applied before M1' using errcode = '42P01';
  end if;
  if to_regclass('app.source_intakes') is not null then
    raise exception 'M1 editorial pipeline is already applied' using errcode = '42P07';
  end if;
end;
$$;

create type app.source_input_mode as enum ('url', 'text');
create type app.source_rights_basis as enum ('idea_commons', 'compatible_license', 'public_domain', 'explicit_permission', 'temporary_analysis');
create type app.source_fingerprint_status as enum ('submitted', 'verified');
create type app.source_text_retention_status as enum ('temporary', 'durable_verified');
create type app.generation_status as enum ('pending', 'running', 'terminal');
create type app.generation_terminal_state as enum ('candidate_ready', 'rejected_by_policy', 'needs_human_analysis', 'providers_exhausted', 'source_invalid');
create type app.attempt_outcome as enum ('success', 'invalid_response', 'timeout', 'policy_rejection', 'source_invalid');
create type app.candidate_status as enum ('draft', 'in_review', 'approved', 'rejected', 'published');
create type app.review_decision_type as enum ('approved', 'rejected');

create function app_private.source_excerpts_have_unique_ids(excerpts jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare excerpt_count bigint; distinct_id_count bigint;
begin
  if jsonb_typeof(excerpts) <> 'array' or jsonb_array_length(excerpts) = 0 then return false; end if;
  if exists(
    select 1 from jsonb_array_elements(excerpts) excerpt
    where coalesce(jsonb_typeof(excerpt), '') <> 'object'
      or coalesce(jsonb_typeof(excerpt->'id'), '') <> 'string'
      or nullif(trim(excerpt->>'id'), '') is null
  ) then return false; end if;
  select count(*), count(distinct excerpt->>'id')
  into excerpt_count, distinct_id_count
  from jsonb_array_elements(excerpts) excerpt;
  return excerpt_count = distinct_id_count;
end; $$;

create function app_private.publication_checklist_valid(checklist jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(checklist = '{"rights":true,"citations":true,"prudence":true}'::jsonb, false)
$$;

create table app.source_intakes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references app.members(id) on delete restrict,
  input_mode app.source_input_mode not null,
  title text not null check (length(trim(title)) between 1 and 240),
  source_url text check (source_url is null or length(trim(source_url)) between 1 and 2048),
  published_at timestamptz,
  accessed_at timestamptz not null,
  fingerprint_sha256 text not null check (fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  fingerprint_status app.source_fingerprint_status not null default 'submitted',
  verified_fingerprint_sha256 text check (verified_fingerprint_sha256 is null or verified_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  fingerprint_verified_at timestamptz,
  fingerprint_verification_method text,
  excerpts jsonb not null check (app_private.source_excerpts_have_unique_ids(excerpts)),
  rights_basis app.source_rights_basis not null,
  rights_note text,
  full_text text,
  full_text_delete_after timestamptz,
  full_text_retention_status app.source_text_retention_status not null default 'temporary',
  retention_verified_at timestamptz,
  retention_verified_by uuid references app.members(id) on delete restrict,
  retention_verification_note text,
  decided_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((input_mode = 'url' and source_url is not null) or input_mode = 'text'),
  check (rights_basis not in ('compatible_license', 'explicit_permission') or nullif(trim(rights_note), '') is not null),
  check (
    (
      fingerprint_status = 'submitted'
      and verified_fingerprint_sha256 is null
      and fingerprint_verified_at is null
      and fingerprint_verification_method is null
    )
    or (
      fingerprint_status = 'verified'
      and verified_fingerprint_sha256 is not null
      and fingerprint_verified_at is not null
      and fingerprint_verification_method = 'unicode_nfc_lf_trim_v1'
    )
  ),
  check (
    (
      full_text is null
      and full_text_delete_after is null
      and full_text_retention_status = 'temporary'
      and retention_verified_at is null
      and retention_verified_by is null
      and retention_verification_note is null
    )
    or (
      full_text is not null
      and full_text_retention_status = 'temporary'
      and full_text_delete_after is not null
      and retention_verified_at is null
      and retention_verified_by is null
      and retention_verification_note is null
    )
    or (
      full_text is not null
      and rights_basis <> 'temporary_analysis'
      and full_text_retention_status = 'durable_verified'
      and full_text_delete_after is null
      and retention_verified_at is not null
      and retention_verified_by is not null
      and nullif(trim(retention_verification_note), '') is not null
    )
  )
);

create table app.prompt_skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 180),
  created_at timestamptz not null default now()
);

create table app.prompt_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references app.prompt_skills(id) on delete restrict,
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  input_schema jsonb not null check (jsonb_typeof(input_schema) = 'object'),
  output_schema jsonb not null check (jsonb_typeof(output_schema) = 'object'),
  instructions text not null check (length(trim(instructions)) > 0),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (skill_id, version)
);

create table app.ai_generations (
  id uuid primary key default gen_random_uuid(),
  source_intake_id uuid not null references app.source_intakes(id) on delete restrict,
  skill_version_id uuid not null references app.prompt_skill_versions(id) on delete restrict,
  requested_by uuid not null references app.members(id) on delete restrict,
  source_revision bigint not null check (source_revision > 0),
  status app.generation_status not null default 'pending',
  terminal_state app.generation_terminal_state,
  controls jsonb not null default '{}'::jsonb check (jsonb_typeof(controls) = 'object'),
  input_fingerprint_sha256 text not null check (input_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'terminal') = (terminal_state is not null and completed_at is not null))
);

create table app.ai_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references app.ai_generations(id) on delete cascade,
  attempt_rank smallint not null check (attempt_rank between 1 and 3),
  route_key text not null check (length(trim(route_key)) > 0),
  outcome app.attempt_outcome not null,
  fallback_reason text,
  response_fingerprint_sha256 text check (response_fingerprint_sha256 is null or response_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  quota_units integer not null default 0 check (quota_units >= 0),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  unique (generation_id, attempt_rank)
);

create table app.editorial_candidates (
  id uuid primary key default gen_random_uuid(),
  source_intake_id uuid not null references app.source_intakes(id) on delete restrict,
  generation_id uuid references app.ai_generations(id) on delete restrict,
  created_by uuid not null references app.members(id) on delete restrict,
  status app.candidate_status not null default 'draft',
  proposed_slug text check (proposed_slug is null or proposed_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  current_revision bigint not null default 1 check (current_revision > 0),
  published_idea_version_id uuid unique references app.idea_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_idea_version_id is not null))
);

create table app.candidate_revisions (
  candidate_id uuid not null references app.editorial_candidates(id) on delete cascade,
  revision bigint not null check (revision > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  changed_by uuid not null references app.members(id) on delete restrict,
  change_summary text not null check (length(trim(change_summary)) > 0),
  schema_valid boolean not null,
  citations_valid boolean not null,
  prudence_valid boolean not null,
  created_at timestamptz not null default now(),
  primary key (candidate_id, revision)
);

create table app.review_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references app.editorial_candidates(id) on delete restrict,
  candidate_revision bigint not null,
  reviewer_id uuid not null references app.members(id) on delete restrict,
  decision app.review_decision_type not null,
  reason text not null check (length(trim(reason)) > 0),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  self_approval boolean not null,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, candidate_revision) references app.candidate_revisions(candidate_id, revision) on delete restrict,
  unique (candidate_id, candidate_revision),
  check (decision <> 'approved' or app_private.publication_checklist_valid(checklist))
);

create table app_private.command_receipts (
  actor_member_id uuid not null references app.members(id) on delete restrict,
  command_name text not null check (length(trim(command_name)) > 0),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
  request_fingerprint_sha256 text not null check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (actor_member_id, command_name, idempotency_key)
);

create index source_intakes_created_by_idx on app.source_intakes(created_by, created_at desc);
create index source_intakes_retention_idx on app.source_intakes(full_text_delete_after) where full_text is not null;
create index source_intakes_retention_verified_by_idx on app.source_intakes(retention_verified_by);
create index prompt_skill_versions_skill_idx on app.prompt_skill_versions(skill_id, published_at desc);
create index ai_generations_source_idx on app.ai_generations(source_intake_id, created_at desc);
create index ai_generations_requested_by_idx on app.ai_generations(requested_by);
create index ai_generations_skill_version_idx on app.ai_generations(skill_version_id);
create index ai_generation_attempts_generation_idx on app.ai_generation_attempts(generation_id, attempt_rank);
create index editorial_candidates_source_idx on app.editorial_candidates(source_intake_id, created_at desc);
create index editorial_candidates_generation_idx on app.editorial_candidates(generation_id);
create index editorial_candidates_created_by_idx on app.editorial_candidates(created_by);
create index candidate_revisions_changed_by_idx on app.candidate_revisions(changed_by);
create index review_decisions_candidate_idx on app.review_decisions(candidate_id, candidate_revision);
create index review_decisions_reviewer_idx on app.review_decisions(reviewer_id);
create index command_receipts_resource_idx on app_private.command_receipts(resource_id);

create function app.has_global_role(required_role app.global_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from app.member_role_assignments where member_id = app.current_member_id() and role = required_role)
$$;

create function app.can_contribute()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_global_role('contributor') or app.has_global_role('admin')
$$;

create function app.can_review()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_global_role('reviewer') or app.has_global_role('admin')
$$;

create function app_private.initialize_source_retention()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.full_text is null then
    new.full_text_delete_after := null;
    new.full_text_retention_status := 'temporary';
    new.retention_verified_at := null;
    new.retention_verified_by := null;
    new.retention_verification_note := null;
  elsif new.full_text_retention_status = 'temporary' and new.full_text_delete_after is null then
    new.full_text_delete_after := statement_timestamp() + interval '7 days';
  end if;
  return new;
end; $$;

create function app_private.protect_source_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.fingerprint_sha256 is distinct from old.fingerprint_sha256
     or new.excerpts is distinct from old.excerpts then
    raise exception 'submitted source fingerprint and excerpts are immutable' using errcode = '55000';
  end if;
  if old.fingerprint_status = 'verified' and row(
       new.fingerprint_status,
       new.verified_fingerprint_sha256,
       new.fingerprint_verified_at,
       new.fingerprint_verification_method
     ) is distinct from row(
       old.fingerprint_status,
       old.verified_fingerprint_sha256,
       old.fingerprint_verified_at,
       old.fingerprint_verification_method
     ) then
    raise exception 'verified source fingerprint is immutable' using errcode = '55000';
  end if;
  if old.fingerprint_status = 'submitted' and new.fingerprint_status = 'verified' then
    if app.current_member_id() is not null then
      raise exception 'only a trusted server component may verify a source fingerprint' using errcode = '42501';
    end if;
  elsif row(
       new.fingerprint_status,
       new.verified_fingerprint_sha256,
       new.fingerprint_verified_at,
       new.fingerprint_verification_method
     ) is distinct from row(
       old.fingerprint_status,
       old.verified_fingerprint_sha256,
       old.fingerprint_verified_at,
       old.fingerprint_verification_method
     ) then
    raise exception 'invalid source fingerprint verification transition' using errcode = '55000';
  end if;
  return new;
end; $$;

create function app.record_verified_source_fingerprint(target_source_intake_id uuid, expected_revision bigint, derived_fingerprint_sha256 text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if app.current_member_id() is not null then
    raise exception 'server-only fingerprint verification command' using errcode = '42501';
  end if;
  if derived_fingerprint_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid verified source fingerprint' using errcode = '23514';
  end if;
  update app.source_intakes
  set fingerprint_status = 'verified',
      verified_fingerprint_sha256 = derived_fingerprint_sha256,
      fingerprint_verified_at = statement_timestamp(),
      fingerprint_verification_method = 'unicode_nfc_lf_trim_v1',
      revision = revision + 1,
      updated_at = statement_timestamp()
  where id = target_source_intake_id
    and revision = expected_revision
    and fingerprint_status = 'submitted'
  returning revision into next_revision;
  if not found then raise exception 'source not found, already verified, or revision conflict' using errcode = '40001'; end if;
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata)
  values(null,'source_intake.fingerprint_verified','source_intake',target_source_intake_id,'{}'::jsonb);
  return next_revision;
end; $$;

create function app.verify_source_retention_rights(target_source_intake_id uuid, expected_revision bigint, verification_note text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor uuid := app.current_member_id(); next_revision bigint;
begin
  if actor is null or not app.can_review() then
    raise exception 'reviewer capability required' using errcode = '42501';
  end if;
  if nullif(trim(verification_note), '') is null then
    raise exception 'retention verification evidence required' using errcode = '23514';
  end if;
  update app.source_intakes
  set full_text_retention_status = 'durable_verified',
      full_text_delete_after = null,
      retention_verified_at = statement_timestamp(),
      retention_verified_by = actor,
      retention_verification_note = verification_note,
      revision = revision + 1,
      updated_at = statement_timestamp()
  where id = target_source_intake_id
    and revision = expected_revision
    and full_text is not null
    and full_text_retention_status = 'temporary'
    and rights_basis <> 'temporary_analysis'
  returning revision into next_revision;
  if not found then raise exception 'source not eligible for durable retention or revision conflict' using errcode = '40001'; end if;
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata)
  values(actor,'source_intake.retention_verified','source_intake',target_source_intake_id,jsonb_build_object('rights_basis',(select rights_basis from app.source_intakes where id=target_source_intake_id)));
  return next_revision;
end; $$;

create function app.create_source_intake(
  input_mode app.source_input_mode, title text, source_url text, published_at timestamptz,
  accessed_at timestamptz, fingerprint_sha256 text, excerpts jsonb,
  rights_basis app.source_rights_basis, rights_note text, full_text text,
  idempotency_key text, request_fingerprint_sha256 text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := app.current_member_id(); existing app_private.command_receipts%rowtype; result_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not app.can_contribute() then raise exception 'contributor capability required' using errcode='42501'; end if;
  select * into existing from app_private.command_receipts r where r.actor_member_id=actor and r.command_name='create_source_intake' and r.idempotency_key=create_source_intake.idempotency_key;
  if found then
    if existing.request_fingerprint_sha256 <> request_fingerprint_sha256 then raise exception 'idempotency key conflict' using errcode='23505'; end if;
    return existing.resource_id;
  end if;
  insert into app.source_intakes(created_by,input_mode,title,source_url,published_at,accessed_at,fingerprint_sha256,excerpts,rights_basis,rights_note,full_text)
  values(actor,input_mode,title,source_url,published_at,accessed_at,fingerprint_sha256,excerpts,rights_basis,rights_note,full_text) returning id into result_id;
  insert into app_private.command_receipts values(actor,'create_source_intake',idempotency_key,request_fingerprint_sha256,result_id,now());
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata) values(actor,'source_intake.created','source_intake',result_id,jsonb_build_object('input_mode',input_mode,'rights_basis',rights_basis,'has_temporary_text',full_text is not null));
  return result_id;
end; $$;

create function app.start_candidate_generation(target_source_intake_id uuid, target_skill_version_id uuid, expected_source_revision bigint, idempotency_key text, request_fingerprint_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=app.current_member_id(); existing app_private.command_receipts%rowtype; result_id uuid; source_fingerprint text;
begin
  if actor is null or not app.can_contribute() then raise exception 'contributor capability required' using errcode='42501'; end if;
  select fingerprint_sha256 into source_fingerprint from app.source_intakes where id=target_source_intake_id and created_by=actor and revision=expected_source_revision;
  if not found then raise exception 'source not found or revision conflict' using errcode='40001'; end if;
  if not exists(select 1 from app.prompt_skill_versions where id=target_skill_version_id) then raise exception 'skill version not found' using errcode='23503'; end if;
  select * into existing from app_private.command_receipts r where r.actor_member_id=actor and r.command_name='start_candidate_generation' and r.idempotency_key=start_candidate_generation.idempotency_key;
  if found then
    if existing.request_fingerprint_sha256<>request_fingerprint_sha256 then raise exception 'idempotency key conflict' using errcode='23505'; end if; return existing.resource_id;
  end if;
  insert into app.ai_generations(source_intake_id,skill_version_id,requested_by,source_revision,input_fingerprint_sha256) values(target_source_intake_id,target_skill_version_id,actor,expected_source_revision,source_fingerprint) returning id into result_id;
  insert into app_private.command_receipts values(actor,'start_candidate_generation',idempotency_key,request_fingerprint_sha256,result_id,now());
  insert into app_private.outbox_events(topic,aggregate_type,aggregate_id,payload,idempotency_key) values('editorial.generation.requested','ai_generation',result_id,jsonb_build_object('generation_id',result_id,'skill_version_id',target_skill_version_id),'generation:'||result_id::text);
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata) values(actor,'generation.requested','ai_generation',result_id,jsonb_build_object('skill_version_id',target_skill_version_id,'source_revision',expected_source_revision));
  return result_id;
end; $$;

create function app.update_candidate_draft(target_candidate_id uuid, expected_revision bigint, content jsonb, change_summary text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor uuid:=app.current_member_id(); next_revision bigint;
begin
  if actor is null or not app.can_contribute() then raise exception 'contributor capability required' using errcode='42501'; end if;
  update app.editorial_candidates set current_revision=current_revision+1,updated_at=now()
  where id=target_candidate_id and created_by=actor and current_revision=expected_revision and status in ('draft','in_review') returning current_revision into next_revision;
  if not found then raise exception 'candidate not found or revision conflict' using errcode='40001'; end if;
  insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
  values(target_candidate_id,next_revision,content,actor,change_summary,true,app_private.candidate_citations_valid(content),true);
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata) values(actor,'candidate.revised','editorial_candidate',target_candidate_id,jsonb_build_object('revision',next_revision));
  return next_revision;
end; $$;

create function app_private.candidate_citations_valid(content jsonb)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(content->'claims')='array' and not exists(
    select 1 from jsonb_array_elements(content->'claims') claim
    where claim->>'type'='fact' and (jsonb_typeof(claim->'citationExcerptIds')<>'array' or jsonb_array_length(claim->'citationExcerptIds')=0)
  )
$$;

create function app_private.candidate_schema_valid(content jsonb)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(content)='object'
    and content ?& array['title','oneLineSummary','problemStatement','targetAudiences','proposedApproach','mvpScope','initialExclusions','coreAssumptions','validationQuestions','risks','claims']
    and nullif(trim(content->>'title'),'') is not null
    and nullif(trim(content->>'oneLineSummary'),'') is not null
    and nullif(trim(content->>'problemStatement'),'') is not null
    and nullif(trim(content->>'proposedApproach'),'') is not null
    and jsonb_typeof(content->'targetAudiences')='array'
    and jsonb_array_length(content->'targetAudiences')>0
    and jsonb_typeof(content->'mvpScope')='array'
    and jsonb_array_length(content->'mvpScope')>0
    and jsonb_typeof(content->'initialExclusions')='array'
    and jsonb_array_length(content->'initialExclusions')>0
    and jsonb_typeof(content->'coreAssumptions')='array'
    and jsonb_array_length(content->'coreAssumptions')>0
    and jsonb_typeof(content->'validationQuestions')='array'
    and jsonb_array_length(content->'validationQuestions')>0
    and jsonb_typeof(content->'risks')='array'
    and jsonb_array_length(content->'risks')>0
    and jsonb_typeof(content->'claims')='array'
    and jsonb_array_length(content->'claims')>0
    and not exists(
      select 1 from jsonb_array_elements(content->'claims') claim
      where jsonb_typeof(claim)<>'object'
        or nullif(trim(claim->>'type'),'') is null
        or claim->>'type' not in ('fact','hypothesis','estimate','recommendation','validation_question')
        or nullif(trim(claim->>'statement'),'') is null
        or jsonb_typeof(claim->'citationExcerptIds')<>'array'
        or (claim->>'type' in ('estimate','recommendation') and nullif(trim(claim->>'rationale'),'') is null)
    )
$$;

create function app_private.protect_append_only()
returns trigger language plpgsql set search_path='' as $$ begin raise exception '% is append-only',tg_table_name using errcode='55000'; end; $$;

create function app_private.protect_published_slug()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.current_published_version_id is not null and new.slug is distinct from old.slug then
    raise exception 'published idea slug is immutable' using errcode='55000';
  end if;
  return new;
end; $$;

create function app_private.guard_candidate_revision()
returns trigger language plpgsql set search_path='' as $$
begin
  if not app_private.candidate_schema_valid(new.content) then raise exception 'candidate content does not match the canonical schema' using errcode='23514'; end if;
  if not app_private.candidate_citations_valid(new.content) then raise exception 'factual claims require citations' using errcode='23514'; end if;
  if not (new.schema_valid and new.citations_valid and new.prudence_valid) then raise exception 'candidate controls must all pass before revision storage' using errcode='23514'; end if;
  return new;
end; $$;

create function app.approve_and_publish_candidate(target_candidate_id uuid, expected_revision bigint, reason text, checklist jsonb, approved_slug text, content_license text, credit_name text, idempotency_key text, request_fingerprint_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=app.current_member_id(); owner uuid; intake app.source_intakes%rowtype; revision_content jsonb; existing app_private.command_receipts%rowtype; idea_id uuid:=gen_random_uuid(); version_id uuid; source_id uuid:=gen_random_uuid(); claim jsonb; claim_id uuid; excerpt_id text; excerpt_matches bigint; self_approval boolean; final_slug text:=approved_slug;
begin
  if actor is null or not app.can_review() then raise exception 'reviewer capability required' using errcode='42501'; end if;
  if approved_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid slug' using errcode='23514'; end if;
  if nullif(trim(content_license),'') is null or nullif(trim(credit_name),'') is null then raise exception 'license and credit required' using errcode='23514'; end if;
  if not app_private.publication_checklist_valid(checklist) then raise exception 'review checklist must contain exactly true rights, citations, and prudence confirmations' using errcode='23514'; end if;
  select * into existing from app_private.command_receipts r where r.actor_member_id=actor and r.command_name='approve_and_publish_candidate' and r.idempotency_key=approve_and_publish_candidate.idempotency_key;
  if found then if existing.request_fingerprint_sha256<>request_fingerprint_sha256 then raise exception 'idempotency key conflict' using errcode='23505'; end if; return existing.resource_id; end if;
  select c.created_by,r.content into owner,revision_content
  from app.editorial_candidates c
  join app.candidate_revisions r on r.candidate_id=c.id and r.revision=c.current_revision
  where c.id=target_candidate_id and c.current_revision=expected_revision and c.status in ('draft','in_review')
  for update of c;
  if not found then raise exception 'candidate not found or revision conflict' using errcode='40001'; end if;
  if not app_private.candidate_citations_valid(revision_content) then raise exception 'factual claims require citations' using errcode='23514'; end if;
  if not (revision_content ?& array['title','oneLineSummary','problemStatement','targetAudiences','proposedApproach','mvpScope','initialExclusions','coreAssumptions','validationQuestions','risks','claims']) then raise exception 'candidate content missing required fields' using errcode='23514'; end if;
  select s.* into intake from app.source_intakes s join app.editorial_candidates c on c.source_intake_id=s.id where c.id=target_candidate_id;
  if intake.rights_basis='temporary_analysis' then raise exception 'durable publication rights required' using errcode='23514'; end if;
  self_approval := owner=actor;
  if self_approval and not app.has_global_role('admin') then raise exception 'only admin may self-approve' using errcode='42501'; end if;
  update app.editorial_candidates set status='approved',updated_at=now()
  where id=target_candidate_id and current_revision=expected_revision and status in ('draft','in_review');
  if not found then raise exception 'candidate decision conflict' using errcode='40001'; end if;
  insert into app.review_decisions(candidate_id,candidate_revision,reviewer_id,decision,reason,checklist,self_approval)
  values(target_candidate_id,expected_revision,actor,'approved',reason,checklist,self_approval);
  insert into app.ideas(id,slug) values(idea_id,final_slug) on conflict(slug) do nothing;
  if not found then
    final_slug:=final_slug||'-'||substr(replace(idea_id::text,'-',''),1,8);
    insert into app.ideas(id,slug) values(idea_id,final_slug);
  end if;
  insert into app.idea_versions(idea_id,version_number,language,status,visibility,content_license,content,change_summary,created_by) values(idea_id,1,'fr','draft','private',content_license,revision_content,'Première publication éditoriale',actor) returning id into version_id;
  insert into app.sources(id,source_type,title,publisher_or_author,url_or_reference,published_at,accessed_at,license,notes)
  values(source_id,'editorial_intake',intake.title,null,coalesce(intake.source_url,'urn:idea-commons:source:'||source_id::text),intake.published_at,intake.accessed_at,intake.rights_note,'Source éditoriale vérifiée') returning id into source_id;
  for claim in select value from jsonb_array_elements(revision_content->'claims') loop
    insert into app.claims(idea_version_id,claim_type,statement,validation_status,rationale) values(version_id,(claim->>'type')::app.claim_type,claim->>'statement',case when claim->>'type'='fact' then 'supported' else 'untested' end::app.claim_validation_status,claim->>'rationale') returning id into claim_id;
    if claim->>'type'='fact' then
      for excerpt_id in select jsonb_array_elements_text(claim->'citationExcerptIds') loop
        select count(*) into excerpt_matches from jsonb_array_elements(intake.excerpts) e where e->>'id'=excerpt_id;
        if excerpt_matches <> 1 then raise exception 'citation excerpt must resolve exactly once' using errcode='23514'; end if;
      end loop;
      insert into app.claim_sources(claim_id,source_id,citation_order) values(claim_id,source_id,1);
    end if;
  end loop;
  insert into app.idea_version_credits(idea_version_id,credit_order,display_name,contribution) values(version_id,1,credit_name,'Revue et publication éditoriales');
  update app.idea_versions set status='published',visibility='public',published_at=now() where id=version_id;
  update app.ideas set current_published_version_id=version_id where id=idea_id;
  update app.editorial_candidates set status='published',proposed_slug=final_slug,published_idea_version_id=version_id,updated_at=now()
  where id=target_candidate_id and current_revision=expected_revision and status='approved';
  if not found then raise exception 'candidate publication transition conflict' using errcode='40001'; end if;
  update app.source_intakes
  set decided_at=now(),
      full_text_delete_after=case
        when full_text is null or full_text_retention_status='durable_verified' then null
        else least(full_text_delete_after,now()+interval '7 days')
      end,
      revision=revision+1,
      updated_at=now()
  where id=intake.id;
  insert into app_private.command_receipts values(actor,'approve_and_publish_candidate',idempotency_key,request_fingerprint_sha256,version_id,now());
  insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata) values(actor,'candidate.published','idea_version',version_id,jsonb_build_object('candidate_id',target_candidate_id,'candidate_revision',expected_revision,'self_approval',self_approval));
  insert into app_private.outbox_events(topic,aggregate_type,aggregate_id,payload,idempotency_key) values('editorial.idea.published','idea_version',version_id,jsonb_build_object('idea_version_id',version_id,'candidate_id',target_candidate_id),'publication:'||version_id::text);
  return version_id;
end; $$;

create function app.reject_candidate(target_candidate_id uuid, expected_revision bigint, reason text, checklist jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=app.current_member_id(); result_id uuid; owner uuid; self_approval boolean;
begin
 if actor is null or not app.can_review() then raise exception 'reviewer capability required' using errcode='42501'; end if;
 select created_by into owner from app.editorial_candidates where id=target_candidate_id and current_revision=expected_revision and status in ('draft','in_review') for update; if not found then raise exception 'candidate not found or revision conflict' using errcode='40001'; end if;
 self_approval:=owner=actor; if self_approval and not app.has_global_role('admin') then raise exception 'only admin may decide own candidate' using errcode='42501'; end if;
 update app.editorial_candidates set status='rejected',updated_at=now() where id=target_candidate_id and current_revision=expected_revision and status in ('draft','in_review');
 if not found then raise exception 'candidate decision conflict' using errcode='40001'; end if;
 insert into app.review_decisions(candidate_id,candidate_revision,reviewer_id,decision,reason,checklist,self_approval) values(target_candidate_id,expected_revision,actor,'rejected',reason,checklist,self_approval) returning id into result_id;
 update app.source_intakes
 set decided_at=now(),
     full_text_retention_status='temporary',
     retention_verified_at=null,
     retention_verified_by=null,
     retention_verification_note=null,
     full_text_delete_after=case when full_text is not null then least(coalesce(full_text_delete_after,now()+interval '7 days'),now()+interval '7 days') else null end,
     revision=revision+1,
     updated_at=now()
 where id=(select source_intake_id from app.editorial_candidates where id=target_candidate_id);
 insert into app_private.audit_events(actor_member_id,event_type,resource_type,resource_id,metadata) values(actor,'candidate.rejected','editorial_candidate',target_candidate_id,jsonb_build_object('candidate_revision',expected_revision,'self_approval',self_approval));
 return result_id;
end; $$;

create function app.purge_expired_source_texts(purge_cutoff timestamptz default now())
returns bigint language plpgsql security definer set search_path='' as $$
declare affected bigint;
begin
 if app.current_member_id() is not null then raise exception 'server-only maintenance command' using errcode='42501'; end if;
 update app.source_intakes
 set full_text=null,
     full_text_delete_after=null,
     full_text_retention_status='temporary',
     retention_verified_at=null,
     retention_verified_by=null,
     retention_verification_note=null,
     revision=revision+1,
     updated_at=now()
 where full_text is not null and full_text_delete_after<=purge_cutoff;
 get diagnostics affected=row_count; return affected;
end; $$;

create trigger source_intakes_initialize_retention before insert on app.source_intakes for each row execute function app_private.initialize_source_retention();
create trigger source_intakes_protect_evidence before update of fingerprint_sha256,fingerprint_status,verified_fingerprint_sha256,fingerprint_verified_at,fingerprint_verification_method,excerpts on app.source_intakes for each row execute function app_private.protect_source_evidence();
create trigger source_intakes_revision before update on app.source_intakes for each row execute function app_private.enforce_revision_increment();
create trigger source_intakes_updated before update on app.source_intakes for each row execute function app_private.set_updated_at();
create trigger ideas_protect_published_slug before update of slug on app.ideas for each row execute function app_private.protect_published_slug();
create trigger candidates_updated before update on app.editorial_candidates for each row execute function app_private.set_updated_at();
create trigger candidate_revisions_validate before insert on app.candidate_revisions for each row execute function app_private.guard_candidate_revision();
create trigger candidate_revisions_append_only before update or delete on app.candidate_revisions for each row execute function app_private.protect_append_only();
create trigger review_decisions_append_only before update or delete on app.review_decisions for each row execute function app_private.protect_append_only();
create trigger generation_attempts_append_only before update or delete on app.ai_generation_attempts for each row execute function app_private.protect_append_only();
create trigger prompt_skill_versions_append_only before update or delete on app.prompt_skill_versions for each row execute function app_private.protect_append_only();

alter table app.source_intakes enable row level security;
alter table app.prompt_skills enable row level security;
alter table app.prompt_skill_versions enable row level security;
alter table app.ai_generations enable row level security;
alter table app.ai_generation_attempts enable row level security;
alter table app.editorial_candidates enable row level security;
alter table app.candidate_revisions enable row level security;
alter table app.review_decisions enable row level security;

create policy source_intakes_select_editorial on app.source_intakes for select using(created_by=app.current_member_id() or app.can_review());
create policy prompt_skills_select_editorial on app.prompt_skills for select using(app.can_contribute() or app.can_review());
create policy prompt_skill_versions_select_editorial on app.prompt_skill_versions for select using(app.can_contribute() or app.can_review());
create policy generations_select_editorial on app.ai_generations for select using(requested_by=app.current_member_id() or app.can_review());
create policy attempts_select_editorial on app.ai_generation_attempts for select using(exists(select 1 from app.ai_generations g where g.id=generation_id and (g.requested_by=app.current_member_id() or app.can_review())));
create policy candidates_select_editorial on app.editorial_candidates for select using(created_by=app.current_member_id() or app.can_review());
create policy revisions_select_editorial on app.candidate_revisions for select using(exists(select 1 from app.editorial_candidates c where c.id=candidate_id and (c.created_by=app.current_member_id() or app.can_review())));
create policy decisions_select_editorial on app.review_decisions for select using(reviewer_id=app.current_member_id() or exists(select 1 from app.editorial_candidates c where c.id=candidate_id and c.created_by=app.current_member_id()) or app.can_review());

revoke all on all tables in schema app from public, anonymous, authenticated;
revoke all on all functions in schema app from public, anonymous, authenticated;
revoke all on all tables in schema app_private from public, anonymous, authenticated;
revoke all on all functions in schema app_private from public, anonymous, authenticated;

do $$ begin
 if exists(select 1 from pg_roles where rolname='anonymous') then
  grant usage on schema app to anonymous;
  grant select on app.ideas,app.idea_versions,app.claims,app.sources,app.claim_sources,app.idea_version_credits,app.taxonomy_terms,app.idea_version_terms to anonymous;
  grant execute on function app.version_is_published(uuid) to anonymous;
 end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then
  grant usage on schema app to authenticated;
  grant select on app.ideas,app.idea_versions,app.claims,app.sources,app.claim_sources,app.idea_version_credits,app.taxonomy_terms,app.idea_version_terms to authenticated;
  grant select,insert on app.members to authenticated; grant update(display_name,locale) on app.members to authenticated;
  grant select on app.member_role_assignments,app.source_intakes,app.prompt_skills,app.prompt_skill_versions,app.ai_generations,app.ai_generation_attempts,app.editorial_candidates,app.candidate_revisions,app.review_decisions to authenticated;
  grant select,insert,delete on app.favorites to authenticated; grant select,insert on app.projects to authenticated; grant update(title,context,revision) on app.projects to authenticated; grant select,insert,delete on app.project_members to authenticated; grant update(role,status,accepted_at) on app.project_members to authenticated; grant select,insert,delete on app.project_artifacts to authenticated; grant update(title,content,revision) on app.project_artifacts to authenticated; grant select on app.exports to authenticated;
  grant execute on function app.current_auth_user_id(),app.current_member_id(),app.has_global_role(app.global_role),app.can_contribute(),app.can_review(),app.project_access_level(uuid),app.version_is_published(uuid),app.archive_project(uuid,bigint) to authenticated;
  grant execute on function app.create_source_intake(app.source_input_mode,text,text,timestamptz,timestamptz,text,jsonb,app.source_rights_basis,text,text,text,text) to authenticated;
  grant execute on function app.start_candidate_generation(uuid,uuid,bigint,text,text),app.update_candidate_draft(uuid,bigint,jsonb,text),app.approve_and_publish_candidate(uuid,bigint,text,jsonb,text,text,text,text,text),app.reject_candidate(uuid,bigint,text,jsonb),app.verify_source_retention_rights(uuid,bigint,text) to authenticated;
 end if;
end $$;

revoke all on function app.purge_expired_source_texts(timestamptz) from public,anonymous,authenticated;
revoke all on function app.record_verified_source_fingerprint(uuid,bigint,text) from public,anonymous,authenticated;

comment on table app.source_intakes is 'M1 editorial source provenance; fingerprint_sha256 is contributor-submitted and non-authoritative, excerpts are immutable, and full_text is temporary unless separately verified for durable retention';
comment on column app.source_intakes.fingerprint_sha256 is 'Unverified contributor-submitted SHA-256-shaped correlation hint; never a public proof or URN';
comment on column app.source_intakes.verified_fingerprint_sha256 is 'Trusted-component SHA-256 over Unicode NFC, LF line endings, trimmed line endings and surrounding whitespace (unicode_nfc_lf_trim_v1)';
comment on function app.record_verified_source_fingerprint(uuid,bigint,text) is 'Server-only recording of a digest derived by a trusted component; PostgreSQL does not recompute SHA-256 in M1-A';
comment on function app.verify_source_retention_rights(uuid,bigint,text) is 'Reviewer/admin-only transition required before durable full-text retention; a future server path requires a distinct provable identity';
comment on function app.approve_and_publish_candidate(uuid,bigint,text,jsonb,text,text,text,text,text) is 'Atomic human review and public M0 publication command';

commit;
