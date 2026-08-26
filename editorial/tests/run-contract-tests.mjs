import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runSimulatedAdapter} from "../simulator/simulated-adapter.mjs";

const root = new URL("../", import.meta.url);
const corpus = JSON.parse(await readFile(new URL("corpus/manifest.json", root), "utf8"));
const skill = JSON.parse(await readFile(new URL("skills/source-to-idea/v1/skill.json", root), "utf8"));
const inputSchema = JSON.parse(await readFile(new URL("skills/source-to-idea/v1/input.schema.json", root), "utf8"));
JSON.parse(await readFile(new URL("skills/source-to-idea/v1/output.schema.json", root), "utf8"));

assert.equal(corpus.synthetic, true);
assert.ok(corpus.sources.length >= 15 && corpus.sources.length <= 20);
assert.equal(new Set(corpus.sources.map(source => source.id)).size, corpus.sources.length);
assert.ok(corpus.sources.filter(source => source.length === "short").length >= 5);
assert.ok(corpus.sources.filter(source => source.length === "long").length >= 5);
assert.ok(corpus.sources.filter(source => source.expected === "needs_human_analysis").length >= 3);
assert.ok(corpus.sources.filter(source => ["rejected_by_policy", "source_invalid"].includes(source.expected)).length >= 2);
assert.deepEqual(skill.terminalStates, ["candidate_ready", "rejected_by_policy", "needs_human_analysis", "providers_exhausted", "source_invalid"]);

const input = {sourceId: "syn-fr-01", language: "fr-BJ", title: "Cas synthétique", sourceFingerprint: "a".repeat(64), rightsBasis: "idea_commons", excerpts: [{id: "ex-1", text: "Une observation fictive datée est disponible.", locator: "paragraphe 1"}]};
const duplicateExcerptIds = {...input, excerpts: [{id: "same-id", text: "Premier texte.", locator: "paragraphe 1"}, {id: "same-id", text: "Second texte différent.", locator: "paragraphe 2"}]};
const excerptIdsAreUnique = value => new Set(value.excerpts.map(excerpt => excerpt.id)).size === value.excerpts.length;
assert.equal(inputSchema.properties.excerpts["x-idea-commons-unique-by"], "id");
assert.equal(excerptIdsAreUnique(input), true);
assert.equal(excerptIdsAreUnique(duplicateExcerptIds), false, "different excerpts cannot share an id");
assert.ok(skill.rules.some(rule => rule.includes("indice non autoritaire")));
const expected = {
  success: "candidate_ready", invalid_json: "needs_human_analysis", missing_citation: "needs_human_analysis",
  timeout: "providers_exhausted", fallback: "candidate_ready", policy_rejection: "rejected_by_policy",
  source_invalid: "source_invalid", cascade_exhausted: "providers_exhausted"
};
for (const [scenario, state] of Object.entries(expected)) {
  const first = runSimulatedAdapter(input, scenario);
  const second = runSimulatedAdapter(input, scenario);
  assert.deepEqual(first, second, `${scenario} must be deterministic`);
  assert.equal(first.state, state, `${scenario} terminal state`);
}
assert.equal(runSimulatedAdapter(input, "fallback").attempts.length, 2);
assert.equal(runSimulatedAdapter(input, "cascade_exhausted").attempts.length, 3);
assert.equal(runSimulatedAdapter(input, "missing_citation").controls.citationsValid, false);
assert.ok(runSimulatedAdapter(input).candidate.claims.every(claim => claim.type !== "fact" || claim.citationExcerptIds.length > 0));

console.log(`M1-A contract tests passed: ${corpus.sources.length} synthetic sources, ${Object.keys(expected).length} simulator scenarios.`);
