import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const db = new PGlite();
try {
  const bootstrap = (await readFile(new URL("database/tests/bootstrap.sql", root), "utf8"))
    .split("\n")
    .filter((line) => !line.startsWith("\\"))
    .join("\n");
  await db.exec(bootstrap);
  for (const migration of [
    "0001_m0_data_model.sql",
    "0002_m0_data_api_grants.sql",
    "0003_m1_editorial_pipeline.sql",
    "0004_cloudflare_outbox_delivery.sql",
    "0005_server_verified_identity.sql",
    "0006_data_api_rpc_boundary.sql",
  ]) {
    await db.exec(await readFile(new URL(`database/migrations/${migration}`, root), "utf8"));
  }
  const columns = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'app_private' and table_name = 'outbox_events'
        and column_name in ('available_at','attempt_count','dispatched_at','dispatch_lease_until','last_error_code')`,
  );
  assert.equal(columns.rows.length, 5);
  const uniqueIndex = await db.query<{ present: boolean }>(
    "select to_regclass('app.editorial_candidates_generation_unique_idx') is not null as present",
  );
  assert.equal(uniqueIndex.rows[0]?.present, true);
  const identity = await db.query<{ present: boolean }>(
    "select pg_get_functiondef('app.current_auth_user_id()'::regprocedure) like '%request.jwt.claim.sub%' as present",
  );
  assert.equal(identity.rows[0]?.present, true);
  console.log("migration contract: 0001→0006 applied in-memory; Data API, outbox and server identity contracts present");
} finally {
  await db.close();
}
