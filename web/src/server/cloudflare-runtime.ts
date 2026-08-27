import { configureDatabase } from "./db";
import { configureDataApi } from "./data-api";
import {
  consumeQueueBatch,
  relayOutboxBatch,
  type OutboxQueueMessage,
  type QueueMessageLike,
} from "./worker";

export interface CloudflareRuntimeEnv {
  NEON_DATA_API_URL: string;
  TRUSTED_DATABASE_URL: string;
  OUTBOX_DATABASE: { connectionString: string };
  GENERATION_QUEUE: { send(message: OutboxQueueMessage): Promise<unknown> };
}

export function configureCloudflareDatabase(env: CloudflareRuntimeEnv): void {
  configureDataApi(env.NEON_DATA_API_URL);
  configureDatabase({
    trustedConnectionString: env.TRUSTED_DATABASE_URL,
    outboxConnectionString: env.OUTBOX_DATABASE.connectionString,
  });
}

/** Handler `scheduled` à composer avec l'entrypoint fourni par la PR #7. */
export async function scheduledOutboxRelay(env: CloudflareRuntimeEnv): Promise<number> {
  configureCloudflareDatabase(env);
  return relayOutboxBatch(async (message) => { await env.GENERATION_QUEUE.send(message); });
}

/** Handler `queue` à composer avec l'entrypoint fourni par la PR #7. */
export async function queuedOutboxConsumer(
  messages: readonly QueueMessageLike[],
  env: CloudflareRuntimeEnv,
): Promise<void> {
  configureCloudflareDatabase(env);
  await consumeQueueBatch(messages);
}
