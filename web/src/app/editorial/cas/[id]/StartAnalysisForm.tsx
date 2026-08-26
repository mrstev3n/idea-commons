"use client";

import { useActionState } from "react";
import { IDLE_FORM_STATE } from "@/app/editorial/form-state";
import { startAnalysisAction } from "@/app/editorial/actions";

export function StartAnalysisForm({
  intakeId,
  revision,
}: {
  intakeId: string;
  revision: number;
}) {
  const [state, formAction, isPending] = useActionState(startAnalysisAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="stack-2">
      <input type="hidden" name="intakeId" value={intakeId} />
      <input type="hidden" name="revision" value={revision} />
      {state.status === "error" ? (
        <p role="alert" className="note note--danger">
          {state.message}
        </p>
      ) : null}
      <div className="cluster">
        <button type="submit" className="btn btn--primary" disabled={isPending}>
          {isPending ? (
            <>
              <span className="working-indicator" aria-hidden="true" /> Analyse en cours…
            </>
          ) : (
            "Lancer l'analyse"
          )}
        </button>
        <span className="text-sm text-muted">
          L'analyse part d'ici. Aucune route payante.
        </span>
      </div>
    </form>
  );
}
