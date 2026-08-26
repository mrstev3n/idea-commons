// Pont vers l'adaptateur simulé canonique du dépôt (editorial/simulator).
// Source de vérité unique : aucun contrat n'est dupliqué côté web.
// Entrée : JSON {input, scenario} sur stdin ; sortie : résultat JSON sur stdout.
import { runSimulatedAdapter } from "../../editorial/simulator/simulated-adapter.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { input, scenario } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
process.stdout.write(JSON.stringify(runSimulatedAdapter(input, scenario)));
