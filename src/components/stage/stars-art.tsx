"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { astronomerArmAt } from "./acting";
import { useFigureLife, type FigureLife } from "./figure-life";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { StarEdges } from "./star-edges";
import { constellation, starReveal } from "./stars-plan";
import { useStageProgress } from "./stage-context";
import { Twinkle } from "./twinkle";

/**
 * The astronomer's life: breathing and small shifts, and his raised arm settling into the point as
 * the fabric sky clears (`astronomerArmAt`, scrubbed), before the stars grow from his fingertip. The
 * application and the finale draw him with the same life.
 */
export function useAstronomerLife(): FigureLife {
  return useFigureLife(plateEntry("stars/astronomer"), {
    acting: (p, _t, _i, out) => {
      out.arm = astronomerArmAt(p);
    },
  });
}

/**
 * Scene 12, the stargazer (`stars-plan.ts`, timings in `STARS`). After the fabric sky transition
 * clears, the astronomer stands top left on his marble platform (stairs descending toward the
 * viewer), pointing at the sky. White stars grow outward from his fingertip as a graph: nodes
 * appear, some join by thin lines, many just twinkle (idle time). The bottom right is kept clear for
 * the clouds. Stars and lines are scrubbed by progress, so they shrink back when scrolling up.
 */
export function StarsArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  const reveal = useTransform(progress, starReveal);
  const { nodes } = React.useMemo(() => constellation(), []);
  const astronomer = useAstronomerLife();

  return (
    <>
      <Plate id="hero/sky" />
      <Twinkle sprite="stars/star" points={nodes} reveal={reveal} additive layer={1} name="constellation" />
      <StarEdges layer={2} />
      <Plate id="stars/cloud" layer={3} />
      <Plate id="stars/platform" layer={4} />
      <Plate id="stars/astronomer" layer={5} life={astronomer} />
    </>
  );
}
