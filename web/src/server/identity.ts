import { getAuth } from "./auth";
import type { AppIdentity } from "./identity-contract";
import { resolveRuntimeIdentity } from "./runtime-identity";

export { canContribute, canReview } from "./identity-contract";
export type { AppIdentity } from "./identity-contract";

const ANONYMOUS: AppIdentity = {
  key: "anonymous",
  displayName: "Visiteur anonyme",
  authUserId: null,
  memberId: null,
  databaseAuthToken: null,
  roles: [],
  description: "Session anonyme.",
};

/**
 * Vérifie la session Neon Auth puis résout le membre via l'unique RPC Data API.
 * Aucun rôle Auth ou client n'est accepté comme capacité métier.
 */
export async function getCurrentIdentity(): Promise<AppIdentity> {
  let session: Awaited<ReturnType<ReturnType<typeof getAuth>["getSession"]>>["data"];
  let databaseAuthToken: string | null = null;
  try {
    const auth = getAuth();
    ({ data: session } = await auth.getSession());
    if (session?.user?.id) {
      const tokenResult = await auth.token();
      databaseAuthToken = tokenResult.data?.token ?? null;
    }
  } catch {
    return ANONYMOUS;
  }
  if (!session?.user?.id) return ANONYMOUS;
  if (!databaseAuthToken) throw new Error("jeton Neon Auth absent pour une session authentifiée");

  const authUserId = session.user.id;
  const displayName = session.user.name?.trim() || "Membre";
  const runtimeIdentity = await resolveRuntimeIdentity(authUserId, databaseAuthToken);
  return {
    key: "authenticated",
    displayName,
    authUserId,
    memberId: runtimeIdentity.memberId,
    databaseAuthToken,
    roles: runtimeIdentity.roles,
    description: "Compte authentifié par Neon Auth; capacités chargées par RPC sous RLS.",
  };
}
