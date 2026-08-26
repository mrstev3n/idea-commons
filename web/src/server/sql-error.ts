import type { CommandResult } from "./types";

/**
 * Traduction des erreurs PostgreSQL vers les réponses normatives IC-07 §9.
 * Les fonctions serveur M1 signalent leurs refus par SQLSTATE :
 *   42501 → authentification/capacité, 40001 → conflit de révision,
 *   23505 → conflit d'idempotence, 23514/23503/22xxx → validation.
 */
export function toCommandError(error: unknown): CommandResult<never> {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractSqlState(error);

  if (code === "42501") {
    if (message.includes("authentication required")) {
      return { ok: false, status: 401, message: "Authentification requise." };
    }
    return { ok: false, status: 403, message: normativeMessage(message) };
  }
  if (code === "40001") {
    return {
      ok: false,
      status: 409,
      message:
        "La ressource a changé depuis ta lecture (conflit de révision). Recharge, compare, puis décide : aucun écrasement silencieux.",
    };
  }
  if (code === "23505") {
    return { ok: false, status: 409, message: normativeMessage(message) };
  }
  if (code === "55000") {
    return { ok: false, status: 409, message: normativeMessage(message) };
  }
  if (code && ["23514", "23503", "23502", "22P02", "22001"].includes(code)) {
    return { ok: false, status: 422, message: normativeMessage(message) };
  }
  return { ok: false, status: 500, message: "Erreur interne inattendue." };
}

function extractSqlState(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; fields?: { code?: unknown } };
  if (typeof candidate.code === "string" && candidate.code.length === 5) return candidate.code;
  if (typeof candidate.fields?.code === "string") return candidate.fields.code;
  return null;
}

const TRANSLATIONS: [RegExp, string][] = [
  [/contributor capability required/, "Capacité contributor requise."],
  [/reviewer capability required/, "Capacité reviewer requise."],
  [/only admin may self-approve/, "Seul un admin peut auto-approuver son propre candidat."],
  [/only admin may decide own candidate/, "Seul un admin peut décider sur son propre candidat."],
  [/idempotency key conflict/, "Même clé d'idempotence avec une charge utile différente : conflit explicite, aucune mutation."],
  [/candidate not found or revision conflict/, "Candidat introuvable ou révision périmée."],
  [/source not found or revision conflict/, "Source introuvable ou révision périmée."],
  [/factual claims require citations/, "Chaque claim factuel doit référencer au moins un extrait."],
  [/candidate content does not match the canonical schema/, "Le contenu ne respecte pas le schéma canonique."],
  [/citation excerpt does not exist/, "Une citation référence un extrait inexistant."],
  [/durable publication rights required/, "La base de droits « analyse temporaire » ne permet pas une publication durable."],
  [/review checklist must confirm/, "La checklist de revue doit confirmer droits, citations et prudence."],
  [/license and credit required/, "Licence de contenu et crédit sont obligatoires."],
  [/invalid slug/, "Slug invalide : minuscules, chiffres et tirets uniquement."],
  [/is append-only/, "Cet historique est en ajout seul et ne peut pas être réécrit."],
  [/published idea slug is immutable/, "Le slug d'une idée publiée est immuable."],
];

function normativeMessage(raw: string): string {
  for (const [pattern, text] of TRANSLATIONS) {
    if (pattern.test(raw)) return text;
  }
  return raw;
}
