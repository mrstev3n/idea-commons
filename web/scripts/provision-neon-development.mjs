import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";

const ownerUrl = process.env.IC_NEON_OWNER_URL;
const runtimePasswordFile = process.env.IC_RUNTIME_SERVICE_PASSWORD_FILE;
const trustedPasswordFile = process.env.IC_TRUSTED_SERVICE_PASSWORD_FILE;
const runtimePassword = runtimePasswordFile ? (await readFile(runtimePasswordFile, "utf8")).trim() : null;
const trustedPassword = trustedPasswordFile ? (await readFile(trustedPasswordFile, "utf8")).trim() : null;
if (!ownerUrl || !runtimePassword || !trustedPassword) {
  throw new Error("configuration de provisionnement absente");
}

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(webRoot);
const owner = new Client({ connectionString: ownerUrl });
const roleName = "ic_runtime_service";
const trustedRoleName = "ic_trusted_continuation";

function migration(name) {
  return readFile(path.join(root, "database", "migrations", name), "utf8");
}

await owner.connect();
let step = "inspect-version";
try {
  const version = await owner.query("select current_setting('server_version') as version");
  const m1 = await owner.query("select to_regclass('app.source_intakes') is not null as applied");
  if (!m1.rows[0].applied) await owner.query(await migration("0003_m1_editorial_pipeline.sql"));

  const outboxLease = await owner.query(
    `select exists (
       select 1 from information_schema.columns
        where table_schema='app_private' and table_name='outbox_events'
          and column_name='dispatch_lease_until') as applied`,
  );
  if (!outboxLease.rows[0].applied) await owner.query(await migration("0004_cloudflare_outbox_delivery.sql"));

  const identityFallback = await owner.query(
    "select pg_get_functiondef('app.current_auth_user_id()'::regprocedure) like '%request.jwt.claim.sub%' as applied",
  );
  if (!identityFallback.rows[0].applied) await owner.query(await migration("0005_server_verified_identity.sql"));
  const dataApiBoundary = await owner.query("select to_regprocedure('app.runtime_identity()') is not null as applied");
  if (!dataApiBoundary.rows[0].applied) await owner.query(await migration("0006_data_api_rpc_boundary.sql"));

  step = "create-or-rotate-runtime-role";
  const escapedPassword = owner.escapeLiteral(runtimePassword);
  const role = await owner.query("select exists(select 1 from pg_roles where rolname=$1) as present", [roleName]);
  if (!role.rows[0].present) {
    await owner.query(`create role ${roleName} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password ${escapedPassword}`);
  } else {
    const attributes = await owner.query(
      "select rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls as bounded from pg_roles where rolname=$1",
      [roleName],
    );
    if (!attributes.rows[0]?.bounded) throw new Error("attributs du rôle runtime non bornés");
    await owner.query(`alter role ${roleName} password ${escapedPassword}`);
  }
  step = "grant-runtime-privileges";
  await owner.query(`revoke all privileges on all tables in schema app, app_private from ${roleName}`);
  await owner.query(`revoke all privileges on all sequences in schema app, app_private from ${roleName}`);
  await owner.query(`revoke all privileges on all functions in schema app, app_private from ${roleName}`);
  await owner.query(`grant connect on database neondb to ${roleName}`);
  await owner.query(`grant usage on schema app, app_private to ${roleName}`);
  await owner.query(`grant select on app.source_intakes, app.ai_generations, app_private.outbox_events to ${roleName}`);
  await owner.query(`grant update on app.ai_generations, app_private.outbox_events to ${roleName}`);
  await owner.query(`grant insert on app.ai_generation_attempts, app.editorial_candidates, app.candidate_revisions to ${roleName}`);
  await owner.query(`grant insert on app_private.audit_events to ${roleName}`);
  await owner.query(`grant usage, select on sequence app_private.audit_events_id_seq to ${roleName}`);

  step = "create-trusted-continuation-role";
  const trustedRole = await owner.query("select exists(select 1 from pg_roles where rolname=$1) as present", [trustedRoleName]);
  if (!trustedRole.rows[0].present) {
    await owner.query(`create role ${trustedRoleName} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password ${owner.escapeLiteral(trustedPassword)}`);
  } else {
    const attributes = await owner.query(
      "select rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb and not rolcreaterole and not rolbypassrls as bounded from pg_roles where rolname=$1",
      [trustedRoleName],
    );
    if (!attributes.rows[0]?.bounded) throw new Error("attributs du rôle trusted non bornés");
    await owner.query(`alter role ${trustedRoleName} password ${owner.escapeLiteral(trustedPassword)}`);
  }
  step = "grant-trusted-continuation-privileges";
  await owner.query(`revoke all privileges on all tables in schema app, app_private from ${trustedRoleName}`);
  await owner.query(`revoke all privileges on all sequences in schema app, app_private from ${trustedRoleName}`);
  await owner.query(`revoke all privileges on all functions in schema app, app_private from ${trustedRoleName}`);
  await owner.query(`grant connect on database neondb to ${trustedRoleName}`);
  await owner.query(`grant usage on schema app to ${trustedRoleName}`);
  await owner.query(`grant execute on function app.record_verified_source_fingerprint(uuid,bigint,text) to ${trustedRoleName}`);

  step = "audit-runtime-role-boundaries";
  const memberships = await owner.query(
    `select member.rolname as member, parent.rolname as parent
       from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles parent on parent.oid=m.roleid
      where member.rolname = any($1::text[])`,
    [[roleName, trustedRoleName]],
  );
  if (memberships.rows.length) throw new Error("membership inattendue sur une identité de service");
  const unexpectedTables = await owner.query(
    `with effective as (
       select r.rolname, n.nspname, c.relname, privilege_type
         from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
         cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_type)
        where r.rolname=any($1::text[]) and n.nspname in ('app','app_private')
          and c.relkind in ('r','p','v','m','f')
          and has_table_privilege(r.oid,c.oid,privilege_type)
     )
     select * from effective e where not exists (
       select 1 from (values
         ($2,'app','source_intakes','SELECT'),
         ($2,'app','ai_generations','SELECT'), ($2,'app','ai_generations','UPDATE'),
         ($2,'app','ai_generation_attempts','INSERT'),
         ($2,'app','editorial_candidates','INSERT'),
         ($2,'app','candidate_revisions','INSERT'),
         ($2,'app_private','outbox_events','SELECT'), ($2,'app_private','outbox_events','UPDATE'),
         ($2,'app_private','audit_events','INSERT')
       ) allowed(rolname,nspname,relname,privilege_type)
       where (allowed.rolname,allowed.nspname,allowed.relname,allowed.privilege_type)
           =(e.rolname,e.nspname,e.relname,e.privilege_type)
     )`,
    [[roleName, trustedRoleName], roleName],
  );
  if (unexpectedTables.rows.length) throw new Error("privilège de table inattendu sur une identité de service");
  const unexpectedSchemas = await owner.query(
    `select r.rolname,n.nspname,privilege_type
       from pg_roles r cross join pg_namespace n
       cross join (values ('USAGE'),('CREATE')) p(privilege_type)
      where r.rolname=any($1::text[]) and n.nspname in ('app','app_private')
        and has_schema_privilege(r.oid,n.oid,privilege_type)
        and not ((r.rolname=$2 and n.nspname in ('app','app_private') and privilege_type='USAGE')
          or (r.rolname=$3 and n.nspname='app' and privilege_type='USAGE'))`,
    [[roleName, trustedRoleName], roleName, trustedRoleName],
  );
  if (unexpectedSchemas.rows.length) throw new Error("privilège de schéma inattendu sur une identité de service");
  const unexpectedSequences = await owner.query(
    `select r.rolname,n.nspname,c.relname,privilege_type
       from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join (values ('SELECT'),('USAGE'),('UPDATE')) p(privilege_type)
      where r.rolname=any($1::text[]) and n.nspname in ('app','app_private') and c.relkind='S'
        and has_sequence_privilege(r.oid,c.oid,privilege_type)
        and not (r.rolname=$2 and n.nspname='app_private' and c.relname='audit_events_id_seq'
          and privilege_type in ('SELECT','USAGE'))`,
    [[roleName, trustedRoleName], roleName],
  );
  if (unexpectedSequences.rows.length) throw new Error("privilège de séquence inattendu sur une identité de service");
  const unexpectedFunctions = await owner.query(
    `select r.rolname, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) arguments
       from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where r.rolname=any($1::text[]) and n.nspname in ('app','app_private')
        and has_function_privilege(r.oid,p.oid,'execute')
        and not (r.rolname=$2 and p.oid='app.record_verified_source_fingerprint(uuid,bigint,text)'::regprocedure)`,
    [[roleName, trustedRoleName], trustedRoleName],
  );
  if (unexpectedFunctions.rows.length) throw new Error("privilège de fonction inattendu sur une identité de service");
  const runtimeFingerprint = await owner.query(
    "select has_function_privilege($1,'app.record_verified_source_fingerprint(uuid,bigint,text)','execute') as runtime_has, has_function_privilege($2,'app.record_verified_source_fingerprint(uuid,bigint,text)','execute') as trusted_has, has_function_privilege($1,'app.purge_expired_source_texts(timestamptz)','execute') as runtime_purge",
    [roleName, trustedRoleName],
  );
  if (runtimeFingerprint.rows[0].runtime_has || runtimeFingerprint.rows[0].runtime_purge || !runtimeFingerprint.rows[0].trusted_has) {
    throw new Error("frontière fonctionnelle service/trusted invalide");
  }

  step = "run-m1-tests";
  await owner.query(await readFile(path.join(root, "database", "tests", "m1_editorial_pipeline_test.sql"), "utf8"));

  const shape = await owner.query(
    `select
       to_regclass('app.source_intakes') is not null as m1,
       to_regclass('app.editorial_candidates_generation_unique_idx') is not null as candidate_idempotency,
       exists(select 1 from information_schema.columns where table_schema='app_private' and table_name='outbox_events' and column_name='dispatch_lease_until') as outbox_lease,
       pg_get_functiondef('app.current_auth_user_id()'::regprocedure) like '%request.jwt.claim.sub%' as server_identity_fallback,
       not has_function_privilege($1,'app.record_verified_source_fingerprint(uuid,bigint,text)','execute') as outbox_cannot_verify_fingerprint,
       has_function_privilege($2,'app.record_verified_source_fingerprint(uuid,bigint,text)','execute') as trusted_fingerprint`,
    [roleName, trustedRoleName],
  );
  console.log(JSON.stringify({
    postgresVersion: version.rows[0].version,
    migrationShape: shape.rows[0],
    m1Tests: "passed-and-rolled-back",
    runtimeRole: roleName,
    trustedRole: trustedRoleName,
  }));
} catch (error) {
  console.error(JSON.stringify({
    error: "neon-development-provisioning-failed",
    step,
    code: error?.code ?? "unknown",
    assertion: error?.code === "P0001" ? String(error.message).slice(0, 240) : undefined,
  }));
  process.exitCode = 1;
} finally {
  await owner.end();
}
