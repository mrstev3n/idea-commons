import { randomUUID } from "node:crypto";
import { withTrustedDb } from "./db";
import { dataApiRpc, verifyRuntimeIdentity } from "./data-api";
import { fingerprintRequest } from "./canonical";
import { deriveCanonicalSourceFingerprint } from "./source-fingerprint";
import { toCommandError } from "./sql-error";
import type { SyntheticIdentity } from "./identities";

type DatabaseIdentity = SyntheticIdentity & { databaseAuthToken?: string | null };
import type {
  CandidateContent,
  CommandResult,
  RightsBasis,
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
  idempotencyKey: string;
}

export interface CreatedIntake {
  intakeId: string;
  fingerprint: string;
  revision: number;
}

export async function createSourceIntake(
  identity: DatabaseIdentity,
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
    const token = identity.databaseAuthToken ?? "";
    await verifyRuntimeIdentity(identity.authUserId, token);
    const duplicateOf = await dataApiRpc<string | null>("runtime_source_by_fingerprint", {
      target_fingerprint: fingerprint,
    }, token);
    const result = duplicateOf
      ? { kind: "duplicate", duplicateOf } as const
      : await (async () => {
        const id = await dataApiRpc<string>("create_source_intake", {
          input_mode: input.inputMode,
          title: input.title,
          source_url: input.sourceUrl,
          published_at: input.publishedAt,
          accessed_at: new Date().toISOString(),
          fingerprint_sha256: fingerprint,
          excerpts: input.excerpts,
          rights_basis: input.rightsBasis,
          rights_note: input.rightsNote,
          full_text: input.rightsBasis === "temporary_analysis" ? input.fullText : null,
          idempotency_key: input.idempotencyKey,
          request_fingerprint_sha256: requestFingerprint,
        }, token);
        if (input.inputMode === "url") {
          return { kind: "created", id, revision: 1 } as const;
        }

        // Re-dériver depuis le texte brut dans la continuation de confiance :
        // l'indice contributor précédent n'acquiert jamais d'autorité par copie.
        const verifiedFingerprint = deriveCanonicalSourceFingerprint(input.fullText);
        const revision = await withTrustedDb(async (tx) => {
          const verified = await tx.query<{ revision: string }>(
            "select app.record_verified_source_fingerprint($1, $2, $3) as revision",
            [id, 1, verifiedFingerprint],
          );
          return Number(verified.rows[0].revision);
        });
        return {
          kind: "created",
          id,
          revision,
        } as const;
      })();

    if (result.kind === "duplicate") {
      return {
        ok: false,
        status: 409,
        message: `Cette empreinte de source existe déjà (cas ${result.duplicateOf}). Une soumission rejouée retrouve la même empreinte : ouvrez le cas existant plutôt que de le dupliquer.`,
      };
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
  identity: DatabaseIdentity,
  intakeId: string,
  expectedRevision: number,
): Promise<CommandResult<{ generationId: string }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  const idempotencyKey = `gen:${intakeId}:${expectedRevision}`;
  const requestFingerprint = fingerprintRequest({ intakeId, expectedRevision });
  try {
    const token = identity.databaseAuthToken ?? "";
    await verifyRuntimeIdentity(identity.authUserId, token);
    const skillVersionId = await dataApiRpc<string | null>("runtime_source_to_idea_skill_version", {}, token);
    if (!skillVersionId) throw new Error("published skill version missing");
    const generationId = await dataApiRpc<string>("start_candidate_generation", {
      target_source_intake_id: intakeId, target_skill_version_id: skillVersionId,
      expected_source_revision: expectedRevision, idempotency_key: idempotencyKey,
      request_fingerprint_sha256: requestFingerprint,
    }, token);
    return { ok: true, value: { generationId } };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function updateCandidateDraft(
  identity: DatabaseIdentity,
  candidateId: string,
  expectedRevision: number,
  content: CandidateContent,
  changeSummary: string,
): Promise<CommandResult<{ revision: number }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const token = identity.databaseAuthToken ?? "";
    await verifyRuntimeIdentity(identity.authUserId, token);
    const revision = Number(await dataApiRpc<string>("update_candidate_draft", {
      target_candidate_id: candidateId, expected_revision: expectedRevision,
      content, change_summary: changeSummary,
    }, token));
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
  identity: DatabaseIdentity,
  input: PublicationDecisionInput,
): Promise<CommandResult<PublicationReceipt>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const token = identity.databaseAuthToken ?? "";
    await verifyRuntimeIdentity(identity.authUserId, token);
    const versionId = await dataApiRpc<string>("approve_and_publish_candidate", {
      target_candidate_id: input.candidateId, expected_revision: input.expectedRevision,
      reason: input.reason, checklist: input.checklist, approved_slug: input.approvedSlug,
      content_license: input.contentLicense, credit_name: input.creditName,
      idempotency_key: `publish:${input.candidateId}:${input.expectedRevision}`,
      request_fingerprint_sha256: fingerprintRequest(input),
    }, token);
    const receipt = await dataApiRpc<PublicationReceipt>("runtime_publication_receipt", {
      target_version_id: versionId,
    }, token);
    return { ok: true, value: receipt };
  } catch (error) {
    return toCommandError(error);
  }
}

export async function rejectCandidate(
  identity: DatabaseIdentity,
  candidateId: string,
  expectedRevision: number,
  reason: string,
  checklist: { rights: boolean; citations: boolean; prudence: boolean },
): Promise<CommandResult<{ decisionId: string }>> {
  if (!identity.authUserId) {
    return { ok: false, status: 401, message: "Authentification requise." };
  }
  try {
    const token = identity.databaseAuthToken ?? "";
    await verifyRuntimeIdentity(identity.authUserId, token);
    const decisionId = await dataApiRpc<string>("reject_candidate", {
      target_candidate_id: candidateId, expected_revision: expectedRevision, reason, checklist,
    }, token);
    return { ok: true, value: { decisionId } };
  } catch (error) {
    return toCommandError(error);
  }
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
