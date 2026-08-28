import assert from "node:assert/strict";
import {
  collectPostUploadFailures,
  collectPreUploadFailures,
  collectStaticFailures,
  loadStaticInputs,
} from "./cloudflare-preflight.mjs";

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

console.log("cloudflare preflight contract: local, pre-upload and post-upload gates passed");
