import { readFile } from "node:fs/promises";
import path from "node:path";

const webRoot = process.cwd();
const blockers = [
  {
    file: "src/server/db.ts",
    patterns: ["@electric-sql/pglite", "IC_DATA_DIR", "database/migrations"],
    reason: "PGlite dépend d'un stockage local persistant et de fichiers du dépôt.",
  },
  {
    file: "src/server/worker.ts",
    patterns: ['from "node:child_process"', "spawn(process.execPath"],
    reason: "Cloudflare Workers n'implémente pas l'exécution de processus enfant.",
  },
  {
    file: "src/app/api/cas/[id]/statut/route.ts",
    patterns: ["processOutboxOnce()"],
    reason: "Une requête GET ne doit pas consommer opportunistement l'outbox en production.",
  },
];

const active = [];
for (const blocker of blockers) {
  const source = await readFile(path.join(webRoot, blocker.file), "utf8");
  if (blocker.patterns.some((pattern) => source.includes(pattern))) {
    active.push(blocker);
  }
}

if (active.length > 0) {
  console.error("Déploiement Cloudflare bloqué : adaptateurs locaux encore actifs.");
  for (const blocker of active) {
    console.error(`- ${blocker.file}: ${blocker.reason}`);
  }
  console.error("Le build vinext seul ne constitue pas une preuve de compatibilité runtime.");
  process.exit(1);
}

console.log("Préflight Cloudflare réussi : aucun bloqueur local connu détecté.");
