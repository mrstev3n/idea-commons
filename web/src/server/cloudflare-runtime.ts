import { configureDatabase } from "./db";
import { configureDataApi } from "./data-api";
import {
  consumeQueueBatch,
  relayOutboxBatch,
  type OutboxQueueMessage,
  type QueueMessageLike,
  OUTBOX_BATCH_LIMIT,
} from "./worker";

export interface CloudflareRuntimeEnv {
  NEON_DATA_API_URL: string;
  NEON_AUTH_BASE_URL: string;
  TRUSTED_DATABASE_URL: string;
  OUTBOX_DATABASE: { connectionString: string };
  GENERATION_QUEUE: { send(message: OutboxQueueMessage): Promise<unknown> };
}

export function configureCloudflareDatabase(env: CloudflareRuntimeEnv): void {
  configureDataApi(env.NEON_DATA_API_URL, env.NEON_AUTH_BASE_URL);
  configureDatabase({
    trustedConnectionString: env.TRUSTED_DATABASE_URL,
    outboxConnectionString: env.OUTBOX_DATABASE.connectionString,
  });
}

/** Handler `scheduled` à composer avec l'entrypoint fourni par la PR #7. */
export async function scheduledOutboxRelay(env: CloudflareRuntimeEnv): Promise<number> {
  configureCloudflareDatabase(env);
  const sent = await relayOutboxBatch(
    async (message) => { await env.GENERATION_QUEUE.send(message); },
    OUTBOX_BATCH_LIMIT,
    async () => { await env.GENERATION_QUEUE.send({ type: "outbox.relay" }); },
  );
  console.info("outbox_relay_complete", { sent });
  return sent;
}

export type WorkerQueueMessageLike = Omit<QueueMessageLike, "body"> & { body: OutboxQueueMessage };

/** Handler `queue` à composer avec l'entrypoint fourni par la PR #7. */
export async function queuedOutboxConsumer(
  messages: readonly WorkerQueueMessageLike[],
  env: CloudflareRuntimeEnv,
  relay = scheduledOutboxRelay,
  consume = consumeQueueBatch,
): Promise<void> {
  configureCloudflareDatabase(env);
  for (const message of messages.slice(0, OUTBOX_BATCH_LIMIT)) {
    if ("type" in message.body && message.body.type === "outbox.relay") {
      try {
        await relay(env);
        message.ack();
      } catch {
        // Cloudflare retries a lost/failed hint and eventually retains it in
        // the DLQ. Independently, PostgreSQL is swept every hour.
        message.retry();
      }
    } else {
      await consume([message as QueueMessageLike]);
    }
  }
}
