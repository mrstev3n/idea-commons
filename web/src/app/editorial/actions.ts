"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentIdentity } from "@/server/identity";
import {
  approveAndPublishCandidate,
  createSourceIntake,
  rejectCandidate,
  startCandidateGeneration,
  updateCandidateDraft,
} from "@/server/commands";
import {
  CLAIM_TYPES,
  RIGHTS_BASES,
  type CandidateContent,
  type ClaimType,
  type RightsBasis,
  type SourceExcerpt,
} from "@/server/types";

import type { FormState, ReviewActionState } from "@/app/editorial/form-state";

/* ---------- Créer une ingestion de source ---------- */

export async function submitSourceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const identity = await getCurrentIdentity();

  const inputMode = formData.get("inputMode") === "url" ? "url" : "text";
  const title = String(formData.get("title") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim() || null;
  const publishedAt = String(formData.get("publishedAt") ?? "").trim() || null;
  const fullText = String(formData.get("fullText") ?? "");
  const rightsBasisRaw = String(formData.get("rightsBasis") ?? "");
  const rightsNote = String(formData.get("rightsNote") ?? "").trim() || null;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");

  let excerpts: SourceExcerpt[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("excerpts") ?? "[]")) as SourceExcerpt[];
    excerpts = parsed
      .map((excerpt, index) => ({
        id: `ex-${index + 1}`,
        text: String(excerpt.text ?? "").trim(),
        locator: String(excerpt.locator ?? "").trim() || null,
      }))
      .filter((excerpt) => excerpt.text.length > 0);
  } catch {
    excerpts = [];
  }

  const fieldErrors: Record<string, string> = {};
  if (title.length === 0 || title.length > 240) {
    fieldErrors.title = "Indique un titre (240 caractères maximum).";
  }
  if (inputMode === "url") {
    if (!sourceUrl) {
      fieldErrors.sourceUrl = "Colle l'URL publique, ou passe en texte copié.";
    } else if (!/^https?:\/\/[^\s]+$/i.test(sourceUrl)) {
      fieldErrors.sourceUrl = "L'URL doit commencer par http:// ou https://.";
    }
  }
  if (fullText.trim().length === 0) {
    fieldErrors.fullText = "Colle le texte que tu analyses.";
  }
  if (excerpts.length === 0) {
    fieldErrors.excerpts = "Garde au moins un passage réellement utilisé.";
  }
  const rightsBasis = RIGHTS_BASES.find((basis) => basis === rightsBasisRaw) as
    | RightsBasis
    | undefined;
  if (!rightsBasis) {
    fieldErrors.rightsBasis = "Choisis la base de droits.";
  } else if (
    (rightsBasis === "compatible_license" || rightsBasis === "explicit_permission") &&
    !rightsNote
  ) {
    fieldErrors.rightsNote =
      "Ajoute la licence exacte ou la référence de l'autorisation.";
  }
  if (!idempotencyKey) {
    fieldErrors.idempotencyKey = "Recharge la page, puis enregistre à nouveau.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Impossible d'enregistrer. Corrige les champs ci-dessous.",
      fieldErrors,
    };
  }

  const result = await createSourceIntake(identity, {
    inputMode,
    title,
    sourceUrl: inputMode === "url" ? sourceUrl : null,
    publishedAt,
    fullText,
    excerpts,
    rightsBasis: rightsBasis as RightsBasis,
    rightsNote,
    idempotencyKey,
  });

  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: {} };
  }

  revalidatePath("/editorial");
  redirect(`/editorial/cas/${result.value.intakeId}`);
}

/* ---------- Lancer l'analyse ---------- */

export async function startAnalysisAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const identity = await getCurrentIdentity();
  const intakeId = String(formData.get("intakeId") ?? "");
  const revision = Number(formData.get("revision") ?? 0);
  const result = await startCandidateGeneration(identity, intakeId, revision);
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: {} };
  }
  revalidatePath(`/editorial/cas/${intakeId}`);
  return { status: "idle", message: null, fieldErrors: {} };
}

