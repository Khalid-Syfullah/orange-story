"use client";
// The Work's copy layer (docs/COPY.md, Chapter 2): three cards in column B, each pinned to a plate
// y position (card 1 in the sky, card 2 at the orange's shoulder, card 3 beside the blueprint) so it
// arrives with the part of the painting it sits beside. A card travels at 0.6x the plate's speed;
// each ramps in over 60 scroll units, the title (with its tag and panel) 12 units ahead of the body,
// and leaves as it passes the top of the frame. Positions and windows come from
// passes/work/timeline.ts, the same numbers the picture uses. Text is DOM, never WebGL.
import { useCallback, useRef } from "react";
import { work } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import {
  CARD_ANCHORS,
  cardScreenY,
  cardWindows,
  rampIn,
  rampOut,
  WORK_TUNE,
  workUnits,
  type CardWindow,
} from "./passes/work/timeline";
import styles from "./WorkCopy.module.css";

/** How far a piece lifts as it arrives and leaves (px). */
const LIFT = 14;

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ opacity: "", transform: "", visibility: "" });

function write(el: HTMLElement | null, last: Written, alpha: number, lift: number) {
  if (!el) return;
  const next: Written = {
    opacity: alpha.toFixed(3),
    transform: lift === 0 ? "" : `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

interface CardRefs {
  root: HTMLElement | null;
  panel: HTMLElement | null;
  tag: HTMLElement | null;
  title: HTMLElement | null;
  body: HTMLElement | null;
}

export function WorkCopy() {
  const cards = useRef<CardRefs[]>(work.cards.map(() => ({ root: null, panel: null, tag: null, title: null, body: null })));
  const written = useRef(work.cards.map(() => ({ panel: blank(), tag: blank(), title: blank(), body: blank(), y: "" })));
  const windows = useRef<{ key: string; list: CardWindow[] }>({ key: "", list: [] });

  const onFrame = useCallback((f: FrameCtx) => {
    const key = `${f.css[0]}x${f.css[1]}`;
    if (windows.current.key !== key) windows.current = { key, list: cardWindows(f.css) };
    const x = workUnits(f.p);
    const t = Math.min(1, Math.max(0, f.t));
    // Only while the chapter (and its neighbours' ramps) are near: the cards are hidden elsewhere.
    const near = x > -100 && x < 1700;
    for (let i = 0; i < cards.current.length; i++) {
      const refs = cards.current[i];
      const w = written.current[i];
      const win = windows.current.list[i];
      if (!refs.root || !win) continue;
      const out = near ? rampOut(x, win.outAt) : 0;
      const titleIn = near ? rampIn(x, win.inAt) : 0;
      const bodyIn = near ? rampIn(x, win.inAt + WORK_TUNE.cardLead) : 0;
      const arriving = 1 - titleIn;
      const leaving = 1 - out;
      const lift = arriving * LIFT - leaving * LIFT;
      write(refs.panel, w.panel, titleIn * out, 0);
      write(refs.tag, w.tag, titleIn * out, lift);
      write(refs.title, w.title, titleIn * out, lift);
      write(refs.body, w.body, bodyIn * out, lift);
      // Pinned to its plate y, at 0.6x the plate's speed; the card's centre sits on that y.
      const y = `translate3d(0, ${(cardScreenY(CARD_ANCHORS[i], t, f.css) * f.css[1]).toFixed(1)}px, 0) translateY(-50%)`;
      if (w.y !== y) refs.root.style.transform = w.y = y;
    }
  }, []);
  useFrame(onFrame);

  return (
    <div className={`on-sky ${styles.work}`}>
      {work.cards.map((card, i) => (
        <article
          key={card.title}
          ref={(el) => {
            cards.current[i].root = el;
          }}
          className={styles.card}
          aria-label={card.title}
        >
          <span
            ref={(el) => {
              cards.current[i].panel = el;
            }}
            className={styles.panel}
            aria-hidden="true"
          />
          <span
            ref={(el) => {
              cards.current[i].tag = el;
            }}
            className={`tag ${styles.piece} ${styles.tag}`}
          >
            {card.tag}
          </span>
          <h3
            ref={(el) => {
              cards.current[i].title = el;
            }}
            className={`title ${styles.piece} ${styles.title}`}
          >
            {card.title}
          </h3>
          <p
            ref={(el) => {
              cards.current[i].body = el;
            }}
            className={`body ${styles.piece} ${styles.body}`}
          >
            {card.body}
          </p>
        </article>
      ))}
    </div>
  );
}
