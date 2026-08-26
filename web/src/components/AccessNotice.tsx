import Link from "next/link";

/**
 * Frontières d'accès normatives IC-07 §9, rendues comme surfaces explicites :
 * 401 (authentification requise) et 403 (capacité manquante).
 * Les cas 404 passent par notFound() sans révéler l'existence de la ressource.
 */
export function AccessNotice({ kind }: { kind: 401 | 403 }) {
  return (
    <div className="shell" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="card stack-4" style={{ maxWidth: 560, marginInline: "auto" }} data-rise>
        <p className="eyebrow">{kind === 401 ? "Compte requis" : "Pas le bon compte"}</p>
        <h1 className="page-head" style={{ padding: 0, maxWidth: "none" }}>
          {kind === 401
            ? "Connecte-toi pour entrer ici."
            : "Ce compte ne peut pas travailler ici."}
        </h1>
        <p className="text-muted">
          {kind === 401
            ? "Le catalogue se lit sans compte. Ajouter une source, analyser et revoir demandent un compte."
            : "Tu es connecté, mais il te manque le droit d'ajouter une source ou de décider en revue."}
        </p>
        <div className="cluster">
          <Link className="btn btn--primary" href="/identite">
            Choisir un compte de test
          </Link>
          <Link className="btn btn--secondary" href="/">
            Aller au catalogue
          </Link>
        </div>
      </div>
    </div>
  );
}
