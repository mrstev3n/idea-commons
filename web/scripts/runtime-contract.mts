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
import { runSimulatedAdapter } from "../../editorial/simulator/simulated-adapter.mjs";

assert.throws(() => validateDatabaseConnectionString(undefined), /configuration PostgreSQL absente/);
assert.throws(() => validateDatabaseConnectionString("https://example.test"), /invalide/);
assert.equal(
  validateDatabaseConnectionString("postgresql://service@example.test/idea_commons"),
  "postgresql://service@example.test/idea_commons",
);
assert.throws(() => configureDataApi("http://example.test/neondb/rest/v1"), /invalide/);
assert.throws(() => configureDataApi("https://example.test/rest/v1"), /invalide/);
configureDataApi("https://example.test/neondb/rest/v1");
const originalFetch = globalThis.fetch;
const dataApiRequests: Request[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  dataApiRequests.push(request);
  return Response.json([]);
};
assert.deepEqual(await dataApiPublicRpc("public_list_published_ideas", {}), []);
assert.equal(dataApiRequests[0].url, "https://example.test/neondb/rest/v1/rpc/public_list_published_ideas");
assert.equal(dataApiRequests[0].headers.get("authorization"), null);
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
assert.deepEqual([1, 2, 3, 4, 5, 99].map(retryDelaySeconds), [15, 30, 60, 120, 240, 900]);
assert.equal(OUTBOX_BATCH_LIMIT, 5);
assert.equal(OUTBOX_MAX_ATTEMPTS, 5);
assert.equal(QUEUE_MAX_RETRIES, 5);
assert.equal(QUEUE_TERMINAL_DELIVERY, 6);

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
