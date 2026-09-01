import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAW_COLOR_ALLOWLIST } from "./design-token-contract.allowlist.mjs";

const WEB_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TOKEN_SOURCE = "src/design/tokens.css";
const PRODUCT_EXTENSIONS = new Set([".css", ".scss", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

const DIRECT_PRIMITIVE = /--ic-[a-z0-9_-]+/gi;
const HEX_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/gi;
const NUMERIC_COLOR = /\b0x(?:[0-9a-f]{8}|[0-9a-f]{6})\b/gi;
const FUNCTION_COLOR = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/gi;
const CSS_WIDE_COLOR = /\bcolor\s*\(/gi;
const NAMED_COLOR =
  /(?<![-\w])(?:aliceblue|aqua|aquamarine|azure|beige|bisque|black|blue|brown|chocolate|coral|cornsilk|crimson|cyan|fuchsia|gold|goldenrod|gray|green|grey|honeydew|hotpink|indigo|ivory|khaki|lavender|lime|linen|magenta|maroon|moccasin|navy|olive|orange|orchid|pink|plum|purple|rebeccapurple|red|salmon|seashell|silver|snow|tan|teal|thistle|tomato|turquoise|violet|wheat|white|yellow)(?![-\w])/gi;

function stripComments(source) {
  const output = [...source];
  let blockComment = false;
  let lineComment = false;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (blockComment) {
      if (character === "*" && next === "/") {
        output[index] = " ";
        output[index + 1] = " ";
        blockComment = false;
        index += 1;
      } else if (character !== "\n" && character !== "\r") {
        output[index] = " ";
      }
      continue;
    }

    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
      } else {
        output[index] = " ";
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      blockComment = true;
      index += 1;
      continue;
    }

    if (character === "/" && next === "/") {
      output[index] = " ";
      output[index + 1] = " ";
      lineComment = true;
      index += 1;
    }
  }

  return output.join("");
}

async function collectFiles(target) {
  const targetStat = await stat(target);
  if (targetStat.isFile()) return PRODUCT_EXTENSIONS.has(path.extname(target)) ? [target] : [];
  if (!targetStat.isDirectory()) return [];

  const entries = await readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(entryPath)));
    else if (entry.isFile() && PRODUCT_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function isUrlFragment(line, column, raw) {
  if (!raw.startsWith("#")) return false;
  return /url\(\s*["']?$/.test(line.slice(0, column));
}

function allowlistMatch(relativePath, raw, sourceLine) {
  return RAW_COLOR_ALLOWLIST.find(
    (entry) =>
      entry.path === relativePath &&
      entry.raw.toLowerCase() === raw.toLowerCase() &&
      entry.line === sourceLine.trim(),
  );
}

function findMatches(line, regex) {
  regex.lastIndex = 0;
  return [...line.matchAll(regex)];
}

export function auditSource(source, relativePath, allowlistCounts = new Map()) {
  if (relativePath === TOKEN_SOURCE) return [];

  const extension = path.extname(relativePath);
  const isStylesheet = extension === ".css" || extension === ".scss";
  const strippedLines = stripComments(source).split(/\r?\n/);
  const sourceLines = source.split(/\r?\n/);
  const violations = [];

  for (let lineIndex = 0; lineIndex < strippedLines.length; lineIndex += 1) {
    const line = strippedLines[lineIndex];
    const sourceLine = sourceLines[lineIndex] ?? "";
    const lineNumber = lineIndex + 1;

    for (const match of findMatches(line, DIRECT_PRIMITIVE)) {
      violations.push({
        code: "DIRECT_PRIMITIVE",
        path: relativePath,
        line: lineNumber,
        column: match.index + 1,
        raw: match[0],
        message: "Les primitives --ic-* ne sont consommables que dans src/design/tokens.css.",
      });
    }

    const colorPatterns = [HEX_COLOR, FUNCTION_COLOR];
    if (extension !== ".css" && extension !== ".scss") colorPatterns.push(NUMERIC_COLOR);
    if (isStylesheet) colorPatterns.push(CSS_WIDE_COLOR, NAMED_COLOR);

    for (const pattern of colorPatterns) {
      for (const match of findMatches(line, pattern)) {
        const raw = match[0];
        if (isUrlFragment(line, match.index, raw)) continue;

        const allowance = allowlistMatch(relativePath, raw, sourceLine);
        if (allowance) {
          allowlistCounts.set(allowance.id, (allowlistCounts.get(allowance.id) ?? 0) + 1);
          continue;
        }

        // Un nom de couleur n'est une valeur que lorsqu'il suit une déclaration
        // sur la même ligne. Cela écarte les sélecteurs et libellés comme `.green`.
        if (pattern === NAMED_COLOR && !line.slice(0, match.index).includes(":")) continue;

        violations.push({
          code: "RAW_COLOR",
          path: relativePath,
          line: lineNumber,
          column: match.index + 1,
          raw,
          message: "Déplacer la valeur dans tokens.css et consommer un rôle sémantique.",
        });
      }
    }
  }

  return violations;
}

export async function auditTargets(targets, { enforceAllowlist = false } = {}) {
  const files = [...new Set((await Promise.all(targets.map(collectFiles))).flat())].sort();
  const allowlistCounts = new Map();
  const violations = [];

  for (const file of files) {
    const relativePath = path.relative(WEB_ROOT, file).split(path.sep).join("/");
    const source = await readFile(file, "utf8");
    violations.push(...auditSource(source, relativePath, allowlistCounts));
  }

  if (enforceAllowlist) {
    for (const allowance of RAW_COLOR_ALLOWLIST) {
      const expected = allowance.occurrences ?? 1;
      const actual = allowlistCounts.get(allowance.id) ?? 0;
      if (actual !== expected) {
        violations.push({
          code: "STALE_ALLOWLIST",
          path: allowance.path,
          line: 0,
          column: 0,
          raw: allowance.raw,
          message: `L'exception ${allowance.id} attend ${expected} occurrence(s), ${actual} trouvée(s).`,
        });
      }
    }
  }

  return { files, violations };
}

async function runCli() {
  const argumentsAsPaths = process.argv.slice(2);
  const defaultRun = argumentsAsPaths.length === 0;
  const targets = (defaultRun ? ["src"] : argumentsAsPaths).map((target) =>
    path.resolve(WEB_ROOT, target),
  );
  const { files, violations } = await auditTargets(targets, { enforceAllowlist: defaultRun });

  if (violations.length > 0) {
    for (const violation of violations) {
      const position = violation.line > 0 ? `:${violation.line}:${violation.column}` : "";
      console.error(
        `${violation.path}${position} [${violation.code}] ${violation.raw} — ${violation.message}`,
      );
    }
    console.error(`Contrat design tokens: ${violations.length} violation(s) dans ${files.length} fichier(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Contrat design tokens: conforme (${files.length} fichier(s)).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
