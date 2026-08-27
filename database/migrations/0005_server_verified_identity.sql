begin;

create or replace function app.current_auth_user_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  raw_user_id text;
begin
  if to_regprocedure('auth.user_id()') is not null then
    execute 'select auth.user_id()::text' into raw_user_id;
  end if;
  raw_user_id := coalesce(nullif(raw_user_id, ''), nullif(current_setting('request.jwt.claim.sub', true), ''));
  return raw_user_id::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function app.current_auth_user_id() is
  'Neon Auth identity when available; otherwise the server-verified authUserId injected transaction-locally by the Hyperdrive application adapter.';

commit;
