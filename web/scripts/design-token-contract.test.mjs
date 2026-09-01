import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CONTRACT_SCRIPT = fileURLToPath(new URL("./design-token-contract.mjs", import.meta.url));
const FIXTURES = "scripts/fixtures/design-token-contract";

function runFixture(name) {
  return spawnSync(process.execPath, [CONTRACT_SCRIPT, path.join(FIXTURES, name)], {
    cwd: WEB_ROOT,
    encoding: "utf8",
  });
}

test("refuse une consommation directe de primitive", () => {
  const result = runFixture("direct-primitive.css");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIRECT_PRIMITIVE/);
});

test("refuse les formats de couleur brute pris en charge", () => {
  const result = runFixture("raw-colors.css");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RAW_COLOR/);
  assert.match(result.stderr, /5 violation\(s\)/);
});

test("ignore les faux positifs CSS documentés", () => {
  const result = runFixture("allowed-css-mechanisms.css");
  assert.equal(result.status, 0, result.stderr);
});
