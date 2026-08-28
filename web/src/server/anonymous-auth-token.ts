const ANONYMOUS_TOKEN_PATH = "/token/anonymous";
const REFRESH_MARGIN_MS = 30_000;
const MAX_CACHE_LIFETIME_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface AnonymousClaims {
  exp?: unknown;
  role?: unknown;
}

interface CachedToken {
  value: string;
  usableUntilMs: number;
}

export interface AnonymousTokenAcquirer {
  getToken(): Promise<string>;
}

export interface AnonymousTokenAcquirerOptions {
  fetch?: FetchLike;
  now?: () => number;
}

export function normalizeAnonymousAuthBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("configuration Neon Auth anonyme invalide");
  }
  return url.toString().replace(/\/$/, "");
}

function decodeClaims(token: string): AnonymousClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error("jeton anonyme Neon invalide");
  }
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as AnonymousClaims;
  } catch {
    throw new Error("jeton anonyme Neon invalide");
  }
}

export function createAnonymousTokenAcquirer(
  authBaseUrl: string,
  options: AnonymousTokenAcquirerOptions = {},
): AnonymousTokenAcquirer {
  const endpoint = `${normalizeAnonymousAuthBaseUrl(authBaseUrl)}${ANONYMOUS_TOKEN_PATH}`;
  const fetchToken = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let cached: CachedToken | null = null;
  let pending: Promise<string> | null = null;

  async function acquire(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchToken(endpoint, {
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-store" },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new Error("jeton anonyme Neon indisponible");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`jeton anonyme Neon indisponible (${response.status})`);

    const payload = await response.json().catch(() => null) as { token?: unknown } | null;
    const token = payload?.token;
    if (typeof token !== "string") throw new Error("jeton anonyme Neon invalide");
    const claims = decodeClaims(token);
    const acquiredAt = now();
    if (claims.role !== "anonymous" || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
      throw new Error("jeton anonyme Neon invalide");
    }
    const usableUntilMs = Math.min(
      claims.exp * 1_000 - REFRESH_MARGIN_MS,
      acquiredAt + MAX_CACHE_LIFETIME_MS,
    );
    if (usableUntilMs <= acquiredAt) throw new Error("jeton anonyme Neon trop proche de son expiration");
    cached = { value: token, usableUntilMs };
    return token;
  }

  return {
    async getToken(): Promise<string> {
      const currentTime = now();
      if (cached && cached.usableUntilMs > currentTime) return cached.value;
      if (pending) return pending;
      const request = acquire();
      pending = request;
      try {
        return await request;
      } finally {
        if (pending === request) pending = null;
      }
    },
  };
}
