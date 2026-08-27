/**
 * Identités synthétiques du harnais local — données pures, sans dépendance
 * au runtime Next (utilisables par les scripts Node de vérification).
 *
 * Ces identités de test reproduisent le contrat Neon Auth : un `auth_user_id`
 * (sub JWT) projeté vers `app.members`,
 * des capacités portées par `app.member_role_assignments`, et une exécution
 * SQL sous rôle `anonymous`/`authenticated` avec RLS réelle.
 * Aucun de ces comptes n'est une personne réelle.
 */

import type { AppIdentity } from "./identity-contract";

export type SyntheticIdentity = AppIdentity;
export { canContribute, canReview, identityMemberId, memberDisplayName } from "./identity-contract";

export const IDENTITIES: SyntheticIdentity[] = [
  {
    key: "anonymous",
    displayName: "Visiteur anonyme",
    authUserId: null,
    memberId: null,
    databaseAuthToken: null,
    roles: [],
    description: "Tu lis le catalogue. Pas d'espace éditorial.",
  },
  {
    key: "membre",
    displayName: "Mireille Membre",
    authUserId: "00000000-0000-4000-8000-000000000004",
    memberId: "10000000-0000-4000-8000-000000000004",
    databaseAuthToken: "test-token-membre",
    roles: [],
    description: "Connecté, sans droit d'ajouter ou de revoir une source.",
  },
  {
    key: "contributor",
    displayName: "Awa Contributrice",
    authUserId: "00000000-0000-4000-8000-000000000001",
    memberId: "10000000-0000-4000-8000-000000000001",
    databaseAuthToken: "test-token-contributor",
    roles: ["contributor"],
    description: "Tu ajoutes des sources et corriges tes fiches. Tu ne publies pas.",
  },
  {
    key: "reviewer",
    displayName: "Rachida Revieweuse",
    authUserId: "00000000-0000-4000-8000-000000000002",
    memberId: "10000000-0000-4000-8000-000000000002",
    databaseAuthToken: "test-token-reviewer",
    roles: ["reviewer"],
    description: "Tu relis, tu publies ou tu rejettes — avec un motif.",
  },
  {
    key: "admin",
    displayName: "Sena Admin",
    authUserId: "00000000-0000-4000-8000-000000000003",
    memberId: "10000000-0000-4000-8000-000000000003",
    databaseAuthToken: "test-token-admin",
    roles: ["contributor", "reviewer", "admin"],
    description: "Tous les droits. En test, tu peux publier une fiche que tu as toi-même saisie.",
  },
];
