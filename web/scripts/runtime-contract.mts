import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  setDatabaseTransactionRunnerForTests,
  validateDatabaseConnectionString,
} from "../src/server/db";
import {
  configureDataApi,
  dataApiPublicRpc,
  dataApiRpc,
  verifyRuntimeIdentity,
} from "../src/server/data-api";
import {
  consumeQueueBatch,
  OUTBOX_BATCH_LIMIT,
  OUTBOX_MAX_ATTEMPTS,
  QUEUE_MAX_RETRIES,
  QUEUE_TERMINAL_DELIVERY,
  processOutboxEvent,
  relayOutboxBatch,
  retryDelaySeconds,
} from "../src/server/worker";
import { createCloudflareEntrypoint } from "../src/server/cloudflare-entrypoint";
import { notifyOutboxCommitted, withOutboxWakeup } from "../src/server/outbox-wakeup";
import { queuedOutboxConsumer } from "../src/server/cloudflare-runtime";
import { startCandidateGeneration } from "../src/server/commands";
import { runSimulatedAdapter } from "../../editorial/simulator/simulated-adapter.mjs";

assert.throws(() => validateDatabaseConnectionString(undefined), /configuration PostgreSQL absente/);
assert.throws(() => validateDatabaseConnectionString("https://example.test"), /invalide/);
assert.equal(
  validateDatabaseConnectionString("postgresql://service@example.test/idea_commons"),
  "postgresql://service@example.test/idea_commons",
);
assert.throws(() => configureDataApi("http://example.test/neondb/rest/v1", "https://auth.example.test"), /invalide/);
assert.throws(() => configureDataApi("https://example.test/rest/v1", "https://auth.example.test"), /invalide/);
const originalFetch = globalThis.fetch;
const dataApiRequests: Request[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url.endsWith("/token/anonymous")) {
    return Response.json({
      token: "e30.eyJleHAiOjQxMDI0NDQ4MDAsInJvbGUiOiJhbm9ueW1vdXMifQ.test-only",
    });
  }
  dataApiRequests.push(request);
  return Response.json([]);
};
configureDataApi("https://example.test/neondb/rest/v1", "https://auth.example.test/neondb/auth");
assert.deepEqual(await dataApiPublicRpc("public_list_published_ideas", {}), []);
assert.equal(dataApiRequests[0].url, "https://example.test/neondb/rest/v1/rpc/public_list_published_ideas");
assert.equal(
  dataApiRequests[0].headers.get("authorization"),
  "Bearer e30.eyJleHAiOjQxMDI0NDQ4MDAsInJvbGUiOiJhbm9ueW1vdXMifQ.test-only",
);
assert.equal(dataApiRequests[0].headers.get("accept-profile"), "app");

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  dataApiRequests.push(request);
  return Response.json({ authUserId: "user-a", memberId: "member-a", roles: ["contributor", "contributor"] });
};
assert.deepEqual(await verifyRuntimeIdentity("user-a", "jwt-test-only"), {
  authUserId: "user-a", memberId: "member-a", roles: ["contributor"],
});
assert.equal(dataApiRequests[1].url, "https://example.test/neondb/rest/v1/rpc/runtime_identity");
assert.equal(dataApiRequests[1].headers.get("authorization"), "Bearer jwt-test-only");
assert.equal(dataApiRequests[1].headers.get("accept-profile"), "app");
await assert.rejects(verifyRuntimeIdentity("user-b", "jwt-test-only"), /incohérente/);
globalThis.fetch = async () => Response.json({ code: "42501" }, { status: 403 });
await assert.rejects(dataApiRpc("runtime_identity", {}, "jwt-test-only"), /refusée \(403\)/);
globalThis.fetch = originalFetch;

