"use client";
// The hero copy layer: title, subtitle and button in the open sky, the tag and paragraph in the
// lower left, positioned by the layout tokens in src/app/globals.css. Text is DOM, never WebGL.
//
// The copy comes in as the painting finishes printing (driven by the same print-in progress as the
// shader's treatments, so nothing switches on) and leaves over the first third of the bridge, the
// paragraph leading the title by 12 scroll units. The button scrolls to the application segment;
// the button and a click on the canvas both fire the signal ring.
import { useCallback, useEffect, useRef } from "react";
import { hero } from "@/content/copy";
import { PillButton } from "@/ui/primitives";
import type { FrameCtx } from "./frame";
import { useFrame, useStage } from "./hub";
import { fireRing, heroIntro, markHeroReady } from "./passes/hero/events";
import { SCROLL_UNIT, segment } from "./script";
import styles from "./HeroCopy.module.css";

/** The paragraph leaves this far (in scroll units) before the title. */
const PARAGRAPH_LEAD = 12;
/** How far the copy lifts as it leaves (px). */
const LIFT = 16;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}

function write(el: HTMLElement | null, last: Written, opacity: number, lift: number) {
  if (!el) return;
  const next: Written = {
    opacity: opacity.toFixed(3),
    transform: `translate3d(0, ${(-lift).toFixed(2)}px, 0)`,
    visibility: opacity < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

export function HeroCopy() {
  const hub = useStage();
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const lowRef = useRef<HTMLDivElement>(null);
  const topWritten = useRef<Written>({ opacity: "", transform: "", visibility: "" });
  const lowWritten = useRef<Written>({ opacity: "", transform: "", visibility: "" });
  const lowTop = useRef("");

  const onFrame = useCallback(
    (f: FrameCtx) => {
      // The hero loop has real pixels: the print-in may begin (the pass reads this).
      if (hub.engine?.textures?.loop("hero").ready) markHeroReady();

      const bridge = segment("bridge");
      const third = (bridge.end - bridge.start) / 3;
      const lead = PARAGRAPH_LEAD * SCROLL_UNIT;
      // Title group: [bridge.start + lead, bridge.start + third]; paragraph group a lead earlier.
      const outTitle = smooth(bridge.start + lead, bridge.start + third, f.p);
      const outLow = smooth(bridge.start, bridge.start + third - lead, f.p);

      // In: with the print-in. Without WebGL, or when the stage opened past the hero and the hero
      // pass has not drawn yet, the copy is simply there; a pass that never runs gets a short wait.
      const intro = f.glOff || f.segment.id !== "hero" ? 1 : heroIntro();
      const failSafe = smooth(3.5, 4.5, f.time);
      const inTitle = Math.max(smooth(0.55, 1, intro), failSafe);
      const inLow = Math.max(smooth(0.7, 1, intro), failSafe);

      // The paragraph sits right under the title block, wherever the block ends at this size; on a
      // tall phone it stacks at the foot of the page instead (the stylesheet).
      const top = topRef.current;
      const low = lowRef.current;
      if (top && low && f.band >= 0.999 && f.frame % 15 === 0) {
        const at = `${Math.round(top.offsetTop + top.offsetHeight + 12)}px`;
        if (lowTop.current !== at) low.style.top = lowTop.current = at;
      }
      write(topRef.current, topWritten.current, inTitle * (1 - outTitle), outTitle * LIFT + (1 - inTitle) * 10);
      write(lowRef.current, lowWritten.current, inLow * (1 - outLow), outLow * LIFT + (1 - inLow) * 10);
    },
    [hub],
  );
  useFrame(onFrame);

  // A click on the canvas fires the ring while the hero is on screen.
  useEffect(() => {
    const canvas = rootRef.current?.closest(".pin")?.querySelector<HTMLCanvasElement>("canvas.gl");
    if (!canvas) return;
    const onClick = () => {
      if ((hub.last?.p ?? 0) < segment("hero").end) fireRing();
    };
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [hub]);

  const start = () => {
    fireRing();
    hub.scrollToSegment("application");
  };

  return (
    <div ref={rootRef} className={styles.hero}>
      <div ref={topRef} className={styles.top}>
        <h1 className={`display-xl ${styles.title}`}>{hero.title}</h1>
        <p className={`lead ${styles.subtitle}`}>{hero.subtitle}</p>
        <PillButton className={styles.button} onClick={start}>
          {hero.button}
        </PillButton>
      </div>
      <div ref={lowRef} className={styles.low}>
        <span className={`tag ${styles.tag}`}>{hero.tag}</span>
        <p className={`body ${styles.paragraph}`}>{hero.paragraph}</p>
      </div>
    </div>
  );
}
