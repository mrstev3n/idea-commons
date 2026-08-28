export type RuntimeRole = "anonymous" | "authenticated";
export interface RuntimeIdentityProof {
  authUserId: string | null;
  memberId: string | null;
  roles: ("contributor" | "reviewer" | "admin")[];
}

let configuredUrl: string | null = null;

export function configureDataApi(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.pathname.endsWith("/neondb/rest/v1")) {
    throw new Error("NEON_DATA_API_URL invalide");
  }
  configuredUrl = url.replace(/\/$/, "");
}

async function callDataApiRpc<Result>(
  name: string,
  parameters: Record<string, unknown>,
  authToken?: string,
): Promise<Result> {
  if (!configuredUrl) throw new Error("Data API non configurée");
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("nom RPC invalide");
  const headers: Record<string, string> = {
    "Accept-Profile": "app",
    "Content-Profile": "app",
    "Content-Type": "application/json",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${configuredUrl}/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(parameters),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Data API RPC refusée (${response.status})`);
    const code = typeof payload === "object" && payload && "code" in payload
      ? (payload as { code?: unknown }).code
      : undefined;
    Object.assign(error, { code });
    throw error;
  }
  return payload as Result;
}

export async function dataApiPublicRpc<Result>(
  name: "public_list_published_ideas" | "public_get_published_idea",
  parameters: Record<string, unknown>,
): Promise<Result> {
  return callDataApiRpc(name, parameters);
}

export async function dataApiRpc<Result>(
  name: string,
  parameters: Record<string, unknown>,
  authToken: string,
): Promise<Result> {
  if (!authToken) throw new Error("JWT Neon Auth requis");
  return callDataApiRpc(name, parameters, authToken);
}

export async function verifyRuntimeIdentity(
  expectedAuthUserId: string,
  authToken: string,
): Promise<RuntimeIdentityProof> {
  const raw = await dataApiRpc<RuntimeIdentityProof | RuntimeIdentityProof[]>("runtime_identity", {}, authToken);
  const proof = Array.isArray(raw) ? raw[0] : raw;
  if (!proof || proof.authUserId !== expectedAuthUserId) throw new Error("identité Data API incohérente");
  const allowed = new Set(["contributor", "reviewer", "admin"]);
  if (!proof.roles.every((role) => allowed.has(role))) throw new Error("rôle Data API inattendu");
  return { ...proof, roles: [...new Set(proof.roles)] };
}
