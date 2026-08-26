import Image from "next/image";
import Link from "next/link";
import styles from "./RecentCollections.module.css";

export type RecentCollectionIdea = {
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

type RecentCollectionsProps = {
  ideas: RecentCollectionIdea[];
};

const COLLECTIONS = [
  {
    title: "Les indispensables",
    count: 16,
    image: "/images/stock-territory-valley.webp",
  },
  {
    title: "Débats en cours",
    count: 15,
    image: "/images/stock-community-workshop.webp",
  },
  {
    title: "Territoires en transition",
    count: 22,
    image: "/images/stock-economy-harbor.webp",
  },
] as const;

const EDITORIAL_PREVIEWS: RecentCollectionIdea[] = [
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

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatPublishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function IdeaStatus({ idea }: { idea: RecentCollectionIdea }) {
  return (
    <div className={styles.cardMeta}>
      <p>
        <span>Source</span>
        {idea.sourceLabel}
      </p>
      <p>
        <span>Statut</span>
        {idea.statusLabel ?? "Publiée · revue humaine"}
      </p>
      <p>
        <span>Provenance</span>
        {idea.provenance} · {formatPublishedAt(idea.publishedAt)}
      </p>
    </div>
  );
}

function IdeaCard({
  idea,
  variant,
}: {
  idea: RecentCollectionIdea;
  variant: "feature" | "wide" | "compact";
}) {
  const href = idea.href ?? (idea.statusLabel ? null : `/idees/${idea.slug}`);

  return (
    <article className={`${styles.ideaCard} ${styles[variant]}`}>
      <div className={styles.ideaMedia}>
        <Image
          src={idea.image}
          alt={idea.imageAlt}
          fill
          sizes="(max-width: 760px) 100vw, (max-width: 1080px) 50vw, 42vw"
        />
      </div>
      <div className={styles.ideaBody}>
        <p className={styles.eyebrow}>{idea.theme}</p>
        <h3>{idea.title}</h3>
        <p className={styles.summary}>{idea.oneLineSummary}</p>
        <IdeaStatus idea={idea} />
        {href ? (
          <Link className={styles.textLink} href={href}>
            {idea.actionLabel ?? "Voir l’idée"} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <p className={styles.pendingLabel}>Fiche disponible après publication</p>
        )}
      </div>
    </article>
  );
}

export function RecentCollections({ ideas }: RecentCollectionsProps) {
  const visibleIdeas = [...ideas, ...EDITORIAL_PREVIEWS].slice(0, 4);

  return (
    <>
      <section id="idees-publiees" className={styles.recentSection} aria-labelledby="recent-title" data-reveal>
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <h2 id="recent-title">Idées récentes</h2>
            <a href="#idees-publiees">
              Voir toutes les idées <span aria-hidden="true">→</span>
            </a>
          </div>

          {visibleIdeas.length > 0 ? (
            <div className={styles.ideaLayout}>
              {visibleIdeas.map((idea, index) => (
                <IdeaCard
                  key={`${idea.slug}-${index}`}
                  idea={idea}
                  variant={index === 0 ? "feature" : index === 1 ? "wide" : "compact"}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div>
                <p className={styles.eyebrow}>Catalogue public</p>
                <h3>Les premières idées sont en cours de préparation.</h3>
                <p>
                  Elles apparaîtront ici après lecture de leur source et revue humaine.
                </p>
              </div>
              <Link className={styles.emptyAction} href="/editorial">
                Accéder à l’espace éditorial <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>
      </section>

      <section
        id="collections"
        className={styles.collectionsSection}
        aria-labelledby="collections-title"
        data-reveal
      >
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <h2 id="collections-title">Collections éditoriales</h2>
            <Link href="/editorial">
              Voir l’espace éditorial <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className={styles.collectionsGrid}>
            {COLLECTIONS.map((collection, index) => {
              const relatedIdea = ideas[index % Math.max(ideas.length, 1)];

              return (
              <article className={styles.collectionCard} key={collection.title}>
                <Image
                  src={collection.image}
                  alt=""
                  fill
                  sizes="(max-width: 760px) 100vw, (max-width: 1080px) 31vw, 25vw"
                />
                <div className={styles.collectionOverlay}>
                  <p className={styles.collectionLabel}>Collection</p>
                  <h3>{collection.title}</h3>
                  <p>{collection.count} idées dans cette collection</p>
                  <Link href={relatedIdea ? `/idees/${relatedIdea.slug}` : "/editorial"}>
                    Parcourir les idées <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
