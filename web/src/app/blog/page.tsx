import type { Metadata } from "next";
import Link from "next/link";
import styles from "../editorial-pages.module.css";

export const metadata: Metadata = {
  title: "Blog — Idea Commons",
  description: "Récits et collections éditoriales autour des idées, de leurs sources et de ce qu’elles rendent possible.",
};

export default function BlogPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Blog</p>
          <h1>Les idées racontées depuis leur point de départ.</h1>
          <p className={styles.lead}>Le Blog accueille des récits thématiques et des Collections : des publications éditoriales qui sélectionnent, classent et contextualisent des idées anciennes ou récentes.</p>
        </div>
        <div className={styles.abstractMark} aria-hidden="true"><span>Oh</span><span>Ah</span></div>
      </header>

      <section className={styles.section} aria-labelledby="latest-story">
        <div className={styles.sectionHeading}>
          <h2 id="latest-story">À lire</h2>
        </div>
        <article className={styles.storyCard}>
          <p className={styles.eyebrow}>Cas réel</p>
          <h2>Donner un son aux réactions : naissance d’un soundboard d’emojis</h2>
          <p>Pendant un live ou un appel vidéo, certaines réactions gagnent à être entendues. Cette envie est devenue un soundboard où chaque emoji déclenche un son.</p>
          <Link className={styles.textLink} href="/blog/soundboard-emojis">Lire le récit</Link>
        </article>
      </section>
    </main>
  );
}
