import { createHash } from "node:crypto";

/** Méthode figée par le contrat SQL M1-A. */
export const SOURCE_FINGERPRINT_METHOD = "unicode_nfc_lf_trim_v1" as const;

/**
 * Représentation canonique v1 du texte brut reçu côté serveur.
 *
 * Ordre normatif : NFC, CRLF/CR vers LF, retrait des SPACE/TAB en fin de
 * chaque ligne, puis `String.prototype.trim()` sur le document entier.
 */
export function canonicalizeSourceText(rawSourceText: string): string {
  return rawSourceText
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

/**
 * Dérive SHA-256 depuis le texte brut uniquement. Ce module serveur dépend de
 * `node:crypto` et n'offre aucune variante acceptant un digest pré-calculé.
 */
export function deriveCanonicalSourceFingerprint(rawSourceText: string): string {
  return createHash("sha256")
    .update(canonicalizeSourceText(rawSourceText), "utf8")
    .digest("hex");
}
