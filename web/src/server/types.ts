/** Contrats partagés du pipeline éditorial IC-07 (alignés sur le skill source-to-idea v1). */

export const CLAIM_TYPES = [
  "fact",
  "hypothesis",
  "estimate",
  "recommendation",
  "validation_question",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const TERMINAL_STATES = [
  "candidate_ready",
  "rejected_by_policy",
  "needs_human_analysis",
  "providers_exhausted",
  "source_invalid",
] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];

export const RIGHTS_BASES = [
  "idea_commons",
  "compatible_license",
  "public_domain",
  "explicit_permission",
  "temporary_analysis",
] as const;

export type RightsBasis = (typeof RIGHTS_BASES)[number];

export interface SourceExcerpt {
  id: string;
  text: string;
  locator: string | null;
}

export interface CandidateClaim {
  type: ClaimType;
  statement: string;
  rationale: string | null;
  citationExcerptIds: string[];
}

export interface CandidateContent {
  title: string;
  oneLineSummary: string;
  problemStatement: string;
  targetAudiences: string[];
  proposedApproach: string;
  mvpScope: string[];
  initialExclusions: string[];
  coreAssumptions: string[];
  validationQuestions: string[];
  risks: string[];
  claims: CandidateClaim[];
}

export interface AdapterAttempt {
  rank: number;
  route: string;
  outcome: "success" | "invalid_response" | "timeout" | "policy_rejection" | "source_invalid";
  reason: string | null;
}

export interface AdapterResult {
  state: TerminalState;
  candidate: CandidateContent | null;
  controls: { schemaValid: boolean; citationsValid: boolean; prudenceValid: boolean };
  reasonCode: string | null;
  attempts: AdapterAttempt[];
}

export type SimulatorScenario =
  | "success"
  | "invalid_json"
  | "missing_citation"
  | "timeout"
  | "fallback"
  | "policy_rejection"
  | "source_invalid"
  | "cascade_exhausted";

export const SIMULATOR_SCENARIOS: { value: SimulatorScenario; label: string }[] = [
  { value: "success", label: "Succès direct (route primaire)" },
  { value: "fallback", label: "Fallback après timeout, puis succès" },
  { value: "invalid_json", label: "Réponse JSON invalide → analyse humaine" },
  { value: "missing_citation", label: "Citation absente → analyse humaine" },
  { value: "policy_rejection", label: "Rejet de politique" },
  { value: "source_invalid", label: "Source invalide (droits non documentés)" },
  { value: "timeout", label: "Timeout sans récupération" },
  { value: "cascade_exhausted", label: "Cascade gratuite épuisée (3 routes)" },
];

/** Résultat homogène des commandes serveur : succès typé ou erreur normative. */
export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 401 | 403 | 404 | 409 | 422 | 500; message: string };
