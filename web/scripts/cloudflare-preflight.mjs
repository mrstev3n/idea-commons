import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const webRoot = process.cwd();
const localOnly = process.argv.includes("--local");
const failures = [];
const requireCheck = (condition, message) => { if (!condition) failures.push(message); };
const config = JSON.parse(await readFile(path.join(webRoot, "wrangler.jsonc"), "utf8"));
const worker = await readFile(path.join(webRoot, "worker.ts"), "utf8");
const db = await readFile(path.join(webRoot, "src/server/db.ts"), "utf8");
const outbox = await readFile(path.join(webRoot, "src/server/worker.ts"), "utf8");
const provision = await readFile(path.join(webRoot, "scripts/provision-neon-development.mjs"), "utf8");
const dataApi = await readFile(path.join(webRoot, "src/server/data-api.ts"), "utf8");
const boundary = await readFile(path.join(webRoot, "../database/migrations/0006_data_api_rpc_boundary.sql"), "utf8");

requireCheck(config.main === "worker.ts", "entrypoint Worker custom absent");
requireCheck(worker.includes("createCloudflareEntrypoint"), "composition fetch/scheduled/queue absente");
requireCheck(config.vars?.NEON_DATA_API_URL?.endsWith("/neondb/rest/v1"), "endpoint Data API absent ou invalide");
requireCheck(dataApi.includes("Authorization: `Bearer ${authToken}`") && dataApi.includes('"Accept-Profile": "app"'), "JWT/profil app Data API non câblé");
requireCheck(boundary.includes("revoke all privileges on all tables in schema app from anonymous, authenticated"), "tables app directement exposées à la Data API");
requireCheck(boundary.includes("app.runtime_identity()") && boundary.includes("to authenticated"), "RPC Data API étroites absentes");
requireCheck(!db.includes("@electric-sql/pglite") && !db.includes("IC_DATA_DIR"), "adaptateur DB filesystem/PGlite actif");
requireCheck(!outbox.includes('from "node:child_process"') && !outbox.includes("spawn(process.execPath"), "child_process actif dans le Worker");
const outboxBinding = config.hyperdrive?.find(({ binding }) => binding === "OUTBOX_DATABASE");
requireCheck(Boolean(outboxBinding?.id && !outboxBinding.id.includes("PENDING")), "binding Hyperdrive OUTBOX_DATABASE réel absent");
const producer = config.queues?.producers?.find(({ binding }) => binding === "GENERATION_QUEUE");
const consumer = config.queues?.consumers?.find(({ queue }) => queue === producer?.queue);
requireCheck(Boolean(producer), "producer GENERATION_QUEUE absent");
requireCheck(Boolean(consumer), "consumer Queue absent");
requireCheck(consumer?.max_batch_size === 5, "batch Queue non borné à 5");
requireCheck(consumer?.max_concurrency === 1, "concurrence Queue non bornée à 1");
requireCheck(consumer?.max_retries === 5 && consumer?.retry_delay === 15, "retry Queue non borné");
requireCheck(Boolean(consumer?.dead_letter_queue), "DLQ absente");
requireCheck(config.triggers?.crons?.length === 1, "Cron durable absent ou multiple");
requireCheck(outbox.includes("message.retry();"), "épuisement consommateur n'alimente pas la DLQ");
requireCheck(provision.includes("revoke all privileges on all tables") && provision.includes("audit-runtime-role-boundaries"), "audit fail-closed des rôles service absent");
requireCheck(provision.includes("ic_trusted_continuation") && provision.includes("ic_runtime_service"), "séparation trusted/outbox absente");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? walk(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]))).flat();
}
for (const file of await walk(path.join(webRoot, "src/app"))) {
  if (!file.endsWith("route.ts")) continue;
  const source = await readFile(file, "utf8");
  if (/export\s+async\s+function\s+GET/.test(source)) {
    requireCheck(!/processOutbox|relayOutbox|consumeQueue|scheduledOutbox/.test(source), `effet outbox dans GET: ${path.relative(webRoot, file)}`);
  }
}
if (!localOnly) {
  const evidence = JSON.parse(await readFile(path.join(webRoot, "runtime-readiness.json"), "utf8"));
  requireCheck(evidence.neonDataApi?.jwtRlsPositiveNegative === true, "preuve distante JWT/RLS positive+négative absente");
  requireCheck(evidence.neonRoles?.outboxLeastPrivilege === true, "preuve distante moindre privilège outbox absente");
  requireCheck(evidence.neonRoles?.trustedContinuationLeastPrivilege === true, "preuve distante moindre privilège continuation absente");
  requireCheck(evidence.cloudflare?.bindingsVerified === true, "preuve distante bindings Worker absente");
}
if (failures.length) {
  console.error(`Préflight Cloudflare refusé (${localOnly ? "local" : "readiness"}) :`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Préflight Cloudflare ${localOnly ? "local" : "readiness"} réussi.`);
