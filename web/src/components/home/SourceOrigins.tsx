import Image from "next/image";
import styles from "./SourceOrigins.module.css";

const SOURCES = [
  { name: "Reddit", src: "/brands/reddit.png", className: styles.reddit },
  { name: "Google News", src: "/brands/google-news.svg", className: styles.googleNews },
  { name: "TechCrunch", src: "/brands/techcrunch.svg", className: styles.techCrunch },
  { name: "Yelp", src: "/brands/yelp.svg", className: styles.yelp },
  { name: "Axios", src: "/brands/axios.svg", className: styles.axios },
  { name: "Yahoo!", src: "/brands/yahoo.svg", className: styles.yahoo },
  { name: "Reuters", src: "/brands/reuters.svg", className: styles.reuters },
  { name: "The Guardian", src: "/brands/the-guardian.svg", className: styles.guardian },
] as const;

export function SourceOrigins() {
  return (
    <section className={styles.section} aria-labelledby="sources-title">
      <div className={styles.shell}>
        <div className={styles.heading}>
          <h2 id="sources-title">Les sources qui nourrissent nos idées</h2>
        </div>
        <div className={styles.scroller} tabIndex={0} aria-label="Origines éditoriales">
          <ul className={styles.list}>
            {SOURCES.map((source) => (
              <li className={styles.item} key={source.name}>
                <Image
                  className={`${styles.logo} ${source.className}`}
                  src={source.src}
                  alt={source.name}
                  width={156}
                  height={52}
                  sizes="156px"
                />
                {source.name === "Reddit" || source.name === "Google News" ? (
                  <span className={styles.wordmark} aria-hidden="true">
                    {source.name}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
