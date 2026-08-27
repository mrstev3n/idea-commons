import type { AppIdentity } from "./identity-contract";

type RuntimeRole = AppIdentity["roles"][number];
type Fetcher = typeof fetch;

interface RuntimeIdentityPayload {
  authUserId: string | null;
  memberId: string | null;
  roles: string[];
}

const ALLOWED_ROLES = new Set<RuntimeRole>(["contributor", "reviewer", "admin"]);

function dataApiUrl(): URL {
  const value = process.env.NEON_DATA_API_URL?.trim();
  if (!value) throw new Error("configuration d'identité runtime absente : NEON_DATA_API_URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.pathname.endsWith("/neondb/rest/v1")) {
    throw new Error("configuration d'identité runtime invalide");
  }
  return url;
}

/**
 * Résout l'identité SQL depuis l'unique RPC d'amorçage Data API.
 * Le JWT ne quitte jamais ce fetch serveur et les erreurs amont ne sont pas reflétées.
 */
export async function resolveRuntimeIdentity(
  expectedAuthUserId: string,
  authToken: string,
  fetcher: Fetcher = fetch,
): Promise<{ memberId: string | null; roles: RuntimeRole[] }> {
  if (!expectedAuthUserId || !authToken) throw new Error("session Neon Auth incomplète");

  const endpoint = new URL(`${dataApiUrl().toString().replace(/\/$/, "")}/rpc/runtime_identity`);
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "accept-profile": "app",
      "content-profile": "app",
      "content-type": "application/json",
    },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`identité runtime indisponible (${response.status})`);

  const payload = await response.json() as RuntimeIdentityPayload | RuntimeIdentityPayload[];
  const identity = Array.isArray(payload) ? payload[0] : payload;
  if (!identity || identity.authUserId !== expectedAuthUserId) {
    throw new Error("identité runtime incohérente");
  }
  if (identity.memberId !== null && typeof identity.memberId !== "string") {
    throw new Error("membre runtime invalide");
  }
  if (!Array.isArray(identity.roles) || !identity.roles.every((role): role is RuntimeRole => ALLOWED_ROLES.has(role as RuntimeRole))) {
    throw new Error("capacités runtime invalides");
  }
  return { memberId: identity.memberId, roles: [...new Set(identity.roles)] };
}
