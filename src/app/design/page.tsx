// Dev-only design sheet (not linked): type scale, swatches, buttons, tags, hairlines and star marks.
// Specimen text comes from src/content/copy.ts; the labels here are token names for developers.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { application, chrome, finale, hero, model, questions, terms, work } from "@/content/copy";
import { Hairline, PillButton, StarMark, Tag } from "@/ui/primitives";
import styles from "./design.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const SWATCHES = [
  ["--sky", "#1F4E9C"],
  ["--sky-soft", "#6F9BD6"],
  ["--milk", "#F6F3EC"],
  ["--ink", "#15130F"],
  ["--press", "#0E0C0A"],
  ["--orange", "#FF7A00"],
  ["--leaf", "#476B35"],
  ["--marble", "#ECE7DD"],
  ["--paper", "#EFE6D2"],
] as const;

const SCALE = [
  ["display-xxl (wordmark 600)", "display-xxl display-xxl--wordmark", finale.wordmark],
  ["display-xxl", "display-xxl", terms.codaTitle],
  ["display-xl", "display-xl", hero.title],
  ["display-l", "display-l", questions.title],
  ["title", "title", work.cards[0].title],
  ["lead", "lead", hero.subtitle],
  ["body", "body", hero.paragraph],
  ["label", "label", model.share.tag],
  ["meta", "meta", chrome.percent(88)],
] as const;

function Frame({ ground }: { ground: "on-sky" | "on-paper" }) {
  return (
    <div className={`${styles.frame} ${ground}`}>
      <Hairline direction="v" className={styles.left} />
      <Hairline direction="v" className={styles.right} />
      <Hairline direction="h" className={styles.top} />
      <Hairline direction="h" className={styles.mid} />
      <StarMark className={styles.midStar} />
      <span className={`label ${styles.colA}`}>{chrome.chapters[0].label}</span>
      <span className={`meta ${styles.colB}`}>{chrome.chapters[0].short}</span>
    </div>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className={styles.page}>
      <section className={`${styles.block} on-milk`}>
        <p className="label">Type scale</p>
        <div className={styles.scale}>
          {SCALE.map(([name, cls, sample]) => (
            <div key={name} className={styles.row}>
              <span className={`meta ${styles.rowLabel}`}>{name}</span>
              <span className={cls}>{sample}</span>
            </div>
          ))}
          <div className={styles.row}>
            <span className={`meta ${styles.rowLabel}`}>display-xl italic</span>
            <span className="display-xl italic">{questions.titleHandwritten}</span>
          </div>
        </div>
      </section>

      <section className={`${styles.block} on-milk`}>
        <p className="label">Colours</p>
        <div className={styles.swatches}>
          {SWATCHES.map(([name, hex]) => (
            <div key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(${name})` }} />
              <span className="meta">{name}</span>
              <span className="meta">{hex}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.block} on-sky`}>
        <p className="label">Buttons and tags on sky</p>
        <div className={styles.inline}>
          <PillButton>{chrome.apply}</PillButton>
          <PillButton>{hero.button}</PillButton>
          <Tag>{hero.tag}</Tag>
          <Tag>{model.share.tag}</Tag>
        </div>
      </section>

      <section className={`${styles.block} on-paper`}>
        <p className="label">Buttons and tags on paper</p>
        <div className={styles.inline}>
          <PillButton>{application.submit}</PillButton>
          <Tag>{terms.block.tag}</Tag>
          <Tag>{work.cards[2].tag}</Tag>
        </div>
      </section>

      <section className={`${styles.block} on-milk`}>
        <p className="label">Hairlines, rules and star marks</p>
        <div className={styles.frames}>
          <Frame ground="on-sky" />
          <Frame ground="on-paper" />
        </div>
      </section>
    </main>
  );
}