const relaySql: string[] = [];
setDatabaseTransactionRunnerForTests(async (fn) => fn({
  query: async (text, values) => {
    relaySql.push(text);
    if (text.includes("with claimable")) {
      assert.deepEqual(values, [5]);
      return { rows: Array.from({ length: 5 }, (_, index) => ({ id: `outbox-${index + 1}`, attempt_count: 1 })) };
    }
    return { rows: [] };
  },
  exec: async () => undefined,
}));
const relayed: string[] = [];
assert.equal(await relayOutboxBatch(async ({ outboxId }) => { relayed.push(outboxId); }, 99), 5);
assert.equal(relayed.length, 5);
assert.match(relaySql[0], /for update skip locked/);
assert.match(relaySql[0], /dispatch_lease_until/);

let idleQueries = 0;
let idleSends = 0;
let continuations = 0;
setDatabaseTransactionRunnerForTests(async (fn) => fn({
  query: async () => { idleQueries += 1; return { rows: [] }; },
  exec: async () => undefined,
}));
assert.equal(await relayOutboxBatch(async () => { idleSends += 1; }, 5, async () => { continuations += 1; }), 0);
assert.equal(idleQueries, 1); // Only the hourly sweep probes an empty DB.
assert.equal(idleSends, 0);
assert.equal(continuations, 0);
setDatabaseTransactionRunnerForTests(async (fn) => fn({
  query: async (text) => ({ rows: text.includes("with claimable")
    ? Array.from({ length: 5 }, (_, i) => ({ id: `pending-${i}`, attempt_count: 1 })) : [] }),
  exec: async () => undefined,
}));
assert.equal(await relayOutboxBatch(async () => undefined, 5, async () => { continuations += 1; }), 5);
assert.equal(continuations, 1); // A backlog must not wait for another hourly sweep.

const crashSql: string[] = [];
setDatabaseTransactionRunnerForTests(async (fn) => fn({
  query: async (text) => {
    crashSql.push(text);
    return text.includes("with claimable") ? { rows: [{ id: "crash-after-claim", attempt_count: 1 }] } : { rows: [] };
  },
  exec: async () => undefined,
}));
assert.equal(await relayOutboxBatch(async () => { throw new Error("queue unavailable"); }), 0);
assert.equal(crashSql.some((sql) => sql.includes("queue_send_failed") && sql.includes("available_at")), true);

let transactionNumber = 0;
const afterSendSql: string[] = [];
setDatabaseTransactionRunnerForTests(async (fn) => {
  transactionNumber += 1;
  if (transactionNumber === 2) throw new Error("crash after queue send");
  return fn({
    query: async (text) => {
      afterSendSql.push(text);
      return text.includes("with claimable")
        ? { rows: [{ id: "sent-before-crash", attempt_count: 1 }] }
        : { rows: [] };
    },
    exec: async () => undefined,
  });
});
const sentBeforeCrash: string[] = [];
assert.equal(await relayOutboxBatch(async ({ outboxId }) => { sentBeforeCrash.push(outboxId); }), 0);
assert.deepEqual(sentBeforeCrash, ["sent-before-crash"]);
assert.equal(afterSendSql.some((sql) => sql.includes("queue_send_failed")), true);

function message(id: string, attempts: number) {
  const state = { ack: 0, retries: [] as ({ delaySeconds?: number } | undefined)[] };
  return {
    state,
    value: {
      body: { outboxId: id }, attempts,
      ack: () => { state.ack += 1; },
      retry: (options?: { delaySeconds?: number }) => { state.retries.push(options); },
    },
  };
}
const successes = Array.from({ length: 6 }, (_, index) => message(`success-${index}`, 1));
await consumeQueueBatch(successes.map(({ value }) => value), async () => true);
assert.equal(successes.slice(0, 5).every(({ state }) => state.ack === 1), true);
assert.equal(successes[5].state.ack, 0);

const retrying = message("retry", 2);
await consumeQueueBatch([retrying.value], async () => { throw new Error("transient"); });
assert.deepEqual(retrying.state.retries, [{ delaySeconds: 30 }]);
assert.equal(retrying.state.ack, 0);

