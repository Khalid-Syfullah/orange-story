"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { useStacked } from "@/lib/use-stacked";

import { figureOffset, sinkDepth } from "./apply-plan";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { StarEdges } from "./star-edges";
import { useStageProgress } from "./stage-context";
import { constellation, starReveal, starsDim } from "./stars-plan";
import { Twinkle } from "./twinkle";
import { useTextHaze } from "./use-text-haze";

/** The form: on a phone the stargazer's cloud sits behind it, and thins out of its way. */
const OVER_CLOUD = ["apply-form"] as const;

/**
 * Scene 13, the application. The same sky as the stargazer scene: the finished constellation
 * (reused from `stars-plan.ts`, twinkling on idle time), the cloud, and the astronomer on his
 * platform, who steps down the frame (`apply-plan.ts`) so the application text at the top left sits
 * in clear sky (on a phone he sinks out of the frame: the text and the form fill it). The stars and
 * their lines recede while the application is up (`starsDim`), so they never compete with its words.
 * The form itself is DOM (`src/components/story/apply-form.tsx`), with its glowing orb behind it.
 */
export function ApplyArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(1);
  const progress = stage ?? none;
  const reveal = useTransform(progress, starReveal);
  // The constellation recedes behind the application's words and form.
  const dim = useTransform(progress, starsDim);
  const clear = useTextHaze(OVER_CLOUD, { mode: "clear", stackedOnly: true });
  const depth = sinkDepth(useStacked());
  const sink = useTransform(progress, (p) => figureOffset(p, depth));
  const { nodes } = React.useMemo(() => constellation(), []);

  return (
    <>
      <Plate id="hero/sky" />
      <Twinkle sprite="stars/star" points={nodes} reveal={reveal} opacity={dim} additive layer={1} name="constellation" />
      <StarEdges layer={2} opacity={dim} />
      <Plate id="stars/cloud" layer={3} clearing={clear} />
      <Plate id="stars/platform" layer={4} y={sink} />
      <Plate id="stars/astronomer" layer={5} y={sink} />
    </>
  );
}
