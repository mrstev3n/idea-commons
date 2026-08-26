/**
 * Identités synthétiques du harnais local — données pures, sans dépendance
 * au runtime Next (utilisables par les scripts Node de vérification).
 *
 * Neon Auth n'est pas activé dans cet incrément. Ces identités reproduisent
 * le contrat prévu : un `auth_user_id` (sub JWT) projeté vers `app.members`,
 * des capacités portées par `app.member_role_assignments`, et une exécution
 * SQL sous rôle `anonymous`/`authenticated` avec RLS réelle.
 * Aucun de ces comptes n'est une personne réelle.
 */

export interface SyntheticIdentity {
  key: string;
  displayName: string;
  authUserId: string | null;
  roles: ("contributor" | "reviewer" | "admin")[];
  description: string;
}

export const IDENTITIES: SyntheticIdentity[] = [
  {
    key: "anonymous",
    displayName: "Visiteur anonyme",
    authUserId: null,
    roles: [],
    description: "Tu lis le catalogue. Pas d'espace éditorial.",
  },
  {
    key: "membre",
    displayName: "Mireille Membre",
    authUserId: "00000000-0000-4000-8000-000000000004",
    roles: [],
    description: "Connecté, sans droit d'ajouter ou de revoir une source.",
  },
  {
    key: "contributor",
    displayName: "Awa Contributrice",
    authUserId: "00000000-0000-4000-8000-000000000001",
    roles: ["contributor"],
    description: "Tu ajoutes des sources et corriges tes fiches. Tu ne publies pas.",
  },
  {
    key: "reviewer",
    displayName: "Rachida Revieweuse",
    authUserId: "00000000-0000-4000-8000-000000000002",
    roles: ["reviewer"],
    description: "Tu relis, tu publies ou tu rejettes — avec un motif.",
  },
  {
    key: "admin",
    displayName: "Sena Admin",
    authUserId: "00000000-0000-4000-8000-000000000003",
    roles: ["contributor", "reviewer", "admin"],
    description: "Tous les droits. En test, tu peux publier une fiche que tu as toi-même saisie.",
  },
];

export function canContribute(identity: SyntheticIdentity): boolean {
  return identity.roles.includes("contributor") || identity.roles.includes("admin");
}

export function canReview(identity: SyntheticIdentity): boolean {
  return identity.roles.includes("reviewer") || identity.roles.includes("admin");
}

export function identityMemberId(identity: SyntheticIdentity): string | null {
  if (!identity.authUserId) return null;
  return `10000000-0000-4000-8000-00000000000${identity.authUserId.slice(-1)}`;
}

export function memberDisplayName(memberId: string | null): string {
  if (!memberId) return "Service";
  const suffix = memberId.slice(-1);
  const identity = IDENTITIES.find((candidate) => candidate.authUserId?.endsWith(suffix));
  return identity?.displayName ?? "Membre";
}
