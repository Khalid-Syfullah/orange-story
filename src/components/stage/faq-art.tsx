"use client";

import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useTextHaze } from "./use-text-haze";

/** "Questions worth asking first." stands at the top, between the rows. */
const OVER_ROWS = ["questions-title"] as const;

/**
 * Scene 11, the questions: the orchard the fall scene ended in (the same four rows, at their
 * manifest places), the camera climbing between them (camera script). The question cards and their
 * connector line are DOM (`question-deck.tsx`), fixed on oranges of the near rows. Where the rows'
 * fruit reaches in behind the section title at the top, it recedes into the sky's haze while the
 * title is up, so the title never sits on bright fruit.
 */
export function FaqArt({ scene }: SceneArtProps) {
  void scene;
  const haze = useTextHaze(OVER_ROWS, { strength: 0.85 });
  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="fall/trees-left-far" clearing={haze} />
      <Plate id="fall/trees-right-far" clearing={haze} />
      <Plate id="fall/trees-left-near" clearing={haze} />
      <Plate id="fall/trees-right-near" clearing={haze} />
    </>
  );
}
