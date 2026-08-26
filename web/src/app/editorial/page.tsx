import type { Metadata } from "next";
import Link from "next/link";
import { canContribute, canReview, getCurrentIdentity } from "@/server/identity";
import { listEditorialCases } from "@/server/queries";
import { memberDisplayName } from "@/server/queries";
import { AccessNotice } from "@/components/AccessNotice";
import { Badge } from "@/components/Badge";
import {
  CANDIDATE_STATUS_LABELS,
  RIGHTS_BASIS_LABELS,
  TERMINAL_STATE_LABELS,
  TERMINAL_STATE_TONES,
  formatDateTime,
} from "@/lib/labels";
import type { TerminalState } from "@/server/types";

export const metadata: Metadata = { title: "Espace éditorial" };
export const dynamic = "force-dynamic";

function CaseStateBadge({
  generationState,
  candidateStatus,
  publishedSlug,
}: {
  generationState: TerminalState | "pending" | "running" | null;
  candidateStatus: string | null;
  publishedSlug: string | null;
}) {
  if (publishedSlug) return <Badge tone="ready">Publié</Badge>;
  if (candidateStatus === "rejected") return <Badge tone="failure">Rejeté</Badge>;
  if (generationState === null) return <Badge tone="neutral">Source enregistrée</Badge>;
  if (generationState === "pending" || generationState === "running") {
    return (
      <Badge tone="running" withDot>
        Analyse en cours
      </Badge>
    );
  }
  return (
    <Badge tone={TERMINAL_STATE_TONES[generationState]}>
      {TERMINAL_STATE_LABELS[generationState]}
    </Badge>
  );
}

export default async function EditorialDashboardPage() {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) return <AccessNotice kind={401} />;
  if (!canContribute(identity) && !canReview(identity)) return <AccessNotice kind={403} />;

  const cases = await listEditorialCases(identity);

  return (
    <div className="shell stack-6" style={{ paddingBlock: "var(--space-6) var(--space-8)" }}>
      <header className="page-head stack-2" data-rise>
            <p className="eyebrow">Espace éditorial</p>
        <div className="catalogue__head" style={{ marginBottom: 0 }}>
          <h1>Sources</h1>
          {canContribute(identity) ? (
            <Link className="btn btn--primary" href="/editorial/sources/nouvelle">
              Ajouter une source
            </Link>
          ) : null}
        </div>
        <p className="text-muted" style={{ maxWidth: 720 }}>
          De la source à la fiche publique : tu déclares les droits, l'analyse propose un
          candidat, une revue humaine décide. Rien ne part tout seul.{" "}
          {canReview(identity)
            ? "Tu vois toutes les sources."
            : "Tu vois uniquement tes sources."}
        </p>
      </header>

      {cases.length === 0 ? (
        <div className="empty stack-4" data-rise="2">
          <h2 style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}>
            Aucune source pour l'instant
          </h2>
          <p>
            Ajoute une source publique. L'analyse et la revue viennent ensuite : rien n'est
            publié sans décision humaine.
          </p>
          {canContribute(identity) ? (
            <p>
              <Link className="btn btn--primary" href="/editorial/sources/nouvelle">
                Ajouter une source
              </Link>
            </p>
          ) : (
            <p className="text-sm">
              Avec un compte de revue, tu verras les sources dès qu'une contribution en crée.
            </p>
          )}
        </div>
      ) : (
        <div className="table-frame table-frame--stack" data-rise="2">
          <table>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">État</th>
                <th scope="col">Brouillon</th>
                <th scope="col">Droits</th>
                <th scope="col">Par</th>
                <th scope="col">Le</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((editorialCase) => (
                <tr key={editorialCase.intakeId}>
                  <td data-label="Source">
                    <Link href={`/editorial/cas/${editorialCase.intakeId}`}>
                      {editorialCase.title}
                    </Link>
                  </td>
                  <td data-label="État">
                    <CaseStateBadge
                      generationState={editorialCase.generationState}
                      candidateStatus={editorialCase.candidateStatus}
                      publishedSlug={editorialCase.publishedSlug}
                    />
                  </td>
                  <td data-label="Brouillon">
                    {editorialCase.candidateStatus
                      ? CANDIDATE_STATUS_LABELS[editorialCase.candidateStatus]
                      : "—"}
                  </td>
                  <td className="text-sm" data-label="Droits">
                    {RIGHTS_BASIS_LABELS[editorialCase.rightsBasis] ?? editorialCase.rightsBasis}
                  </td>
                  <td className="text-sm" data-label="Par">
                    {memberDisplayName(editorialCase.createdBy)}
                  </td>
                  <td className="text-sm" data-label="Le">
                    {formatDateTime(editorialCase.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
