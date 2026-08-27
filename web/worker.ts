import vinextHandler from "vinext/server/fetch-handler";
import { createCloudflareEntrypoint } from "./src/server/cloudflare-entrypoint";
import type { OutboxQueueMessage } from "./src/server/worker";

const handler = createCloudflareEntrypoint((request, env, ctx) => vinextHandler.fetch(request, env, ctx));

export default handler satisfies ExportedHandler<Env & { TRUSTED_DATABASE_URL: string }, OutboxQueueMessage>;
