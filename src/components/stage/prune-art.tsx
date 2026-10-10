"use client";

import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { gardenerSwayAt } from "./acting";
import { fallHeadAt, fallLeanAt } from "./fall-plan";
import { useFigureLife, type FigureLife, type FigurePart } from "./figure-life";
import { Plate } from "./plate";
import { armTurnAt, onTree, shearsClosed, SNIP_KICK, snipShake } from "./prune-plan";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/**
 * On a phone the gardener and his column stand in the middle, behind the fit text at the bottom:
 * there they recede into the sky's haze while the text is up (a wide screen keeps him beside the
 * text instead).
 */
export const OVER_COLUMN = ["fit"] as const;

/**
 * Framed waist up beside him, his young tree fills the left of the frame, where the docked chapter
 * title and the fit text stand: it recedes into the sky's haze behind both while they are up.
 */
export const OVER_TREE = ["terms-title", "fit"] as const;

/** His arms (both frames of the shears) ride his body. */
const GARDENER_PARTS: readonly FigurePart[] = [{ id: "prune/gardener-arms-1" }, { id: "prune/gardener-arms-2" }];

/**
 * The gardener's life: breathing and small shifts, and his body following the shears, leaning in a
 * little with each snip (`gardenerSwayAt`, scrubbed); in the fall, leaning toward the branch as he
 * reaches up to cut it and bowing his head after the falling fruit (`fall-plan.ts`). His arms ride
 * his body. The prune and the fall draw him with the same life.
 */
export function useGardenerLife(): FigureLife {
  return useFigureLife(plateEntry("prune/gardener"), {
    parts: GARDENER_PARTS,
    acting: (p, _t, _i, out) => {
      out.sway = gardenerSwayAt(p) + fallLeanAt(p);
      out.head = fallHeadAt(p);
    },
  });
}

/**
 * Scene 9, the gardener (`prune-plan.ts`, timings in `PRUNE`): blue sky, a minaret-like column with
 * the white marble urn and the young orange tree (small idle sway from the manifest), and the
 * gardener beside it. His arms turn on the shoulder with each snip; they are two frames, open and
 * closed shears, and the closed one takes over only inside the quick part of the squeeze (and the
 * open one back in the quick part of the opening), in a short cross-fade. Each snip shakes the
 * tree a little. All scrubbed, so it reverses exactly. The rising dust that opens the scene is the
 * `dust` transition; the title and the fit text are DOM beats.
 */
export function PruneArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const closed = useTransform(progress, shearsClosed);
  const open = useTransform(closed, (c) => 1 - c);
  const turn = useTransform(progress, armTurnAt);
  const shake = useTransform(progress, snipShake);
  // The tree turns a little about its foot, its branches riding it, the one he works on turning more.
  const treeTurn = useTransform(shake, (k) => SNIP_KICK.tree * k);
  const leftX = useTransform(treeTurn, (a) => onTree("prune/branch-left", a).x);
  const leftY = useTransform(treeTurn, (a) => onTree("prune/branch-left", a).y);
  const leftTurn = useTransform(shake, (k) => (SNIP_KICK.tree + SNIP_KICK.branch) * k);
  const rightX = useTransform(treeTurn, (a) => onTree("prune/branch-right", a).x);
  const rightY = useTransform(treeTurn, (a) => onTree("prune/branch-right", a).y);
  const haze = useTextHaze(OVER_COLUMN, { strength: 0.85, stackedOnly: true });
  const treeHaze = useTextHaze(OVER_TREE, { strength: 0.8, union: true });
  const life = useGardenerLife();

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="prune/column" clearing={haze} />
      <Plate id="prune/urn" clearing={treeHaze} />
      <Plate id="prune/tree" rotate={treeTurn} clearing={treeHaze} />
      <Plate id="prune/branch-left" x={leftX} y={leftY} rotate={leftTurn} clearing={treeHaze} />
      <Plate id="prune/branch-right" x={rightX} y={rightY} rotate={treeTurn} clearing={treeHaze} />
      <Plate id="prune/gardener" clearing={haze} life={life} />
      <Plate id="prune/gardener-arms-1" rotate={turn} opacity={open} layer={1} clearing={haze} ride={life.ride("prune/gardener-arms-1")} />
      <Plate id="prune/gardener-arms-2" rotate={turn} opacity={closed} layer={2} clearing={haze} ride={life.ride("prune/gardener-arms-2")} />
    </>
  );
}
