"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitSourceAction } from "@/app/editorial/actions";
import { IDLE_FORM_STATE } from "@/app/editorial/form-state";
import { RIGHTS_BASIS_DESCRIPTIONS, RIGHTS_BASIS_LABELS } from "@/lib/labels";
import { RIGHTS_BASES, SIMULATOR_SCENARIOS } from "@/server/types";

interface ExcerptDraft {
  key: number;
  text: string;
  locator: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Titre de la source",
  sourceUrl: "URL publique",
  fullText: "Texte analysé",
  excerpts: "Passages utilisés",
  rightsBasis: "Base de droits",
  rightsNote: "Note de droits",
};

export function SourceForm() {
  const [state, formAction, isPending] = useActionState(submitSourceAction, IDLE_FORM_STATE);
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [rightsBasis, setRightsBasis] = useState<string>("");
  const [excerpts, setExcerpts] = useState<ExcerptDraft[]>([{ key: 1, text: "", locator: "" }]);
  const [dirty, setDirty] = useState(false);
  const nextKey = useRef(2);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const summaryRef = useRef<HTMLDivElement>(null);

  /* État « saisie sale » : avertir avant de perdre le travail (IC-07 §5). */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (state.status === "error") {
      summaryRef.current?.focus();
    }
  }, [state]);

  const noteRequired = rightsBasis === "compatible_license" || rightsBasis === "explicit_permission";
  const errorEntries = Object.entries(state.fieldErrors);

  return (
    <form
      action={formAction}
      className="stack-5"
      onInput={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      noValidate
    >
      {state.status === "error" ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="error-summary stack-2"
          aria-labelledby="erreurs-titre"
        >
          <h2 id="erreurs-titre">Impossible d'enregistrer</h2>
          <p>{state.message}</p>
          {errorEntries.length > 0 ? (
            <ul>
              {errorEntries.map(([field, message]) => (
                <li key={field}>
                  <a href={`#champ-${field}`}>
                    {FIELD_LABELS[field] ?? field} : {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <fieldset className="fieldset">
        <legend>Comment tu ajoutes</legend>
        <div className="cluster" role="group">
          <div className="segmented">
            <button
              type="button"
              className="segmented__option"
              aria-pressed={inputMode === "url"}
              onClick={() => setInputMode("url")}
            >
              URL publique
            </button>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={inputMode === "text"}
              onClick={() => setInputMode("text")}
            >
              Texte copié
            </button>
          </div>
        </div>
        <input type="hidden" name="inputMode" value={inputMode} />
        <p className="field__hint" style={{ marginTop: "var(--space-3)" }}>
          Tu fournis le texte analysé. On ne va pas le chercher à ta place.
        </p>
      </fieldset>

      <div className="field" id="champ-title">
        <label className="field__label" htmlFor="title">
          Titre de la source
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={240}
          placeholder="La ville de 15 minutes, version 2024"
          aria-invalid={state.fieldErrors.title ? true : undefined}
          aria-describedby={state.fieldErrors.title ? "erreur-title" : undefined}
        />
        {state.fieldErrors.title ? (
          <p className="field__error" id="erreur-title">
            {state.fieldErrors.title}
          </p>
        ) : null}
      </div>

      {inputMode === "url" ? (
        <div className="field" id="champ-sourceUrl">
          <label className="field__label" htmlFor="sourceUrl">
            URL publique
          </label>
          <p className="field__hint">
            L'URL seule ne prouve ni le contenu ni les droits : le texte collé ci-dessous
            fait foi.
          </p>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            aria-invalid={state.fieldErrors.sourceUrl ? true : undefined}
            aria-describedby={state.fieldErrors.sourceUrl ? "erreur-sourceUrl" : undefined}
          />
          {state.fieldErrors.sourceUrl ? (
            <p className="field__error" id="erreur-sourceUrl">
              {state.fieldErrors.sourceUrl}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="publishedAt">
          Date de publication <span className="field__optional">(si tu la connais)</span>
        </label>
        <input id="publishedAt" name="publishedAt" type="date" />
      </div>

      <div className="field" id="champ-fullText">
        <label className="field__label" htmlFor="fullText">
          Texte analysé
        </label>
        <p className="field__hint">
          Colle le contenu réellement analysé. Sur la base « analyse temporaire », ce texte
          disparaît sous 7 jours après décision.
        </p>
        <textarea
          id="fullText"
          name="fullText"
          rows={8}
          required
          placeholder="« En 2023, 40 % des trajets urbains… »"
          aria-invalid={state.fieldErrors.fullText ? true : undefined}
          aria-describedby={state.fieldErrors.fullText ? "erreur-fullText" : undefined}
        />
        {state.fieldErrors.fullText ? (
          <p className="field__error" id="erreur-fullText">
            {state.fieldErrors.fullText}
          </p>
        ) : null}
      </div>

      <fieldset
        className="fieldset"
        id="champ-excerpts"
        aria-describedby={state.fieldErrors.excerpts ? "erreur-excerpts" : undefined}
      >
        <legend>Passages utilisés</legend>
        <p className="field__hint">
          Garde uniquement les passages réellement utilisés, dans l'ordre, avec un repère
          lisible (paragraphe, section…). Chaque fait du candidat devra citer l'un d'eux.
        </p>
        {state.fieldErrors.excerpts ? (
          <p className="field__error" id="erreur-excerpts">
            {state.fieldErrors.excerpts}
          </p>
        ) : null}
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack-4">
          {excerpts.map((excerpt, index) => (
            <li key={excerpt.key} className="card stack-2" style={{ padding: "var(--space-4)" }}>
              <div className="field">
                <label className="field__label" htmlFor={`excerpt-text-${excerpt.key}`}>
                  Extrait {index + 1}
                </label>
                <textarea
                  id={`excerpt-text-${excerpt.key}`}
                  rows={3}
                  value={excerpt.text}
                  onChange={(event) =>
                    setExcerpts((current) =>
                      current.map((item) =>
                        item.key === excerpt.key ? { ...item, text: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`excerpt-locator-${excerpt.key}`}>
                  Localisation <span className="field__optional">(facultative)</span>
                </label>
                <input
                  id={`excerpt-locator-${excerpt.key}`}
                  type="text"
                  placeholder="paragraphe 2"
                  value={excerpt.locator}
                  onChange={(event) =>
                    setExcerpts((current) =>
                      current.map((item) =>
                        item.key === excerpt.key
                          ? { ...item, locator: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              {excerpts.length > 1 ? (
                <div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--sm"
                    onClick={() =>
                      setExcerpts((current) => current.filter((item) => item.key !== excerpt.key))
                    }
                  >
                    Retirer cet extrait
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <div style={{ marginTop: "var(--space-3)" }}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              setExcerpts((current) => [
                ...current,
                { key: nextKey.current, text: "", locator: "" },
              ]);
              nextKey.current += 1;
            }}
          >
            Ajouter un extrait
          </button>
        </div>
        <input
          type="hidden"
          name="excerpts"
          value={JSON.stringify(
            excerpts.map((excerpt) => ({ text: excerpt.text, locator: excerpt.locator })),
          )}
        />
      </fieldset>

      <fieldset className="fieldset" id="champ-rightsBasis">
        <legend>Droits d'utilisation</legend>
        <p className="field__hint">
          « Accessible en public » n'autorise pas à republier. Sans droits justifiés, la
          source sera refusée ou envoyée en revue humaine.
        </p>
        {state.fieldErrors.rightsBasis ? (
          <p className="field__error">{state.fieldErrors.rightsBasis}</p>
        ) : null}
        {RIGHTS_BASES.map((basis) => (
          <label key={basis} className="choice">
            <input
              type="radio"
              name="rightsBasis"
              value={basis}
              checked={rightsBasis === basis}
              onChange={() => setRightsBasis(basis)}
            />
            <span>
              <span className="choice__title">{RIGHTS_BASIS_LABELS[basis]}</span>
              <span className="choice__desc">{RIGHTS_BASIS_DESCRIPTIONS[basis]}</span>
            </span>
          </label>
        ))}
        <div className="field" id="champ-rightsNote" style={{ marginTop: "var(--space-4)" }}>
          <label className="field__label" htmlFor="rightsNote">
            Note de droits{" "}
            {noteRequired ? null : <span className="field__optional">(facultative)</span>}
          </label>
          <input
            id="rightsNote"
            name="rightsNote"
            type="text"
            placeholder={
              noteRequired ? "Licence exacte ou référence de l'autorisation" : "Attribution, précisions…"
            }
            aria-invalid={state.fieldErrors.rightsNote ? true : undefined}
            aria-describedby={state.fieldErrors.rightsNote ? "erreur-rightsNote" : undefined}
          />
          {state.fieldErrors.rightsNote ? (
            <p className="field__error" id="erreur-rightsNote">
              {state.fieldErrors.rightsNote}
            </p>
          ) : null}
        </div>
      </fieldset>

      <details className="card" style={{ padding: "var(--space-4)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 650 }}>
          Harnais de test — analyse simulée
        </summary>
        <div className="stack-2" style={{ marginTop: "var(--space-3)" }}>
          <p className="text-sm text-muted">
            Aucun fournisseur d'IA n'est branché. L'analyse rejoue un scénario local. Tu
            peux forcer un échec pour éprouver les états.
          </p>
          <div className="field">
            <label className="field__label" htmlFor="scenario">
              Scénario forcé <span className="field__optional">(facultatif)</span>
            </label>
            <select id="scenario" name="scenario" defaultValue="">
              <option value="">Automatique (succès, sauf si le corpus dit autrement)</option>
              {SIMULATOR_SCENARIOS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="cluster">
        <button type="submit" className="btn btn--primary" disabled={isPending}>
          {isPending ? (
            <>
              <span className="working-indicator" aria-hidden="true" /> Enregistrement…
            </>
          ) : (
            "Enregistrer la source"
          )}
        </button>
        <span className="text-sm text-muted">
          Tu lanceras l'analyse depuis la page suivante.
        </span>
      </div>
    </form>
  );
}
