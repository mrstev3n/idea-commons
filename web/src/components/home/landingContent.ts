export type LandingIdeaPresentation = {
  slug: string;
  title: string;
  oneLineSummary: string;
  theme: string;
  image: string;
  imageAlt: string;
  sourceLabel: string;
  provenance: string;
  publishedAt: string;
  statusLabel?: string;
  href?: string;
  actionLabel?: string;
};

export const EDITORIAL_PREVIEWS: LandingIdeaPresentation[] = [
  {
    slug: "ilots-fraicheur-trajets-quotidiens",
    title: "Des îlots de fraîcheur reliés aux trajets du quotidien",
    oneLineSummary:
      "Relier les zones ombragées, les points d’eau et les parcours les plus empruntés.",
    theme: "Territoires",
    image: "/images/stock-territory-valley.webp",
    imageAlt: "Vallée et territoire habité vus depuis les hauteurs",
    sourceLabel: "Corpus mobilité et climat urbain",
    provenance: "Croisement éditorial",
    publishedAt: "Date à confirmer",
    statusLabel: "Relecture en cours",
  },
  {
    slug: "outils-reparation-quartier",
    title: "Mutualiser les outils de réparation à l’échelle du quartier",
    oneLineSummary:
      "Mettre en commun équipements, savoir-faire et créneaux d’entraide de proximité.",
    theme: "Communs",
    image: "/images/stock-economy-harbor.webp",
    imageAlt: "Infrastructure portuaire observée depuis le rivage",
    sourceLabel: "Observations de terrain à consolider",
    provenance: "Piste éditoriale",
    publishedAt: "Date à confirmer",
    statusLabel: "Relecture en cours",
  },
];
