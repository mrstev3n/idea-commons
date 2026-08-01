begin;

do $$
begin
  if exists (
    select 1 from pg_roles
    where rolname in ('anonymous', 'authenticated') and rolbypassrls
  ) then
    raise exception 'Data API roles must be NOBYPASSRLS' using errcode = '42501';
  end if;
end;
$$;

create schema app;
create schema app_private;

revoke all on schema app from public;
revoke all on schema app_private from public;

create type app.global_role as enum ('contributor', 'reviewer', 'admin');
create type app.editorial_status as enum (
  'draft', 'submitted', 'in_review', 'changes_requested', 'approved',
  'published', 'needs_review', 'superseded', 'archived', 'rejected', 'withdrawn'
);
create type app.content_visibility as enum ('public', 'unlisted', 'private');
create type app.claim_type as enum ('fact', 'hypothesis', 'estimate', 'recommendation', 'validation_question');
create type app.claim_validation_status as enum ('untested', 'partially_supported', 'supported', 'refuted', 'stale');
create type app.project_status as enum ('active', 'archived');
create type app.project_member_role as enum ('editor', 'viewer');
create type app.project_member_status as enum ('invited', 'accepted', 'declined');
create type app.artifact_type as enum ('note', 'validation_plan', 'roadmap', 'backlog', 'brief');
create type app.export_status as enum ('pending', 'ready', 'failed', 'expired');

create table app.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  locale text not null default 'fr' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.member_role_assignments (
  member_id uuid not null references app.members(id) on delete cascade,
  role app.global_role not null,
  assigned_at timestamptz not null default now(),
  primary key (member_id, role)
);

create table app.ideas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  current_published_version_id uuid,
  created_at timestamptz not null default now()
);

create table app.idea_versions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references app.ideas(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  status app.editorial_status not null default 'draft',
  visibility app.content_visibility not null default 'private',
  content_license text,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  change_summary text,
  created_by uuid not null references app.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (idea_id, version_number),
  unique (idea_id, id),
  check (
    status not in ('published', 'needs_review', 'superseded')
    or (
      visibility in ('public', 'unlisted')
      and published_at is not null
      and content_license is not null
      and length(trim(content_license)) > 0
    )
  )
);

alter table app.ideas
  add constraint ideas_current_published_version_fkey
  foreign key (id, current_published_version_id)
  references app.idea_versions (idea_id, id)
  deferrable initially deferred;

create table app.claims (
  id uuid primary key default gen_random_uuid(),
  idea_version_id uuid not null references app.idea_versions(id) on delete cascade,
  claim_type app.claim_type not null,
  statement text not null check (length(trim(statement)) > 0),
  scope text,
  validation_status app.claim_validation_status not null default 'untested',
  rationale text,
  created_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  check (claim_type <> 'recommendation' or nullif(trim(rationale), '') is not null),
  check (claim_type <> 'estimate' or nullif(trim(rationale), '') is not null)
);

create table app.sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (length(trim(source_type)) > 0),
  title text not null check (length(trim(title)) > 0),
  publisher_or_author text,
  url_or_reference text not null check (length(trim(url_or_reference)) > 0),
  published_at timestamptz,
  accessed_at timestamptz not null,
  license text,
  notes text,
  created_at timestamptz not null default now()
);

create table app.claim_sources (
  claim_id uuid not null references app.claims(id) on delete cascade,
  source_id uuid not null references app.sources(id) on delete restrict,
  citation_order smallint not null check (citation_order > 0),
  primary key (claim_id, source_id),
  unique (claim_id, citation_order)
);