const lastRetry = message("last-retry", 5);
const terminalized: string[] = [];
await consumeQueueBatch(
  [lastRetry.value],
  async () => { throw new Error("permanent"); },
  async (id, reason) => { terminalized.push(`${id}:${reason}`); },
);
assert.deepEqual(terminalized, []);
assert.deepEqual(lastRetry.state.retries, [{ delaySeconds: 240 }]);
assert.equal(lastRetry.state.ack, 0);

const exhausted = message("exhausted", 6);
await consumeQueueBatch(
  [exhausted.value],
  async () => { throw new Error("permanent"); },
  async (id, reason) => { terminalized.push(`${id}:${reason}`); },
);
assert.deepEqual(terminalized, ["exhausted:consumer_attempts_exhausted"]);
assert.deepEqual(exhausted.state.retries, [undefined]);
assert.equal(exhausted.state.ack, 0);

setDatabaseTransactionRunnerForTests(async (fn) => fn({
  query: async (text) => text.includes("from app_private.outbox_events")
    ? { rows: [{ outbox_id: "duplicate", generation_id: "generation", status: "terminal" }] }
    : { rows: [] },
  exec: async () => undefined,
}));
assert.equal(await processOutboxEvent("duplicate"), false);
setDatabaseTransactionRunnerForTests(null);

const handlerCalls: string[] = [];
const pending: Promise<unknown>[] = [];
const entrypoint = createCloudflareEntrypoint(
  async () => { handlerCalls.push("fetch"); return new Response("ok"); },
  {
    configure: () => { handlerCalls.push("configure"); },
    scheduled: async () => { handlerCalls.push("scheduled"); return 0; },
    queue: async () => { handlerCalls.push("queue"); },
  },
);
const fakeEnv = {} as never;
const fakeContext = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
assert.equal((await entrypoint.fetch(new Request("https://example.test"), fakeEnv, fakeContext)).status, 200);
entrypoint.scheduled({}, fakeEnv, fakeContext);
entrypoint.queue({ messages: [] }, fakeEnv, fakeContext);
await Promise.all(pending);
assert.deepEqual(handlerCalls, ["configure", "fetch", "scheduled", "queue"]);

const wakeMessages: unknown[] = [];
const wakePending: Promise<unknown>[] = [];
const wakeEnv = {
  NEON_DATA_API_URL: "https://example.test/neondb/rest/v1",
  NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
  TRUSTED_DATABASE_URL: "postgresql://trusted@example.test/db",
  OUTBOX_DATABASE: { connectionString: "postgresql://runtime@example.test/db" },
  GENERATION_QUEUE: { send: async (body: unknown) => { wakeMessages.push(body); } },
};
const wakeContext = { waitUntil: (task: Promise<unknown>) => { wakePending.push(task); } };
const wakeHandler = createCloudflareEntrypoint(async (request) => {
  if (request.method === "POST") notifyOutboxCommitted();
  return new Response("ok");
}, { configure: () => undefined, scheduled: async () => 0, queue: async () => undefined });
await wakeHandler.fetch(new Request("https://example.test"), wakeEnv, wakeContext);
assert.equal(wakeMessages.length, 0); // GET must not wake PostgreSQL or send hints.
await wakeHandler.fetch(new Request("https://example.test", { method: "POST" }), wakeEnv, wakeContext);
await Promise.all(wakePending);
assert.deepEqual(wakeMessages, [{ type: "outbox.relay" }]);

// Request contexts cannot leak into concurrent or subsequent requests.
const contexts: string[] = [];
await Promise.all(["a", "b"].map(label => withOutboxWakeup(() => { contexts.push(label); }, async () => {
  await Promise.resolve(); notifyOutboxCommitted();
})));
notifyOutboxCommitted();
assert.deepEqual(contexts.sort(), ["a", "b"]);

const runtimeWake = { body: { type: "outbox.relay" as const }, attempts: 1,
  ack: () => { wakeAcks += 1; }, retry: () => { wakeRetries += 1; } };
