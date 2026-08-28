import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const db = new PGlite();

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

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
    "0007_public_catalog_rpc.sql",
  ]) {
    await db.exec(await readFile(new URL(`database/migrations/${migration}`, root), "utf8"));
  }

  await db.exec(`
    insert into app.members (id, auth_user_id, display_name) values
      ('11000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000001', 'Auteur public synthétique');

    insert into app.ideas (id, slug) values
      ('21000000-0000-0000-0000-000000000001', 'idee-publique'),
      ('21000000-0000-0000-0000-000000000002', 'idee-non-repertoriee'),
      ('21000000-0000-0000-0000-000000000003', 'brouillon-prive');

    insert into app.idea_versions (
      id, idea_id, version_number, language, status, visibility, content,
      content_license, created_by, published_at
    ) values
      (
        '31000000-0000-0000-0000-000000000001',
        '21000000-0000-0000-0000-000000000001', 1, 'fr', 'draft', 'private',
        '{"title":"Idée publique","oneLineSummary":"Résumé public","problemStatement":"Problème public","targetAudiences":["public"],"proposedApproach":"Approche publique","mvpScope":["test"],"initialExclusions":["privé"],"coreAssumptions":["hypothèse"],"validationQuestions":["question"],"risks":["risque"]}',
        null, '11000000-0000-0000-0000-000000000001', null
      ),
      (
        '31000000-0000-0000-0000-000000000002',
        '21000000-0000-0000-0000-000000000002', 1, 'fr', 'draft', 'private',
        '{"title":"Idée non répertoriée","oneLineSummary":"Résumé par lien","problemStatement":"Problème public par lien","targetAudiences":["public"],"proposedApproach":"Approche","mvpScope":["test"],"initialExclusions":[],"coreAssumptions":[],"validationQuestions":[],"risks":[]}',
        null, '11000000-0000-0000-0000-000000000001', null
      ),
      (
        '31000000-0000-0000-0000-000000000003',
        '21000000-0000-0000-0000-000000000003', 1, 'fr', 'draft', 'private',
        '{"title":"DONNEE_PRIVEE_NE_DOIT_PAS_SORTIR"}',
        null, '11000000-0000-0000-0000-000000000001', null
      );

    insert into app.claims (id, idea_version_id, claim_type, statement, validation_status) values
      ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'hypothesis', 'Hypothèse publique synthétique.', 'untested'),
      ('41000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'hypothesis', 'Hypothèse non répertoriée synthétique.', 'untested');

    insert into app.idea_version_credits (idea_version_id, credit_order, display_name) values
      ('31000000-0000-0000-0000-000000000001', 1, 'Auteur public synthétique'),
      ('31000000-0000-0000-0000-000000000002', 1, 'Auteur public synthétique');

    update app.idea_versions
    set status = 'published', visibility = 'public', content_license = 'CC-BY-SA-4.0',
      published_at = '2026-08-20T00:00:00Z'
    where id = '31000000-0000-0000-0000-000000000001';
    update app.idea_versions
    set status = 'published', visibility = 'unlisted', content_license = 'CC-BY-SA-4.0',
      published_at = '2026-08-19T00:00:00Z'
    where id = '31000000-0000-0000-0000-000000000002';

    update app.ideas
    set current_published_version_id = '31000000-0000-0000-0000-000000000001'
    where id = '21000000-0000-0000-0000-000000000001';
    update app.ideas
    set current_published_version_id = '31000000-0000-0000-0000-000000000002'
    where id = '21000000-0000-0000-0000-000000000002';

    insert into app.projects (id, owner_member_id, source_idea_version_id, title, context) values (
      '61000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      'DONNEE_PROJET_PRIVEE_NE_DOIT_PAS_SORTIR',
      '{"private":true}'
    );
  `);

  const privileges = await db.query<{
    list_allowed: boolean;
    detail_allowed: boolean;
    member_rpc_allowed: boolean;
    direct_table_privileges: number;
    private_function_privileges: number;
  }>(`
    select
      has_function_privilege('anonymous', 'app.public_list_published_ideas()', 'EXECUTE') as list_allowed,
      has_function_privilege('anonymous', 'app.public_get_published_idea(text)', 'EXECUTE') as detail_allowed,
      has_function_privilege('anonymous', 'app.runtime_list_editorial_cases()', 'EXECUTE') as member_rpc_allowed,
      (
        select count(*)::int
        from pg_class as c
        join pg_namespace as n on n.oid = c.relnamespace
        where n.nspname = 'app'
          and c.relkind in ('r', 'v', 'm', 'p')
          and has_table_privilege('anonymous', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
      ) as direct_table_privileges,
      (
        select count(*)::int
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'app_private'
          and has_function_privilege('anonymous', p.oid, 'EXECUTE')
      ) as private_function_privileges
  `);
  assert.deepEqual(privileges.rows[0], {
    list_allowed: true,
    detail_allowed: true,
    member_rpc_allowed: false,
    direct_table_privileges: 0,
    private_function_privileges: 0,
  });

  await db.exec("set role anonymous");
  try {
    const listResult = await db.query<{ payload: unknown }>(
      "select app.public_list_published_ideas() as payload",
    );
    const list = jsonValue<Array<Record<string, unknown>>>(listResult.rows[0].payload);
    assert.equal(list.length, 1);
    assert.deepEqual(Object.keys(list[0]).sort(), [
      "claimCounts", "language", "oneLineSummary", "publishedAt",
      "slug", "sourceTitle", "sourceType", "title",
    ]);
    assert.equal(list[0].slug, "idee-publique");
    assert.equal(JSON.stringify(list).includes("DONNEE_PRIVEE"), false);

    const publicResult = await db.query<{ payload: unknown }>(
      "select app.public_get_published_idea('idee-publique') as payload",
    );
    const publicIdea = jsonValue<Record<string, unknown>>(publicResult.rows[0].payload);
    assert.deepEqual(Object.keys(publicIdea).sort(), [
      "claims", "content", "contentLicense", "credits", "language",
      "publishedAt", "slug", "versionNumber",
    ]);
    assert.equal(publicIdea.slug, "idee-publique");
    assert.deepEqual(Object.keys(publicIdea.content as Record<string, unknown>).sort(), [
      "coreAssumptions", "initialExclusions", "mvpScope", "oneLineSummary",
      "problemStatement", "proposedApproach", "risks", "targetAudiences",
      "title", "validationQuestions",
    ]);
    const publicClaims = publicIdea.claims as Array<Record<string, unknown>>;
    assert.deepEqual(Object.keys(publicClaims[0]).sort(), [
      "citations", "rationale", "statement", "type",
    ]);

    const unlistedResult = await db.query<{ payload: unknown }>(
      "select app.public_get_published_idea('idee-non-repertoriee') as payload",
    );
    assert.equal(
      jsonValue<Record<string, unknown>>(unlistedResult.rows[0].payload).slug,
      "idee-non-repertoriee",
    );

    const privateResult = await db.query<{ payload: unknown }>(
      "select app.public_get_published_idea('brouillon-prive') as payload",
    );
    assert.equal(privateResult.rows[0].payload, null);

    await assert.rejects(db.query("select * from app.projects"), /permission denied/i);
    await assert.rejects(
      db.query("select app.runtime_list_editorial_cases()"),
      /permission denied/i,
    );
  } finally {
    await db.exec("reset role");
  }

  console.log("public catalogue contract: anonymous projections allowed; unlisted bounded; private tables and member RPCs denied");
} finally {
  await db.close();
}
