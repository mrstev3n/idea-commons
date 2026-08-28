import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), "..");
const outputPath = path.join(webRoot, "dist", "wrangler-version-upload.ndjson");

function requireVersionId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("ID de version uploadée absent ou invalide");
  }
  return value;
}

export function extractVersionUpload(output, expectedWorker = "idea-commons-web") {
  const events = output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error("sortie structurée Wrangler illisible");
      }
    });
  const uploads = events.filter((event) => event.type === "version-upload" && event.worker_name === expectedWorker);
  if (uploads.length !== 1) throw new Error("événement version-upload unique absent");
  const alias = uploads[0].preview_alias_url;
  const previewAliasUrl = typeof alias === "string"
    && URL.canParse(alias)
    && new URL(alias).protocol === "https:"
    && new URL(alias).hostname.endsWith(".workers.dev")
    ? alias
    : null;
  return {
    versionId: requireVersionId(uploads[0].version_id),
    previewAliasUrl,
  };
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: webRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} refusé (${signal ? `signal ${signal}` : `code ${code ?? "inconnu"}`})`));
    });
  });
}

export async function runPreviewWorkflow({
  runCommand = run,
  resetOutput = () => writeFile(outputPath, "", { encoding: "utf8", mode: 0o600 }),
  readOutput = () => readFile(outputPath, "utf8"),
} = {}) {
  await runCommand("npm", ["run", "cloudflare:readiness"]);
  await runCommand("npm", ["run", "build:vinext"]);
  await resetOutput();
  await runCommand("wrangler", [
    "versions", "upload",
    "--config", "dist/server/wrangler.json",
    "--preview-alias", "dev",
  ], { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath });
  const upload = extractVersionUpload(await readOutput());
  await runCommand("npm", ["run", "cloudflare:post-upload", "--", "--version-id", upload.versionId]);
  return upload;
}

export async function main() {
  const upload = await runPreviewWorkflow();
  console.log(`Preview Cloudflare vérifiée pour la version ${upload.versionId}.`);
  if (upload.previewAliasUrl) console.log(`Alias vérifié : ${upload.previewAliasUrl}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
