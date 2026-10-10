"use client";

import { useMotionValue, useTransform } from "motion/react";

import { Plate } from "./plate";
import { armLean, shearsClosed, trimmedScale } from "./prune-plan";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";

/**
 * Scene 9, the gardener (`prune-plan.ts`, timings in `PRUNE`): blue sky, a minaret-like column with
 * the white marble urn and the young orange tree (small idle sway from the manifest), and the
 * gardener beside it. His arms are two frames, open and closed shears, cross-faded by progress so
 * the shears snip as he trims and reverse exactly. The rising dust that opens the scene is the
 * `dust` transition; the title and the fit text are DOM beats.
 */
export function PruneArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const closed = useTransform(progress, shearsClosed);
  const lean = useTransform(progress, armLean);
  const branch = useTransform(progress, trimmedScale);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="prune/column" />
      <Plate id="prune/urn" />
      <Plate id="prune/tree" />
      <Plate id="prune/branch-left" scale={branch} />
      <Plate id="prune/branch-right" />
      <Plate id="prune/gardener" />
      <Plate id="prune/gardener-arms-1" rotate={lean} layer={1} />
      <Plate id="prune/gardener-arms-2" rotate={lean} opacity={closed} layer={2} />
    </>
  );
}
