"use client";

import Image from "next/image";
import { CSSProperties, useEffect, useRef, useState } from "react";
import styles from "./SourceOrigins.module.css";

const SOURCES = [
  { name: "Reddit", src: "/brands/reddit.png", className: styles.reddit, width: 155, height: 155 },
  { name: "Yahoo Finance", src: "/brands/yahoo.svg", className: styles.yahoo, width: 1000, height: 277 },
  { name: "arXiv", src: "/brands/arxiv.svg", className: styles.arxiv, width: 247, height: 111 },
  { name: "Google News", src: "/brands/google-news.svg", className: styles.googleNews, width: 183, height: 150 },
  { name: "The Guardian", src: "/brands/the-guardian.svg", className: styles.guardian, width: 295, height: 97 },
  { name: "X", src: "/brands/x.png", className: styles.x, width: 2400, height: 2453 },
  { name: "Europe PMC", src: "/brands/europe-pmc.png", className: styles.europePmc, width: 1081, height: 251 },
  { name: "Yelp", src: "/brands/yelp.svg", className: styles.yelp, width: 496, height: 200 },
  {
    name: "Crossref",
    src: "https://assets.crossref.org/logo/metadata-from-crossref-logo-200.svg",
    className: styles.crossref,
    width: 300,
    height: 102,
    external: true,
  },
  { name: "Axios", src: "/brands/axios.svg", className: styles.axios, width: 150, height: 38 },
] as const;

export function SourceOrigins() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { threshold: 0.25 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const renderSources = (isClone = false) => (
    <ul className={`${styles.list} ${isClone ? styles.clone : ""}`} aria-hidden={isClone || undefined}>
      {SOURCES.map((source, index) => (
        <li
          className={styles.item}
          key={`${isClone ? "clone" : "source"}-${source.name}`}
          style={{ "--source-enter-index": index } as CSSProperties}
        >
          {"external" in source ? (
            // Crossref asks consumers to reference its CDN asset directly.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={`${styles.logo} ${source.className}`}
              src={source.src}
              alt={isClone ? "" : source.name}
              width={source.width}
              height={source.height}
              loading="lazy"
            />
          ) : (
            <Image
              className={`${styles.logo} ${source.className}`}
              src={source.src}
              alt={isClone ? "" : source.name}
              width={source.width}
              height={source.height}
              sizes="(max-width: 720px) 38vw, 180px"
            />
          )}
          {source.name === "Reddit" || source.name === "Google News" ? (
            <span className={styles.wordmark} aria-hidden="true">
              {source.name}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${isVisible ? styles.visible : ""}`}
      aria-labelledby="sources-title"
    >
      <div className={styles.shell}>
        <div className={styles.heading}>
          <h2 id="sources-title">Les sources qui nourrissent nos idées</h2>
        </div>
        <div
          className={styles.scroller}
          tabIndex={0}
          aria-label="Origines éditoriales — animation en pause au survol ou au focus"
        >
          <div className={styles.track}>
            {renderSources()}
            {renderSources(true)}
          </div>
        </div>
      </div>
    </section>
  );
}
