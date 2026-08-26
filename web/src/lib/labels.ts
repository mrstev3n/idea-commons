import type { TerminalState } from "@/server/types";

/** Vocabulaire d'interface français — source unique des libellés d'enums. */

export const CLAIM_TYPE_LABELS: Record<string, string> = {
  fact: "Fait sourcé",
  hypothesis: "Hypothèse",
  estimate: "Estimation",
  recommendation: "Recommandation",
  validation_question: "À valider",
};

const CLAIM_COUNT_WORDS: Record<string, { one: string; other: string }> = {
  fact: { one: "fait", other: "faits" },
  hypothesis: { one: "hypothèse", other: "hypothèses" },
  estimate: { one: "estimation", other: "estimations" },
  recommendation: { one: "recommandation", other: "recommandations" },
  validation_question: { one: "à valider", other: "à valider" },
};

export function claimCountLabel(type: string, count: number): string {
  const words = CLAIM_COUNT_WORDS[type];
  if (!words) return `${count} ${type}`;
  return `${count} ${count > 1 ? words.other : words.one}`;
}

export const ROLE_LABELS: Record<string, string> = {
  contributor: "Contribution",
  reviewer: "Revue",
  admin: "Admin",
};

export const TERMINAL_STATE_LABELS: Record<TerminalState, string> = {
  candidate_ready: "Prêt pour revue",
  rejected_by_policy: "Refusé par la politique",
  needs_human_analysis: "Revue humaine nécessaire",
  providers_exhausted: "Analyse indisponible",
  source_invalid: "Source inutilisable",
};

export const TERMINAL_STATE_TONES: Record<TerminalState, "ready" | "caution" | "failure"> = {
  candidate_ready: "ready",
  needs_human_analysis: "caution",
  rejected_by_policy: "failure",
  providers_exhausted: "failure",
  source_invalid: "failure",
};

export const TERMINAL_STATE_NEXT_STEPS: Record<TerminalState, string> = {
  candidate_ready:
    "Les contrôles automatiques sont passés. Il reste une revue humaine : rien n'est publié.",
  needs_human_analysis:
    "Citations, droits ou prudence restent à trancher. Relis le dernier résultat avant de relancer une analyse.",
  rejected_by_policy:
    "La source ou le contenu ne passe pas la politique. Corrige l'entrée si elle est légitime, sinon clôture.",
  providers_exhausted:
    "L'analyse n'a pas abouti. Un nouvel essai n'a de sens qu'après un changement connu.",
  source_invalid:
    "Source inaccessible, non publique, ou droits insuffisants. Remplace ou corrige la source.",
};

export const RIGHTS_BASIS_LABELS: Record<string, string> = {
  idea_commons: "Source Idea Commons",
  compatible_license: "Licence compatible",
  public_domain: "Domaine public",
  explicit_permission: "Autorisation explicite documentée",
  temporary_analysis: "Analyse temporaire",
};

export const RIGHTS_BASIS_DESCRIPTIONS: Record<string, string> = {
  idea_commons: "Contenu produit ici : tu peux le conserver.",
  compatible_license: "Licence de réutilisation (précise laquelle en note).",
  public_domain: "Œuvre du domaine public : conservation possible.",
  explicit_permission: "Autorisation écrite du titulaire (référence en note).",
  temporary_analysis:
    "Juste accessible en public : le texte complet disparaît sous 7 jours après décision. Pas de publication durable sur cette base.",
};

export const ATTEMPT_OUTCOME_LABELS: Record<string, string> = {
  success: "Succès",
  invalid_response: "Réponse invalide",
  timeout: "Timeout",
  policy_rejection: "Rejet de politique",
  source_invalid: "Source invalide",
};

export const ROUTE_LABELS: Record<string, string> = {
  "workers-qwen3-30b-a3b": "Workers AI · Qwen3 30B A3B",
  "groq-qwen-3.6-27b": "Groq Free · Qwen 3.6 27B",
  "ollama-gpt-oss-120b": "Ollama Cloud · GPT-OSS 120B",
};

export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  in_review: "En revue",
  approved: "Approuvé",
  rejected: "Rejeté",
  published: "Publié",
};

export const FALLBACK_REASON_LABELS: Record<string, string> = {
  json_invalid: "JSON invalide",
  citation_missing: "Citation absente",
  deadline_exceeded: "Délai dépassé",
  fallback_after_timeout: "Bascule après timeout",
  personal_data_or_rights: "Donnée personnelle ou droits",
  rights_not_documented: "Droits non documentés",
  all_free_routes_exhausted: "Toutes les routes gratuites épuisées",
};

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(value),
  );
}
