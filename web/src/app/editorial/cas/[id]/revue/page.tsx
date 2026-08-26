import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canContribute, canReview, getCurrentIdentity } from "@/server/identity";
import { getEditorialCase, identityMemberId } from "@/server/queries";
import { AccessNotice } from "@/components/AccessNotice";
import { slugifyTitle } from "@/server/canonical";
import { ReviewWorkbench } from "@/app/editorial/cas/[id]/revue/ReviewWorkbench";

export const metadata: Metadata = { title: "Revue" };
export const dynamic = "force-dynamic";

export default async function RevuePage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) return <AccessNotice kind={401} />;

  const { id } = await params;
  const detail = await getEditorialCase(identity, id);
  if (!detail) notFound();
  if (!detail.candidate) redirect(`/editorial/cas/${id}`);

  const candidate = detail.candidate;
  if (candidate.status !== "in_review" && candidate.status !== "draft") {
    redirect(`/editorial/cas/${id}`);
  }

  const memberId = identityMemberId(identity);
  const isOwnCandidate = candidate.createdBy === memberId;
  const canEdit = canContribute(identity) && isOwnCandidate;
  const mayDecide = canReview(identity) && (!isOwnCandidate || identity.roles.includes("admin"));

  return (
    <div className="shell stack-5" style={{ paddingBlock: "var(--space-6) var(--space-8)" }}>
      <header className="page-head stack-2" data-rise>
        <p className="eyebrow">
          <Link href={`/editorial/cas/${detail.intakeId}`} style={{ textDecoration: "none" }}>
            Source
          </Link>{" "}
          / Revue
        </p>
        <h1>Revue</h1>
        <p className="text-muted" style={{ maxWidth: 760 }}>
          Compare la source et le candidat, corrige, puis publie ou rejette. L'IA n'a aucun
          pouvoir de publication.
        </p>
      </header>
      <div data-rise="2">
        <ReviewWorkbench
          intakeId={detail.intakeId}
          candidateId={candidate.id}
          initialRevision={candidate.currentRevision}
          initialContent={candidate.content}
          sourceTitle={detail.title}
          sourceUrl={detail.sourceUrl}
          rightsBasis={detail.rightsBasis}
          rightsNote={detail.rightsNote}
          excerpts={detail.excerpts}
          canEdit={canEdit}
          canDecide={mayDecide}
          isOwnCandidate={isOwnCandidate}
          defaultCreditName={identity.displayName}
          suggestedSlug={slugifyTitle(candidate.content.title)}
        />
      </div>
    </div>
  );
}
