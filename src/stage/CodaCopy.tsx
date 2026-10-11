"use client";
// The coda's copy (docs/COPY.md, Chapter 3): the large chapter title "The Terms" in display-xl in
// column A over the coda's first half, then the fit text, its tag and side text in column B over
// the second half, milk on sky. Each ramps over 60 scroll units (the fit text 12 units ahead of its
// tag and side); the fit copy fades out as the halo grows round the orange, and a glass over the
// column (backdrop-filter, masked to the halo's annulus) blurs the copy behind the halo, fading with
// it. Text is DOM, never WebGL; the halo's geometry comes from passes/coda/timeline.ts, the same
// numbers the shader draws it with.
import { useCallback, useRef } from "react";
import { terms } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import { CODA_TUNE, codaCopyColumn, codaCopyNear, codaFitAlpha, codaTitleAlpha, haloAt } from "./passes/coda/timeline";
import styles from "./CodaCopy.module.css";

/** How far a piece lifts as it arrives (px). */
const LIFT = 14;

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ opacity: "", transform: "", visibility: "" });

function write(el: HTMLElement | null, last: Written, alpha: number) {
  if (!el) return;
  const lift = (1 - alpha) * LIFT;
  const next: Written = {
    opacity: alpha.toFixed(3),
    transform: lift < 0.01 ? "" : `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

export function CodaCopy() {
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const sideRef = useRef<HTMLParagraphElement>(null);
  const glassRef = useRef<HTMLSpanElement>(null);
  const written = useRef({ title: blank(), text: blank(), tag: blank(), side: blank() });
  const glass = useRef({ mask: "", opacity: "" });
  const sizeKey = useRef("");

  const onFrame = useCallback((f: FrameCtx) => {
    const root = rootRef.current;
    if (!root) return;
    // The fit column's place, once per frame size: beside the orange, never across it.
    const key = `${f.css[0]}x${f.css[1]}`;
    if (sizeKey.current !== key) {
      sizeKey.current = key;
      const c = codaCopyColumn(f.css);
      root.style.setProperty("--coda-left", `${c.left.toFixed(1)}px`);
      root.style.setProperty("--coda-width", `${c.width.toFixed(1)}px`);
    }
    const near = codaCopyNear(f.p);
    const w = written.current;
    const title = near ? codaTitleAlpha(f.p) : 0;
    const text = near ? codaFitAlpha(f.p, CODA_TUNE.fitLead) : 0;
    const rest = near ? codaFitAlpha(f.p, 0) : 0;
    write(titleRef.current, w.title, title);
    write(textRef.current, w.text, text);
    write(tagRef.current, w.tag, rest);
    write(sideRef.current, w.side, rest);

    // The glass: the halo's annulus over the column, blurring the copy behind the halo. Its opacity
    // follows the halo's growth and the copy's own alpha, so it fades with the copy (no pop when the
    // copy has gone) and the picture under it is untouched once nothing is left to blur.
    const g = glassRef.current;
    const col = columnRef.current;
    if (!g || !col) return;
    const h = near && text > 0.004 ? haloAt(f.p, f.css) : null;
    const on = h !== null && h.g > 0.001;
    const opacity = on && h ? (h.g * text).toFixed(3) : "0";
    if (on && h) {
      const pad = CODA_TUNE.glassPad;
      const cx = h.x - col.offsetLeft + pad;
      const cy = h.y - col.offsetTop + pad;
      const r0 = h.r * 0.98;
      const mask = `radial-gradient(circle at ${cx.toFixed(0)}px ${cy.toFixed(0)}px, transparent ${r0.toFixed(0)}px, #000 ${(r0 + 12).toFixed(0)}px, #000 ${h.outer.toFixed(0)}px, transparent ${(h.outer + CODA_TUNE.glassFeather).toFixed(0)}px)`;
      if (glass.current.mask !== mask) {
        glass.current.mask = mask;
        g.style.setProperty("-webkit-mask-image", mask);
        g.style.setProperty("mask-image", mask);
      }
    }
    if (glass.current.opacity !== opacity) {
      glass.current.opacity = opacity;
      g.style.opacity = opacity;
      g.style.visibility = opacity === "0" ? "hidden" : "visible";
    }
  }, []);
  useFrame(onFrame);

  return (
    <section ref={rootRef} className={`on-sky ${styles.coda}`} aria-label={terms.chapter.label}>
      <h2 ref={titleRef} className={`display-xl ${styles.piece} ${styles.title}`}>
        {terms.codaTitle}
      </h2>
      <div ref={columnRef} className={styles.column}>
        <p ref={textRef} className={`lead ${styles.piece} ${styles.text}`}>
          {terms.fit.text}
        </p>
        <div className={styles.foot}>
          <span ref={tagRef} className={`tag ${styles.piece}`}>
            {terms.fit.tag}
          </span>
          <p ref={sideRef} className={`body ${styles.piece} ${styles.side}`}>
            {terms.fit.side}
          </p>
        </div>
        <span
          ref={glassRef}
          className={styles.glass}
          style={{ inset: `${-CODA_TUNE.glassPad}px`, backdropFilter: `blur(${CODA_TUNE.glassBlur}px)`, WebkitBackdropFilter: `blur(${CODA_TUNE.glassBlur}px)` }}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
