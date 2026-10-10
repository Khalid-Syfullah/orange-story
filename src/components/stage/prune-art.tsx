"use client";

import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { gardenerSwayAt } from "./acting";
import { useFigureLife, type FigureLife, type FigurePart } from "./figure-life";
import { Plate } from "./plate";
import { armLean, shearsClosed, trimmedScale } from "./prune-plan";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/**
 * On a phone the gardener's column stands in the middle, behind the fit text at the bottom: there it
 * recedes into the sky's haze while the text is up (a wide screen keeps him beside the text instead).
 */
const OVER_COLUMN = ["fit"] as const;

/** His arms (both frames of the shears) ride his body. */
const GARDENER_PARTS: readonly FigurePart[] = [{ id: "prune/gardener-arms-1" }, { id: "prune/gardener-arms-2" }];

/**
 * The gardener's life: breathing and small shifts, and his body following the shears, leaning in a
 * little with each snip (`gardenerSwayAt`, scrubbed); his arms ride his body. The fall scene draws
 * him with the same life as he drifts away.
 */
export function useGardenerLife(): FigureLife {
  return useFigureLife(plateEntry("prune/gardener"), {
    parts: GARDENER_PARTS,
    acting: (p, _t, _i, out) => {
      out.sway = gardenerSwayAt(p);
    },
  });
}

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
  const haze = useTextHaze(OVER_COLUMN, { strength: 0.85, stackedOnly: true });
  const life = useGardenerLife();

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="prune/column" clearing={haze} />
      <Plate id="prune/urn" clearing={haze} />
      <Plate id="prune/tree" clearing={haze} />
      <Plate id="prune/branch-left" scale={branch} clearing={haze} />
      <Plate id="prune/branch-right" clearing={haze} />
      <Plate id="prune/gardener" clearing={haze} life={life} />
      <Plate id="prune/gardener-arms-1" rotate={lean} layer={1} clearing={haze} ride={life.ride("prune/gardener-arms-1")} />
      <Plate id="prune/gardener-arms-2" rotate={lean} opacity={closed} layer={2} clearing={haze} ride={life.ride("prune/gardener-arms-2")} />
    </>
  );
}
