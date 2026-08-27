import { runSimulatedAdapter } from "../../../editorial/simulator/simulated-adapter.mjs";
import { withServiceDb, type DbTransaction } from "./db";
import { sha256Hex } from "./canonical";
import type { AdapterResult, SourceExcerpt } from "./types";

export const OUTBOX_BATCH_LIMIT = 5;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const QUEUE_MAX_RETRIES = 5;
export const QUEUE_TERMINAL_DELIVERY = QUEUE_MAX_RETRIES + 1;

export interface OutboxQueueMessage { outboxId: string }
export interface QueueMessageLike {
  body: OutboxQueueMessage;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface PendingEvent {
  outbox_id: string;
  generation_id: string;
  status: string;
  intake_id: string;
  title: string;
  fingerprint_sha256: string;
  rights_basis: string;
  excerpts: SourceExcerpt[];
  requested_by: string;
}

/**
 * Relais Cron borné. Le verrou/lease PostgreSQL évite deux relais simultanés.
 * Un crash après `send` peut produire un doublon Queue : le consommateur est
 * donc idempotent sur l'identifiant durable de l'outbox.
 */
export async function relayOutboxBatch(
  send: (message: OutboxQueueMessage) => Promise<void>,
  limit = OUTBOX_BATCH_LIMIT,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(limit, OUTBOX_BATCH_LIMIT));
  const claims = await withServiceDb(async (tx) => {
    const result = await tx.query<{ id: string; attempt_count: number }>(
      `with claimable as (
         select id from app_private.outbox_events
          where topic = 'editorial.generation.requested'
            and delivered_at is null
            and dispatched_at is null
            and available_at <= now()
            and (dispatch_lease_until is null or dispatch_lease_until < now())
          order by occurred_at
          for update skip locked
          limit $1
       )
       update app_private.outbox_events o
          set dispatch_lease_until = now() + interval '60 seconds',
              attempt_count = attempt_count + 1
         from claimable c where o.id = c.id
       returning o.id, o.attempt_count`,
      [boundedLimit],
    );
    return result.rows;
  });

  let sent = 0;
  for (const claim of claims) {
    const outboxId = claim.id;
    if (claim.attempt_count > OUTBOX_MAX_ATTEMPTS) {
      await failOutboxPermanently(outboxId, "dispatch_attempts_exhausted");
      continue;
    }
    try {
      await send({ outboxId });
      await withServiceDb(async (tx) => {
        await tx.query(
          `update app_private.outbox_events
              set dispatched_at = now(), dispatch_lease_until = null, last_error_code = null
            where id = $1 and delivered_at is null`,
          [outboxId],
        );
      });
      sent += 1;
    } catch {
      await scheduleDispatchRetry(outboxId);
    }
  }
  return sent;
}

/** Consommateur Queue : 5 retries, donc terminalisation sur la 6e livraison. */
export async function consumeQueueBatch(
  messages: readonly QueueMessageLike[],
  process: (outboxId: string) => Promise<boolean> = processOutboxEvent,
  failPermanently: (outboxId: string, reasonCode: string) => Promise<void> = failOutboxPermanently,
): Promise<void> {
  for (const message of messages.slice(0, OUTBOX_BATCH_LIMIT)) {
    try {
      await process(message.body.outboxId);
      message.ack();
    } catch {
      if (message.attempts >= QUEUE_TERMINAL_DELIVERY) {
        await failPermanently(message.body.outboxId, "consumer_attempts_exhausted");
        // Le dernier retry garde le message en échec : Cloudflare le transfère
        // alors vers la DLQ configurée après max_retries.
        message.retry();
      } else {
        message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
      }
    }
  }
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(900, 15 * 2 ** Math.max(0, attempt - 1));
}

/** Compatibilité des scripts locaux : aucun appel depuis une route GET. */
export async function processOutboxOnce(): Promise<number> {
  const messages: OutboxQueueMessage[] = [];
  await relayOutboxBatch(async (message) => { messages.push(message); });
  let processed = 0;
  for (const message of messages) {
    if (await processOutboxEvent(message.outboxId)) processed += 1;
  }
  return processed;
}

/** Transaction idempotente : terminal/delivered signifie succès déjà acquis. */
export async function processOutboxEvent(outboxId: string): Promise<boolean> {
  return withServiceDb(async (tx) => {
    const event = await loadEventForUpdate(tx, outboxId);
    if (!event || event.status === "terminal") {
      if (event) await markDelivered(tx, event.outbox_id);
      return false;
    }
    const result = runSimulatedAdapter({
      sourceId: event.intake_id,
      language: "fr",
      title: event.title,
      sourceFingerprint: event.fingerprint_sha256,
      rightsBasis: event.rights_basis,
      excerpts: event.excerpts,
    }, "success");
    await persistResult(tx, event, result);
    await markDelivered(tx, event.outbox_id);
    return true;
  });
}