/* ---------- Revue : enregistrer, rejeter, approuver ---------- */

function parseCandidateContent(formData: FormData): CandidateContent | { error: string } {
  try {
    const raw = JSON.parse(String(formData.get("content") ?? "")) as CandidateContent;
    const claims = (raw.claims ?? []).map((claim) => ({
      type: (CLAIM_TYPES.includes(claim.type as ClaimType) ? claim.type : "hypothesis") as ClaimType,
      statement: String(claim.statement ?? "").trim(),
      rationale: claim.rationale ? String(claim.rationale).trim() : null,
      citationExcerptIds: (claim.citationExcerptIds ?? []).map(String),
    }));
    return { ...raw, claims };
  } catch {
    return { error: "Le candidat est illisible. Recharge la page." };
  }
}

export async function saveDraftAction(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const identity = await getCurrentIdentity();
  const candidateId = String(formData.get("candidateId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision") ?? 0);
  const changeSummary =
    String(formData.get("changeSummary") ?? "").trim() || "Correction éditoriale";
  const content = parseCandidateContent(formData);
  if ("error" in content) {
    return { status: "error", message: content.error, fieldErrors: {} };
  }
  const result = await updateCandidateDraft(
    identity,
    candidateId,
    expectedRevision,
    content,
    changeSummary,
  );
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: {} };
  }
  const intakeId = String(formData.get("intakeId") ?? "");
  revalidatePath(`/editorial/cas/${intakeId}`);
  return { status: "idle", message: null, fieldErrors: {}, savedRevision: result.value.revision };
}

export async function rejectAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const identity = await getCurrentIdentity();
  const candidateId = String(formData.get("candidateId") ?? "");
  const intakeId = String(formData.get("intakeId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    return {
      status: "error",
      message: "Indique le motif du rejet.",
      fieldErrors: { reason: "Écris pourquoi tu rejettes ce candidat." },
    };
  }
  const checklist = {
    rights: formData.get("check-rights") === "on",
    citations: formData.get("check-citations") === "on",
    prudence: formData.get("check-prudence") === "on",
  };
  const result = await rejectCandidate(identity, candidateId, expectedRevision, reason, checklist);
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: {} };
  }
  revalidatePath(`/editorial/cas/${intakeId}`);
  redirect(`/editorial/cas/${intakeId}/recu`);
}

export async function approveAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const identity = await getCurrentIdentity();
  const candidateId = String(formData.get("candidateId") ?? "");
  const intakeId = String(formData.get("intakeId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  const approvedSlug = String(formData.get("approvedSlug") ?? "").trim();
  const contentLicense = String(formData.get("contentLicense") ?? "").trim();
  const creditName = String(formData.get("creditName") ?? "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!reason) fieldErrors.reason = "Écris le motif de la publication.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(approvedSlug)) {
    fieldErrors.approvedSlug = "Utilise uniquement des minuscules, des chiffres et des tirets.";
  }
  if (!contentLicense) fieldErrors.contentLicense = "Choisis une licence.";
  if (!creditName) fieldErrors.creditName = "Indique un nom pour le crédit.";
  const checklist = {
    rights: formData.get("check-rights") === "on",
    citations: formData.get("check-citations") === "on",
    prudence: formData.get("check-prudence") === "on",
  };
  if (!checklist.rights || !checklist.citations || !checklist.prudence) {
    fieldErrors.checklist = "Coche les trois points : droits, citations, distinction des claims.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "La publication est incomplète. Complète les champs ci-dessous.",
      fieldErrors,
    };
  }

  const result = await approveAndPublishCandidate(identity, {
    candidateId,
    expectedRevision,
    reason,
    checklist,
    approvedSlug,
    contentLicense,
    creditName,
  });
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: {} };
  }
  revalidatePath("/", "layout");
  redirect(`/editorial/cas/${intakeId}/recu`);
}
