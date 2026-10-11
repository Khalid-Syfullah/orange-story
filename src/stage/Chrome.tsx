"use client";
// The chrome (docs/STORY.md): the hairline frame with its star mark, the Orange mark and grid menu
// button top-left, the Apply pill top-right, the left rail with the four chapter labels, and the
// bottom-right percentage. Every string comes from src/content/copy.ts; positions come from the
// layout tokens. Colour follows the segment's ground (milk on sky, ink on paper) through the frame
// subscription, written to the DOM directly.
import { useCallback, useRef, useState } from "react";
import { chrome } from "@/content/copy";
import { Hairline, PillButton, StarMark } from "@/ui/primitives";
import type { FrameCtx } from "./frame";
import { useFrame, useStage } from "./hub";
import { chapterAt, chapterStart, groundAt, surfaceAt, type ChapterId } from "./script";
import styles from "./Chrome.module.css";

const GROUND_CLASS = { sky: "on-sky", paper: "on-paper", milk: "on-milk" } as const;

function GridIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {[1.5, 6, 10.5].flatMap((y) =>
        [1.5, 6, 10.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="currentColor" />),
      )}
    </svg>
  );
}

export function Chrome() {
  const hub = useStage();
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const onFrame = useCallback((f: FrameCtx) => {
    const root = rootRef.current;
    if (!root) return;
    const cls = `${styles.chrome} ${GROUND_CLASS[groundAt(f.p)]}`;
    if (root.className !== cls) root.className = cls;
    const surface = surfaceAt(f.p);
    if (root.dataset.surface !== surface) root.dataset.surface = surface;

    const chapter = chapterAt(f.p) ?? "";
    if (root.dataset.chapter !== chapter) {
      root.dataset.chapter = chapter;
      const rail = railRef.current;
      if (rail) {
        for (const b of rail.querySelectorAll<HTMLButtonElement>("button")) {
          b.setAttribute("aria-current", b.dataset.chapter === chapter ? "true" : "false");
        }
      }
    }

    const percent = chrome.percent(f.p * 100);
    const el = percentRef.current;
    if (el && el.textContent !== percent) el.textContent = percent;
  }, []);
  useFrame(onFrame);

  const go = (chapter: ChapterId) => {
    hub.scrollToSegment(chapterStart(chapter));
    setMenuOpen(false);
  };

  return (
    <div ref={rootRef} className={`${styles.chrome} on-sky`} data-surface="paint" data-chapter="">
      <Hairline direction="v" over="paint" className={styles.left} />
      <Hairline direction="v" over="paint" className={styles.right} />
      <Hairline direction="h" over="paint" className={styles.top} />
      <Hairline direction="h" over="paint" className={styles.mid} />
      <StarMark className={styles.midStar} />

      <button type="button" className={styles.mark} aria-label={chrome.a11y.home} onClick={() => hub.setP(0)}>
        {chrome.mark}
      </button>

      <button
        type="button"
        className={styles.menu}
        aria-label={menuOpen ? chrome.a11y.menuClose : chrome.a11y.menuOpen}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <GridIcon />
      </button>
      {menuOpen && (
        <ul className={styles.menuList} aria-label={chrome.a11y.chapters}>
          {chrome.chapters.map((c) => (
            <li key={c.id}>
              <button type="button" className={`meta ${styles.menuItem}`} onClick={() => go(c.id)}>
                <span>{c.short}</span>
                <span>{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PillButton className={styles.apply} onClick={() => hub.scrollToSegment("application")}>
        {chrome.apply}
      </PillButton>

      <nav ref={railRef} className={styles.rail} aria-label={chrome.a11y.chapters}>
        {chrome.chapters.map((c) => (
          <button
            key={c.id}
            type="button"
            data-chapter={c.id}
            aria-current="false"
            className={`label ${styles.railItem}`}
            onClick={() => go(c.id)}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <span ref={percentRef} className={`meta ${styles.percent}`} aria-label={chrome.a11y.progress}>
        {chrome.percent(0)}
      </span>
    </div>
  );
}
