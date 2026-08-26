/**
 * Parcours de fumée IC-07 — pilote les vraies commandes serveur (fonctions SQL
 * M1 sous RLS), le worker outbox et l'adaptateur simulé contre une base PGlite
 * jetable. Vérifie le chemin nominal ET les frontières normatives
 * (401/403/404/409), l'idempotence de publication et l'immuabilité M0.
 *
 * Usage : npm run smoke (aucun réseau, aucune écriture hors répertoire temporaire).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "ic-smoke-"));
process.env.IC_DATA_DIR = dataDir;

const { IDENTITIES } = await import("../src/server/identities");
const {
  createSourceIntake,
  startCandidateGeneration,
  updateCandidateDraft,
  approveAndPublishCandidate,
} = await import("../src/server/commands");
const { processOutboxOnce } = await import("../src/server/worker");
const { getEditorialCase, getPublishedIdea, listPublishedIdeas } = await import(
  "../src/server/queries"
);
const { withDbRoleThenService, withServiceDb } = await import("../src/server/db");
const { deriveCanonicalSourceFingerprint } = await import("../src/server/source-fingerprint");

const anonymous = IDENTITIES.find((i) => i.key === "anonymous")!;
const membre = IDENTITIES.find((i) => i.key === "membre")!;
const contributor = IDENTITIES.find((i) => i.key === "contributor")!;
const reviewer = IDENTITIES.find((i) => i.key === "reviewer")!;

let stepCount = 0;
function step(label: string): void {
  stepCount += 1;
  console.log(`  ✓ ${String(stepCount).padStart(2, "0")} ${label}`);
}

const runId = randomUUID().slice(0, 8);
const sourceText = [
  `Note de synthèse (${runId}) — mutualiser les diagnostics énergétiques de quartier.`,
  "Les collectivités dupliquent des études coûteuses faute de partage structuré.",
  "Une base commune de diagnostics réutilisables réduirait les délais de 6 mois à 6 semaines.",
  "Question ouverte : quel niveau d'anonymisation des données de consommation est requis ?",
].join("\n");

const excerpts = [
  {
    id: "exc-1",
    text: "Les collectivités dupliquent des études coûteuses faute de partage structuré.",
    locator: "§2",
  },
  {
    id: "exc-2",
    text: "Une base commune de diagnostics réutilisables réduirait les délais de 6 mois à 6 semaines.",
    locator: "§3",
  },
];

function intakeInput(overrides: Record<string, unknown> = {}) {
  return {
    inputMode: "text" as const,
    title: `Diagnostics énergétiques mutualisés (${runId})`,
    sourceUrl: null,
    publishedAt: null,
    fullText: sourceText,
    excerpts,
    rightsBasis: "idea_commons" as const,
    rightsNote: null,
    scenario: "success" as const,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function waitAndProcess(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 2300));
  let processed = 0;
  for (let i = 0; i < 5 && processed === 0; i += 1) {
    processed = await processOutboxOnce();
    if (processed === 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return processed;
}

try {
  console.log("Parcours de fumée IC-07 (base PGlite jetable)\n");

  /* --- Frontières d'entrée --- */
  const anonAttempt = await createSourceIntake(anonymous, intakeInput());
  assert.equal(anonAttempt.ok, false);
  assert.equal(!anonAttempt.ok && anonAttempt.status, 401);
  step("anonyme → création de source refusée (401)");

  const memberAttempt = await createSourceIntake(membre, intakeInput());
  assert.equal(memberAttempt.ok, false);
  assert.equal(!memberAttempt.ok && memberAttempt.status, 403);
  step("membre sans capacité → création refusée (403)");

  const rollbackTitle = `Rollback atomique (${runId})`;
  const rollbackText = `Source annulée ${runId}`;
  let rollbackIntakeId: string | null = null;
  await assert.rejects(
    withDbRoleThenService(
      "authenticated",
      contributor.authUserId!,
      async (tx) => {
        const created = await tx.query<{ id: string }>(
          `select app.create_source_intake(
             'text', $1, null, null, now(), $2, $3::jsonb, 'idea_commons',
             null, null, $4, $5
           ) as id`,
          [
            rollbackTitle,
            deriveCanonicalSourceFingerprint(rollbackText),
            JSON.stringify([{ id: "rollback-1", text: "Preuve atomique.", locator: "p1" }]),
            randomUUID(),
            deriveCanonicalSourceFingerprint(`requête rollback ${runId}`),
          ],
        );
        rollbackIntakeId = created.rows[0].id;
        return created.rows[0].id;
      },
      async (tx, intakeId) => {
        await tx.query(
          "select app.record_verified_source_fingerprint($1, $2, $3)",
          [intakeId, 2, deriveCanonicalSourceFingerprint(rollbackText)],
        );
      },
    ),
    /source not found, already verified, or revision conflict/,
  );
  const rollbackEvidence = await withServiceDb(async (tx) => {
    const result = await tx.query<{ intakes: string; audit: string; receipts: string; outbox: string }>(
      `select
         (select count(*) from app.source_intakes where id = $1) as intakes,
         (select count(*) from app_private.audit_events where resource_id = $1) as audit,
         (select count(*) from app_private.command_receipts where resource_id = $1) as receipts,
         (select count(*) from app_private.outbox_events where aggregate_id = $1) as outbox`,
      [rollbackIntakeId],
    );
    return result.rows[0];
  });
  assert.deepEqual(
    Object.values(rollbackEvidence).map(Number),
    [0, 0, 0, 0],
  );
  step("échec de continuation service → ingestion et effets annulés atomiquement");

  /* --- Chemin nominal : saisie --- */
  const created = await createSourceIntake(contributor, intakeInput());
  assert.ok(created.ok, `création attendue: ${JSON.stringify(created)}`);
  const createdValue = created.ok ? created.value : (undefined as never);
  const { intakeId } = createdValue;
  assert.equal(createdValue.revision, 2);
  step(`contributrice → source enregistrée (${intakeId.slice(0, 8)}…)`);

  const verifiedText = await withServiceDb(async (tx) => {
    const result = await tx.query<{
      fingerprint_sha256: string;
      fingerprint_status: string;
      verified_fingerprint_sha256: string | null;
      fingerprint_verification_method: string | null;
      revision: string;
    }>(
      `select fingerprint_sha256, fingerprint_status::text,
              verified_fingerprint_sha256, fingerprint_verification_method, revision
         from app.source_intakes where id = $1`,
      [intakeId],
    );
    return result.rows[0];
  });
  assert.equal(verifiedText.fingerprint_status, "verified");
  assert.equal(verifiedText.fingerprint_sha256, createdValue.fingerprint);
  assert.equal(verifiedText.verified_fingerprint_sha256, deriveCanonicalSourceFingerprint(sourceText));
  assert.equal(verifiedText.fingerprint_verification_method, "unicode_nfc_lf_trim_v1");
  assert.equal(Number(verifiedText.revision), 2);
  step("texte → empreinte dérivée et enregistrée par la continuation service");

  const rawText = `\u00a0\t\r\n  Texte brut ${runId}  \t\r\n`;
  const rawCreated = await createSourceIntake(
    contributor,
    intakeInput({
      title: `Texte brut canonique (${runId})`,
      fullText: rawText,
      rightsBasis: "temporary_analysis",
      idempotencyKey: randomUUID(),
    }),
  );
  assert.ok(rawCreated.ok, `création texte brut attendue: ${JSON.stringify(rawCreated)}`);
  const rawCreatedValue = rawCreated.ok ? rawCreated.value : (undefined as never);
  const rawEvidence = await withServiceDb(async (tx) => {
    const result = await tx.query<{
      full_text: string;
      verified_fingerprint_sha256: string;
      verification_audit_events: string;
      leaked_events: string;
    }>(
      `select s.full_text, s.verified_fingerprint_sha256,
              (select count(*)
                 from app_private.audit_events a
                where a.resource_id = s.id
                  and a.event_type = 'source_intake.fingerprint_verified'
                  and a.resource_type = 'source_intake'
                  and a.metadata = '{}'::jsonb)
                as verification_audit_events,
              (select count(*)
                 from app_private.audit_events a
                where a.resource_id = s.id
                  and (a.metadata::text like '%' || s.full_text || '%'
                       or a.metadata::text like '%' || s.verified_fingerprint_sha256 || '%'
                       or a.metadata::text like '%unicode_nfc_lf_trim_v1%'))
              +
              (select count(*)
                 from app_private.outbox_events o
                where o.aggregate_id = s.id
                  and (o.payload::text like '%' || s.full_text || '%'
                       or o.payload::text like '%' || s.verified_fingerprint_sha256 || '%'
                       or o.payload::text like '%unicode_nfc_lf_trim_v1%'))
                as leaked_events
         from app.source_intakes s where s.id = $1`,
      [rawCreatedValue.intakeId],
    );
    return result.rows[0];
  });
  assert.equal(rawEvidence.full_text, rawText);
  assert.equal(rawEvidence.verified_fingerprint_sha256, deriveCanonicalSourceFingerprint(rawText));
  assert.equal(Number(rawEvidence.verification_audit_events), 1);
  assert.equal(Number(rawEvidence.leaked_events), 0);
  step("audit conservé ; texte, digest et méthode absents des audit/outbox");

  const urlCreated = await createSourceIntake(
    contributor,
    intakeInput({
      inputMode: "url",
      title: `URL sans corps serveur (${runId})`,
      sourceUrl: `https://example.test/source-${runId}`,
      fullText: `${sourceText}\nCopie navigateur pour URL ${runId}.`,
      rightsBasis: "temporary_analysis",
      idempotencyKey: randomUUID(),
    }),
  );
  assert.ok(urlCreated.ok, `création URL attendue: ${JSON.stringify(urlCreated)}`);
  const urlCreatedValue = urlCreated.ok ? urlCreated.value : (undefined as never);
  assert.equal(urlCreatedValue.revision, 1);
  const urlEvidence = await withServiceDb(async (tx) => {
    const result = await tx.query<{
      fingerprint_status: string;
      verified_fingerprint_sha256: string | null;
      fingerprint_verification_method: string | null;
    }>(
      `select fingerprint_status::text, verified_fingerprint_sha256,
              fingerprint_verification_method
         from app.source_intakes where id = $1`,
      [urlCreatedValue.intakeId],
    );
    return result.rows[0];
  });
  assert.equal(urlEvidence.fingerprint_status, "submitted");
  assert.equal(urlEvidence.verified_fingerprint_sha256, null);
  assert.equal(urlEvidence.fingerprint_verification_method, null);
  step("URL sans corps acquis côté serveur → reste submitted");

  const duplicate = await createSourceIntake(contributor, intakeInput());
  assert.equal(duplicate.ok, false);
  assert.equal(!duplicate.ok && duplicate.status, 409);
  step("même empreinte re-soumise → déduplication (409)");

  /* --- Analyse simulée --- */
  const generation = await startCandidateGeneration(contributor, intakeId, createdValue.revision);
  assert.ok(generation.ok, `analyse attendue: ${JSON.stringify(generation)}`);
  step("analyse demandée → outbox transactionnelle");

  const processed = await waitAndProcess();
  assert.equal(processed, 1);
  step("worker outbox → adaptateur simulé exécuté");

  const caseForReviewer = await getEditorialCase(reviewer, intakeId);
  assert.ok(caseForReviewer, "le reviewer doit voir le cas");
  assert.equal(caseForReviewer.generation?.terminalState, "candidate_ready");
  assert.ok(caseForReviewer.candidate, "candidat attendu");
  assert.equal(caseForReviewer.candidate.currentRevision, 1);
  assert.ok(
    caseForReviewer.candidate.content.claims.every(
      (claim) => claim.type !== "fact" || claim.citationExcerptIds.length > 0,
    ),
    "chaque fait doit citer au moins un extrait",
  );
  step("candidat prêt (révision 1, faits cités) visible du reviewer");

  const caseForMember = await getEditorialCase(membre, intakeId);
  assert.equal(caseForMember, null);
  step("membre sans capacité → cas invisible (RLS, 404 normatif)");

  /* --- Revue --- */
  const editedContent = {
    ...caseForReviewer.candidate.content,
    oneLineSummary: `${caseForReviewer.candidate.content.oneLineSummary} (relu ${runId})`,
  };

  const editByReviewer = await updateCandidateDraft(
    reviewer,
    caseForReviewer.candidate.id,
    1,
    editedContent,
    "Tentative d'édition par un non-créateur",
  );
  assert.equal(editByReviewer.ok, false);
  step(`édition par un non-créateur refusée (${!editByReviewer.ok && editByReviewer.status})`);

  const editByContributor = await updateCandidateDraft(
    contributor,
    caseForReviewer.candidate.id,
    1,
    editedContent,
    "Reformulation du résumé après relecture",
  );
  assert.ok(editByContributor.ok, `édition attendue: ${JSON.stringify(editByContributor)}`);
  assert.equal(editByContributor.ok && editByContributor.value.revision, 2);
  step("correction de la créatrice → révision 2");

  const approveInput = {
    candidateId: caseForReviewer.candidate.id,
    expectedRevision: 2,
    reason: "Sources vérifiées, claims typés et cités, prudence conforme.",
    checklist: { rights: true, citations: true, prudence: true },
    approvedSlug: `diagnostics-energetiques-${runId}`,
    contentLicense: "CC-BY-SA-4.0",
    creditName: contributor.displayName,
  };

  const staleApprove = await approveAndPublishCandidate(reviewer, {
    ...approveInput,
    expectedRevision: 1,
  });
  assert.equal(staleApprove.ok, false);
  assert.equal(!staleApprove.ok && staleApprove.status, 409);
  step("approbation sur révision périmée → conflit (409)");

  const approveByContributor = await approveAndPublishCandidate(contributor, approveInput);
  assert.equal(approveByContributor.ok, false);
  assert.equal(!approveByContributor.ok && approveByContributor.status, 403);
  step("approbation par la contributrice → refusée (403)");

  const published = await approveAndPublishCandidate(reviewer, approveInput);
  assert.ok(published.ok, `publication attendue: ${JSON.stringify(published)}`);
  const receipt = published.ok ? published.value : (undefined as never);
  step(`approbation reviewer → publication (/idees/${receipt.slug})`);

  const replay = await approveAndPublishCandidate(reviewer, approveInput);
  assert.ok(replay.ok, `rejeu idempotent attendu: ${JSON.stringify(replay)}`);
  assert.equal(replay.ok && replay.value.ideaVersionId, receipt.ideaVersionId);
  step("approbation rejouée → même version, aucune double publication");

  /* --- Lecture publique anonyme --- */
  const catalogue = await listPublishedIdeas();
  assert.ok(catalogue.some((idea) => idea.slug === receipt.slug));
  const publicIdea = await getPublishedIdea(receipt.slug);
  assert.ok(publicIdea, "fiche publique attendue");
  assert.equal(publicIdea.contentLicense, "CC-BY-SA-4.0");
  assert.ok(publicIdea.claims.length > 0, "claims publics attendus");
  assert.ok(
    publicIdea.claims.every((claim) => claim.type !== "fact" || claim.citations.length > 0),
    "chaque fait publié doit porter ses citations",
  );
  assert.ok(publicIdea.credits.length > 0, "crédits publics attendus");
  step("lecture anonyme → fiche complète (claims cités, crédits, licence)");

  /* --- Immuabilité M0 --- */
  let immutabilityEnforced = false;
  try {
    await withServiceDb(async (tx) => {
      await tx.query(
        `update app.idea_versions set content = jsonb_set(content, '{title}', '"altéré"') where id = $1`,
        [receipt.ideaVersionId],
      );
    });
  } catch {
    immutabilityEnforced = true;
  }
  assert.ok(immutabilityEnforced, "la version publiée doit être immuable");
  step("altération directe d'une version publiée → bloquée par trigger M0");

  /* --- Chemin d'échec : cascade épuisée --- */
  const failing = await createSourceIntake(
    contributor,
    intakeInput({
      title: `Cascade épuisée (${runId})`,
      fullText: `${sourceText}\nVariante pour scénario d'échec (${runId}).`,
      scenario: "cascade_exhausted",
      idempotencyKey: randomUUID(),
    }),
  );
  assert.ok(failing.ok, `création attendue: ${JSON.stringify(failing)}`);
  const failingId = failing.ok ? failing.value.intakeId : (undefined as never);
  const failingGeneration = await startCandidateGeneration(
    contributor,
    failingId,
    failing.ok ? failing.value.revision : (undefined as never),
  );
  assert.ok(failingGeneration.ok);
  assert.equal(await waitAndProcess(), 1);
  const failingCase = await getEditorialCase(contributor, failingId);
  assert.equal(failingCase?.generation?.terminalState, "providers_exhausted");
  assert.equal(failingCase?.candidate, null);
  assert.ok((failingCase?.generation?.attempts.length ?? 0) >= 3);
  step("cascade gratuite épuisée → état terminal honnête, tentatives journalisées");

  console.log(`\nPASS — ${stepCount} contrôles du parcours IC-07 vérifiés.`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
