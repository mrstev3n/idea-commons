import type { Metadata } from "next";
import { canContribute, getCurrentIdentity } from "@/server/identity";
import { AccessNotice } from "@/components/AccessNotice";
import { SourceForm } from "@/app/editorial/sources/nouvelle/SourceForm";

export const metadata: Metadata = { title: "Ajouter une source" };
export const dynamic = "force-dynamic";

export default async function NouvelleSourcePage() {
  const identity = await getCurrentIdentity();
  if (!identity.authUserId) return <AccessNotice kind={401} />;
  if (!canContribute(identity)) return <AccessNotice kind={403} />;

  return (
    <div className="shell prose-measure" style={{ paddingBlock: "var(--space-6) var(--space-8)" }}>
      <div className="stack-5">
        <header className="page-head stack-2" data-rise>
          <p className="eyebrow">Nouvelle source</p>
          <h1>Ajouter une source</h1>
          <p className="text-muted">
            URL ou texte public, extraits réellement utilisés, droits déclarés. Rien n'est
            analysé avant cet enregistrement.
          </p>
        </header>
        <div data-rise="2">
          <SourceForm />
        </div>
      </div>
    </div>
  );
}
