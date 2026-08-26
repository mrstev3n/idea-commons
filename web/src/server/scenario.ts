import { readFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./db";
import { deriveCanonicalSourceFingerprint } from "./source-fingerprint";
import type { SimulatorScenario, TerminalState } from "./types";

/**
 * Sélection du scénario de l'adaptateur simulé (harnais local, aucun réseau).
 *
 * Priorité : 1. scénario choisi explicitement dans le panneau « harnais »
 * du formulaire ; 2. correspondance d'empreinte avec le corpus synthétique
 * M1-A et son état attendu ; 3. succès direct.
 * Cette table vit en mémoire du processus de développement : elle n'est ni
 * une donnée produit ni une promesse de persistance.
 */

const overrides = (globalThis as unknown as {
  __icScenarioOverrides?: Map<string, SimulatorScenario>;
}).__icScenarioOverrides ??= new Map<string, SimulatorScenario>();

export function setScenarioOverride(intakeId: string, scenario: SimulatorScenario): void {
  overrides.set(intakeId, scenario);
}

const EXPECTED_TO_SCENARIO: Record<TerminalState, SimulatorScenario> = {
  candidate_ready: "success",
  needs_human_analysis: "missing_citation",
  rejected_by_policy: "policy_rejection",
  source_invalid: "source_invalid",
  providers_exhausted: "cascade_exhausted",
};

interface CorpusSource {
  id: string;
  title: string;
  text: string;
  expected: TerminalState;
}

let corpusByFingerprint: Promise<Map<string, CorpusSource>> | null = null;

function loadCorpus(): Promise<Map<string, CorpusSource>> {
  corpusByFingerprint ??= (async () => {
    const raw = await readFile(
      path.join(repoRoot(), "editorial", "corpus", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(raw) as { sources: CorpusSource[] };
    const map = new Map<string, CorpusSource>();
    for (const source of manifest.sources) {
      map.set(deriveCanonicalSourceFingerprint(source.text), source);
    }
    return map;
  })();
  return corpusByFingerprint;
}

export async function resolveScenario(
  intakeId: string,
  fingerprint: string,
): Promise<SimulatorScenario> {
  const override = overrides.get(intakeId);
  if (override) return override;
  const corpus = await loadCorpus();
  const match = corpus.get(fingerprint);
  if (match) return EXPECTED_TO_SCENARIO[match.expected];
  return "success";
}
