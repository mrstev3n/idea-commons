import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnonymousTokenAcquirer } from "../src/server/anonymous-auth-token";
import { configureDataApi, dataApiPublicRpc } from "../src/server/data-api";

function jwt(exp: number, role = "anonymous", marker = "signature"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp, role })}.${marker}`;
}

const epoch = 2_000_000_000_000;
let now = epoch;
let acquisitionCalls = 0;
const firstToken = jwt((epoch + 120_000) / 1_000, "anonymous", "first-private-marker");
const secondToken = jwt((epoch + 900_000) / 1_000, "anonymous", "second-private-marker");
const acquirer = createAnonymousTokenAcquirer("https://auth.example.test/neondb/auth", {
  now: () => now,
  fetch: async (input, init) => {
    acquisitionCalls += 1;
    assert.equal(String(input), "https://auth.example.test/neondb/auth/token/anonymous");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    assert.equal(new Headers(init?.headers).get("cache-control"), "no-store");
    assert.equal(init?.cache, "no-store");
    return Response.json({ token: acquisitionCalls === 1 ? firstToken : secondToken });
  },
});

assert.deepEqual(await Promise.all([acquirer.getToken(), acquirer.getToken()]), [firstToken, firstToken]);
assert.equal(acquisitionCalls, 1, "les acquisitions concurrentes doivent partager une seule requête");
now += 89_000;
assert.equal(await acquirer.getToken(), firstToken);
assert.equal(acquisitionCalls, 1, "le jeton doit rester en cache avant la marge d'expiration");
now += 2_000;
assert.equal(await acquirer.getToken(), secondToken);
assert.equal(acquisitionCalls, 2, "le jeton doit être rafraîchi avant son expiration");

const upstreamSecret = "upstream-secret-must-not-leak";
const failing = createAnonymousTokenAcquirer("https://auth-failure.example.test/neondb/auth", {
  fetch: async () => Response.json({ token: upstreamSecret, detail: upstreamSecret }, { status: 503 }),
});
await assert.rejects(failing.getToken(), (error: Error) => {
  assert.match(error.message, /indisponible \(503\)/);
  assert.doesNotMatch(error.message, new RegExp(upstreamSecret));
  return true;
});
const wrongRole = createAnonymousTokenAcquirer("https://auth-role.example.test/neondb/auth", {
  fetch: async () => Response.json({ token: jwt(Date.now() / 1_000 + 600, "authenticated") }),
});
await assert.rejects(wrongRole.getToken(), /jeton anonyme Neon invalide/);

const originalFetch = globalThis.fetch;
const transportToken = jwt(Date.now() / 1_000 + 600, "anonymous", "transport-private-marker");
let tokenRequests = 0;
const rpcRequests: Request[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url.endsWith("/token/anonymous")) {
    tokenRequests += 1;
    return Response.json({ token: transportToken });
  }
  rpcRequests.push(request);
  if (request.url.endsWith("/public_list_published_ideas")) return Response.json([]);
  if (request.url.endsWith("/public_get_published_idea")) return Response.json({ slug: "idee-publique" });
  return Response.json({ code: "PGRST202" }, { status: 404 });
};

try {
  configureDataApi(
    "https://data.example.test/neondb/rest/v1",
    "https://auth-transport.example.test/neondb/auth",
  );
  const list = await dataApiPublicRpc<unknown[]>("public_list_published_ideas", {});
  const detail = await dataApiPublicRpc<{ slug: string }>("public_get_published_idea", { target_slug: "idee-publique" });
  assert.deepEqual(list, []);
  assert.deepEqual(detail, { slug: "idee-publique" });
  assert.equal(tokenRequests, 1);
  assert.equal(rpcRequests.length, 2);
  for (const request of rpcRequests) {
    assert.equal(request.headers.get("authorization"), `Bearer ${transportToken}`);
    assert.equal(request.headers.get("accept-profile"), "app");
    assert.equal(request.headers.get("content-profile"), "app");
  }
  assert.equal(JSON.stringify({ list, detail }).includes(transportToken), false);
  assert.throws(
    () => configureDataApi(
      "https://different-data.example.test/neondb/rest/v1",
      "http://invalid-auth.example.test",
    ),
    /configuration Neon Auth anonyme invalide/,
  );
  const callsBeforeInvalidRpc = rpcRequests.length + tokenRequests;
  await assert.rejects(
    dataApiPublicRpc("runtime_list_editorial_cases" as "public_list_published_ideas", {}),
    /RPC publique non autorisée/,
  );
  assert.equal(rpcRequests.length + tokenRequests, callsBeforeInvalidRpc);

  let failureRequestUrl = "";
  globalThis.fetch = async (input) => {
    failureRequestUrl = String(input);
    return Response.json(
      { code: transportToken, token: transportToken },
      { status: 403 },
    );
  };
  await assert.rejects(
    dataApiPublicRpc("public_list_published_ideas", {}),
    (error: Error) => {
      assert.doesNotMatch(error.message, /transport-private-marker/);
      assert.equal(JSON.stringify(error).includes(transportToken), false);
      return true;
    },
  );
  assert.equal(
    failureRequestUrl,
    "https://data.example.test/neondb/rest/v1/rpc/public_list_published_ideas",
    "une reconfiguration Auth invalide ne doit modifier aucune cible active",
  );
} finally {
  globalThis.fetch = originalFetch;
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokenSource = await readFile(path.join(webRoot, "src/server/anonymous-auth-token.ts"), "utf8");
assert.doesNotMatch(tokenSource, /console\.|localStorage|sessionStorage|document\.cookie|caches\./);

async function clientSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return clientSources(target);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    const source = await readFile(target, "utf8");
    return /^\s*["']use client["'];/m.test(source) ? [source] : [];
  }))).flat();
}
for (const source of await clientSources(path.join(webRoot, "src"))) {
  assert.doesNotMatch(source, /anonymous-auth-token|token\/anonymous/);
}

console.log("anonymous catalogue auth contract: server transport, bounded cache, refresh and non-exposure passed");
