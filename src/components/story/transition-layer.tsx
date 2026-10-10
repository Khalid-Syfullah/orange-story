"use client";

import * as React from "react";
import type { MotionValue } from "motion/react";

import { TRANSITIONS } from "@/scroll/script";

/**
 * The transition canvas, above the scene plates: the covering transitions (sand, unfold, dust, ring,
 * fabric) draw here. It is visible only while one of them runs; `data-transition` names it. Written
 * straight to the DOM from progress, no React state. The effects themselves arrive in phase 5.
 */

const CANVAS_TRANSITIONS = TRANSITIONS.filter((t) => t.layer === "canvas");

function activeId(p: number): string {
  for (const t of CANVAS_TRANSITIONS) if (p >= t.start && p < t.end) return t.id;
  return "";
}

export function TransitionLayer({ progress }: { progress: MotionValue<number> }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const update = (p: number) => {
      const id = activeId(p);
      if ((layer.dataset.transition ?? "") === id) return;
      layer.dataset.transition = id;
      layer.style.visibility = id ? "visible" : "hidden";
    };
    update(progress.get());
    return progress.on("change", update);
  }, [progress]);

  return (
    <div ref={ref} aria-hidden data-layer="transitions" className="pointer-events-none absolute inset-0" style={{ visibility: "hidden" }}>
      <canvas className="block size-full" />
    </div>
  );
}
