import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { isWorkerVersionId } from "./cloudflare-preview.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), "..");

function requireCheck(failures, condition, message) {
  if (!condition) failures.push(message);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? walk(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]))).flat();
}

export async function loadStaticInputs(root = webRoot) {
  const routes = [];
  for (const file of await walk(path.join(root, "src/app"))) {
    if (!file.endsWith("route.ts")) continue;
    routes.push({
      name: path.relative(root, file),
      source: await readFile(file, "utf8"),
    });
  }
  return {
    config: JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8")),
    packageManifest: JSON.parse(await readFile(path.join(root, "package.json"), "utf8")),
    previewWorkflow: await readFile(path.join(root, "scripts/cloudflare-preview.mjs"), "utf8"),
    worker: await readFile(path.join(root, "worker.ts"), "utf8"),
    db: await readFile(path.join(root, "src/server/db.ts"), "utf8"),
    outbox: await readFile(path.join(root, "src/server/worker.ts"), "utf8"),
    provision: await readFile(path.join(root, "scripts/provision-neon-development.mjs"), "utf8"),
    dataApi: await readFile(path.join(root, "src/server/data-api.ts"), "utf8"),
    boundary: await readFile(path.join(root, "../database/migrations/0006_data_api_rpc_boundary.sql"), "utf8"),
    publicBoundary: await readFile(path.join(root, "../database/migrations/0007_public_catalog_rpc.sql"), "utf8"),
    evidence: JSON.parse(await readFile(path.join(root, "runtime-readiness.json"), "utf8")),
    routes,
  };
}

export function collectStaticFailures({ config, packageManifest, previewWorkflow, worker, db, outbox, provision, dataApi, boundary, publicBoundary, routes }) {
  const failures = [];
  requireCheck(failures, config.main === "worker.ts", "entrypoint Worker custom absent");
  requireCheck(failures, packageManifest.scripts?.["preview:dev"] === "node scripts/cloudflare-preview.mjs", "workflow preview fail-closed absent");
  requireCheck(failures, previewWorkflow.includes("WRANGLER_OUTPUT_FILE_PATH") && previewWorkflow.includes('"cloudflare:post-upload"'), "contrôle post-upload obligatoire absent du workflow preview");
  requireCheck(failures, worker.includes("createCloudflareEntrypoint"), "composition fetch/scheduled/queue absente");
  requireCheck(failures, config.vars?.NEON_DATA_API_URL?.endsWith("/neondb/rest/v1"), "endpoint Data API absent ou invalide");
  requireCheck(failures, dataApi.includes("headers.Authorization = `Bearer ${authToken}`") && dataApi.includes('"Accept-Profile": "app"'), "JWT/profil app Data API non câblé");
  requireCheck(failures, dataApi.includes("dataApiPublicRpc") && dataApi.includes("return callDataApiRpc(name, parameters);"), "transport RPC public sans JWT absent");
  requireCheck(failures, boundary.includes("revoke all privileges on all tables in schema app from anonymous, authenticated"), "tables app directement exposées à la Data API");
  requireCheck(failures, boundary.includes("app.runtime_identity()") && boundary.includes("to authenticated"), "RPC Data API étroites absentes");
  requireCheck(failures, publicBoundary.includes("app.public_list_published_ideas()") && publicBoundary.includes("app.public_get_published_idea(text)"), "projections catalogue publiques absentes");
  requireCheck(failures, publicBoundary.includes("to anonymous") && publicBoundary.includes("from public, authenticated"), "grants anonymes du catalogue non bornés");
  requireCheck(failures, publicBoundary.includes("revoke all privileges on all tables in schema app from anonymous, authenticated"), "projection catalogue restaure un accès table direct");
  requireCheck(failures, !db.includes("@electric-sql/pglite") && !db.includes("IC_DATA_DIR"), "adaptateur DB filesystem/PGlite actif");
  requireCheck(failures, !outbox.includes('from "node:child_process"') && !outbox.includes("spawn(process.execPath"), "child_process actif dans le Worker");
  const outboxBinding = config.hyperdrive?.find(({ binding }) => binding === "OUTBOX_DATABASE");
  requireCheck(failures, Boolean(outboxBinding?.id && !outboxBinding.id.includes("PENDING")), "binding Hyperdrive OUTBOX_DATABASE réel absent");
  const producer = config.queues?.producers?.find(({ binding }) => binding === "GENERATION_QUEUE");
  const consumer = config.queues?.consumers?.find(({ queue }) => queue === producer?.queue);
  requireCheck(failures, Boolean(producer), "producer GENERATION_QUEUE absent");
  requireCheck(failures, Boolean(consumer), "consumer Queue absent");
  requireCheck(failures, consumer?.max_batch_size === 5, "batch Queue non borné à 5");
  requireCheck(failures, consumer?.max_concurrency === 1, "concurrence Queue non bornée à 1");
  requireCheck(failures, consumer?.max_retries === 5 && consumer?.retry_delay === 15, "retry Queue non borné");
  requireCheck(failures, Boolean(consumer?.dead_letter_queue), "DLQ absente");
  requireCheck(failures, config.triggers?.crons?.length === 1, "Cron durable absent ou multiple");
  requireCheck(failures, outbox.includes("message.retry();"), "épuisement consommateur n'alimente pas la DLQ");
  requireCheck(failures, provision.includes("revoke all privileges on all tables") && provision.includes("audit-runtime-role-boundaries"), "audit fail-closed des rôles service absent");
  requireCheck(failures, provision.includes("ic_trusted_continuation") && provision.includes("ic_runtime_service"), "séparation trusted/outbox absente");
  const requiredSecrets = config.secrets?.required ?? [];
  for (const name of ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "TRUSTED_DATABASE_URL"]) {
    requireCheck(failures, requiredSecrets.includes(name), `secret requis non déclaré : ${name}`);
  }
  for (const route of routes) {
    if (/export\s+async\s+function\s+GET/.test(route.source)) {
      requireCheck(failures, !/processOutbox|relayOutbox|consumeQueue|scheduledOutbox/.test(route.source), `effet outbox dans GET: ${route.name}`);
    }
  }
  return failures;
}

