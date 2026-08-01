\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nobypassrls;
  end if;
end;
$$;

do $$
begin
  execute format('grant anonymous, authenticated to %I', current_user);
end;
$$;

create schema auth;

create function auth.user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')
$$;

revoke all on schema auth from public;
revoke all on function auth.user_id() from public;
grant usage on schema auth to anonymous, authenticated;
grant execute on function auth.user_id() to anonymous, authenticated;

comment on schema auth is 'Local test shim only; Neon Data API supplies auth.user_id in hosted environments';
