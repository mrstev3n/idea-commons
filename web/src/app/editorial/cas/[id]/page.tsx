import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentIdentity, canContribute } from "@/server/identity";
import {
  getEditorialCase,
  identityMemberId,
  memberDisplayName,
  type EditorialCaseDetail,
} from "@/server/queries";
import { processOutboxOnce } from "@/server/worker";
import { AccessNotice } from "@/components/AccessNotice";
import { Badge } from "@/components/Badge";
import { AnalysisPoller } from "@/app/editorial/cas/[id]/AnalysisPoller";
import { StartAnalysisForm } from "@/app/editorial/cas/[id]/StartAnalysisForm";
import {
  ATTEMPT_OUTCOME_LABELS,
  CANDIDATE_STATUS_LABELS,
  FALLBACK_REASON_LABELS,
  RIGHTS_BASIS_LABELS,
  ROUTE_LABELS,
  TERMINAL_STATE_LABELS,
  TERMINAL_STATE_NEXT_STEPS,
  TERMINAL_STATE_TONES,
  formatDateTime,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Cas éditorial" };
export const dynamic = "force-dynamic";

type StepState = "pending" | "current" | "done" | "failed";

function stepStates(detail: EditorialCaseDetail): { label: string; state: StepState }[] {
  const generation = detail.generation;
  const terminal = generation?.terminalState ?? null;
  const decided = detail.decisions.length > 0;
  const published = Boolean(detail.publishedSlug);

  const analyser: StepState = !generation
    ? "current"
    : generation.status !== "terminal"
      ? "current"
      : terminal === "candidate_ready"
        ? "done"
        : "failed";
  const controler: StepState =
    terminal === "candidate_ready" ? "done" : terminal ? "failed" : "pending";
  const revoir: StepState = decided
    ? "done"
    : detail.candidate
      ? "current"
      : "pending";
  const publier: StepState = published
    ? "done"
    : detail.decisions.some((decision) => decision.decision === "rejected")
      ? "failed"
      : "pending";

  return [
    { label: "1 · Saisir", state: "done" },
    { label: "2 · Prouver", state: "done" },
    { label: "3 · Analyser", state: analyser },
    { label: "4 · Contrôler", state: controler },
    { label: "5 · Revoir", state: revoir },
    { label: "6 · Publier", state: publier },
    { label: "7 · Lire", state: published ? "done" : "pending" },
  ];
}

export default async function CasEditorialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) return <AccessNotice kind={401} />;

  await processOutboxOnce();

  const { id } = await params;
  const detail = await getEditorialCase(identity, id);
  if (!detail) notFound();

  const generation = detail.generation;
  const isRunning = generation !== null && generation.status !== "terminal";
  const terminal = generation?.terminalState ?? null;
  const memberId = identityMemberId(identity);
  const mayStartAnalysis =
    !generation && canContribute(identity) && detail.createdBy === memberId && !detail.decidedAt;

  return (
    <div className="shell stack-6" style={{ maxWidth: 900, paddingBlock: "var(--space-6) var(--space-8)" }}>
      <header className="stack-4" data-rise>
        <p className="eyebrow">
          <Link href="/editorial" style={{ textDecoration: "none" }}>
            Espace éditorial
          </Link>{" "}
          / Source
        </p>
        <h1 className="page-head" style={{ padding: 0, maxWidth: "none" }}>
          {detail.title}
        </h1>
        <ol className="stepper" aria-label="Étapes du parcours éditorial">
          {stepStates(detail).map((step) => (
            <li key={step.label} className="stepper__item" data-state={step.state}>
              {step.label}
            </li>
          ))}
        </ol>
      </header>

      <section aria-labelledby="provenance-titre" className="card stack-4" data-rise="2">
          <h2 id="provenance-titre" style={{ fontSize: "var(--text-xl)" }}>
          Source et droits
        </h2>
        <dl className="dl">
          <dt>Mode de saisie</dt>
          <dd>{detail.inputMode === "url" ? "URL publique" : "Texte copié"}</dd>
          {detail.sourceUrl ? (
            <>
              <dt>URL</dt>
              <dd>
                <a href={detail.sourceUrl} rel="noopener noreferrer">
                  {detail.sourceUrl}
                </a>
              </dd>
            </>
          ) : null}
          <dt>Publication de la source</dt>
          <dd>{formatDateTime(detail.publishedAt)}</dd>
          <dt>Accès à la source</dt>
          <dd>{formatDateTime(detail.accessedAt)}</dd>
          <dt>Empreinte SHA-256</dt>
          <dd>
            <span className="fingerprint" title={detail.fingerprint}>
              {detail.fingerprint}
            </span>
          </dd>
          <dt>Base de droits</dt>
          <dd>
            {RIGHTS_BASIS_LABELS[detail.rightsBasis] ?? detail.rightsBasis}
            {detail.rightsNote ? ` — ${detail.rightsNote}` : ""}
          </dd>
          <dt>Texte intégral</dt>
          <dd>
            {detail.hasTemporaryText
              ? "Conservé temporairement ; suppression automatique sous 7 jours après décision."
              : "Non conservé durablement (empreinte et extraits seulement)."}
          </dd>
          <dt>Créé par</dt>
          <dd>
            {memberDisplayName(detail.createdBy)} · {formatDateTime(detail.createdAt)}
          </dd>
        </dl>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 650 }}>
            Extraits conservés ({detail.excerpts.length})
          </summary>
          <div className="stack-2" style={{ marginTop: "var(--space-3)" }}>
            {detail.excerpts.map((excerpt) => (
              <blockquote key={excerpt.id} className="excerpt" style={{ margin: 0 }}>
                <p style={{ margin: 0 }}>{excerpt.text}</p>
                <p className="excerpt__meta">
                  <span className="mono">{excerpt.id}</span>
                  {excerpt.locator ? ` · ${excerpt.locator}` : ""}
                </p>
              </blockquote>
            ))}
          </div>
        </details>
      </section>

      <section
        aria-labelledby="analyse-titre"
        className="card stack-4"
        aria-busy={isRunning}
        data-rise="3"
      >
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <h2 id="analyse-titre" style={{ fontSize: "var(--text-xl)" }}>
            Analyse IA
          </h2>
          {generation ? (
            isRunning ? (
              <Badge tone="running" withDot>
                Analyse en cours
              </Badge>
            ) : terminal ? (
              <Badge tone={TERMINAL_STATE_TONES[terminal]}>
                {TERMINAL_STATE_LABELS[terminal]}
              </Badge>
            ) : null
          ) : (
            <Badge tone="neutral">Pas encore lancée</Badge>
          )}
        </div>

        {!generation ? (
          mayStartAnalysis ? (
            <StartAnalysisForm intakeId={detail.intakeId} revision={detail.revision} />
          ) : (
            <p className="text-muted text-sm">
              L'analyse se lance depuis le compte qui a ajouté la source.
            </p>
          )
        ) : null}

        {isRunning ? (
          <div className="stack-2">
            <p className="cluster" role="status">
              <span className="working-indicator" aria-hidden="true" />
              <span>
                Analyse en cours. Le statut se met à jour tout seul ; aucune barre de
                progression n'est inventée.
              </span>
            </p>
            <AnalysisPoller intakeId={detail.intakeId} />
          </div>
        ) : null}

        {generation && generation.status === "terminal" && terminal ? (
          <div className="stack-4 state-banner-enter">
            <p
              className={`note ${
                TERMINAL_STATE_TONES[terminal] === "ready"
                  ? ""
                  : TERMINAL_STATE_TONES[terminal] === "caution"
                    ? "note--warning"
                    : "note--danger"
              }`}
              role="status"
            >
              <strong>{TERMINAL_STATE_LABELS[terminal]}.</strong>{" "}
              {TERMINAL_STATE_NEXT_STEPS[terminal]}
            </p>

            <div className="cluster" aria-label="Contrôles automatiques">
              <Badge tone={generation.controls.schemaValid ? "ready" : "failure"}>
                Schéma {generation.controls.schemaValid ? "valide" : "invalide"}
              </Badge>
              <Badge tone={generation.controls.citationsValid ? "ready" : "failure"}>
                Citations {generation.controls.citationsValid ? "valides" : "invalides"}
              </Badge>
              <Badge tone={generation.controls.prudenceValid ? "ready" : "failure"}>
                Prudence {generation.controls.prudenceValid ? "valide" : "à revoir"}
              </Badge>
              {generation.controls.simulated ? (
                <Badge tone="neutral">Analyse simulée — hors réseau</Badge>
              ) : null}
            </div>

            <h3 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)" }}>
              Tentatives ({generation.attempts.length})
            </h3>
            <ol className="timeline">
              {generation.attempts.map((attempt) => (
                <li
                  key={attempt.rank}
                  className="timeline__item"
                  data-outcome={
                    attempt.outcome === "success"
                      ? "success"
                      : attempt.outcome === "timeout" || attempt.outcome === "invalid_response"
                        ? "caution"
                        : "failure"
                  }
                >
                  <span className="timeline__marker" aria-hidden="true" />
                  <p style={{ margin: 0, fontWeight: 650 }}>
                    {attempt.rank}. {ROUTE_LABELS[attempt.routeKey] ?? attempt.routeKey} —{" "}
                    {ATTEMPT_OUTCOME_LABELS[attempt.outcome] ?? attempt.outcome}
                  </p>
                  <p className="text-sm text-muted" style={{ margin: 0 }}>
                    {attempt.fallbackReason
                      ? `Motif : ${FALLBACK_REASON_LABELS[attempt.fallbackReason] ?? attempt.fallbackReason} · `
                      : ""}
                    Quota : {attempt.quotaUnits} unités
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="revue-titre" className="card stack-4" data-rise="4">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <h2 id="revue-titre" style={{ fontSize: "var(--text-xl)" }}>
            Revue
          </h2>
          {detail.candidate ? (
            <Badge
              tone={
                detail.candidate.status === "published"
                  ? "ready"
                  : detail.candidate.status === "rejected"
                    ? "failure"
                    : "caution"
              }
            >
              {CANDIDATE_STATUS_LABELS[detail.candidate.status] ?? detail.candidate.status}
            </Badge>
          ) : null}
        </div>

        {!detail.candidate ? (
          <p className="text-muted text-sm">
            Aucun candidat pour l'instant. Il apparaît quand l'analyse est prête pour
            revue — et n'a aucun pouvoir tant qu'un humain n'a pas décidé.
          </p>
        ) : (
          <div className="stack-4">
            <p className="text-sm text-muted">
              Brouillon, révision {detail.candidate.currentRevision} — «{" "}
              {detail.candidate.content.title} ». Compare, corrige et décide dans la revue.
            </p>
            {detail.candidate.status === "in_review" || detail.candidate.status === "draft" ? (
              <p>
                <Link
                  className="btn btn--primary"
                  href={`/editorial/cas/${detail.intakeId}/revue`}
                >
                  Ouvrir la revue
                </Link>
              </p>
            ) : null}
          </div>
        )}

        {detail.decisions.length > 0 ? (
          <div className="stack-2">
            <h3 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)" }}>
              Décisions
            </h3>
            <ol className="timeline">
              {detail.decisions.map((decision) => (
                <li
                  key={decision.id}
                  className="timeline__item"
                  data-outcome={decision.decision === "approved" ? "success" : "failure"}
                >
                  <span className="timeline__marker" aria-hidden="true" />
                  <p style={{ margin: 0, fontWeight: 650 }}>
                    {decision.decision === "approved" ? "Approbation" : "Rejet"} —{" "}
                    {memberDisplayName(decision.reviewerId)}
                    {decision.selfApproval ? " · auto-publication de test" : ""}
                  </p>
                  <p className="text-sm text-muted" style={{ margin: 0 }}>
                    Révision {decision.candidateRevision} · {formatDateTime(decision.createdAt)} ·
                    Motif : {decision.reason}
                  </p>
                </li>
              ))}
            </ol>
            <p>
              <Link className="btn btn--secondary" href={`/editorial/cas/${detail.intakeId}/recu`}>
                Voir la décision
              </Link>
            </p>
          </div>
        ) : null}

        {detail.publishedSlug ? (
          <p className="note">
            Fiche publique (immuable) :{" "}
            <Link href={`/idees/${detail.publishedSlug}`}>/idees/{detail.publishedSlug}</Link> —
            lisible sans compte.
          </p>
        ) : null}
      </section>
    </div>
  );
}
