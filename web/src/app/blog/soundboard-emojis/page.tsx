import type { Metadata } from "next";
import Link from "next/link";
import styles from "../../editorial-pages.module.css";

export const metadata: Metadata = {
  title: "Donner un son aux réactions — Idea Commons",
  description: "Le récit d’un soundboard d’emojis né d’un besoin pendant des lives et des appels vidéo.",
};

export default function SoundboardEmojiStoryPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>Cas réel</p>
          <h1>Donner un son aux réactions : naissance d’un soundboard d’emojis</h1>
          <Link className={styles.textLink} href="/blog">Retour au Blog</Link>
        </header>
        <div className={styles.articleBody}>
          <p>Pendant mes lives TikTok et d’autres visioconférences, je voulais accompagner certaines réactions d’un son. Around, une plateforme que j’appréciais, proposait quelque chose dans cet esprit, mais n’existe plus aujourd’hui.</p>
          <p>J’ai donc créé un petit soundboard d’emojis. Chaque emoji déclenche un son qui correspond à l’émotion visible : un « Oh » ou un « Ah » peut, par exemple, donner une voix à l’étonnement.</p>
          <p>L’idée est partie d’un besoin très concret : rendre une réaction aussi audible que visible pendant un échange en direct.</p>
        </div>
      </article>
    </main>
  );
}
