import fs from "node:fs";
import crypto from "node:crypto";
import {runSimulatedAdapter} from "../simulator/simulated-adapter.mjs";

const casesUrl = new URL("../sources/source-to-idea-cases.json", import.meta.url);
const document = JSON.parse(fs.readFileSync(casesUrl, "utf8"));
let passed = 0;

for (const study of document.cases) {
  const input = {
    sourceId: study.id,
    language: "fr",
    title: study.candidate.title,
    sourceUrl: study.evidence[0].sourceUrl,
    sourceFingerprint: crypto.createHash("sha256").update(JSON.stringify(study.evidence)).digest("hex"),
    rightsBasis: study.rightsBasis,
    excerpts: study.evidence.map((entry) => ({id: entry.id, text: entry.statement, locator: entry.fixturePointer})),
  };
  const output = runSimulatedAdapter(input, study.simulatorScenario);
  if (output.state !== "candidate_ready" || !output.controls.schemaValid || !output.controls.citationsValid || !output.controls.prudenceValid) {
    throw new Error(`simulator contract failed for ${study.id}`);
  }
  const known = new Set(input.excerpts.map((entry) => entry.id));
  for (const claim of output.candidate.claims) {
    if (!claim.citationExcerptIds.every((id) => known.has(id))) {
      throw new Error(`simulator citation failed for ${study.id}`);
    }
  }
  passed += 1;
}

console.log(JSON.stringify({cases: document.cases.length, simulatorChecksPassed: passed, providerCalls: 0}));
