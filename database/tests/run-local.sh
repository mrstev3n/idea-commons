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
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0003_m1_editorial_pipeline.sql
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/tests/m1_editorial_pipeline_test.sql
psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0004_cloudflare_outbox_delivery.sql

outbox_delivery_shape="$(psql -X -A -t -d "$database_name" -c "select count(*) from information_schema.columns where table_schema='app_private' and table_name='outbox_events' and column_name in ('available_at','attempt_count','dispatched_at','dispatch_lease_until','last_error_code')")"
if [ "$outbox_delivery_shape" != "5" ]; then
  echo "Outbox delivery migration shape failed: $outbox_delivery_shape (expected 5 including two existing columns)." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -d "$database_name" <<'SQL'
insert into app.members(id,auth_user_id,display_name) values
 ('21000000-0000-0000-0000-000000000001','02000000-0000-0000-0000-000000000001','Contributor concurrence'),
 ('21000000-0000-0000-0000-000000000002','02000000-0000-0000-0000-000000000002','Reviewer concurrence A'),
 ('21000000-0000-0000-0000-000000000003','02000000-0000-0000-0000-000000000003','Reviewer concurrence B');
insert into app.member_role_assignments(member_id,role) values
 ('21000000-0000-0000-0000-000000000001','contributor'),
 ('21000000-0000-0000-0000-000000000002','reviewer'),
 ('21000000-0000-0000-0000-000000000003','reviewer');
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis) values
 ('25000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','text','Course approbation approbation',now(),repeat('a',64),'[{"id":"ex-1","text":"Fait concurrent synthétique A.","locator":"p1"}]','idea_commons'),
 ('25000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','text','Course approbation rejet',now(),repeat('b',64),'[{"id":"ex-1","text":"Fait concurrent synthétique B.","locator":"p1"}]','idea_commons');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values
 ('24000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','in_review',1),
 ('24000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','in_review',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid) values
 ('24000000-0000-0000-0000-000000000001',1,'{"title":"Course A","oneLineSummary":"Résumé","problemStatement":"Problème","targetAudiences":["public"],"proposedApproach":"Approche","mvpScope":["test"],"initialExclusions":["paiement"],"coreAssumptions":["hypothèse"],"validationQuestions":["question"],"risks":["risque"],"claims":[{"type":"fact","statement":"Fait concurrent synthétique A.","rationale":null,"citationExcerptIds":["ex-1"]}]}','21000000-0000-0000-0000-000000000001','Fixture concurrence A',true,true,true),
 ('24000000-0000-0000-0000-000000000002',1,'{"title":"Course B","oneLineSummary":"Résumé","problemStatement":"Problème","targetAudiences":["public"],"proposedApproach":"Approche","mvpScope":["test"],"initialExclusions":["paiement"],"coreAssumptions":["hypothèse"],"validationQuestions":["question"],"risks":["risque"],"claims":[{"type":"fact","statement":"Fait concurrent synthétique B.","rationale":null,"citationExcerptIds":["ex-1"]}]}','21000000-0000-0000-0000-000000000001','Fixture concurrence B',true,true,true);
SQL

run_native_approval() {
  auth_user_id="$1"
  candidate_id="$2"
  slug="$3"
  idempotency_key="$4"
  request_fingerprint="$5"
  psql -X -v ON_ERROR_STOP=1 -d "$database_name" -c "begin; select set_config('request.jwt.claim.sub','$auth_user_id',true); set local role authenticated; select pg_sleep(0.25); select app.approve_and_publish_candidate('$candidate_id',1,'Décision concurrente native','{\"rights\":true,\"citations\":true,\"prudence\":true}','$slug','CC-BY-SA-4.0','Revue concurrente','$idempotency_key','$request_fingerprint'); commit;"
}

run_native_rejection() {
  auth_user_id="$1"
  candidate_id="$2"
  psql -X -v ON_ERROR_STOP=1 -d "$database_name" -c "begin; select set_config('request.jwt.claim.sub','$auth_user_id',true); set local role authenticated; select pg_sleep(0.25); select app.reject_candidate('$candidate_id',1,'Rejet concurrent natif','{\"rights\":false}'); commit;"
}

assert_one_native_winner() {
  first_pid="$1"
  second_pid="$2"
  winners=0
  if wait "$first_pid"; then winners=$((winners + 1)); fi
  if wait "$second_pid"; then winners=$((winners + 1)); fi
  if [ "$winners" -ne 1 ]; then
    echo "Concurrent review test expected exactly one winner, got $winners." >&2
    exit 1
  fi
}

run_native_approval '02000000-0000-0000-0000-000000000002' '24000000-0000-0000-0000-000000000001' 'course-native-a' 'native-aa-a' '1111111111111111111111111111111111111111111111111111111111111111' >/dev/null 2>&1 &
approval_a_pid=$!
run_native_approval '02000000-0000-0000-0000-000000000003' '24000000-0000-0000-0000-000000000001' 'course-native-b' 'native-aa-b' '2222222222222222222222222222222222222222222222222222222222222222' >/dev/null 2>&1 &
approval_b_pid=$!
assert_one_native_winner "$approval_a_pid" "$approval_b_pid"

aa_counts="$(psql -X -A -t -d "$database_name" -c "select count(*)||':'||count(*) filter(where c.published_idea_version_id is not null)||':'||(select count(*) from app_private.outbox_events where topic='editorial.idea.published' and payload->>'candidate_id'=c.id::text) from app.review_decisions d join app.editorial_candidates c on c.id=d.candidate_id where c.id='24000000-0000-0000-0000-000000000001' group by c.id")"
if [ "$aa_counts" != "1:1:1" ]; then
  echo "Concurrent approval/approval invariant failed: $aa_counts (expected 1:1:1)." >&2
  exit 1
fi

run_native_approval '02000000-0000-0000-0000-000000000002' '24000000-0000-0000-0000-000000000002' 'course-native-c' 'native-ar-a' '3333333333333333333333333333333333333333333333333333333333333333' >/dev/null 2>&1 &
approval_reject_pid=$!
run_native_rejection '02000000-0000-0000-0000-000000000003' '24000000-0000-0000-0000-000000000002' >/dev/null 2>&1 &
rejection_pid=$!
assert_one_native_winner "$approval_reject_pid" "$rejection_pid"

ar_counts="$(psql -X -A -t -d "$database_name" -c "select count(*)||':'||count(*) filter(where c.published_idea_version_id is not null)||':'||(select count(*) from app_private.outbox_events where topic='editorial.idea.published' and payload->>'candidate_id'=c.id::text) from app.review_decisions d join app.editorial_candidates c on c.id=d.candidate_id where c.id='24000000-0000-0000-0000-000000000002' group by c.id")"
case "$ar_counts" in
  1:0:0|1:1:1) ;;
  *) echo "Concurrent approval/rejection invariant failed: $ar_counts (expected one decision and at most one publication)." >&2; exit 1 ;;
esac

echo "Native PostgreSQL concurrent decision tests passed."

if psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0001_m0_data_model.sql >/dev/null 2>&1; then
  echo "Migration replay unexpectedly succeeded." >&2
  exit 1
fi

if psql -X -v ON_ERROR_STOP=1 -d "$database_name" -f database/migrations/0003_m1_editorial_pipeline.sql >/dev/null 2>&1; then
  echo "M1 migration replay unexpectedly succeeded." >&2
  exit 1
fi

echo "M0/M1 migrations, RLS matrices, and replay guards passed."
