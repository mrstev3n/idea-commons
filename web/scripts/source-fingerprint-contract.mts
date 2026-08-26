import assert from "node:assert/strict";
import {
  SOURCE_FINGERPRINT_METHOD,
  canonicalizeSourceText,
  deriveCanonicalSourceFingerprint,
} from "../src/server/source-fingerprint";

interface Vector {
  name: string;
  raw: string;
  canonical: string;
  digest: string;
}

// Oracle indépendant utilisé pour figer les valeurs : Python stdlib
// `unicodedata.normalize` + `hashlib.sha256`, avec une implémentation séparée
// de la politique LF/fin de ligne/trim. Les valeurs ne sont jamais recalculées
// par la fonction TypeScript testée.
const VECTORS: Vector[] = [
  {
    name: "NFC depuis caractères décomposés",
    raw: "Cafe\u0301",
    canonical: "Café",
    digest: "73473dcc12b763085904a5279d048c4d5b3b008c46f1f32443b99de04aa83a14",
  },
  {
    name: "CRLF, CR et LF convergent",
    raw: "a\r\nb\rc\n",
    canonical: "a\nb\nc",
    digest: "ea7fb08b7a2dc4619ffb7c7bb38d95a2047935fa165d71b12efd3852a2e6d0cc",
  },
  {
    name: "SPACE et TAB de fin de ligne seulement",
    raw: "alpha  \n beta\t \n gamma\t\t",
    canonical: "alpha\n beta\n gamma",
    digest: "ff3d12c3a3798fec27341a97c8e69531ac3060571134a893970f28c35638bfcf",
  },
  {
    name: "espace non ASCII interne préservé en fin de ligne",
    raw: "alpha\u00a0  \r\nbeta\t",
    canonical: "alpha\u00a0\nbeta",
    digest: "c6a54da453ffd8bd335c8209deed6c069f951d5246d4ac7ef8cd5a3888c9d937",
  },
  {
    name: "whitespace ECMAScript autour du document",
    raw: "\u00a0\t\n  contenu \t\n\r\u00a0",
    canonical: "contenu",
    digest: "3016ef88e3166466281c563b984abed5412a2de823d37ed99c2af39be422fab1",
  },
  {
    name: "BOM et séparateurs ECMAScript aux frontières",
    raw: "\ufeff\u2028contenu\u2029\ufeff",
    canonical: "contenu",
    digest: "3016ef88e3166466281c563b984abed5412a2de823d37ed99c2af39be422fab1",
  },
  {
    name: "contenu vide",
    raw: "",
    canonical: "",
    digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    name: "contenu whitespace-only",
    raw: " \t\r\n\u00a0",
    canonical: "",
    digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    name: "emoji et caractères non-BMP",
    raw: "  Idée 🚀 😀  ",
    canonical: "Idée 🚀 😀",
    digest: "fc040d407acab2fa03313e80708d3be604a40a935478ef1fbc01ff3278f2df59",
  },
  {
    name: "français accentué",
    raw: "L’été à Cotonou.",
    canonical: "L’été à Cotonou.",
    digest: "bba9d48ff51756126177cd5eb28a5fd9f523608008dff1299e99ace09030de46",
  },
  {
    name: "indentation interne préservée",
    raw: "a\n  b",
    canonical: "a\n  b",
    digest: "ff0de82e255bee8738dd1279853c50f5e7f9f3eb50b14611c7298b221bb468dc",
  },
  {
    name: "texte qui ressemble déjà à un digest",
    raw: "a".repeat(64),
    canonical: "a".repeat(64),
    digest: "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
  },
];

assert.equal(SOURCE_FINGERPRINT_METHOD, "unicode_nfc_lf_trim_v1");

for (const vector of VECTORS) {
  const canonical = canonicalizeSourceText(vector.raw);
  assert.equal(canonical, vector.canonical, `${vector.name}: représentation canonique`);
  assert.equal(
    canonicalizeSourceText(canonical),
    canonical,
    `${vector.name}: canonicalisation idempotente`,
  );
  const digest = deriveCanonicalSourceFingerprint(vector.raw);
  assert.equal(digest, vector.digest, `${vector.name}: digest oracle`);
  assert.match(digest, /^[0-9a-f]{64}$/, `${vector.name}: 64 hex minuscules`);
}

assert.equal(
  deriveCanonicalSourceFingerprint("Café\r\nligne  \t"),
  deriveCanonicalSourceFingerprint("Cafe\u0301\nligne"),
  "deux textes canoniquement équivalents doivent converger",
);
assert.notEqual(
  deriveCanonicalSourceFingerprint("source"),
  deriveCanonicalSourceFingerprint("Source"),
  "une différence matérielle d'un caractère doit diverger",
);

console.log(`PASS — ${VECTORS.length} vecteurs ${SOURCE_FINGERPRINT_METHOD} vérifiés.`);
