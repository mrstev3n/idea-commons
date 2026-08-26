import type { Metadata } from "next";
import { getCurrentIdentity, IDENTITIES } from "@/server/identity";
import { switchIdentityAction } from "@/app/identite/actions";
import { Badge } from "@/components/Badge";
import { ROLE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Compte de test" };
export const dynamic = "force-dynamic";

export default async function IdentitePage() {
  const current = await getCurrentIdentity();

  return (
    <div className="shell prose-measure" style={{ paddingBlock: "var(--space-6) var(--space-8)" }}>
      <div className="stack-5">
        <header className="page-head stack-2" data-rise>
          <p className="eyebrow">Comptes de test</p>
          <h1>Quel compte veux-tu utiliser ?</h1>
          <p className="text-muted">
            Pas d'authentification réelle ici. Ces comptes simulent un visiteur, un membre,
            une contributrice, une revieweuse ou un admin. Aucun n'est une personne réelle.
          </p>
        </header>

        <form action={switchIdentityAction} className="stack-4" data-rise="2">
          <fieldset className="fieldset" style={{ border: 0, padding: 0 }}>
            <legend className="visually-hidden">Compte à utiliser</legend>
            {IDENTITIES.map((identity) => (
              <label key={identity.key} className="choice">
                <input
                  type="radio"
                  name="identity"
                  value={identity.key}
                  defaultChecked={identity.key === current.key}
                />
                <span>
                  <span className="choice__title cluster">
                    {identity.displayName}
                    {identity.roles.length === 0 ? (
                      <Badge tone="neutral">{identity.authUserId ? "Compte" : "Sans compte"}</Badge>
                    ) : (
                      identity.roles.map((role) => (
                        <Badge key={role} tone={role === "admin" ? "caution" : "ready"}>
                          {ROLE_LABELS[role] ?? role}
                        </Badge>
                      ))
                    )}
                  </span>
                  <span className="choice__desc">{identity.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="btn btn--primary">
            Utiliser ce compte
          </button>
        </form>

        <p className="note note--info" data-rise="3">
          Les droits se décident côté serveur. Un écran masqué n'ouvre pas un accès.
        </p>
      </div>
    </div>
  );
}
