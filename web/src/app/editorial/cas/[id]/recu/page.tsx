import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentIdentity } from "@/server/identity";
import { getEditorialCase, memberDisplayName } from "@/server/queries";
import { AccessNotice } from "@/components/AccessNotice";
import { Badge } from "@/components/Badge";
import { formatDateTime } from "@/lib/labels";

export const metadata: Metadata = { title: "Décision" };
export const dynamic = "force-dynamic";

export default async function RecuPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) return <AccessNotice kind={401} />;

  const { id } = await params;
  const detail = await getEditorialCase(identity, id);
  if (!detail) notFound();
  if (detail.decisions.length === 0) redirect(`/editorial/cas/${id}`);

  const decision = detail.decisions[0];
  const approved = decision.decision === "approved";

  return (
    <div className="shell prose-measure" style={{ paddingBlock: "var(--space-6) var(--space-8)" }}>
      <div className="stack-5">
        <header className="page-head stack-2" data-rise>
          <p className="eyebrow">
            <Link href={`/editorial/cas/${detail.intakeId}`} style={{ textDecoration: "none" }}>
              Source
            </Link>{" "}
            / Décision
          </p>
          <div className="cluster">
            <h1>{approved ? "Fiche publiée" : "Candidat rejeté"}</h1>
            <Badge tone={approved ? "ready" : "failure"}>
              {approved ? "Publié" : "Rejeté"}
            </Badge>
          </div>
        </header>

        <section className="card stack-4" aria-labelledby="recu-details" data-rise="2">
          <h2 id="recu-details" style={{ fontSize: "var(--text-xl)" }}>
            La décision
          </h2>
          <dl className="dl">
            <dt>Source</dt>
            <dd>{detail.title}</dd>
            <dt>Décision</dt>
            <dd>{approved ? "Publication" : "Rejet"}</dd>
            <dt>Revue par</dt>
            <dd>
              {memberDisplayName(decision.reviewerId)}
              {decision.selfApproval ? " — auto-publication de test, conservée dans l'historique" : ""}
            </dd>
            <dt>Révision</dt>
            <dd>{decision.candidateRevision}</dd>
            <dt>Le</dt>
            <dd>{formatDateTime(decision.createdAt)}</dd>
            <dt>Motif</dt>
            <dd>{decision.reason}</dd>
            {approved && detail.publishedSlug ? (
              <>
                <dt>Fiche publique</dt>
                <dd>
                  <Link href={`/idees/${detail.publishedSlug}`}>
                    /idees/{detail.publishedSlug}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        {approved ? (
          <p className="note" data-rise="3">
            Cette version ne change plus : contenu, claims, citations, crédits et licence.
            Une correction crée une nouvelle version et garde celle-ci. L'adresse reste la
            même.
          </p>
        ) : (
          <p className="note note--warning" data-rise="3">
            Le rejet s'ajoute à l'historique : il n'écrase pas une décision précédente. Le
            texte complet de la source disparaît sous 7 jours.
          </p>
        )}

        <div className="cluster" data-rise="4">
          {approved && detail.publishedSlug ? (
            <Link className="btn btn--primary" href={`/idees/${detail.publishedSlug}`}>
              Lire la fiche publique
            </Link>
          ) : null}
          <Link className="btn btn--secondary" href="/editorial">
            Retour aux sources
          </Link>
        </div>
      </div>
    </div>
  );
}
