import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedIdea } from "@/server/queries";
import { getCurrentIdentity } from "@/server/identity";
import { CLAIM_TYPE_LABELS, formatDate } from "@/lib/labels";
import { Badge } from "@/components/Badge";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getPublishedIdea(await getCurrentIdentity(), slug);
  if (!idea) return { title: "Fiche introuvable" };
  return { title: idea.content.title, description: idea.content.oneLineSummary };
}

function ListSection({ id, title, items }: { id: string; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="stack-2">
      <h2 id={id}>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function FichePubliquePage({ params }: PageProps) {
  const { slug } = await params;
  const idea = await getPublishedIdea(await getCurrentIdentity(), slug);
  if (!idea) notFound();

  const { content } = idea;

  return (
    <div className="shell fiche">
      <article className="stack-6">
        <header className="stack-4 fiche__meta" data-rise>
          <p className="eyebrow">Fiche · version {idea.versionNumber} · immuable</p>
          <h1>{content.title}</h1>
          <p className="text-muted" style={{ fontSize: "var(--text-lg)", maxWidth: "40rem" }}>
            {content.oneLineSummary}
          </p>
          <p className="cluster text-sm text-muted">
            <span>{formatDate(idea.publishedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Licence {idea.contentLicense}</span>
            <span aria-hidden="true">·</span>
            <span lang="en">{idea.language}</span>
          </p>
        </header>

        <section aria-labelledby="probleme" className="stack-2" data-rise="2">
          <h2 id="probleme">Le problème</h2>
          <p>{content.problemStatement}</p>
        </section>

        <div data-rise="3" className="stack-6">
          <ListSection id="publics" title="Pour qui" items={content.targetAudiences} />

          <section aria-labelledby="approche" className="stack-2">
            <h2 id="approche">L'approche</h2>
            <p>{content.proposedApproach}</p>
          </section>

          <ListSection id="mvp" title="Premier test" items={content.mvpScope} />
          <ListSection id="exclusions" title="Hors périmètre" items={content.initialExclusions} />
          <ListSection id="hypotheses" title="Hypothèses" items={content.coreAssumptions} />
          <ListSection id="validation" title="À valider" items={content.validationQuestions} />
          <ListSection id="risques" title="Risques" items={content.risks} />
        </div>

        <section aria-labelledby="claims-titre" className="stack-4" data-rise="4">
          <h2 id="claims-titre">Claims</h2>
          <p className="text-muted text-sm">
            Chaque affirmation a un type. Un fait s'appuie sur une source ; une hypothèse
            n'est jamais un fait.
          </p>
          <div>
            {idea.claims.map((claim) => (
              <article key={claim.id} className="claim" data-claim-type={claim.type}>
                <Badge tone={claim.type as never}>{CLAIM_TYPE_LABELS[claim.type] ?? claim.type}</Badge>
                <p className="claim__statement">{claim.statement}</p>
                {claim.rationale ? (
                  <p className="claim__rationale">Justification : {claim.rationale}</p>
                ) : null}
                {claim.citations.length > 0 ? (
                  <p className="claim__citations">
                    Sources :{" "}
                    {claim.citations.map((citation, index) => (
                      <span key={citation.urlOrReference}>
                        {index > 0 ? " ; " : ""}
                        {citation.urlOrReference.startsWith("http") ? (
                          <a href={citation.urlOrReference} rel="noopener noreferrer">
                            {citation.title}
                          </a>
                        ) : (
                          <span>
                            {citation.title} (<span className="mono">{citation.urlOrReference}</span>)
                          </span>
                        )}
                      </span>
                    ))}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <footer className="stack-4" data-rise="5">
          <section aria-labelledby="credits" className="stack-2">
            <h2 id="credits">Crédits</h2>
            <ul>
              {idea.credits.map((credit) => (
                <li key={credit.displayName}>
                  {credit.displayName}
                  {credit.contribution ? ` — ${credit.contribution}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <p className="note">
            Cette version ne change plus. Une correction crée une nouvelle version et garde
            celle-ci. Licence : {idea.contentLicense}.
          </p>
        </footer>
      </article>
    </div>
  );
}
