import Image from "next/image";
import Link from "next/link";
import { CLAIM_TYPE_LABELS, formatDate } from "@/lib/labels";
import { LandingStory } from "@/components/LandingStory";
import { LandingMotion } from "@/components/home/LandingMotion";
import { ActionLink } from "@/components/ui/Action";
import { listPublishedIdeas, type PublishedIdeaSummary } from "@/server/queries";
import { getCurrentIdentity } from "@/server/identity";

export const dynamic = "force-dynamic";

const IDEA_PRESENTATION: Record<
  string,
  { theme: string; image: string; imageAlt: string; provenance: string; sourceLabel: string }
> = {
  "cartographie-ilots-chaleur": {
    theme: "Environnement",
    image: "/images/stock-climate-flood.webp",
    imageAlt: "Vue aérienne d’un territoire résidentiel touché par une inondation",
    provenance: "Note méthodologique",
    sourceLabel: "Collectif de quartier · campagne d’été",
  },
  "ateliers-reparation-mediatheque": {
    theme: "Société",
    image: "/images/stock-community-workshop.webp",
    imageAlt: "Groupe de travail réuni autour de solutions environnementales",
    provenance: "Compte rendu d’expérimentation",
    sourceLabel: "Médiathèque intercommunale · expérimentation",
  },
};

function presentationFor(idea: PublishedIdeaSummary) {
  return (
    IDEA_PRESENTATION[idea.slug] ?? {
      theme: "Communs",
      image: "/images/idea-heat-mapping.jpg",
      imageAlt: "Source éditoriale représentée dans le catalogue Idea Commons",
      provenance: idea.sourceType === "editorial_intake" ? "Source éditoriale" : "Provenance",
      sourceLabel: idea.sourceTitle ?? "Source éditoriale vérifiée",
    }
  );
}

function HeroDossier({ idea }: { idea?: PublishedIdeaSummary }) {
  if (!idea) return null;
  const claimTypes = Object.keys(idea.claimCounts).slice(0, 3);
  const presentation = presentationFor(idea);

  return (
    <aside className="hero-dossier" aria-label={`Idée vedette : ${idea.title}`}>
      <div className="hero-dossier__sheet">
        <p className="hero-dossier__eyebrow">Idée vérifiée</p>
        <h2>{idea.title}</h2>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{presentation.sourceLabel}</dd>
          </div>
          <div>
            <dt>Publication</dt>
            <dd>Revue humaine · {formatDate(idea.publishedAt)}</dd>
          </div>
        </dl>
        {claimTypes.length > 0 ? (
          <ul className="hero-dossier__claims" aria-label="Types d’affirmations">
            {claimTypes.map((type) => (
              <li key={type}>{CLAIM_TYPE_LABELS[type] ?? type}</li>
            ))}
          </ul>
        ) : null}
        <Link href={`/idees/${idea.slug}`}>Ouvrir l’idée</Link>
      </div>
    </aside>
  );
}

export default async function CataloguePage() {
  const identity = await getCurrentIdentity();
  const ideas = await listPublishedIdeas(identity);
  const landingIdeas = ideas.map((idea) => {
    const presentation = presentationFor(idea);

    return {
      slug: idea.slug,
      title: idea.title,
      oneLineSummary: idea.oneLineSummary,
      theme: presentation.theme,
      image: presentation.image,
      imageAlt: presentation.imageAlt,
      sourceLabel: presentation.sourceLabel,
      provenance: presentation.provenance,
      publishedAt: idea.publishedAt,
    };
  });

  return (
    <>
      <LandingMotion />
      <section className="hero hero--stage" aria-labelledby="promesse">
        <Image
          className="hero__image"
          src="/images/idea-commons-hero-landscape.jpg"
          alt=""
          fill
          priority
          loading="eager"
          sizes="100vw"
        />
        <div className="hero__inner">
          <div className="hero__copy">
            <h1 id="promesse" className="hero__title">
              <span className="hero__plain">Des sources deviennent</span>
              <em className="hero__accent">des idées à discuter.</em>
            </h1>
            <p className="hero__lead">
              Nous révélons, dans les sources du quotidien, des idées de produits et services
              numériques pour votre prochaine startup ou votre side project.
            </p>
            <div className="hero__actions">
              <ActionLink variant="on-dark" size="lg" data-emphasis="strong" href="#idees-publiees">
                Explorer les idées
              </ActionLink>
              <ActionLink variant="on-dark" size="lg" href="/editorial">
                Proposer une source
              </ActionLink>
            </div>
            <p className="hero__micro">
              Ouvert à tous. Gratuit et sans inscription pour explorer.
            </p>
          </div>
          <HeroDossier idea={ideas[0]} />
        </div>
      </section>

      <LandingStory ideas={landingIdeas} />
    </>
  );
}
