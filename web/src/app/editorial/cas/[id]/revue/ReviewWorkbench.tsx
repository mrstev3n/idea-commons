"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { approveAction, rejectAction, saveDraftAction } from "@/app/editorial/actions";
import { IDLE_FORM_STATE, type ReviewActionState } from "@/app/editorial/form-state";
import { CLAIM_TYPE_LABELS, RIGHTS_BASIS_LABELS } from "@/lib/labels";
import {
  CLAIM_TYPES,
  type CandidateContent,
  type ClaimType,
  type SourceExcerpt,
} from "@/server/types";

interface WorkbenchProps {
  intakeId: string;
  candidateId: string;
  initialRevision: number;
  initialContent: CandidateContent;
  sourceTitle: string;
  sourceUrl: string | null;
  rightsBasis: string;
  rightsNote: string | null;
  excerpts: SourceExcerpt[];
  canEdit: boolean;
  canDecide: boolean;
  isOwnCandidate: boolean;
  defaultCreditName: string;
  suggestedSlug: string;
}

const ARRAY_FIELDS: { key: keyof CandidateContent; label: string; hint: string }[] = [
  { key: "targetAudiences", label: "Pour qui", hint: "Un public par ligne." },
  { key: "mvpScope", label: "Premier test", hint: "Un élément par ligne." },
  { key: "initialExclusions", label: "Hors périmètre", hint: "Une exclusion par ligne." },
  { key: "coreAssumptions", label: "Hypothèses", hint: "Une hypothèse par ligne." },
  { key: "validationQuestions", label: "À valider", hint: "Une question par ligne." },
  { key: "risks", label: "Risques", hint: "Un risque par ligne." },
];

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function ReviewWorkbench(props: WorkbenchProps) {
  const [content, setContent] = useState<CandidateContent>(props.initialContent);
  const [changeSummary, setChangeSummary] = useState("");
  const [mobilePane, setMobilePane] = useState<"source" | "candidat">("candidat");
  const [saveState, saveFormAction, isSaving] = useActionState<ReviewActionState, FormData>(
    saveDraftAction,
    IDLE_FORM_STATE,
  );
  const [approveState, approveFormAction, isApproving] = useActionState(
    approveAction,
    IDLE_FORM_STATE,
  );
  const [rejectState, rejectFormAction, isRejecting] = useActionState(
    rejectAction,
    IDLE_FORM_STATE,
  );
  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const rejectDialogRef = useRef<HTMLDialogElement>(null);

  const currentRevision = saveState.savedRevision ?? props.initialRevision;
  const contentJson = useMemo(() => JSON.stringify(content), [content]);

  const updateField = <K extends keyof CandidateContent>(key: K, value: CandidateContent[K]) =>
    setContent((current) => ({ ...current, [key]: value }));

  const updateClaim = (index: number, patch: Partial<CandidateContent["claims"][number]>) =>
    setContent((current) => ({
      ...current,
      claims: current.claims.map((claim, claimIndex) =>
        claimIndex === index ? { ...claim, ...patch } : claim,
      ),
    }));

  const readOnly = !props.canEdit;

  return (
    <div className="stack-5">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Révision {currentRevision} — une version périmée produit un conflit, jamais un
          écrasement.
        </p>
        <div className="segmented" data-mobile-toggle role="group" aria-label="Panneau affiché sur mobile">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={mobilePane === "source"}
            onClick={() => setMobilePane("source")}
          >
            Source
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={mobilePane === "candidat"}
            onClick={() => setMobilePane("candidat")}
          >
            Candidat
          </button>
        </div>
      </div>

      <div className="compare">
        {/* ---------- Panneau source ---------- */}
        <section
          className="compare__pane card stack-4"
          aria-labelledby="pane-source-titre"
          data-mobile-hidden={mobilePane !== "source"}
        >
          <h2 id="pane-source-titre" style={{ fontSize: "var(--text-xl)" }}>
            Source
          </h2>
          <dl className="dl">
            <dt>Titre</dt>
            <dd>{props.sourceTitle}</dd>
            {props.sourceUrl ? (
              <>
                <dt>URL</dt>
                <dd>
                  <a href={props.sourceUrl} rel="noopener noreferrer">
                    {props.sourceUrl}
                  </a>
                </dd>
              </>
            ) : null}
            <dt>Droits</dt>
            <dd>
              {RIGHTS_BASIS_LABELS[props.rightsBasis] ?? props.rightsBasis}
              {props.rightsNote ? ` — ${props.rightsNote}` : ""}
            </dd>
          </dl>
          <div className="stack-2">
            {props.excerpts.map((excerpt) => (
              <blockquote key={excerpt.id} className="excerpt" style={{ margin: 0 }}>
                <p style={{ margin: 0 }}>{excerpt.text}</p>
                <p className="excerpt__meta">
                  <span className="mono">{excerpt.id}</span>
                  {excerpt.locator ? ` · ${excerpt.locator}` : ""}
                </p>
              </blockquote>
            ))}
          </div>
          <p className="note note--info" style={{ margin: 0 }}>
            Distingue extrait, claim, justification et correction humaine : une génération
            n'est jamais une source.
          </p>
        </section>

        {/* ---------- Panneau candidat ---------- */}
        <section
          className="compare__pane stack-4"
          aria-labelledby="pane-candidat-titre"
          data-mobile-hidden={mobilePane !== "candidat"}
        >
          <h2 id="pane-candidat-titre" style={{ fontSize: "var(--text-xl)" }}>
            Fiche en préparation {readOnly ? "(lecture seule)" : ""}
          </h2>

          {saveState.status === "error" ? (
            <p role="alert" className="note note--danger">
              {saveState.message}
            </p>
          ) : null}
          {saveState.savedRevision ? (
            <p role="status" className="note">
              Corrections enregistrées — révision {saveState.savedRevision}.
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="cand-title">
              Titre
            </label>
            <input
              id="cand-title"
              type="text"
              value={content.title}
              readOnly={readOnly}
              onChange={(event) => updateField("title", event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cand-summary">
              Résumé en une ligne
            </label>
            <textarea
              id="cand-summary"
              rows={2}
              value={content.oneLineSummary}
              readOnly={readOnly}
              onChange={(event) => updateField("oneLineSummary", event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cand-problem">
              Problème observé
            </label>
            <textarea
              id="cand-problem"
              rows={3}
              value={content.problemStatement}
              readOnly={readOnly}
              onChange={(event) => updateField("problemStatement", event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cand-approach">
              Approche proposée
            </label>
            <textarea
              id="cand-approach"
              rows={3}
              value={content.proposedApproach}
              readOnly={readOnly}
              onChange={(event) => updateField("proposedApproach", event.target.value)}
            />
          </div>

          {ARRAY_FIELDS.map((field) => (
            <div className="field" key={field.key}>
              <label className="field__label" htmlFor={`cand-${field.key}`}>
                {field.label}
              </label>
              <p className="field__hint">{field.hint}</p>
              <textarea
                id={`cand-${field.key}`}
                rows={3}
                value={(content[field.key] as string[]).join("\n")}
                readOnly={readOnly}
                onChange={(event) =>
                  updateField(field.key, linesToArray(event.target.value) as never)
                }
              />
            </div>
          ))}

          <fieldset className="fieldset stack-4">
            <legend>Claims</legend>
            <p className="field__hint">
              Un fait doit citer au moins un extrait ; une estimation ou une recommandation
              exige une justification. N'invente ni fait, ni citation, ni chiffre.
            </p>
            {content.claims.map((claim, index) => (
              <div className="card stack-2" key={index} style={{ padding: "var(--space-4)" }}>
                <div className="field">
                  <label className="field__label" htmlFor={`claim-type-${index}`}>
                    Type du claim {index + 1}
                  </label>
                  <select
                    id={`claim-type-${index}`}
                    value={claim.type}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateClaim(index, { type: event.target.value as ClaimType })
                    }
                  >
                    {CLAIM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CLAIM_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`claim-statement-${index}`}>
                    Affirmation
                  </label>
                  <textarea
                    id={`claim-statement-${index}`}
                    rows={2}
                    value={claim.statement}
                    readOnly={readOnly}
                    onChange={(event) => updateClaim(index, { statement: event.target.value })}
                  />
                </div>
                {claim.type === "estimate" || claim.type === "recommendation" ? (
                  <div className="field">
                    <label className="field__label" htmlFor={`claim-rationale-${index}`}>
                      Justification (obligatoire pour ce type)
                    </label>
                    <input
                      id={`claim-rationale-${index}`}
                      type="text"
                      value={claim.rationale ?? ""}
                      readOnly={readOnly}
                      onChange={(event) =>
                        updateClaim(index, { rationale: event.target.value || null })
                      }
                    />
                  </div>
                ) : null}
                {claim.type === "fact" ? (
                  <fieldset className="fieldset">
                    <legend className="text-sm">Extraits cités (au moins un)</legend>
                    {props.excerpts.map((excerpt) => (
                      <label
                        key={excerpt.id}
                        className="cluster text-sm"
                        style={{ padding: "4px 0" }}
                      >
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={claim.citationExcerptIds.includes(excerpt.id)}
                          onChange={(event) =>
                            updateClaim(index, {
                              citationExcerptIds: event.target.checked
                                ? [...claim.citationExcerptIds, excerpt.id]
                                : claim.citationExcerptIds.filter((id) => id !== excerpt.id),
                            })
                          }
                        />
                        <span>
                          <span className="mono">{excerpt.id}</span> — {excerpt.text}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                {!readOnly && content.claims.length > 1 ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      onClick={() =>
                        updateField(
                          "claims",
                          content.claims.filter((_, claimIndex) => claimIndex !== index),
                        )
                      }
                    >
                      Retirer ce claim
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {!readOnly ? (
              <div>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() =>
                    updateField("claims", [
                      ...content.claims,
                      {
                        type: "hypothesis",
                        statement: "",
                        rationale: null,
                        citationExcerptIds: [],
                      },
                    ])
                  }
                >
                  Ajouter un claim
                </button>
              </div>
            ) : null}
          </fieldset>

          {props.canEdit ? (
            <form action={saveFormAction} className="card stack-4" style={{ padding: "var(--space-4)" }}>
              <input type="hidden" name="candidateId" value={props.candidateId} />
              <input type="hidden" name="intakeId" value={props.intakeId} />
              <input type="hidden" name="expectedRevision" value={currentRevision} />
              <input type="hidden" name="content" value={contentJson} />
              <div className="field">
            <label className="field__label" htmlFor="change-summary">
              Résumé de la correction
            </label>
            <p className="field__hint">Décris ce qui a été corrigé, et pourquoi.</p>
              <input
                id="change-summary"
                name="changeSummary"
                type="text"
                placeholder="Citations recollées aux extraits 2 et 3"
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
              />
              </div>
              <div>
                <button type="submit" className="btn btn--secondary" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <span className="working-indicator" aria-hidden="true" /> Enregistrement…
                    </>
                  ) : (
                    "Enregistrer les corrections"
                  )}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>

      {/* ---------- Décision ---------- */}
      {props.canDecide ? (
        <section className="card stack-4" aria-labelledby="decision-titre">
          <h2 id="decision-titre" style={{ fontSize: "var(--text-xl)" }}>
            Décider
          </h2>
          {props.isOwnCandidate ? (
            <p className="note note--warning" style={{ margin: 0 }}>
              Tu as ajouté cette source : publier ici est une auto-publication de test,
              conservée dans l'historique.
            </p>
          ) : null}
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            La décision porte sur la révision {currentRevision}. Rien ne devient public sans
            un humain nommé. Un rejet garde l'historique.
          </p>
          <div className="cluster">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => approveDialogRef.current?.showModal()}
            >
              Approuver et publier…
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => rejectDialogRef.current?.showModal()}
            >
              Rejeter le candidat
            </button>
          </div>
        </section>
      ) : (
        <p className="note note--info">
          Ton compte ne peut pas décider ici : il faut un droit de revue.
        </p>
      )}

      {/* ---------- Dialogue d'approbation ---------- */}
      <dialog ref={approveDialogRef} className="dialog" aria-labelledby="approve-titre">
        <form action={approveFormAction} className="stack-4">
          <h2 id="approve-titre" style={{ fontSize: "var(--text-xl)" }}>
            Approuver et publier
          </h2>
          {approveState.status === "error" ? (
            <p role="alert" className="note note--danger">
              {approveState.message}
            </p>
          ) : null}
          <input type="hidden" name="candidateId" value={props.candidateId} />
          <input type="hidden" name="intakeId" value={props.intakeId} />
          <input type="hidden" name="expectedRevision" value={currentRevision} />

          <div className="field">
            <label className="field__label" htmlFor="approve-slug">
              Adresse publique (figée à la première publication)
            </label>
            <input
              id="approve-slug"
              name="approvedSlug"
              type="text"
              defaultValue={props.suggestedSlug}
              aria-invalid={approveState.fieldErrors.approvedSlug ? true : undefined}
              aria-describedby={
                approveState.fieldErrors.approvedSlug ? "erreur-approvedSlug" : undefined
              }
            />
            {approveState.fieldErrors.approvedSlug ? (
              <p className="field__error" id="erreur-approvedSlug">
                {approveState.fieldErrors.approvedSlug}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="approve-license">
              Licence du contenu
            </label>
            <select id="approve-license" name="contentLicense" defaultValue="CC-BY-SA-4.0">
              <option value="CC-BY-SA-4.0">CC BY-SA 4.0 (défaut du catalogue)</option>
              <option value="CC-BY-4.0">CC BY 4.0</option>
              <option value="CC0-1.0">CC0 1.0</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="approve-credit">
              Crédit (attribution obligatoire)
            </label>
            <input
              id="approve-credit"
              name="creditName"
              type="text"
              defaultValue={props.defaultCreditName}
              aria-invalid={approveState.fieldErrors.creditName ? true : undefined}
              aria-describedby={
                approveState.fieldErrors.creditName ? "erreur-creditName" : undefined
              }
            />
            {approveState.fieldErrors.creditName ? (
              <p className="field__error" id="erreur-creditName">
                {approveState.fieldErrors.creditName}
              </p>
            ) : null}
          </div>

          <fieldset
            className="fieldset"
            aria-describedby={approveState.fieldErrors.checklist ? "erreur-checklist" : undefined}
          >
            <legend>Avant de publier</legend>
            {approveState.fieldErrors.checklist ? (
              <p className="field__error" id="erreur-checklist">
                {approveState.fieldErrors.checklist}
              </p>
            ) : null}
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-rights" /> Les droits d'utilisation permettent
              une publication durable.
            </label>
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-citations" /> Chaque fait cite un extrait réel
              de la source.
            </label>
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-prudence" /> Faits, hypothèses, estimations et
              questions sont correctement distingués.
            </label>
          </fieldset>

          <div className="field">
            <label className="field__label" htmlFor="approve-reason">
              Motif de la décision
            </label>
            <textarea
              id="approve-reason"
              name="reason"
              rows={2}
              aria-invalid={approveState.fieldErrors.reason ? true : undefined}
              aria-describedby={approveState.fieldErrors.reason ? "erreur-approve-reason" : undefined}
            />
            {approveState.fieldErrors.reason ? (
              <p className="field__error" id="erreur-approve-reason">
                {approveState.fieldErrors.reason}
              </p>
            ) : null}
          </div>

          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => approveDialogRef.current?.close()}
            >
              Annuler
            </button>
            <button type="submit" className="btn btn--primary" disabled={isApproving}>
              {isApproving ? (
                <>
                  <span className="working-indicator" aria-hidden="true" /> Publication…
                </>
              ) : (
                "Publier cette fiche"
              )}
            </button>
          </div>
        </form>
      </dialog>

      {/* ---------- Dialogue de rejet ---------- */}
      <dialog ref={rejectDialogRef} className="dialog" aria-labelledby="reject-titre">
        <form action={rejectFormAction} className="stack-4">
          <h2 id="reject-titre" style={{ fontSize: "var(--text-xl)" }}>
            Rejeter le candidat
          </h2>
          {rejectState.status === "error" ? (
            <p role="alert" className="note note--danger">
              {rejectState.message}
            </p>
          ) : null}
          <input type="hidden" name="candidateId" value={props.candidateId} />
          <input type="hidden" name="intakeId" value={props.intakeId} />
          <input type="hidden" name="expectedRevision" value={currentRevision} />
          <fieldset className="fieldset">
            <legend>Points examinés</legend>
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-rights" /> Droits examinés
            </label>
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-citations" /> Citations examinées
            </label>
            <label className="cluster text-sm" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="check-prudence" /> Prudence examinée
            </label>
          </fieldset>
          <div className="field">
            <label className="field__label" htmlFor="reject-reason">
              Motif du rejet
            </label>
            <textarea
              id="reject-reason"
              name="reason"
              rows={3}
              aria-invalid={rejectState.fieldErrors.reason ? true : undefined}
              aria-describedby={rejectState.fieldErrors.reason ? "erreur-reject-reason" : undefined}
            />
            {rejectState.fieldErrors.reason ? (
              <p className="field__error" id="erreur-reject-reason">
                {rejectState.fieldErrors.reason}
              </p>
            ) : null}
          </div>
          <div className="cluster" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => rejectDialogRef.current?.close()}
            >
              Annuler
            </button>
            <button type="submit" className="btn btn--danger" disabled={isRejecting}>
              {isRejecting ? "Rejet…" : "Rejeter ce candidat"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
