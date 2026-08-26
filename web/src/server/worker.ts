import { spawn } from "node:child_process";
import path from "node:path";
import { repoRoot, withServiceDb } from "./db";
import { sha256Hex } from "./canonical";
import { resolveScenario } from "./scenario";
import type { AdapterResult, SimulatorScenario, SourceExcerpt } from "./types";

/**
 * Worker outbox en processus (transport alpha IC-07 : commande serveur →
 * outbox transactionnelle → worker → polling client).
 *
 * Le worker est un composant de service : il n'emprunte pas le chemin
 * utilisateur et écrit via la connexion service, comme le worker durable
 * prévu par l'architecture cible. Il consomme `editorial.generation.requested`,
 * exécute l'adaptateur simulé canonique via un pont Node, journalise chaque
 * tentative, matérialise l'état terminal et, si `candidate_ready`, crée le
 * candidat éditorial et sa révision 1 (sortie IA originale).
 *
 * Un délai minimal de visibilité (2 s) rend l'état « analyse en cours »
 * observable par polling sans inventer de progression chiffrée.
 */

const VISIBILITY_DELAY = "2 seconds";

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

export async function processOutboxOnce(): Promise<number> {
  const events = await withServiceDb(async (tx) => {
    const result = await tx.query<PendingEvent>(
      `select o.id as outbox_id, g.id as generation_id, g.status,
              s.id as intake_id, s.title, s.fingerprint_sha256, s.rights_basis,
              s.excerpts, g.requested_by
         from app_private.outbox_events o
         join app.ai_generations g on g.id = o.aggregate_id
         join app.source_intakes s on s.id = g.source_intake_id
        where o.topic = 'editorial.generation.requested'
          and o.delivered_at is null
          and o.occurred_at <= now() - interval '${VISIBILITY_DELAY}'
        order by o.occurred_at
        limit 5`,
    );
    return result.rows;
  });

  let processed = 0;
  for (const event of events) {
    if (event.status === "terminal") {
      await markDelivered(event.outbox_id);
      continue;
    }
    const scenario = await resolveScenario(event.intake_id, event.fingerprint_sha256);
    const result = await runAdapterBridge(
      {
        sourceId: event.intake_id,
        language: "fr",
        title: event.title,
        sourceFingerprint: event.fingerprint_sha256,
        rightsBasis: event.rights_basis,
        excerpts: event.excerpts,
      },
      scenario,
    );
    await persistResult(event, result);
    await markDelivered(event.outbox_id);
    processed += 1;
  }
  return processed;
}

async function markDelivered(outboxId: string): Promise<void> {
  await withServiceDb(async (tx) => {
    await tx.query(
      `update app_private.outbox_events
          set delivered_at = now(), attempt_count = attempt_count + 1
        where id = $1`,
      [outboxId],
    );
  });
}

async function persistResult(event: PendingEvent, result: AdapterResult): Promise<void> {
  await withServiceDb(async (tx) => {
    await tx.query(
      `update app.ai_generations
          set status = 'terminal', terminal_state = $2,
              controls = $3::jsonb, completed_at = now()
        where id = $1 and status <> 'terminal'`,
      [
        event.generation_id,
        result.state,
        JSON.stringify({
          schemaValid: result.controls.schemaValid,
          citationsValid: result.controls.citationsValid,
          prudenceValid: result.controls.prudenceValid,
          reasonCode: result.reasonCode,
          simulated: true,
        }),
      ],
    );

    const startedAt = new Date();
    for (const attempt of result.attempts) {
      await tx.query(
        `insert into app.ai_generation_attempts
           (generation_id, attempt_rank, route_key, outcome, fallback_reason,
            response_fingerprint_sha256, quota_units, started_at, completed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.generation_id,
          attempt.rank,
          attempt.route,
          attempt.outcome,
          attempt.reason,
          attempt.outcome === "success" && result.candidate
            ? sha256Hex(JSON.stringify(result.candidate))
            : null,
          estimateQuotaUnits(event.excerpts),
          new Date(startedAt.getTime() + (attempt.rank - 1) * 400).toISOString(),
          new Date(startedAt.getTime() + attempt.rank * 400).toISOString(),
        ],
      );
    }

    if (result.state === "candidate_ready" && result.candidate) {
      const candidate = await tx.query<{ id: string }>(
        `insert into app.editorial_candidates (source_intake_id, generation_id, created_by, status)
         values ($1, $2, $3, 'in_review')
         returning id`,
        [event.intake_id, event.generation_id, event.requested_by],
      );
      await tx.query(
        `insert into app.candidate_revisions
           (candidate_id, revision, content, changed_by, change_summary,
            schema_valid, citations_valid, prudence_valid)
         values ($1, 1, $2::jsonb, $3, 'Sortie IA originale (adaptateur simulé)', true, true, true)`,
        [candidate.rows[0].id, JSON.stringify(result.candidate), event.requested_by],
      );
    }

    await tx.query(
      `insert into app_private.audit_events (actor_member_id, event_type, resource_type, resource_id, metadata)
       values (null, 'generation.completed', 'ai_generation', $1, $2::jsonb)`,
      [
        event.generation_id,
        JSON.stringify({ terminal_state: result.state, attempts: result.attempts.length, simulated: true }),
      ],
    );
  });
}

function estimateQuotaUnits(excerpts: SourceExcerpt[]): number {
  const characters = excerpts.reduce((total, excerpt) => total + excerpt.text.length, 0);
  return Math.max(1, Math.ceil(characters / 4));
}

interface AdapterInput {
  sourceId: string;
  language: string;
  title: string;
  sourceFingerprint: string;
  rightsBasis: string;
  excerpts: SourceExcerpt[];
}

function runAdapterBridge(input: AdapterInput, scenario: SimulatorScenario): Promise<AdapterResult> {
  const bridgePath = path.join(repoRoot(), "web", "scripts", "adapter-bridge.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`adaptateur simulé indisponible : ${Buffer.concat(stderr).toString()}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as AdapterResult);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ input, scenario }));
  });
}
