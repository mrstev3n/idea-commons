import type { Metadata } from "next";
import Link from "next/link";
import styles from "../editorial-pages.module.css";

export const metadata: Metadata = {
  title: "Cas d’utilisation — Idea Commons",
  description: "Quatre points de départ pour explorer des idées à partir de besoins, d’irritants, de services et de territoires.",
};

const USE_CASES = [
  {
    id: "idee-produit",
    title: "Trouver une idée de produit",
    copy: "Partir d’un besoin observé, retrouver les sources qui permettent de le situer et faire émerger une piste à examiner.",
  },
  {
    id: "irritant",
    title: "Transformer un irritant en piste",
    copy: "Décrire une friction concrète, comprendre ce qui la provoque et relier les idées qui pourraient ouvrir une autre voie.",
  },
  {
    id: "service-experience",
    title: "Repenser un service ou une expérience",
    copy: "Mettre en regard les usages, les signaux et les sources pour éclairer une évolution sans masquer ce qui reste à vérifier.",
  },
  {
    id: "besoins-territoire",
    title: "Explorer les besoins d’un territoire",
    copy: "Rassembler des signaux locaux, des initiatives et des faits publics pour mieux situer un besoin avant d’en discuter.",
  },
] as const;

export default function UseCasesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Cas d’utilisation</p>
          <h1>Commencer par un besoin réel.</h1>
          <p className={styles.lead}>Ces points d’entrée aident à explorer des idées sans prétendre couvrir tous les usages. Chacun relie un besoin à des sources et à des pistes qui restent discutables.</p>
        </div>
        <div className={styles.abstractMark} aria-hidden="true"><span>?</span><span>→</span></div>
      </header>

      <section className={styles.section} aria-labelledby="use-cases-title">
        <div className={styles.sectionHeading}>
          <h2 id="use-cases-title">Quatre points de départ</h2>
          <p>Choisissez la situation qui ressemble le plus à ce que vous cherchez aujourd’hui.</p>
        </div>
        <div className={styles.topicGrid}>
          {USE_CASES.map((useCase) => (
            <article className={styles.topicCard} id={useCase.id} key={useCase.id}>
              <h2>{useCase.title}</h2>
              <p>{useCase.copy}</p>
              <Link className={styles.textLink} href="/#idees-publiees">Explorer les idées</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
