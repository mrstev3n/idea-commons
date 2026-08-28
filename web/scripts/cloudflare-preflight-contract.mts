import assert from "node:assert/strict";
import {
  collectPostUploadFailures,
  collectPreUploadFailures,
  collectStaticFailures,
  loadStaticInputs,
} from "./cloudflare-preflight.mjs";
import { extractVersionUpload, runPreviewWorkflow } from "./cloudflare-preview.mjs";

const inputs = await loadStaticInputs();
assert.deepEqual(collectStaticFailures(inputs), []);

const expectedHyperdrive = inputs.evidence.cloudflare.resources.hyperdrive;
const remote = {
  hyperdrive: {
    id: expectedHyperdrive.id,
    origin: { user: expectedHyperdrive.expectedUser },
    origin_connection_limit: expectedHyperdrive.originConnectionLimit,
    caching: { disabled: true },
  },
  queueList: [...inputs.evidence.cloudflare.resources.queues],
};
assert.deepEqual(collectPreUploadFailures({ ...inputs, ...remote }), []);
assert.match(
  collectPreUploadFailures({ ...inputs, ...remote, hyperdrive: { ...remote.hyperdrive, origin: { user: "neondb_owner" } } }).join("\n"),
  /identité Hyperdrive inattendue/,
);
assert.match(
  collectPreUploadFailures({ ...inputs, ...remote, queueList: remote.queueList.slice(0, 1) }).join("\n"),
  /DLQ development absente/,
);
assert.match(
  collectPreUploadFailures({
    ...inputs,
    ...remote,
    evidence: {
      ...inputs.evidence,
      neonDataApi: { jwtRlsPositiveNegative: { verified: false } },
    },
  }).join("\n"),
  /preuve distante JWT\/RLS positive\+négative absente/,
);

const versionId = "11111111-2222-4333-8444-555555555555";
const version = {
  id: versionId,
  resources: {
    script: { handlers: ["fetch", "scheduled", "queue"] },
    bindings: [
      { name: "OUTBOX_DATABASE", type: "hyperdrive" },
      { name: "GENERATION_QUEUE", type: "queue" },
      { name: "NEON_DATA_API_URL", type: "plain_text" },
      ...inputs.evidence.cloudflare.postUpload.requiredSecrets.map((name: string) => ({ name, type: "secret_text", text: "must-not-be-read" })),
    ],
  },
};
assert.deepEqual(collectPostUploadFailures({ ...inputs, version, versionId }), []);
const missingSecret = structuredClone(version);
missingSecret.resources.bindings = missingSecret.resources.bindings.filter(({ name }) => name !== "NEON_AUTH_COOKIE_SECRET");
const postFailure = collectPostUploadFailures({ ...inputs, version: missingSecret, versionId }).join("\n");
assert.match(postFailure, /secret post-upload absent : NEON_AUTH_COOKIE_SECRET/);
assert.doesNotMatch(postFailure, /must-not-be-read/);
const missingQueue = structuredClone(version);
missingQueue.resources.bindings = missingQueue.resources.bindings.filter(({ name }) => name !== "GENERATION_QUEUE");
assert.match(collectPostUploadFailures({ ...inputs, version: missingQueue, versionId }).join("\n"), /binding version Queue absent/);
const missingHandler = structuredClone(version);
missingHandler.resources.script.handlers = missingHandler.resources.script.handlers.filter((handler) => handler !== "scheduled");
assert.match(collectPostUploadFailures({ ...inputs, version: missingHandler, versionId }).join("\n"), /handler Worker absent : scheduled/);
const malformedVersionId = "----------------";
assert.match(
  collectPostUploadFailures({ ...inputs, version: { ...version, id: malformedVersionId }, versionId: malformedVersionId }).join("\n"),
  /ID de version Worker explicite requis/,
);
assert.match(
  collectPostUploadFailures({
    ...inputs,
    version,
    versionId,
    evidence: {
      ...inputs.evidence,
      cloudflare: {
        ...inputs.evidence.cloudflare,
        postUpload: { ...inputs.evidence.cloudflare.postUpload, required: false },
      },
    },
  }).join("\n"),
  /preuve post-upload non exigée par le contrat/,
);

const uploadEvent = JSON.stringify({
  type: "version-upload",
  worker_name: "idea-commons-web",
  version_id: versionId,
  preview_alias_url: "https://dev-idea-commons-web.example.workers.dev",
  secret_value: "must-not-be-read",
});
assert.deepEqual(extractVersionUpload(uploadEvent), {
  versionId,
  previewAliasUrl: "https://dev-idea-commons-web.example.workers.dev",
});
assert.throws(() => extractVersionUpload(""), /événement version-upload unique absent/);
assert.throws(() => extractVersionUpload(`${uploadEvent}\n${uploadEvent}`), /événement version-upload unique absent/);
assert.throws(
  () => extractVersionUpload(JSON.stringify({ type: "version-upload", worker_name: "idea-commons-web", version_id: "invalid" })),
  /ID de version uploadée absent ou invalide/,
);
const workflowCalls: Array<{ command: string; args: string[] }> = [];
let cleanupCount = 0;
const workflowUpload = await runPreviewWorkflow({
  runCommand: async (command: string, args: string[]) => { workflowCalls.push({ command, args }); },
  resetOutput: async () => {},
  readOutput: async () => uploadEvent,
  cleanupOutput: async () => { cleanupCount += 1; },
});
assert.equal(workflowUpload.versionId, versionId);
assert.equal(cleanupCount, 1);
assert.deepEqual(workflowCalls.map(({ command, args }) => [command, ...args]), [
  ["npm", "run", "cloudflare:readiness"],
  ["npm", "run", "build:vinext"],
  ["wrangler", "versions", "upload", "--config", "dist/server/wrangler.json", "--preview-alias", "dev"],
  ["npm", "run", "cloudflare:post-upload", "--", "--version-id", versionId],
]);
let failureCleanupCount = 0;
await assert.rejects(
  runPreviewWorkflow({
    runCommand: async () => {},
    resetOutput: async () => {},
    readOutput: async () => { throw new Error("lecture simulée refusée"); },
    cleanupOutput: async () => { failureCleanupCount += 1; },
  }),
  /lecture simulée refusée/,
);
assert.equal(failureCleanupCount, 1);

console.log("cloudflare preflight contract: local, pre-upload and post-upload gates passed");
