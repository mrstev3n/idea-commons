\set ON_ERROR_STOP on

begin;

create schema test;

create function test.assert_equal(actual bigint, expected bigint, message text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'assertion failed: % (expected %, got %)', message, expected, actual;
  end if;
end;
$$;

create function test.assert_command_rows(command text, expected bigint, message text)
returns void
language plpgsql
as $$
declare
  affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  perform test.assert_equal(affected, expected, message);
end;
$$;

create function test.expect_denied(command text, message text)
returns void
language plpgsql
as $$
begin
  execute command;
  raise exception 'assertion failed: % (command was allowed)', message;
exception
  when insufficient_privilege or check_violation or sqlstate '55000' then
    null;
end;
$$;

grant usage on schema test to anonymous, authenticated;
grant execute on all functions in schema test to anonymous, authenticated;

insert into app.members (id, auth_user_id, display_name) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Propriétaire fictif'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Étranger fictif'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Viewer fictif'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Editor fictif'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'Reviewer fictif'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'Admin fictif');

insert into app.member_role_assignments (member_id, role) values
  ('10000000-0000-0000-0000-000000000005', 'reviewer'),
  ('10000000-0000-0000-0000-000000000006', 'admin');

insert into app.ideas (id, slug) values
  ('20000000-0000-0000-0000-000000000001', 'annuaire-reparation-fictif'),
  ('20000000-0000-0000-0000-000000000002', 'stock-conversationnel-fictif'),
  ('20000000-0000-0000-0000-000000000003', 'brouillon-invisible-fictif');

insert into app.idea_versions (
  id, idea_id, version_number, language, status, visibility, content, created_by
) values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', 1, 'fr', 'draft', 'private',
    '{"title":"Annuaire fictif","oneLineSummary":"Exemple synthétique","problemStatement":"Problème fictif","targetAudiences":["public fictif"],"proposedApproach":"Approche fictive","mvpScope":["test"],"initialExclusions":["paiement"],"coreAssumptions":["hypothèse"],"validationQuestions":["question"],"risks":["risque"]}',
    '10000000-0000-0000-0000-000000000005'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002', 1, 'fr', 'draft', 'private',
    '{"title":"Stock fictif","oneLineSummary":"Exemple synthétique","problemStatement":"Problème fictif","targetAudiences":["public fictif"],"proposedApproach":"Approche fictive","mvpScope":["test"],"initialExclusions":["paiement"],"coreAssumptions":["hypothèse"],"validationQuestions":["question"],"risks":["risque"]}',
    '10000000-0000-0000-0000-000000000005'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003', 1, 'fr', 'draft', 'private',
    '{"title":"Brouillon fictif"}',
    '10000000-0000-0000-0000-000000000005'
  );

insert into app.claims (id, idea_version_id, claim_type, statement, validation_status) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'fact', 'Fait fictif uniquement pour tester la relation à une source.', 'supported'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'hypothesis', 'Hypothèse fictive à tester.', 'untested');

insert into app.sources (id, source_type, title, url_or_reference, accessed_at) values
  ('50000000-0000-0000-0000-000000000001', 'test', 'Source synthétique', 'urn:idea-commons:test:source-1', '2026-08-01T00:00:00Z');

insert into app.claim_sources (claim_id, source_id, citation_order) values
  ('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1);

insert into app.idea_version_credits (idea_version_id, credit_order, display_name) values
  ('30000000-0000-0000-0000-000000000001', 1, 'Auteur fictif'),
  ('30000000-0000-0000-0000-000000000002', 1, 'Auteur fictif');

update app.idea_versions
set status = 'published', visibility = 'public', content_license = 'CC-BY-SA-4.0', published_at = '2026-08-01T00:00:00Z'
where id = '30000000-0000-0000-0000-000000000001';

update app.idea_versions
set status = 'published', visibility = 'unlisted', content_license = 'CC-BY-SA-4.0', published_at = '2026-08-01T00:00:00Z'
where id = '30000000-0000-0000-0000-000000000002';

update app.ideas set current_published_version_id = '30000000-0000-0000-0000-000000000001'
where id = '20000000-0000-0000-0000-000000000001';
update app.ideas set current_published_version_id = '30000000-0000-0000-0000-000000000002'
where id = '20000000-0000-0000-0000-000000000002';

insert into app.projects (id, owner_member_id, source_idea_version_id, title, context) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Projet privé fictif', '{"country":"ZZ"}');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
insert into app.project_members (project_id, member_id, role, status, accepted_at) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'viewer', 'accepted', '2026-08-01T00:00:00Z'),
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'editor', 'accepted', '2026-08-01T00:00:00Z');
insert into app.favorites (member_id, idea_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
reset role;

insert into app.project_artifacts (id, project_id, artifact_type, title, content, created_by) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'brief', 'Brief fictif', '{"summary":"Synthétique"}', '10000000-0000-0000-0000-000000000001');
insert into app.exports (id, project_id, requested_by, status, format, source_revision, checksum_sha256, storage_key, ready_at) values
  ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ready', 'pdf', 1, repeat('a', 64), 'private/tests/export-fictif.pdf', '2026-08-01T00:00:00Z');

