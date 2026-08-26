import type { Metadata } from "next";
import { ActionLink } from "@/components/ui/Action";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Comparer l’accès gratuit à Idea Commons et l’offre Premium à venir.",
};

const FREE_FEATURES = [
  "Explorer toutes les idées publiées",
  "Consulter leurs sources et leur provenance",
  "Parcourir les thèmes et les collections publiques",
  "Proposer une source publique à la revue éditoriale",
] as const;

const PREMIUM_FEATURES = [
  "Tout ce qui est inclus dans l’offre gratuite",
  "Créer des collections personnelles",
  "Suivre des thèmes et recevoir des alertes ciblées",
  "Préparer des sélections à partager ou à exporter",
] as const;

export default function PricingPage() {
  return (
    <section className={styles.page} aria-labelledby="pricing-title">
      <div className={styles.shell}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Tarifs</p>
          <h1 id="pricing-title">Le Commons reste ouvert. Premium ira plus loin.</h1>
          <p>
            L’exploration publique reste gratuite. Une offre Premium est en préparation
            pour celles et ceux qui voudront organiser, suivre et partager leur veille.
          </p>
        </header>

        <div className={styles.plans}>
          <article className={styles.plan}>
            <div className={styles.planHead}>
              <div>
                <p className={styles.planLabel}>Gratuit</p>
                <h2>Explorer librement</h2>
              </div>
              <p className={styles.price}>0&nbsp;€</p>
            </div>
            <p className={styles.planSummary}>
              Pour comprendre les idées publiées et remonter à leurs sources.
            </p>
            <ul>
              {FREE_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <ActionLink className={styles.action} href="/#idees-publiees" size="lg">
              Explorer les idées
            </ActionLink>
          </article>

          <article className={`${styles.plan} ${styles.premium}`}>
            <div className={styles.planHead}>
              <div>
                <p className={styles.planLabel}>Premium</p>
                <h2>Organiser sa veille</h2>
              </div>
              <p className={styles.soon}>Bientôt</p>
            </div>
            <p className={styles.planSummary}>
              Des fonctions personnelles sont envisagées pour prolonger l’exploration.
            </p>
            <ul>
              {PREMIUM_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <ActionLink className={styles.action} href="/#newsletter" size="lg" variant="inverse">
              Suivre l’arrivée de Premium
            </ActionLink>
          </article>
        </div>

      </div>
    </section>
  );
}
