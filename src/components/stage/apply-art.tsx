"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { figureOffset } from "./apply-plan";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { StarEdges } from "./star-edges";
import { useStageProgress } from "./stage-context";
import { constellation, starReveal } from "./stars-plan";
import { Twinkle } from "./twinkle";

/**
 * Scene 13, the application. The same sky as the stargazer scene: the finished constellation
 * (reused from `stars-plan.ts`, twinkling on idle time), the cloud, and the astronomer on his
 * platform, who steps down the frame (`apply-plan.ts`) so the application text at the top left sits
 * in clear sky. The form itself is DOM (`src/components/story/apply-form.tsx`), with its glowing
 * orb behind it.
 */
export function ApplyArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(1);
  const progress = stage ?? none;
  const reveal = useTransform(progress, starReveal);
  const sink = useTransform(progress, figureOffset);
  const { nodes } = React.useMemo(() => constellation(), []);

  return (
    <>
      <Plate id="hero/sky" />
      <Twinkle sprite="stars/star" points={nodes} reveal={reveal} additive layer={1} name="constellation" />
      <StarEdges layer={2} />
      <Plate id="stars/cloud" layer={3} />
      <Plate id="stars/platform" layer={4} y={sink} />
      <Plate id="stars/astronomer" layer={5} y={sink} />
    </>
  );
}
