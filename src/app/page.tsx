import { hero } from "@/content/copy";
import styles from "./page.module.css";

// Placeholder stage container. Phase 2 replaces the inside with the WebGL stage (src/stage/).
export default function Home() {
  return (
    <main>
      <section className={`${styles.stage} on-sky`} aria-labelledby="hero-title">
        <div className={styles.copy}>
          <h1 id="hero-title" className="display-xl">
            {hero.title}
          </h1>
          <p className={`lead ${styles.subtitle}`}>{hero.subtitle}</p>
        </div>
      </section>
    </main>
  );
}
