"use client";
// The terms copy (docs/COPY.md, Chapter 3): the terms block title and body in column B beside the
// panel, the tag "In plain terms" and the side text below them, ink on paper. Every piece ramps in
// over 60 scroll units with the panel's retreat, the title 12 units ahead, and is fully in as the
// window lands; positions come from passes/terms/timeline.ts (the panel's own geometry, written as
// CSS variables once per frame size), so the column always sits beside the panel. Until the close
// burns it with the paper (phase 10) the copy leaves over the close's first 60 units. Text is DOM,
// never WebGL.
import { useCallback, useRef } from "react";
import { terms } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import { copyAlpha, copyNear, TERMS_TUNE, termsLayout } from "./passes/terms/timeline";
import styles from "./TermsCopy.module.css";

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

export function TermsCopy() {
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const sideRef = useRef<HTMLParagraphElement>(null);
  const written = useRef({ title: blank(), body: blank(), tag: blank(), side: blank() });
  const sizeKey = useRef("");

  const onFrame = useCallback((f: FrameCtx) => {
    const root = rootRef.current;
    if (!root) return;
    const key = `${f.css[0]}x${f.css[1]}`;
    if (sizeKey.current !== key) {
      sizeKey.current = key;
      const L = termsLayout(f.css);
      root.style.setProperty("--terms-left", `${L.copy.left.toFixed(1)}px`);
      root.style.setProperty("--terms-top", `${L.copy.top.toFixed(1)}px`);
      root.style.setProperty("--terms-width", `${L.copy.width.toFixed(1)}px`);
      root.style.setProperty("--terms-height", `${L.copy.minHeight.toFixed(1)}px`);
      root.dataset.stacked = L.stacked ? "true" : "false";
    }
    const near = copyNear(f.p);
    const w = written.current;
    const title = near ? copyAlpha(f.p, TERMS_TUNE.titleLead) : 0;
    const rest = near ? copyAlpha(f.p, 0) : 0;
    write(titleRef.current, w.title, title);
    write(bodyRef.current, w.body, rest);
    write(tagRef.current, w.tag, rest);
    write(sideRef.current, w.side, rest);
  }, []);
  useFrame(onFrame);

  return (
    <section ref={rootRef} className={`on-paper ${styles.terms}`} aria-label={terms.chapter.label} data-stacked="false">
      <div className={styles.column}>
        <div className={styles.head}>
          <h2 ref={titleRef} className={`display-l ${styles.piece} ${styles.title}`}>
            {terms.block.title}
          </h2>
          <p ref={bodyRef} className={`lead ${styles.piece} ${styles.body}`}>
            {terms.block.body}
          </p>
        </div>
        <div className={styles.foot}>
          <span ref={tagRef} className={`tag ${styles.piece}`}>
            {terms.block.tag}
          </span>
          <p ref={sideRef} className={`body ${styles.piece} ${styles.side}`}>
            {terms.block.side}
          </p>
        </div>
      </div>
    </section>
  );
}