function hasDocumentedEvidence(item) {
  return item?.verified === true
    && item?.source?.environment === "development"
    && typeof item?.source?.reference === "string"
    && item.source.reference.length > 0
    && Array.isArray(item?.limits)
    && item.limits.length > 0;
}

export function collectPreUploadFailures({ config, evidence, hyperdrive, queueList }) {
  const failures = [];
  requireCheck(failures, evidence.schemaVersion === 2, "schéma de readiness inconnu");
  requireCheck(failures, evidence.environment === "development", "readiness hors development refusée");
  requireCheck(failures, hasDocumentedEvidence(evidence.neonDataApi?.jwtRlsPositiveNegative), "preuve distante JWT/RLS positive+négative absente ou non documentée");
  requireCheck(failures, hasDocumentedEvidence(evidence.neonDataApi?.publicCatalogAnonymous), "preuve distante catalogue anonyme positive+négative absente ou non documentée");
  requireCheck(failures, hasDocumentedEvidence(evidence.neonRoles?.outboxLeastPrivilege), "preuve distante moindre privilège outbox absente ou non documentée");
  requireCheck(failures, hasDocumentedEvidence(evidence.neonRoles?.trustedContinuationLeastPrivilege), "preuve distante moindre privilège continuation absente ou non documentée");
  requireCheck(failures, hasDocumentedEvidence(evidence.cloudflare?.resources), "preuve distante des ressources Cloudflare absente ou non documentée");

  const expectedHyperdrive = evidence.cloudflare?.resources?.hyperdrive;
  const configHyperdrive = config.hyperdrive?.find(({ binding }) => binding === "OUTBOX_DATABASE");
  requireCheck(failures, hyperdrive?.id === expectedHyperdrive?.id && hyperdrive?.id === configHyperdrive?.id, "Hyperdrive development attendu absent");
  requireCheck(failures, hyperdrive?.origin?.user === expectedHyperdrive?.expectedUser, "identité Hyperdrive inattendue");
  requireCheck(failures, hyperdrive?.origin_connection_limit === expectedHyperdrive?.originConnectionLimit, "limite de connexions Hyperdrive inattendue");
  requireCheck(failures, expectedHyperdrive?.cachingDisabled === true && hyperdrive?.caching?.disabled === expectedHyperdrive.cachingDisabled, "cache Hyperdrive doit rester désactivé");

  const producer = config.queues?.producers?.find(({ binding }) => binding === "GENERATION_QUEUE");
  const consumer = config.queues?.consumers?.find(({ queue }) => queue === producer?.queue);
  const expectedQueues = evidence.cloudflare?.resources?.queues ?? [];
  requireCheck(failures, expectedQueues.includes(producer?.queue) && queueList.includes(producer?.queue), "Queue generation development absente");
  requireCheck(failures, expectedQueues.includes(consumer?.dead_letter_queue) && queueList.includes(consumer?.dead_letter_queue), "DLQ development absente");
  return failures;
}

