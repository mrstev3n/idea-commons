import Image from "next/image";
import Link from "next/link";
import { ActionLink } from "@/components/ui/Action";
import {
  EDITORIAL_PREVIEWS,
  type LandingIdeaPresentation,
} from "./landingContent";
import styles from "./RecentCollections.module.css";

export type RecentCollectionIdea = LandingIdeaPresentation;

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

type Collection = (typeof COLLECTIONS)[number];

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatPublishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function mediaClassName(image: string) {
  return image.includes("stock-territory-valley") ? styles.mediaCropValley : undefined;
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

function IdeaCard({ idea }: { idea: RecentCollectionIdea }) {
  const href = idea.href ?? (idea.statusLabel ? null : `/idees/${idea.slug}`);

  return (
    <article className={styles.ideaCard}>
      <div className={styles.ideaMedia}>
        <Image
          className={mediaClassName(idea.image)}
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

function CollectionCard({
  collection,
  href,
}: {
  collection: Collection;
  href: string;
}) {
  return (
    <article className={styles.collectionCard}>
      <div className={styles.collectionMedia} aria-hidden="true">
        <Image
          className={mediaClassName(collection.image)}
          src={collection.image}
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, (max-width: 1080px) 31vw, 25vw"
        />
      </div>
      <div className={styles.collectionOverlay}>
        <div className={styles.collectionText}>
          <p className={styles.collectionLabel}>Collection</p>
          <h3>{collection.title}</h3>
          <p>{collection.count} idées dans cette collection</p>
        </div>
        <Link href={href}>
          Parcourir les idées
        </Link>
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
          </div>

          {visibleIdeas.length > 0 ? (
            <div className={styles.ideaLayout}>
              {visibleIdeas.map((idea, index) => (
                <IdeaCard
                  key={`${idea.slug}-${index}`}
                  idea={idea}
                />
              ))}
              <aside className={styles.ideaIndexCta} aria-label="Catalogue des idées">
                <p>Découvrez d’autres idées</p>
                <ActionLink href="/#idees-publiees" size="md" variant="primary">
                  Voir toutes les idées
                </ActionLink>
              </aside>
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
              Voir l’espace éditorial
            </Link>
          </div>

          <div className={styles.collectionsGrid}>
            {COLLECTIONS.map((collection, index) => {
              const relatedIdea = ideas[index % Math.max(ideas.length, 1)];

              return (
                <CollectionCard
                  key={collection.title}
                  collection={collection}
                  href={relatedIdea ? `/idees/${relatedIdea.slug}` : "/editorial"}
                />
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
