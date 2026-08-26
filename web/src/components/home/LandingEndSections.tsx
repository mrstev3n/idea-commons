import Image from "next/image";
import { NewsletterSignup } from "./NewsletterSignup";
import { ActionLink } from "@/components/ui/Action";
import styles from "./LandingEndSections.module.css";

const QUESTIONS = [
  {
    question: "Comment une source devient-elle une idée ?",
    answer:
      "Une source publique est relue, ses affirmations sont distinguées et leur provenance reste visible. Une fiche n’est publiée qu’après une revue humaine.",
  },
  {
    question: "Qui peut contribuer ?",
    answer:
      "Toute personne peut proposer une source publique. La publication reste soumise aux règles éditoriales du Commons.",
  },
  {
    question: "Les idées sont-elles neutres ?",
    answer:
      "Non. Elles rendent leur point de vue, leurs hypothèses et leurs sources discutables au lieu de les présenter comme une vérité indifférenciée.",
  },
  {
    question: "Puis-je utiliser une idée dans mes travaux ?",
    answer:
      "Oui, selon la licence indiquée sur sa fiche et en conservant les crédits et la provenance associés à sa version publiée.",
  },
] as const;

export function LandingEndSections() {
  return (
    <>
      <section className={styles.contribution} aria-labelledby="contribution-title" data-reveal>
        <div className={styles.shell}>
          <div className={styles.contributionImage}>
            <Image
              src="/images/idea-repair-workshop.jpg"
              alt="Groupe réuni autour d’une table pour documenter une expérimentation"
              fill
              sizes="(max-width: 760px) 100vw, 55vw"
            />
          </div>
          <div className={styles.contributionCopy}>
            <p className={styles.eyebrow}>Le Commons est ouvert</p>
            <h2 id="contribution-title">Contribuer au Commons</h2>
            <p>
              Partage une source publique, enrichis une idée ou rends un débat plus
              explicite. Chaque contribution reste reliée à son origine.
            </p>
            <div className={styles.actions}>
              <ActionLink variant="primary" href="/editorial">
                Proposer une source
              </ActionLink>
              <ActionLink variant="quiet" href="/identite">
                Créer un compte contributeur
              </ActionLink>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title" data-reveal>
        <div className={styles.faqShell}>
          <div className={styles.faqIntro}>
            <p className={styles.eyebrow}>Pour aller plus loin</p>
            <h2 id="faq-title">Questions fréquentes</h2>
            <p>
              Le minimum à savoir pour explorer, citer ou proposer une source sans perdre
              le fil de sa provenance.
            </p>
          </div>
          <div className={styles.questionList}>
            {QUESTIONS.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="newsletter" className={styles.newsletter} aria-labelledby="newsletter-title" data-reveal>
        <div className={styles.newsletterShell}>
          <div>
            <p className={styles.eyebrow}>La lettre du Commons</p>
            <h2 id="newsletter-title">Le briefing du Commons</h2>
            <p>Chaque semaine, une sélection d’idées et de débats à ne pas manquer.</p>
          </div>
          <NewsletterSignup />
        </div>
      </section>
    </>
  );
}
