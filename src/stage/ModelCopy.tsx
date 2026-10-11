"use client";
// The Model's copy layer (docs/COPY.md, Chapter 1). Two beats have words: over the grove, the
// title and subtitle "We get you found."; over the share still, the title "We split the harvest.",
// the tag "Revenue share" and the typed line, typed character by character by local progress with
// a blinking caret that stops when the line completes. Every piece ramps in over 60 scroll units
// (the title 12 units ahead of the rest) and out before the next beat; the windows are in
// passes/model/timeline.ts, shared with the picture. Text is DOM, never WebGL.
import { useCallback, useRef } from "react";
import { model } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import {
  COPY_WINDOWS,
  copyAlpha,
  modelUnits,
  TITLE_LEAD,
  typedProgress,
} from "./passes/model/timeline";
import styles from "./ModelCopy.module.css";

/** How far a piece lifts as it arrives and leaves (px). */
const LIFT = 14;

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ opacity: "", transform: "", visibility: "" });

/** Write opacity, a lift and visibility to an element, touching the DOM only when they change. */
function write(el: HTMLElement | null, last: Written, alpha: number, units: number, window: { in: number; out: number }, lead: number) {
  if (!el) return;
  // Rising: lifts up into place over the ramp; leaving: lifts away.
  const arriving = 1 - Math.min(1, Math.max(0, (units - (window.in - lead)) / 60));
  const leaving = Math.min(1, Math.max(0, (units - (window.out - lead)) / 60));
  const lift = arriving * LIFT - leaving * LIFT;
  const next: Written = {
    opacity: alpha.toFixed(3),
    transform: `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

export function ModelCopy() {
  const groveTitle = useRef<HTMLHeadingElement>(null);
  const groveSub = useRef<HTMLParagraphElement>(null);
  const shareTitle = useRef<HTMLHeadingElement>(null);
  const shareTag = useRef<HTMLSpanElement>(null);
  const shareLine = useRef<HTMLParagraphElement>(null);
  const typedRef = useRef<HTMLSpanElement>(null);
  const untypedRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const written = useRef({
    groveTitle: blank(),
    groveSub: blank(),
    shareTitle: blank(),
    shareTag: blank(),
    shareLine: blank(),
  });
  const shown = useRef(-1);

  const onFrame = useCallback((f: FrameCtx) => {
    const x = modelUnits(f.p);
    const w = written.current;
    const g = COPY_WINDOWS.grove;
    const s = COPY_WINDOWS.share;

    write(groveTitle.current, w.groveTitle, copyAlpha(g, x, TITLE_LEAD), x, g, TITLE_LEAD);
    write(groveSub.current, w.groveSub, copyAlpha(g, x, 0), x, g, 0);
    write(shareTitle.current, w.shareTitle, copyAlpha(s, x, TITLE_LEAD), x, s, TITLE_LEAD);
    write(shareTag.current, w.shareTag, copyAlpha(s, x, 0), x, s, 0);
    write(shareLine.current, w.shareLine, copyAlpha(s, x, 0), x, s, 0);

    // The typed line: a character count from local progress, so scrubbing back untypes it.
    const line = model.share.typed;
    const count = Math.round(typedProgress(x) * line.length);
    if (count !== shown.current) {
      shown.current = count;
      if (typedRef.current) typedRef.current.textContent = line.slice(0, count);
      if (untypedRef.current) untypedRef.current.textContent = line.slice(count);
      if (caretRef.current) caretRef.current.dataset.done = count >= line.length ? "true" : "false";
    }
  }, []);
  useFrame(onFrame);

  const share = model.share;
  return (
    <div className={`on-milk ${styles.model}`}>
      <section className={styles.beat} aria-label={model.grove.title}>
        <h2 ref={groveTitle} className={`display-l ${styles.piece} ${styles.title}`}>
          {model.grove.title}
        </h2>
        <p ref={groveSub} className={`lead ${styles.piece} ${styles.subtitle}`}>
          {model.grove.subtitle}
        </p>
      </section>

      <section className={styles.beat} aria-label={share.title}>
        <h2 ref={shareTitle} className={`display-l ${styles.piece} ${styles.title}`}>
          {share.title}
        </h2>
        <span ref={shareTag} className={`tag ${styles.piece} ${styles.tag}`}>
          {share.tag}
        </span>
        <p ref={shareLine} className={`lead ${styles.piece} ${styles.typed}`}>
          <span className="sr-only">{share.typed}</span>
          <span aria-hidden="true">
            <span ref={typedRef} />
            <span ref={caretRef} className={styles.caret} data-done="false" />
            <span ref={untypedRef} className={styles.untyped}>
              {share.typed}
            </span>
          </span>
        </p>
      </section>
    </div>
  );
}