export function collectPostUploadFailures({ config, evidence, version, versionId }) {
  const failures = [];
  requireCheck(failures, evidence.cloudflare?.postUpload?.required === true, "preuve post-upload non exigée par le contrat");
  requireCheck(failures, isWorkerVersionId(versionId), "ID de version Worker explicite requis");
  requireCheck(failures, version?.id === versionId, "version Worker demandée introuvable");
  const handlers = version?.resources?.script?.handlers ?? [];
  for (const handler of ["fetch", "scheduled", "queue"]) {
    requireCheck(failures, handlers.includes(handler), `handler Worker absent : ${handler}`);
  }
  const bindings = version?.resources?.bindings ?? [];
  const hasBinding = (name, type) => bindings.some((binding) => binding.name === name && binding.type === type);
  requireCheck(failures, hasBinding("OUTBOX_DATABASE", "hyperdrive"), "binding version Hyperdrive absent");
  requireCheck(failures, hasBinding("GENERATION_QUEUE", "queue"), "binding version Queue absent");
  requireCheck(failures, hasBinding("NEON_DATA_API_URL", "plain_text"), "binding version Data API absent");
  const requiredSecrets = evidence.cloudflare?.postUpload?.requiredSecrets ?? [];
  for (const name of requiredSecrets) {
    requireCheck(failures, config.secrets?.required?.includes(name), `secret post-upload non déclaré : ${name}`);
    requireCheck(failures, hasBinding(name, "secret_text"), `secret post-upload absent : ${name}`);
  }
  return failures;
}

function parseJsonOutput(output, label) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`${label} illisible`);
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error(`${label} illisible`);
  }
}

async function runWrangler(args, label) {
  const wranglerBin = path.join(webRoot, "node_modules/wrangler/bin/wrangler.js");
  try {
    const { stdout } = await execFileAsync(process.execPath, [wranglerBin, ...args], {
      cwd: webRoot,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const code = typeof error?.code === "number" ? error.code : "inconnu";
    throw new Error(`${label} refusé (code ${code}); sortie distante masquée`);
  }
}

async function loadRemoteResources(config) {
  const hyperdriveId = config.hyperdrive.find(({ binding }) => binding === "OUTBOX_DATABASE").id;
  const [hyperdriveOutput, queueOutput] = await Promise.all([
    runWrangler(["hyperdrive", "get", hyperdriveId], "lecture Hyperdrive"),
    runWrangler(["queues", "list"], "lecture Queues"),
  ]);
  const hyperdrive = parseJsonOutput(hyperdriveOutput, "métadonnées Hyperdrive");
  const expectedQueueNames = [
    config.queues.producers.find(({ binding }) => binding === "GENERATION_QUEUE")?.queue,
    config.queues.consumers[0]?.dead_letter_queue,
  ].filter(Boolean);
  return {
    hyperdrive,
    queueList: expectedQueueNames.filter((name) => queueOutput.includes(name)),
  };
}

async function loadWorkerVersion(config, versionId) {
  const output = await runWrangler([
    "versions", "view", versionId,
    "--name", config.name,
    "--json",
  ], "lecture version Worker");
  return parseJsonOutput(output, "métadonnées version Worker");
}

function parseOptions(argv) {
  const local = argv.includes("--local");
  const postUpload = argv.includes("--post-upload");
  const versionFlag = argv.findIndex((value) => value === "--version-id");
  const inlineVersion = argv.find((value) => value.startsWith("--version-id="))?.split("=", 2)[1];
  return {
    phase: local ? "local" : postUpload ? "post-upload" : "pre-upload",
    versionId: inlineVersion ?? (versionFlag >= 0 ? argv[versionFlag + 1] : undefined),
  };
}

export async function main(argv = process.argv.slice(2), {
  loadInputs = loadStaticInputs,
  loadResources = loadRemoteResources,
  loadVersion = loadWorkerVersion,
  logError = console.error,
  logSuccess = console.log,
} = {}) {
  const { phase, versionId } = parseOptions(argv);
  const inputs = await loadInputs();
  const failures = collectStaticFailures(inputs);
  if (phase === "post-upload" && !isWorkerVersionId(versionId)) {
    failures.push("ID de version Worker explicite requis");
  }
  if (phase !== "local" && failures.length === 0) {
    try {
      const remote = await loadResources(inputs.config);
      failures.push(...collectPreUploadFailures({ ...inputs, ...remote }));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "lecture des ressources Cloudflare refusée");
    }
  }
  if (phase === "post-upload" && failures.length === 0) {
    try {
      const version = await loadVersion(inputs.config, versionId);
      failures.push(...collectPostUploadFailures({ ...inputs, version, versionId }));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "lecture de la version Worker refusée");
    }
  }
  if (failures.length) {
    logError(`Préflight Cloudflare refusé (${phase}) :`);
    failures.forEach((failure) => logError(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  logSuccess(`Préflight Cloudflare ${phase} réussi.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