async function loadEventForUpdate(tx: DbTransaction, outboxId: string): Promise<PendingEvent | null> {
  const result = await tx.query<PendingEvent>(
    `select o.id as outbox_id, g.id as generation_id, g.status,
            s.id as intake_id, s.title, s.fingerprint_sha256, s.rights_basis,
            s.excerpts, g.requested_by
       from app_private.outbox_events o
       join app.ai_generations g on g.id = o.aggregate_id
       join app.source_intakes s on s.id = g.source_intake_id
      where o.id = $1 and o.topic = 'editorial.generation.requested'
      for update of o, g`,
    [outboxId],
  );
  return result.rows[0] ?? null;
}

async function markDelivered(tx: DbTransaction, outboxId: string): Promise<void> {
  await tx.query(
    `update app_private.outbox_events
        set delivered_at = coalesce(delivered_at, now()), dispatch_lease_until = null
      where id = $1`,
    [outboxId],
  );
}

async function scheduleDispatchRetry(outboxId: string): Promise<void> {
  await withServiceDb(async (tx) => {
    await tx.query(
      `update app_private.outbox_events
          set dispatch_lease_until = null,
              available_at = now() + least(interval '15 minutes', interval '15 seconds' * power(2, greatest(attempt_count - 1, 0))),
              last_error_code = 'queue_send_failed'
        where id = $1 and delivered_at is null`,
      [outboxId],
    );
  });
}

async function failOutboxPermanently(outboxId: string, reasonCode: string): Promise<void> {
  await withServiceDb(async (tx) => {
    const event = await loadEventForUpdate(tx, outboxId);
    if (!event || event.status === "terminal") {
      if (event) await markDelivered(tx, event.outbox_id);
      return;
    }
    await tx.query(
      `update app.ai_generations
          set status = 'terminal', terminal_state = 'providers_exhausted',
              controls = jsonb_build_object('simulated', true, 'reasonCode', $2), completed_at = now()
        where id = $1`,
      [event.generation_id, reasonCode],
    );
    await tx.query(
      `insert into app_private.audit_events (actor_member_id, event_type, resource_type, resource_id, metadata)
       values (null, 'generation.failed', 'ai_generation', $1, jsonb_build_object('reason_code', $2))`,
      [event.generation_id, reasonCode],
    );
    await markDelivered(tx, event.outbox_id);
  });
}

async function persistResult(tx: DbTransaction, event: PendingEvent, result: AdapterResult): Promise<void> {
  await tx.query(
    `update app.ai_generations set status = 'terminal', terminal_state = $2,
            controls = $3::jsonb, completed_at = now()
      where id = $1 and status <> 'terminal'`,
    [event.generation_id, result.state, JSON.stringify({ ...result.controls, reasonCode: result.reasonCode, simulated: true })],
  );
  const startedAt = new Date();
  for (const attempt of result.attempts) {
    await tx.query(
      `insert into app.ai_generation_attempts
         (generation_id, attempt_rank, route_key, outcome, fallback_reason,
          response_fingerprint_sha256, quota_units, started_at, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (generation_id, attempt_rank) do nothing`,
      [event.generation_id, attempt.rank, attempt.route, attempt.outcome, attempt.reason,
       attempt.outcome === "success" && result.candidate ? sha256Hex(JSON.stringify(result.candidate)) : null,
       Math.max(1, Math.ceil(event.excerpts.reduce((n, excerpt) => n + excerpt.text.length, 0) / 4)),
       new Date(startedAt.getTime() + (attempt.rank - 1) * 400).toISOString(),
       new Date(startedAt.getTime() + attempt.rank * 400).toISOString()],
    );
  }
  if (result.state === "candidate_ready" && result.candidate) {
    const candidate = await tx.query<{ id: string }>(
      `insert into app.editorial_candidates (source_intake_id, generation_id, created_by, status)
       values ($1,$2,$3,'in_review')
       on conflict (generation_id) where generation_id is not null do nothing returning id`,
      [event.intake_id, event.generation_id, event.requested_by],
    );
    if (candidate.rows[0]) {
      await tx.query(
        `insert into app.candidate_revisions
           (candidate_id, revision, content, changed_by, change_summary, schema_valid, citations_valid, prudence_valid)
         values ($1,1,$2::jsonb,$3,'Sortie IA originale (adaptateur simulé)',true,true,true)`,
        [candidate.rows[0].id, JSON.stringify(result.candidate), event.requested_by],
      );
    }
  }
  await tx.query(
    `insert into app_private.audit_events (actor_member_id,event_type,resource_type,resource_id,metadata)
     values (null,'generation.completed','ai_generation',$1,$2::jsonb)`,
    [event.generation_id, JSON.stringify({ terminal_state: result.state, attempts: result.attempts.length, simulated: true })],
  );
}
