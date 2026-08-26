import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="card stack-4" style={{ maxWidth: 560, marginInline: "auto" }}>
        <p className="eyebrow">Introuvable</p>
        <h1 className="page-head" style={{ padding: 0, maxWidth: "none" }}>
          Cette page n'existe pas.
        </h1>
        <p className="text-muted">
          Le lien est incomplet, périmé, ou tu n'as pas accès à cette ressource. Le
          catalogue reste lisible sans compte.
        </p>
        <div className="cluster">
          <Link className="btn btn--primary" href="/">
            Aller au catalogue
          </Link>
          <Link className="btn btn--secondary" href="/identite">
            Choisir un compte de test
          </Link>
        </div>
      </div>
    </div>
  );
}
