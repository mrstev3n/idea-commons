/**
 * Graine de démonstration locale — publie deux fiches réalistes et laisse un
 * cas en cours de revue, pour que le catalogue public et l'espace éditorial
 * soient observables dès le premier `npm run dev`.
 *
 * Usage : npm run seed (idempotent par empreinte : rejouable sans doublon).
 * Écrit uniquement dans web/.data/pglite. À lancer serveur arrêté
 * (PGlite est mono-processus).
 */
import { randomUUID } from "node:crypto";

const { IDENTITIES } = await import("../src/server/identities");
const {
  createSourceIntake,
  startCandidateGeneration,
  updateCandidateDraft,
  approveAndPublishCandidate,
} = await import("../src/server/commands");
const { processOutboxOnce } = await import("../src/server/worker");
const { getEditorialCase } = await import("../src/server/queries");

const contributor = IDENTITIES.find((i) => i.key === "contributor")!;
const reviewer = IDENTITIES.find((i) => i.key === "reviewer")!;

interface DemoSource {
  title: string;
  fullText: string;
  excerpts: { id: string; text: string; locator: string | null }[];
  publish: boolean;
  slug: string;
}

const sources: DemoSource[] = [
  {
    title: "Ateliers de réparation ouverts en médiathèque",
    slug: "ateliers-reparation-mediatheque",
    publish: true,
    fullText: [
      "Compte rendu d'expérimentation — médiathèque intercommunale, printemps.",
      "Douze ateliers de réparation ont accueilli 340 participants en quatre mois.",
      "Deux tiers des objets apportés ont été remis en état sur place.",
      "Les bénévoles demandent un référentiel de sécurité partagé entre sites.",
      "Question ouverte : quel modèle d'assurance couvre les réparations effectuées par des tiers ?",
    ].join("\n"),
    excerpts: [
      {
        id: "exc-1",
        text: "Douze ateliers de réparation ont accueilli 340 participants en quatre mois.",
        locator: "§2",
      },
      {
        id: "exc-2",
        text: "Deux tiers des objets apportés ont été remis en état sur place.",
        locator: "§3",
      },
      {
        id: "exc-3",
        text: "Les bénévoles demandent un référentiel de sécurité partagé entre sites.",
        locator: "§4",
      },
    ],
  },
  {
    title: "Cartographie citoyenne des îlots de chaleur",
    slug: "cartographie-ilots-chaleur",
    publish: true,
    fullText: [
      "Note méthodologique — collectif de quartier, campagne d'été.",
      "Quarante capteurs low-cost ont mesuré des écarts allant jusqu'à 7 °C entre rues voisines.",
      "Les données ouvertes ont permis de prioriser trois zones de végétalisation.",
      "La méthode est reproductible pour moins de 2 000 € par quartier.",
      "Question ouverte : comment garantir la qualité métrologique des capteurs citoyens ?",
    ].join("\n"),
    excerpts: [
      {
        id: "exc-1",
        text: "Quarante capteurs low-cost ont mesuré des écarts allant jusqu'à 7 °C entre rues voisines.",
        locator: "§2",
      },
      {
        id: "exc-2",
        text: "Les données ouvertes ont permis de prioriser trois zones de végétalisation.",
        locator: "§3",
      },
      {
        id: "exc-3",
        text: "La méthode est reproductible pour moins de 2 000 € par quartier.",
        locator: "§4",
      },
    ],
  },
  {
    title: "Compostage collectif en pied d'immeuble",
    slug: "compostage-collectif-immeuble",
    publish: false,
    fullText: [
      "Retour d'expérience — bailleur social, huit résidences pilotes.",
      "Le tri à la source a détourné 18 tonnes de biodéchets en un an.",
      "L'accompagnement humain des trois premiers mois conditionne la pérennité.",
      "Question ouverte : quel mode de gouvernance après le retrait de l'accompagnateur ?",
    ].join("\n"),
    excerpts: [
      {
        id: "exc-1",
        text: "Le tri à la source a détourné 18 tonnes de biodéchets en un an.",
        locator: "§2",
      },
      {
        id: "exc-2",
        text: "L'accompagnement humain des trois premiers mois conditionne la pérennité.",
        locator: "§3",
      },
    ],
  },
];

async function waitAndProcess(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2300));
  for (let i = 0; i < 5; i += 1) {
    if ((await processOutboxOnce()) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("le worker n'a traité aucun événement");
}

for (const source of sources) {
  const created = await createSourceIntake(contributor, {
    inputMode: "text",
    title: source.title,
    sourceUrl: null,
    publishedAt: null,
    fullText: source.fullText,
    excerpts: source.excerpts,
    rightsBasis: "idea_commons",
    rightsNote: null,
    scenario: "success",
    idempotencyKey: randomUUID(),
  });

  if (!created.ok) {
    if (created.status === 409) {
      console.log(`— « ${source.title} » existe déjà, ignorée.`);
      continue;
    }
    throw new Error(`création impossible: ${created.message}`);
  }

  const intakeId = created.value.intakeId;
  const generation = await startCandidateGeneration(contributor, intakeId, 1);
  if (!generation.ok) throw new Error(`analyse impossible: ${generation.message}`);
  await waitAndProcess();

  const detail = await getEditorialCase(contributor, intakeId);
  if (!detail?.candidate) throw new Error(`candidat manquant pour « ${source.title} »`);

  if (!source.publish) {
    console.log(`✓ « ${source.title} » laissée en revue (cas éditorial ouvert).`);
    continue;
  }

  const edited = await updateCandidateDraft(
    contributor,
    detail.candidate.id,
    detail.candidate.currentRevision,
    {
      ...detail.candidate.content,
      oneLineSummary: detail.candidate.content.oneLineSummary.replace(/\.$/, "") +
        ", validée en revue éditoriale.",
    },
    "Relecture avant publication",
  );
  if (!edited.ok) throw new Error(`édition impossible: ${edited.message}`);

  const published = await approveAndPublishCandidate(reviewer, {
    candidateId: detail.candidate.id,
    expectedRevision: edited.value.revision,
    reason: "Claims typés et cités, droits déclarés, prudence conforme.",
    checklist: { rights: true, citations: true, prudence: true },
    approvedSlug: source.slug,
    contentLicense: "CC-BY-SA-4.0",
    creditName: contributor.displayName,
  });
  if (!published.ok) throw new Error(`publication impossible: ${published.message}`);
  console.log(`✓ « ${source.title} » publiée → /idees/${published.value.slug}`);
}

console.log("\nGraine de démonstration en place.");
