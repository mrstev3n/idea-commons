import Image from "next/image";
import Link from "next/link";
import styles from "./SignalsAndThemes.module.css";

export interface SignalsAndThemesIdea {
  slug: string;
  title: string;
  oneLineSummary: string;
  theme: string;
  image: string;
  imageAlt: string;
  sourceLabel: string;
  provenance: string;
  publishedAt: string;
}

interface SignalsAndThemesProps {
  ideas: SignalsAndThemesIdea[];
}

interface ThemeCard {
  name: string;
  description: string;
  image: string;
  imageAlt: string;
  href: string;
}

const FALLBACK_IMAGE = "/images/idea-commons-hero-landscape.jpg";

const THEME_DESCRIPTIONS: Record<string, string> = {
  Environnement: "Agir pour la planète aujourd’hui.",
  Société: "Comprendre les dynamiques sociales.",
  Économie: "Décrypter les transformations économiques.",
  Culture: "Observer les récits et pratiques qui nous relient.",
  Technologie: "Interroger les usages qui transforment le quotidien.",
  Territoires: "Lire les mutations au plus près des lieux.",
  Communs: "Mettre les savoirs en partage.",
};

const DEFAULT_THEMES = ["Environnement", "Société", "Économie"];

const THEME_IMAGES: Record<string, { image: string; imageAlt: string }> = {
  Environnement: {
    image: "/images/stock-territory-valley.webp",
    imageAlt: "Vallée verdoyante observée depuis les airs",
  },
  Société: {
    image: "/images/stock-society-crossing.webp",
    imageAlt: "Flux de piétons traversant un passage urbain",
  },
  Économie: {
    image: "/images/stock-economy-harbor.webp",
    imageAlt: "Port de commerce et conteneurs vus depuis les airs",
  },
};

function formatPublishedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function themeCardsFor(ideas: SignalsAndThemesIdea[]): ThemeCard[] {
  const cards = new Map<string, ThemeCard>();

  for (const idea of ideas) {
    const name = idea.theme.trim() || "Communs";
    if (cards.has(name)) continue;
    const themeImage = THEME_IMAGES[name];

    cards.set(name, {
      name,
      description:
        THEME_DESCRIPTIONS[name] ?? `Explorer les idées liées au thème ${name.toLocaleLowerCase("fr-FR")}.`,
      image: themeImage?.image ?? idea.image ?? FALLBACK_IMAGE,
      imageAlt: themeImage?.imageAlt ?? idea.imageAlt ?? `Illustration du thème ${name}`,
      href: `/idees/${idea.slug}`,
    });
  }

  for (const [index, name] of DEFAULT_THEMES.entries()) {
    if (cards.size >= 3 || cards.has(name)) continue;

    const relatedIdea = ideas[index % Math.max(ideas.length, 1)];
    const themeImage = THEME_IMAGES[name];
    cards.set(name, {
      name,
      description: THEME_DESCRIPTIONS[name],
      image: themeImage?.image ?? relatedIdea?.image ?? FALLBACK_IMAGE,
      imageAlt: themeImage?.imageAlt ?? relatedIdea?.imageAlt ?? `Paysage illustrant le thème ${name}`,
      href: relatedIdea ? `/idees/${relatedIdea.slug}` : "/editorial",
    });
  }

  return Array.from(cards.values()).slice(0, 3);
}

function TrendCard({
  idea,
  priority = false,
  variant,
}: {
  idea: SignalsAndThemesIdea;
  priority?: boolean;
  variant: "featured" | "compact";
}) {
  return (
    <Link
      className={`${styles.trendCard} ${
        variant === "featured" ? styles.trendCardFeatured : styles.trendCardCompact
      }`}
      href={`/idees/${idea.slug}`}
    >
      <Image
        className={styles.cardImage}
        src={idea.image || FALLBACK_IMAGE}
        alt={idea.imageAlt}
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        sizes={
          variant === "featured"
            ? "(max-width: 780px) calc(100vw - 40px), 54vw"
            : "(max-width: 780px) calc(100vw - 40px), 36vw"
        }
      />
      <span className={styles.imageWash} aria-hidden="true" />
      <span className={styles.trendContent}>
        <span className={styles.trendTheme}>{idea.theme}</span>
        <span className={styles.trendTitle}>{idea.title}</span>
        {variant === "featured" ? (
          <span className={styles.trendSummary}>{idea.oneLineSummary}</span>
        ) : null}
        <span className={styles.trendMeta}>
          <span>{idea.sourceLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{idea.provenance}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={idea.publishedAt}>{formatPublishedAt(idea.publishedAt)}</time>
        </span>
        <span className={styles.cardAction}>Voir l’idée</span>
      </span>
    </Link>
  );
}

export function SignalsAndThemes({ ideas }: SignalsAndThemesProps) {
  const featuredIdea = ideas[0];
  const compactIdeas = ideas.slice(1, 3);
  const themes = themeCardsFor(ideas);

  return (
    <>
      <section id="tendances" className={styles.trends} aria-labelledby="trends-title" data-reveal>
        <div className={styles.shell}>
          <div className={styles.trendsHeader}>
            <div>
              <h2 id="trends-title">En tendance</h2>
              <p>Les sujets qui font débat aujourd’hui.</p>
            </div>
            <a className={styles.sectionLinkOnPrimary} href="#idees-publiees">
              Voir toutes les idées
            </a>
          </div>

          {featuredIdea ? (
            <div
              className={`${styles.trendGrid} ${
                compactIdeas.length === 0 ? styles.trendGridSingle : ""
              }`}
            >
              <TrendCard idea={featuredIdea} priority variant="featured" />
              {compactIdeas.length > 0 ? (
                <div className={styles.trendStack}>
                  {compactIdeas.map((idea) => (
                    <TrendCard key={idea.slug} idea={idea} variant="compact" />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={styles.emptyTrend}>
              <h3>Les prochains signaux sont en préparation.</h3>
              <p>Les idées relues seront mises en avant ici dès leur publication.</p>
              <Link href="/editorial">Découvrir l’espace éditorial</Link>
            </div>
          )}
        </div>
      </section>

      <section id="themes" className={styles.themes} aria-labelledby="themes-title" data-reveal>
        <div className={styles.shell}>
          <div className={styles.themesHeader}>
            <h2 id="themes-title">Explorer les thèmes</h2>
            <a href="#idees-publiees">Voir tous les thèmes</a>
          </div>
          <div className={styles.themeGrid}>
            {themes.map((theme) => (
              <Link className={styles.themeCard} href={theme.href} key={theme.name}>
                <Image
                  className={styles.cardImage}
                  src={theme.image}
                  alt={theme.imageAlt}
                  fill
                  sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1020px) 45vw, 31vw"
                />
                <span className={styles.imageWash} aria-hidden="true" />
                <span className={styles.themeFooter}>
                  <span className={styles.themeContent}>
                    <span className={styles.themeName}>{theme.name}</span>
                    <span className={styles.themeDescription}>{theme.description}</span>
                  </span>
                  <span className={styles.themeAction} aria-hidden="true">
                    Voir
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
