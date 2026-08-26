"use client";

import Image from "next/image";
import { IconChevronDown } from "@tabler/icons-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
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

function FaqAccordion() {
  const accordionId = useId();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setOpenIndex((currentIndex) => (currentIndex === index ? null : index));
      return;
    }

    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = (index + 1) % QUESTIONS.length;
    if (event.key === "ArrowUp") nextIndex = (index - 1 + QUESTIONS.length) % QUESTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = QUESTIONS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.questionList}>
      {QUESTIONS.map((item, index) => {
        const isOpen = openIndex === index;
        const buttonId = `${accordionId}-question-${index}`;
        const panelId = `${accordionId}-answer-${index}`;

        return (
          <div className={styles.questionItem} key={item.question}>
            <h3 className={styles.questionHeading}>
              <button
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                onKeyDown={(event) => moveFocus(event, index)}
              >
                <span>{item.question}</span>
                <IconChevronDown aria-hidden="true" focusable="false" />
              </button>
            </h3>
            <div
              id={panelId}
              className={styles.answerPanel}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
            >
              <p>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
            <h2 id="contribution-title">Contribuer aux idées</h2>
            <p>
              Propose ce qui mérite d’être documenté, discuté ou mis en commun. Un compte
              est requis avant l’envoi.
            </p>
            <div className={styles.actions}>
              <ActionLink variant="primary" href="/identite">
                Partager une idée
              </ActionLink>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title" data-reveal>
        <div className={styles.faqShell}>
          <div className={styles.faqIntro}>
            <h2 id="faq-title">Questions fréquentes</h2>
            <p>
              Le minimum à savoir pour explorer, citer ou proposer une source sans perdre
              le fil de sa provenance.
            </p>
          </div>
          <FaqAccordion />
        </div>
      </section>

      <section id="newsletter" className={styles.newsletter} aria-labelledby="newsletter-title">
        <div className={styles.newsletterShell}>
          <div>
            <h2 id="newsletter-title">Les briefs Idea Commons</h2>
            <p>Chaque semaine, une sélection d’idées et de débats à ne pas manquer.</p>
          </div>
          <NewsletterSignup />
        </div>
      </section>
    </>
  );
}
