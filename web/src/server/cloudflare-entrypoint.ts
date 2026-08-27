import type { CloudflareRuntimeEnv } from "./cloudflare-runtime";
import { configureCloudflareDatabase, queuedOutboxConsumer, scheduledOutboxRelay } from "./cloudflare-runtime";
import type { OutboxQueueMessage } from "./worker";

interface ExecutionContextLike { waitUntil(promise: Promise<unknown>): void }
interface QueueBatchLike { messages: Parameters<typeof queuedOutboxConsumer>[0] }

export function createCloudflareEntrypoint(
  fetchHandler: (request: Request, env: CloudflareRuntimeEnv, ctx: ExecutionContextLike) => Response | Promise<Response>,
  runtime = {
    configure: configureCloudflareDatabase,
    scheduled: scheduledOutboxRelay,
    queue: queuedOutboxConsumer,
  },
) {
  return {
    fetch(request: Request, env: CloudflareRuntimeEnv, ctx: ExecutionContextLike) {
      runtime.configure(env);
      return fetchHandler(request, env, ctx);
    },
    scheduled(_controller: unknown, env: CloudflareRuntimeEnv, ctx: ExecutionContextLike) {
      ctx.waitUntil(runtime.scheduled(env));
    },
    queue(batch: QueueBatchLike, env: CloudflareRuntimeEnv, ctx: ExecutionContextLike) {
      ctx.waitUntil(runtime.queue(batch.messages, env));
    },
  };
}

export type CloudflareEntrypoint = ReturnType<typeof createCloudflareEntrypoint>;
export type { OutboxQueueMessage };
