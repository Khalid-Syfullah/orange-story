"use client";
// The terms copy (docs/COPY.md, Chapter 3): the terms block title and body in column B beside the
// panel, the tag "In plain terms" and the side text below them, ink on paper. Every piece ramps in
// over 60 scroll units with the panel's retreat, the title 12 units ahead, and is fully in as the
// window lands; positions come from passes/terms/timeline.ts (the panel's own geometry, written as
// CSS variables once per frame size), so the column always sits beside the panel. The copy is under
// the burn and goes with the paper: each piece leaves as the close's char band reaches where it sits
// (passes/coda/timeline.ts burnSurvival, the same front the shader burns along), the pieces nearest
// the bottom left first. Text is DOM, never WebGL.
import { useCallback, useRef } from "react";
import { terms } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import { burnSurvival, type Point2 } from "./passes/coda/timeline";
import { copyAlpha, copyNear, TERMS_TUNE, termsLayout, type TermsLayout } from "./passes/terms/timeline";
import styles from "./TermsCopy.module.css";

/**
 * Where a piece sits on screen (uv, y down) for the burn: a point a quarter in from its left and
 * most of the way down, the part the front from the bottom left reaches first. Offsets are relative
 * to the column, which is positioned by the layout.
 */
function pieceAt(el: HTMLElement | null, L: TermsLayout, css: readonly [number, number]): Point2 {
  if (!el) return { x: 0.5, y: 0.5 };
  return {
    x: (L.copy.left + el.offsetLeft + 0.25 * el.offsetWidth) / css[0],
    y: (L.copy.top + el.offsetTop + 0.8 * el.offsetHeight) / css[1],
  };
}

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
  const points = useRef<{ key: string; title: Point2; body: Point2; tag: Point2; side: Point2 } | null>(null);

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
      points.current = null;
    }
    const near = copyNear(f.p);
    const w = written.current;
    let title = near ? copyAlpha(f.p, TERMS_TUNE.titleLead) : 0;
    let body = near ? copyAlpha(f.p, 0) : 0;
    let tag = body;
    let side = body;
    if (near && f.segment.id === "close") {
      // Under the burn: measured once per frame size, on the first frame of the close (the fonts
      // have long settled by then), from the laid-out pieces.
      const pk = `${key}|close`;
      if (!points.current || points.current.key !== pk) {
        const L = termsLayout(f.css);
        points.current = {
          key: pk,
          title: pieceAt(titleRef.current, L, f.css),
          body: pieceAt(bodyRef.current, L, f.css),
          tag: pieceAt(tagRef.current, L, f.css),
          side: pieceAt(sideRef.current, L, f.css),
        };
      }
      const pt = points.current;
      title *= burnSurvival(pt.title, f.p, f.css);
      body *= burnSurvival(pt.body, f.p, f.css);
      tag *= burnSurvival(pt.tag, f.p, f.css);
      side *= burnSurvival(pt.side, f.p, f.css);
    }
    write(titleRef.current, w.title, title);
    write(bodyRef.current, w.body, body);
    write(tagRef.current, w.tag, tag);
    write(sideRef.current, w.side, side);
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
