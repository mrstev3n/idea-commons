const routes = ["workers-qwen3-30b-a3b", "groq-qwen-3.6-27b", "ollama-gpt-oss-120b"];

function candidate(input) {
  const excerpt = input.excerpts[0];
  return {
    title: input.title,
    oneLineSummary: "Transformer un constat sourcé en expérimentation locale prudente.",
    problemStatement: excerpt.text,
    targetAudiences: ["acteurs locaux à confirmer"],
    proposedApproach: "Tester un service limité, documenté et réversible.",
    mvpScope: ["un territoire fictif", "une boucle de retour manuelle"],
    initialExclusions: ["automatisation", "paiement", "donnée personnelle"],
    coreAssumptions: ["les acteurs accepteraient de participer à un test"],
    validationQuestions: ["Quel problème précis doit être confirmé en premier ?"],
    risks: ["extrapolation au-delà de la source"],
    claims: [{type: "fact", statement: excerpt.text, rationale: null, citationExcerptIds: [excerpt.id]}]
  };
}

export function runSimulatedAdapter(input, scenario = "success") {
  const attempts = [];
  const attempt = (rank, outcome, reason = null) => attempts.push({rank, route: routes[rank - 1], outcome, reason});
  if (scenario === "invalid_json") {
    attempt(1, "invalid_response", "json_invalid");
    return {state: "needs_human_analysis", candidate: null, controls: {schemaValid: false, citationsValid: false, prudenceValid: false}, reasonCode: "json_invalid", attempts};
  }
  if (scenario === "missing_citation") {
    attempt(1, "invalid_response", "citation_missing");
    const value = candidate(input); value.claims[0].citationExcerptIds = [];
    return {state: "needs_human_analysis", candidate: value, controls: {schemaValid: true, citationsValid: false, prudenceValid: true}, reasonCode: "citation_missing", attempts};
  }
  if (scenario === "timeout") {
    attempt(1, "timeout", "deadline_exceeded");
    return {state: "providers_exhausted", candidate: null, controls: {schemaValid: false, citationsValid: false, prudenceValid: false}, reasonCode: "deadline_exceeded", attempts};
  }
  if (scenario === "fallback") {
    attempt(1, "timeout", "deadline_exceeded"); attempt(2, "success", "fallback_after_timeout");
    return {state: "candidate_ready", candidate: candidate(input), controls: {schemaValid: true, citationsValid: true, prudenceValid: true}, reasonCode: null, attempts};
  }
  if (scenario === "policy_rejection") {
    attempt(1, "policy_rejection", "personal_data_or_rights");
    return {state: "rejected_by_policy", candidate: null, controls: {schemaValid: true, citationsValid: true, prudenceValid: true}, reasonCode: "personal_data_or_rights", attempts};
  }
  if (scenario === "source_invalid") {
    attempt(1, "source_invalid", "rights_not_documented");
    return {state: "source_invalid", candidate: null, controls: {schemaValid: true, citationsValid: true, prudenceValid: true}, reasonCode: "rights_not_documented", attempts};
  }
  if (scenario === "cascade_exhausted") {
    routes.forEach((_, index) => attempt(index + 1, "timeout", "deadline_exceeded"));
    return {state: "providers_exhausted", candidate: null, controls: {schemaValid: false, citationsValid: false, prudenceValid: false}, reasonCode: "all_free_routes_exhausted", attempts};
  }
  attempt(1, "success");
  return {state: "candidate_ready", candidate: candidate(input), controls: {schemaValid: true, citationsValid: true, prudenceValid: true}, reasonCode: null, attempts};
}
