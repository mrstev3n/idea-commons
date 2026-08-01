begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anonymous')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Data API roles anonymous and authenticated must exist before this migration'
      using errcode = '42704';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname in ('anonymous', 'authenticated')
      and (rolcanlogin or rolbypassrls)
  ) then
    raise exception 'Data API roles must be NOLOGIN and NOBYPASSRLS'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ) then
    raise exception 'every app table must enable RLS before Data API grants'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on schema app from anonymous, authenticated;
revoke all on all tables in schema app from anonymous, authenticated;
revoke all on all functions in schema app from anonymous, authenticated;
revoke all on schema app_private from anonymous, authenticated;
revoke all on all tables in schema app_private from anonymous, authenticated;
revoke all on all sequences in schema app_private from anonymous, authenticated;
revoke all on all functions in schema app_private from anonymous, authenticated;

grant usage on schema app to anonymous, authenticated;

grant select on app.ideas, app.idea_versions, app.claims, app.sources,
  app.claim_sources, app.idea_version_credits, app.taxonomy_terms,
  app.idea_version_terms to anonymous, authenticated;

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
grant execute on function app.version_is_published(uuid) to anonymous, authenticated;
grant execute on function app.archive_project(uuid, bigint) to authenticated;

commit;
