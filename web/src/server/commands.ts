import { randomUUID } from "node:crypto";
import { withDbRole, withDbRoleThenService } from "./db";
import { fingerprintRequest } from "./canonical";
import { deriveCanonicalSourceFingerprint } from "./source-fingerprint";
import { toCommandError } from "./sql-error";
import { setScenarioOverride } from "./scenario";
import type { SyntheticIdentity } from "./identities";
import type {
  CandidateContent,
  CommandResult,
  RightsBasis,
  SimulatorScenario,
  SourceExcerpt,
} from "./types";

/**
 * Commandes serveur IC-07. Chaque commande délègue la décision d'autorisation
 * aux fonctions SQL M1 (`security definer`, capacités, RLS, idempotence) et se
 * contente de traduire les entrées/sorties. Aucune écriture directe de table.
 */

export interface SourceIntakeInput {
  inputMode: "url" | "text";
  title: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  fullText: string;
  excerpts: SourceExcerpt[];
  rightsBasis: RightsBasis;
  rightsNote: string | null;
  scenario: SimulatorScenario | null;
  idempotencyKey: string;
}

export interface CreatedIntake {
  intakeId: string;
  fingerprint: string;
  revision: number;
}

export async function createSourceIntake(
  identity: SyntheticIdentity,
  input: SourceIntakeInput,
): Promise<CommandResult<CreatedIntake>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  const fingerprint = deriveCanonicalSourceFingerprint(input.fullText);
  const requestFingerprint = fingerprintRequest({
    inputMode: input.inputMode,
    title: input.title,
    sourceUrl: input.sourceUrl,
    fingerprint,
    rightsBasis: input.rightsBasis,
  });

  try {
    const result = await withDbRoleThenService(
      "authenticated",
      identity.authUserId,
      async (tx) => {
        const duplicate = await tx.query<{ id: string }>(
          "select id from app.source_intakes where fingerprint_sha256 = $1 limit 1",
          [fingerprint],
        );
        if (duplicate.rows.length > 0) {
          return { kind: "duplicate", duplicateOf: duplicate.rows[0].id } as const;
        }
        const created = await tx.query<{ id: string }>(
          `select app.create_source_intake(
             $1::app.source_input_mode, $2, $3, $4::timestamptz, now(),
             $5, $6::jsonb, $7::app.source_rights_basis, $8, $9, $10, $11
           ) as id`,
          [
            input.inputMode,
            input.title,
            input.sourceUrl,
            input.publishedAt,
            fingerprint,
            JSON.stringify(input.excerpts),
            input.rightsBasis,
            input.rightsNote,
            input.rightsBasis === "temporary_analysis" ? input.fullText : null,
            input.idempotencyKey,
            requestFingerprint,
          ],
        );
        return { kind: "created", id: created.rows[0].id } as const;
      },
      async (tx, memberResult) => {
        if (memberResult.kind === "duplicate") return memberResult;
        if (input.inputMode === "url") {
          return { kind: "created", id: memberResult.id, revision: 1 } as const;
        }

        // Re-dériver depuis le texte brut dans la continuation de confiance :
        // l'indice contributor précédent n'acquiert jamais d'autorité par copie.
        const verifiedFingerprint = deriveCanonicalSourceFingerprint(input.fullText);
        const verified = await tx.query<{ revision: string }>(
          "select app.record_verified_source_fingerprint($1, $2, $3) as revision",
          [memberResult.id, 1, verifiedFingerprint],
        );
        return {
          kind: "created",
          id: memberResult.id,
          revision: Number(verified.rows[0].revision),
        } as const;
      },
    );

    if (result.kind === "duplicate") {
      return {
        ok: false,
        status: 409,
        message: `Cette empreinte de source existe déjà (cas ${result.duplicateOf}). Une soumission rejouée retrouve la même empreinte : ouvrez le cas existant plutôt que de le dupliquer.`,
      };
    }
    if (input.scenario) {
      setScenarioOverride(result.id, input.scenario);
    }
    return {
      ok: true,
      value: { intakeId: result.id, fingerprint, revision: result.revision },
    };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function startCandidateGeneration(
  identity: SyntheticIdentity,
  intakeId: string,
  expectedRevision: number,
): Promise<CommandResult<{ generationId: string }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  const idempotencyKey = `gen:${intakeId}:${expectedRevision}`;
  const requestFingerprint = fingerprintRequest({ intakeId, expectedRevision });
  try {
    const generationId = await withDbRole("authenticated", identity.authUserId, async (tx) => {
      const skill = await tx.query<{ id: string }>(
        `select v.id from app.prompt_skill_versions v
           join app.prompt_skills s on s.id = v.skill_id
          where s.slug = 'source-to-idea' and v.version = '1.0.0'`,
      );
      if (skill.rows.length === 0) {
        throw new Error("published skill version missing");
      }
      const started = await tx.query<{ id: string }>(
        "select app.start_candidate_generation($1, $2, $3, $4, $5) as id",
        [intakeId, skill.rows[0].id, expectedRevision, idempotencyKey, requestFingerprint],
      );
      return started.rows[0].id;
    });
    return { ok: true, value: { generationId } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateCandidateDraft(
  identity: SyntheticIdentity,
  candidateId: string,
  expectedRevision: number,
  content: CandidateContent,
  changeSummary: string,
): Promise<CommandResult<{ revision: number }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const revision = await withDbRole("authenticated", identity.authUserId, async (tx) => {
      const updated = await tx.query<{ revision: string }>(
        "select app.update_candidate_draft($1, $2, $3::jsonb, $4) as revision",
        [candidateId, expectedRevision, JSON.stringify(content), changeSummary],
      );
      return Number(updated.rows[0].revision);
    });
    return { ok: true, value: { revision } };
  } catch (error) {
    return toCommandError(error);
  }
}

export interface PublicationDecisionInput {
  candidateId: string;
  expectedRevision: number;
  reason: string;
  checklist: { rights: boolean; citations: boolean; prudence: boolean };
  approvedSlug: string;
  contentLicense: string;
  creditName: string;
}

export interface PublicationReceipt {
  ideaVersionId: string;
  slug: string;
  publishedAt: string;
}

export async function approveAndPublishCandidate(
  identity: SyntheticIdentity,
  input: PublicationDecisionInput,
): Promise<CommandResult<PublicationReceipt>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const receipt = await withDbRole("authenticated", identity.authUserId, async (tx) => {
      const published = await tx.query<{ id: string }>(
        "select app.approve_and_publish_candidate($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) as id",
        [
          input.candidateId,
          input.expectedRevision,
          input.reason,
          JSON.stringify(input.checklist),
          input.approvedSlug,
          input.contentLicense,
          input.creditName,
          `publish:${input.candidateId}:${input.expectedRevision}`,
          fingerprintRequest(input),
        ],
      );
      const versionId = published.rows[0].id;
      const idea = await tx.query<{ slug: string; published_at: string }>(
        `select i.slug, v.published_at
           from app.idea_versions v join app.ideas i on i.id = v.idea_id
          where v.id = $1`,
        [versionId],
      );
      return {
        ideaVersionId: versionId,
        slug: idea.rows[0].slug,
        publishedAt: idea.rows[0].published_at,
      };
    });
    return { ok: true, value: receipt };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function rejectCandidate(
  identity: SyntheticIdentity,
  candidateId: string,
  expectedRevision: number,
  reason: string,
  checklist: { rights: boolean; citations: boolean; prudence: boolean },
): Promise<CommandResult<{ decisionId: string }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const decisionId = await withDbRole("authenticated", identity.authUserId, async (tx) => {
      const rejected = await tx.query<{ id: string }>(
        "select app.reject_candidate($1, $2, $3, $4::jsonb) as id",
        [candidateId, expectedRevision, reason, JSON.stringify(checklist)],
      );
      return rejected.rows[0].id;
    });
    return { ok: true, value: { decisionId } };
  } catch (error) {
    return toCommandError(error);
  }
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