let wakeAcks = 0;
let wakeRetries = 0;
let relayCalls = 0;
await queuedOutboxConsumer([runtimeWake], wakeEnv, async () => { relayCalls += 1; return 0; });
assert.equal(relayCalls, 1);
assert.equal(wakeAcks, 1);
await queuedOutboxConsumer([runtimeWake], wakeEnv, async () => { throw new Error("transient DB failure"); });
assert.equal(wakeAcks, 1);
assert.equal(wakeRetries, 1);

// The commit is the boundary: no notification on RPC failure, and a failed
// notification never rolls back an already committed generation request.
const commandCalls: string[] = [];
globalThis.fetch = async (input, init) => {
  const name = new URL(new Request(input, init).url).pathname.split("/").at(-1)!;
  commandCalls.push(name);
  if (name === "runtime_identity") return Response.json({ authUserId: "user-a", memberId: "member-a", roles: ["contributor"] });
  if (name === "runtime_source_to_idea_skill_version") return Response.json("skill");
  if (name === "start_candidate_generation") return Response.json("generation");
  throw new Error("unexpected RPC");
};
const identity = { id: "test", label: "test", authUserId: "user-a", memberId: "member-a", roles: ["contributor"], databaseAuthToken: "test-only" } as never;
let commitHints = 0;
const success = await withOutboxWakeup(() => { assert.equal(commandCalls.at(-1), "start_candidate_generation"); commitHints += 1; }, () => startCandidateGeneration(identity, "intake", 1));
assert.equal(success.ok, true);
assert.equal(commitHints, 1);
globalThis.fetch = async () => Response.json({ code: "42501" }, { status: 403 });
const refused = await withOutboxWakeup(() => { commitHints += 1; }, () => startCandidateGeneration(identity, "intake", 1));
assert.equal(refused.ok, false);
assert.equal(commitHints, 1);
globalThis.fetch = originalFetch;
let hintFailures = 0;
const originalWarn = console.warn;
console.warn = () => { hintFailures += 1; };
withOutboxWakeup(() => { throw new Error("Queue unavailable"); }, () => notifyOutboxCommitted());
console.warn = originalWarn;
assert.equal(hintFailures, 1);
assert.deepEqual([1, 2, 3, 4, 5, 99].map(retryDelaySeconds), [15, 30, 60, 120, 240, 900]);
assert.equal(OUTBOX_BATCH_LIMIT, 5);
assert.equal(OUTBOX_MAX_ATTEMPTS, 5);
assert.equal(QUEUE_MAX_RETRIES, 5);
assert.equal(QUEUE_TERMINAL_DELIVERY, 6);
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
assert.deepEqual(config.triggers.crons, ["17 * * * *"]);

const result = runSimulatedAdapter({
  sourceId: "source-test",
  language: "fr",
  title: "Source synthétique",
  sourceFingerprint: "a".repeat(64),
  rightsBasis: "idea_commons",
  excerpts: [{ id: "e1", text: "Constat synthétique.", locator: "§1" }],
}, "success");
assert.equal(result.state, "candidate_ready");
assert.equal(result.controls.schemaValid, true);

const route = await readFile(new URL("../src/app/api/cas/[id]/statut/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/editorial/cas/[id]/page.tsx", import.meta.url), "utf8");
const provision = await readFile(new URL("./provision-neon-development.mjs", import.meta.url), "utf8");
assert.doesNotMatch(route, /processOutbox|relayOutbox|consumeQueue/);
assert.doesNotMatch(page, /processOutbox|relayOutbox|consumeQueue/);
for (const effectiveCheck of [
  "has_table_privilege", "has_schema_privilege", "has_sequence_privilege", "has_function_privilege",
]) assert.match(provision, new RegExp(effectiveCheck));
assert.match(provision, /n\.nspname in \('app','app_private'\)/);
assert.match(provision, /pg_auth_members/);

console.log("runtime contract: relay, delivery 5/6 DLQ, effective privilege audit and handlers passed");
