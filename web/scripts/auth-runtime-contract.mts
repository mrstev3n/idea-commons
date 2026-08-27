import assert from "node:assert/strict";
import { resolveRuntimeIdentity } from "../src/server/runtime-identity";

process.env.NEON_DATA_API_URL = "https://example.apirest.eu-central-1.aws.neon.tech/neondb/rest/v1";

function responder(payload: unknown, status = 200): typeof fetch {
  return (async (_input, init) => {
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer jwt-test-only");
    assert.equal(headers.get("accept-profile"), "app");
    assert.equal(headers.get("content-profile"), "app");
    return Response.json(payload, { status });
  }) as typeof fetch;
}

const valid = await resolveRuntimeIdentity(
  "00000000-0000-4000-8000-000000000001",
  "jwt-test-only",
  responder({
    authUserId: "00000000-0000-4000-8000-000000000001",
    memberId: "10000000-0000-4000-8000-000000000001",
    roles: ["contributor", "contributor"],
  }),
);
assert.deepEqual(valid.roles, ["contributor"]);

const unmapped = await resolveRuntimeIdentity(
  "00000000-0000-4000-8000-000000000004",
  "jwt-test-only",
  responder({
    authUserId: "00000000-0000-4000-8000-000000000004",
    memberId: null,
    roles: [],
  }),
);
assert.deepEqual(unmapped, { memberId: null, roles: [] });

await assert.rejects(
  resolveRuntimeIdentity(
    "00000000-0000-4000-8000-000000000001",
    "jwt-test-only",
    responder({ authUserId: "00000000-0000-4000-8000-000000000002", memberId: null, roles: [] }),
  ),
  /identité runtime incohérente/,
);

await assert.rejects(
  resolveRuntimeIdentity(
    "00000000-0000-4000-8000-000000000001",
    "jwt-test-only",
    responder({ authUserId: "00000000-0000-4000-8000-000000000001", memberId: null, roles: ["owner"] }),
  ),
  /capacités runtime invalides/,
);

console.log("auth runtime contract: 4/4 assertions passed");
