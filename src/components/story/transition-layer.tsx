"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { MotionValue } from "motion/react";

import { canvasTransitionAt, isCanvasKind } from "@/components/transitions/choreography";
import { TRANSITIONS } from "@/scroll/script";

/**
 * The transition layer, above the scene plates: the covering and sweeping transitions (sand, paper
 * unfold, rising dust, rainbow ring, fabric sky) draw on its canvas (`TransitionCanvas`). The layer
 * is visible only while one of them runs, and `data-transition` names it; both are written straight
 * to the DOM from progress, no React state. The canvas itself renders only while a transition runs.
 * With reduced motion (no live stage) it holds no canvas at all.
 */

const CANVAS_TRANSITIONS = TRANSITIONS.filter((t) => t.layer === "canvas" && isCanvasKind(t.kind));

const TransitionCanvas = dynamic(() => import("@/components/transitions/transition-canvas"), { ssr: false });

export function TransitionLayer({ progress, live }: { progress: MotionValue<number>; live: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const update = (p: number) => {
      const id = canvasTransitionAt(p, CANVAS_TRANSITIONS)?.id ?? "";
      if ((layer.dataset.transition ?? "") === id) return;
      layer.dataset.transition = id;
      layer.style.visibility = id ? "visible" : "hidden";
    };
    update(progress.get());
    return progress.on("change", update);
  }, [progress]);

  return (
    <div ref={ref} aria-hidden data-layer="transitions" className="pointer-events-none absolute inset-0" style={{ visibility: "hidden" }}>
      {live ? <TransitionCanvas progress={progress} transitions={CANVAS_TRANSITIONS} /> : null}
    </div>
  );
}
