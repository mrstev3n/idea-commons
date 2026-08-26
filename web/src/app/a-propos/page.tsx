import type { Metadata } from "next";
import Link from "next/link";
import styles from "../editorial-pages.module.css";

export const metadata: Metadata = {
  title: "À propos — Idea Commons",
  description:
    "Pourquoi Idea Commons existe, comment les idées sont structurées et comment chacun peut les explorer ou y contribuer.",
};

const ABOUT_SECTIONS = [
  {
    id: "mission",
    title: "Faire émerger les idées que l’on aurait pu manquer",
    copy: "Un article, une discussion ou une initiative locale peut révéler un besoin concret. Idea Commons relit ces signaux du quotidien pour en faire des idées de produits et de services que l’on peut comprendre, retrouver et discuter.",
  },
  {
    id: "fonctionnement",
    title: "Garder le lien entre une idée et son point de départ",
    copy: "Chaque idée publiée conserve ses sources, sa provenance et les éléments qui restent à vérifier. Le catalogue évolue chaque jour sans effacer le contexte qui permet de juger une piste par soi-même.",
  },
  {
    id: "contribuer",
    title: "Aider le Commons à mieux voir",
    copy: "Vous pouvez proposer une source ou une idée, ou participer à la veille et à la revue. Un compte est demandé avant l’envoi afin que la contribution puisse être suivie dans votre espace.",
  },
  {
    id: "principes",
    title: "Un espace public, des repères visibles",
    copy: "La lecture du catalogue reste ouverte sans compte. Les idées publiées indiquent leur provenance et passent par une revue humaine. Les favoris, projets et autres espaces personnels restent privés par défaut.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>À propos</p>
          <h1>Des sources ordinaires peuvent ouvrir de vraies pistes.</h1>
          <p className={styles.lead}>
            Idea Commons transforme des signaux du quotidien en idées structurées pour
            celles et ceux qui cherchent leur prochain produit, service ou side project.
          </p>
        </div>
        <div className={styles.abstractMark} aria-hidden="true">
          <span>Source</span>
          <span>Idée</span>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="about-sections-title">
        <div className={styles.sectionHeading}>
          <h2 id="about-sections-title">Comprendre le Commons</h2>
          <p>La promesse, le fonctionnement et les règles qui structurent l’expérience.</p>
        </div>
        <div className={styles.topicGrid}>
          {ABOUT_SECTIONS.map((section) => (
            <article className={styles.topicCard} id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              <p>{section.copy}</p>
              {section.id === "contribuer" ? (
                <Link className={styles.textLink} href="/identite">
                  Accéder à mon espace
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
