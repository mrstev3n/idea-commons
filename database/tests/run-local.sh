#!/bin/sh
set -eu

if ! command -v psql >/dev/null 2>&1 || ! command -v createdb >/dev/null 2>&1 || ! command -v dropdb >/dev/null 2>&1; then
  echo "PostgreSQL client tools are required: psql, createdb, and dropdb." >&2
  exit 1
fi

database_name="idea_commons_m0_test_$$"
anonymous_preexisting="$(psql -X -A -t -d postgres -c "select exists (select 1 from pg_roles where rolname = 'anonymous')")"
authenticated_preexisting="$(psql -X -A -t -d postgres -c "select exists (select 1 from pg_roles where rolname = 'authenticated')")"
cleanup() {
  dropdb --if-exists "$database_name" >/dev/null 2>&1 || true
  if [ "$anonymous_preexisting" = "f" ]; then
    psql -X -d postgres -c 'drop role if exists anonymous' >/dev/null 2>&1 || true
  fi
  if [ "$authenticated_preexisting" = "f" ]; then
    psql -X -d postgres -c 'drop role if exists authenticated' >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

createdb "$database_name"
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/tests/bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0001_m0_data_model.sql
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0002_m0_data_api_grants.sql
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/tests/m0_rls_test.sql

if psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0001_m0_data_model.sql >/dev/null 2>&1; then
  echo "Migration replay unexpectedly succeeded." >&2
  exit 1
fi

echo "M0 migration, RLS matrix, and replay guard passed."