create table app.idea_version_credits (
  idea_version_id uuid not null references app.idea_versions(id) on delete cascade,
  credit_order smallint not null check (credit_order > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  contribution text,
  attribution_url text,
  primary key (idea_version_id, credit_order)
);

create table app.taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  vocabulary text not null check (length(trim(vocabulary)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (length(trim(label)) > 0),
  active boolean not null default true,
  unique (vocabulary, slug)
);

create table app.idea_version_terms (
  idea_version_id uuid not null references app.idea_versions(id) on delete cascade,
  term_id uuid not null references app.taxonomy_terms(id) on delete restrict,
  primary key (idea_version_id, term_id)
);

create table app.favorites (
  member_id uuid not null references app.members(id) on delete cascade,
  idea_id uuid not null references app.ideas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, idea_id)
);

create table app.projects (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references app.members(id) on delete restrict,
  source_idea_version_id uuid not null references app.idea_versions(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 180),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  status app.project_status not null default 'active',
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.project_members (
  project_id uuid not null references app.projects(id) on delete cascade,
  member_id uuid not null references app.members(id) on delete cascade,
  role app.project_member_role not null,
  status app.project_member_status not null default 'invited',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (project_id, member_id),
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create table app.project_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  artifact_type app.artifact_type not null,
  title text not null check (length(trim(title)) between 1 and 180),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references app.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  requested_by uuid not null references app.members(id) on delete restrict,
  status app.export_status not null default 'pending',
  format text not null check (format in ('pdf', 'docx', 'json', 'csv')),
  source_revision bigint not null check (source_revision > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text check (storage_key is null or (length(trim(storage_key)) > 0 and storage_key !~ '^https?://')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  check (
    status <> 'ready'
    or (checksum_sha256 is not null and storage_key is not null and ready_at is not null)
  )
);

create table app_private.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_member_id uuid references app.members(id) on delete set null,
  event_type text not null check (length(trim(event_type)) > 0),
  resource_type text not null check (length(trim(resource_type)) > 0),
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table app_private.outbox_events (
  id bigint generated always as identity primary key,
  topic text not null check (length(trim(topic)) > 0),
  aggregate_type text not null check (length(trim(aggregate_type)) > 0),
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null unique check (length(trim(idempotency_key)) > 0),
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

create index member_role_assignments_role_idx on app.member_role_assignments (role, member_id);
create index ideas_current_published_version_idx on app.ideas (id, current_published_version_id);
create index idea_versions_created_by_idx on app.idea_versions (created_by);
create index idea_versions_public_catalog_idx on app.idea_versions (visibility, published_at desc)
  where status in ('published', 'needs_review') and visibility in ('public', 'unlisted');
create index claims_idea_version_id_idx on app.claims (idea_version_id);
create index claim_sources_source_id_idx on app.claim_sources (source_id);
create index idea_version_terms_term_id_idx on app.idea_version_terms (term_id);
create index favorites_idea_id_idx on app.favorites (idea_id);
create index projects_owner_member_id_idx on app.projects (owner_member_id);
create index projects_source_idea_version_id_idx on app.projects (source_idea_version_id);
create index project_members_member_access_idx on app.project_members (member_id, project_id, role)
  where status = 'accepted';
create index project_members_member_id_idx on app.project_members (member_id);
create index project_artifacts_project_id_idx on app.project_artifacts (project_id);
create index project_artifacts_created_by_idx on app.project_artifacts (created_by);
create index exports_project_id_idx on app.exports (project_id);
create index exports_requested_by_idx on app.exports (requested_by);
create index audit_events_actor_member_id_idx on app_private.audit_events (actor_member_id);
create index audit_events_resource_idx on app_private.audit_events (resource_type, resource_id, occurred_at desc);
create index outbox_events_pending_idx on app_private.outbox_events (available_at, id)
  where delivered_at is null;

create function app.current_auth_user_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  raw_user_id text;
begin
  if to_regprocedure('auth.user_id()') is null then
    return null;
  end if;
  execute 'select auth.user_id()::text' into raw_user_id;
  return nullif(raw_user_id, '')::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create function app.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from app.members as m
  where m.auth_user_id = app.current_auth_user_id()
$$;

create function app.project_access_level(target_project_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.owner_member_id = app.current_member_id() then 'owner'
    when pm.role = 'editor' and pm.status = 'accepted' then 'editor'
    when pm.role = 'viewer' and pm.status = 'accepted' then 'viewer'
    else null
  end
  from app.projects as p
  left join app.project_members as pm
    on pm.project_id = p.id
   and pm.member_id = app.current_member_id()
  where p.id = target_project_id
$$;

create function app.version_is_published(target_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select v.status in ('published', 'needs_review', 'superseded')
    from app.idea_versions as v
    where v.id = target_version_id
  ), false)
$$;

create function app.archive_project(target_project_id uuid, expected_revision bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from app.projects as p
    where p.id = target_project_id
      and p.owner_member_id = app.current_member_id()
      and p.revision = expected_revision
      and p.status = 'active'
  ) then
    return false;
  end if;

  update app.projects
  set status = 'archived', revision = revision + 1
  where id = target_project_id and revision = expected_revision;
  return found;
end;
$$;

revoke all on function app.current_auth_user_id() from public;
revoke all on function app.current_member_id() from public;
revoke all on function app.project_access_level(uuid) from public;
revoke all on function app.version_is_published(uuid) from public;
revoke all on function app.archive_project(uuid, bigint) from public;

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create function app_private.enforce_revision_increment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'revision must increment by exactly one' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function app_private.validate_idea_version_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('published', 'needs_review', 'superseded') then
    if tg_op = 'INSERT' then
      raise exception 'publish by transitioning a prepared draft, not by direct insert'
        using errcode = '23514';
    end if;
    if not (new.content ?& array[
      'title', 'oneLineSummary', 'problemStatement', 'targetAudiences',
      'proposedApproach', 'mvpScope', 'initialExclusions', 'coreAssumptions',
      'validationQuestions', 'risks'
    ]) then
      raise exception 'published version content is missing required fields'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from app.claims as c where c.idea_version_id = new.id
    ) then
      raise exception 'published version requires at least one claim'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from app.idea_version_credits as credit where credit.idea_version_id = new.id
    ) then
      raise exception 'published version requires at least one credit'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from app.claims as c
      where c.idea_version_id = new.id
        and c.claim_type = 'fact'
        and not exists (
          select 1 from app.claim_sources as cs where cs.claim_id = c.id
        )
    ) then
      raise exception 'every factual claim in a published version requires a source'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create function app_private.protect_published_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.status in ('published', 'needs_review', 'superseded') then
    raise exception 'published idea versions are immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.status in ('published', 'needs_review', 'superseded') then
    if row(new.idea_id, new.version_number, new.language, new.visibility, new.content_license, new.content, new.created_by, new.created_at, new.published_at)
       is distinct from
       row(old.idea_id, old.version_number, old.language, old.visibility, old.content_license, old.content, old.created_by, old.created_at, old.published_at) then
      raise exception 'published idea version content is immutable' using errcode = '55000';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create function app_private.protect_published_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_version_id uuid;
begin
  if tg_table_name = 'claims' then
    target_version_id := coalesce(new.idea_version_id, old.idea_version_id);
  elsif tg_table_name = 'claim_sources' then
    select c.idea_version_id into target_version_id
    from app.claims as c
    where c.id = coalesce(new.claim_id, old.claim_id);
  else
    target_version_id := coalesce(new.idea_version_id, old.idea_version_id);
  end if;
  if app.version_is_published(target_version_id) then
    raise exception 'published idea version relations are immutable' using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;

create function app_private.validate_current_published_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_published_version_id is not null and not app.version_is_published(new.current_published_version_id) then
    raise exception 'current version must be published' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function app_private.validate_project_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.version_is_published(new.source_idea_version_id) then
    raise exception 'project source must be a published idea version' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function app_private.guard_project_member_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  access_level text;
begin
  access_level := app.project_access_level(coalesce(new.project_id, old.project_id));
  if access_level = 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and old.member_id = app.current_member_id()
     and old.status = 'invited'
     and new.status in ('accepted', 'declined')
     and row(new.project_id, new.member_id, new.role, new.invited_at)
         is not distinct from row(old.project_id, old.member_id, old.role, old.invited_at) then
    if new.status = 'accepted' and new.accepted_at is null then
      new.accepted_at := statement_timestamp();
    elsif new.status = 'declined' then
      new.accepted_at := null;
    end if;
    return new;
  end if;
  raise exception 'project membership change is not permitted' using errcode = '42501';
end;
$$;

create trigger members_set_updated_at
before update on app.members
for each row execute function app_private.set_updated_at();

create trigger idea_versions_validate_publication
before insert or update on app.idea_versions
for each row execute function app_private.validate_idea_version_publication();

create trigger idea_versions_protect_published
before update or delete on app.idea_versions
for each row execute function app_private.protect_published_version();

create trigger ideas_validate_current_version
before insert or update of current_published_version_id on app.ideas
for each row execute function app_private.validate_current_published_version();

create trigger claims_protect_published
before insert or update or delete on app.claims
for each row execute function app_private.protect_published_child();

create trigger claim_sources_protect_published
before insert or update or delete on app.claim_sources
for each row execute function app_private.protect_published_child();

create trigger idea_version_credits_protect_published
before insert or update or delete on app.idea_version_credits
for each row execute function app_private.protect_published_child();

create trigger idea_version_terms_protect_published
before insert or update or delete on app.idea_version_terms
for each row execute function app_private.protect_published_child();

create trigger projects_validate_source
before insert or update of source_idea_version_id on app.projects
for each row execute function app_private.validate_project_source();

create trigger projects_enforce_revision
before update on app.projects
for each row execute function app_private.enforce_revision_increment();

create trigger projects_set_updated_at
before update on app.projects
for each row execute function app_private.set_updated_at();

create trigger project_members_guard_change
before insert or update or delete on app.project_members
for each row execute function app_private.guard_project_member_change();

create trigger project_artifacts_enforce_revision
before update on app.project_artifacts
for each row execute function app_private.enforce_revision_increment();

create trigger project_artifacts_set_updated_at
before update on app.project_artifacts
for each row execute function app_private.set_updated_at();

alter table app.members enable row level security;
alter table app.member_role_assignments enable row level security;
alter table app.ideas enable row level security;
alter table app.idea_versions enable row level security;
alter table app.claims enable row level security;
alter table app.sources enable row level security;
alter table app.claim_sources enable row level security;
alter table app.idea_version_credits enable row level security;
alter table app.taxonomy_terms enable row level security;
alter table app.idea_version_terms enable row level security;
alter table app.favorites enable row level security;
alter table app.projects enable row level security;
alter table app.project_members enable row level security;
alter table app.project_artifacts enable row level security;
alter table app.exports enable row level security;

create policy members_select_self on app.members
  for select using (auth_user_id = app.current_auth_user_id());
create policy members_insert_self on app.members
  for insert with check (auth_user_id = app.current_auth_user_id());
create policy members_update_self on app.members
  for update using (auth_user_id = app.current_auth_user_id())
  with check (auth_user_id = app.current_auth_user_id());

create policy member_roles_select_self on app.member_role_assignments
  for select using (member_id = app.current_member_id());

create policy ideas_select_published on app.ideas
  for select using (
    current_published_version_id is not null
    and app.version_is_published(current_published_version_id)
  );
create policy idea_versions_select_published on app.idea_versions
  for select using (
    status in ('published', 'needs_review', 'superseded')
    and visibility in ('public', 'unlisted')
  );
create policy claims_select_published on app.claims
  for select using (app.version_is_published(idea_version_id));
create policy sources_select_published on app.sources
  for select using (
    exists (
      select 1
      from app.claim_sources as cs
      join app.claims as c on c.id = cs.claim_id
      where cs.source_id = sources.id
        and app.version_is_published(c.idea_version_id)
    )
  );
create policy claim_sources_select_published on app.claim_sources
  for select using (
    exists (
      select 1 from app.claims as c
      where c.id = claim_sources.claim_id
        and app.version_is_published(c.idea_version_id)
    )
  );
create policy idea_version_credits_select_published on app.idea_version_credits
  for select using (app.version_is_published(idea_version_id));
create policy taxonomy_terms_select_active on app.taxonomy_terms
  for select using (active);
create policy idea_version_terms_select_published on app.idea_version_terms
  for select using (app.version_is_published(idea_version_id));

create policy favorites_select_own on app.favorites
  for select using (member_id = app.current_member_id());
create policy favorites_insert_own on app.favorites
  for insert with check (member_id = app.current_member_id());
create policy favorites_delete_own on app.favorites
  for delete using (member_id = app.current_member_id());

create policy projects_select_member on app.projects
  for select using (app.project_access_level(id) is not null);
create policy projects_insert_owner on app.projects
  for insert with check (
    owner_member_id = app.current_member_id()
    and status = 'active'
    and revision = 1
    and app.version_is_published(source_idea_version_id)
  );
create policy projects_update_editor on app.projects
  for update using (app.project_access_level(id) in ('owner', 'editor'))
  with check (app.project_access_level(id) in ('owner', 'editor'));

create policy project_members_select_member on app.project_members
  for select using (app.project_access_level(project_id) is not null);
create policy project_members_insert_owner on app.project_members
  for insert with check (app.project_access_level(project_id) = 'owner');
create policy project_members_update_owner_or_invitee on app.project_members
  for update using (
    app.project_access_level(project_id) = 'owner'
    or member_id = app.current_member_id()
  )
  with check (
    app.project_access_level(project_id) = 'owner'
    or member_id = app.current_member_id()
  );
create policy project_members_delete_owner on app.project_members
  for delete using (app.project_access_level(project_id) = 'owner');

create policy project_artifacts_select_member on app.project_artifacts
  for select using (app.project_access_level(project_id) is not null);
create policy project_artifacts_insert_editor on app.project_artifacts
  for insert with check (
    app.project_access_level(project_id) in ('owner', 'editor')
    and created_by = app.current_member_id()
    and revision = 1
  );
create policy project_artifacts_update_editor on app.project_artifacts
  for update using (app.project_access_level(project_id) in ('owner', 'editor'))
  with check (app.project_access_level(project_id) in ('owner', 'editor'));
create policy project_artifacts_delete_editor on app.project_artifacts
  for delete using (app.project_access_level(project_id) in ('owner', 'editor'));

create policy exports_select_member on app.exports
  for select using (app.project_access_level(project_id) is not null);

revoke all on all tables in schema app from public;
revoke all on all tables in schema app_private from public;
revoke all on all sequences in schema app_private from public;
revoke all on all functions in schema app_private from public;
alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app_private revoke all on tables from public;
alter default privileges in schema app_private revoke all on sequences from public;
alter default privileges in schema app_private revoke execute on functions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anonymous') then
    grant usage on schema app to anonymous;
    grant select on app.ideas, app.idea_versions, app.claims, app.sources,
      app.claim_sources, app.idea_version_credits, app.taxonomy_terms,
      app.idea_version_terms to anonymous;
    grant execute on function app.version_is_published(uuid) to anonymous;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema app to authenticated;
    grant select on app.ideas, app.idea_versions, app.claims, app.sources,
      app.claim_sources, app.idea_version_credits, app.taxonomy_terms,
      app.idea_version_terms to authenticated;
    grant select, insert on app.members to authenticated;
    grant update (display_name, locale) on app.members to authenticated;
    grant select on app.member_role_assignments to authenticated;
    grant select, insert, delete on app.favorites to authenticated;
    grant select, insert on app.projects to authenticated;
    grant update (title, context, revision) on app.projects to authenticated;
    grant select, insert, delete on app.project_members to authenticated;
    grant update (role, status, accepted_at) on app.project_members to authenticated;
    grant select, insert, delete on app.project_artifacts to authenticated;
    grant update (title, content, revision) on app.project_artifacts to authenticated;
    grant select on app.exports to authenticated;
    grant execute on function app.current_auth_user_id() to authenticated;
    grant execute on function app.current_member_id() to authenticated;
    grant execute on function app.project_access_level(uuid) to authenticated;
    grant execute on function app.version_is_published(uuid) to authenticated;
    grant execute on function app.archive_project(uuid, bigint) to authenticated;
  end if;
end;
$$;

comment on schema app is 'Idea Commons M0 user-facing domain schema';
comment on schema app_private is 'Idea Commons M0 server-only audit and outbox schema';
comment on function app.current_auth_user_id() is 'Returns the Neon Data API auth.user_id UUID, or null when no authenticated identity is present';
comment on function app.project_access_level(uuid) is 'Returns owner, editor, viewer, or null for the current authenticated member';
comment on function app.archive_project(uuid, bigint) is 'Archives an owned project only when the expected revision matches';

commit;