-- Anonymous: published and unlisted catalogue are readable; private tables have no privilege.
select set_config('request.jwt.claim.sub', '', true);
set local role anonymous;
select test.assert_equal((select count(*) from app.ideas), 2, 'anonymous sees only ideas with a published current version');
select test.assert_equal((select count(*) from app.idea_versions), 2, 'anonymous sees public and unlisted published versions');
select test.assert_equal((select count(*) from app.claims), 2, 'anonymous sees claims linked to published versions');
select test.expect_denied('select * from app.projects', 'anonymous cannot query projects');
reset role;

-- Owner: complete private access, bounded updates, protected ownership.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.members), 1, 'owner sees only own member profile');
select test.assert_equal((select count(*) from app.favorites), 1, 'owner sees own favorite');
select test.assert_equal((select count(*) from app.projects), 1, 'owner sees own project');
select test.assert_equal((select count(*) from app.project_artifacts), 1, 'owner sees project artifacts');
select test.assert_equal((select count(*) from app.exports), 1, 'owner sees project exports');
select test.assert_command_rows(
  'update app.projects set title = ''Projet privé fictif révisé'', revision = 2 where id = ''60000000-0000-0000-0000-000000000001'' and revision = 1',
  1,
  'owner updates ordinary project fields with expected revision'
);
select test.expect_denied(
  'update app.projects set owner_member_id = ''10000000-0000-0000-0000-000000000002'' where id = ''60000000-0000-0000-0000-000000000001''',
  'owner cannot transfer ownership through a direct update'
);
reset role;

-- Stranger: private rows are invisible and mutations affect no row.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.projects), 0, 'stranger cannot see project');
select test.assert_equal((select count(*) from app.project_artifacts), 0, 'stranger cannot see artifacts');
select test.assert_equal((select count(*) from app.exports), 0, 'stranger cannot see exports');
select test.assert_command_rows(
  'update app.projects set title = ''Intrusion fictive'', revision = 3 where id = ''60000000-0000-0000-0000-000000000001''',
  0,
  'stranger cannot update project'
);
reset role;

-- Viewer: inherited read, no write.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.projects), 1, 'viewer sees accepted project');
select test.assert_equal((select count(*) from app.project_artifacts), 1, 'viewer sees artifacts');
select test.assert_equal((select count(*) from app.exports), 1, 'viewer sees exports');
select test.assert_command_rows(
  'update app.projects set title = ''Viewer fictif'', revision = 3 where id = ''60000000-0000-0000-0000-000000000001''',
  0,
  'viewer cannot update project'
);
select test.expect_denied(
  'insert into app.project_artifacts (project_id, artifact_type, title, created_by) values (''60000000-0000-0000-0000-000000000001'', ''note'', ''Mutation viewer'', ''10000000-0000-0000-0000-000000000003'')',
  'viewer cannot create artifact'
);
reset role;

-- Editor: ordinary mutation and artifact creation, no protected columns.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.projects), 1, 'editor sees accepted project');
select test.assert_command_rows(
  'update app.projects set context = ''{"country":"ZZ","stage":"test"}'', revision = 3 where id = ''60000000-0000-0000-0000-000000000001'' and revision = 2',
  1,
  'editor updates ordinary project fields'
);
select test.assert_command_rows(
  'insert into app.project_artifacts (project_id, artifact_type, title, content, created_by) values (''60000000-0000-0000-0000-000000000001'', ''note'', ''Note éditeur fictive'', ''{}'', ''10000000-0000-0000-0000-000000000004'')',
  1,
  'editor creates artifact'
);
select test.expect_denied(
  'update app.projects set source_idea_version_id = ''30000000-0000-0000-0000-000000000002'' where id = ''60000000-0000-0000-0000-000000000001''',
  'editor cannot change source version'
);
reset role;

-- Global reviewer and admin roles do not cross the resource boundary.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.member_role_assignments), 1, 'reviewer sees own global role');
select test.assert_equal((select count(*) from app.projects), 0, 'reviewer has no implicit project access');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
set local role authenticated;
select test.assert_equal((select count(*) from app.member_role_assignments), 1, 'admin sees own global role');
select test.assert_equal((select count(*) from app.projects), 0, 'admin has no implicit project access');
reset role;

-- Catalogue immutability and private schema privileges.
select test.expect_denied(
  'update app.idea_versions set content = ''{"title":"altéré"}'' where id = ''30000000-0000-0000-0000-000000000001''',
  'published content is immutable'
);
set local role authenticated;
select test.expect_denied('select * from app_private.audit_events', 'authenticated cannot read audit events');
select test.expect_denied('select * from app_private.outbox_events', 'authenticated cannot read outbox events');
reset role;

-- Structural audit: every foreign-key leading column is indexed and every user-path table has RLS.
select test.assert_equal((
  select count(*)
  from pg_constraint as c
  where c.contype = 'f'
    and c.connamespace in ('app'::regnamespace, 'app_private'::regnamespace)
    and not exists (
      select 1
      from pg_index as i
      where i.indrelid = c.conrelid
        and i.indisvalid
        and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
        and i.indpred is null
    )
), 0, 'all foreign keys have a leading index');

select test.assert_equal((
  select count(*)
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'app'
    and c.relkind = 'r'
    and not c.relrowsecurity
), 0, 'all app tables have RLS enabled');

select 'M0 RLS tests passed' as result;

rollback;
