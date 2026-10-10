"use client";

import { useMotionValue, useTransform } from "motion/react";

import { PRUNE } from "@/scroll/script";

import { branchDropX, branchDropY, branchTurn, cutBranchOpacity, gardenerX, orangeFrame, stillBranchOpacity } from "./fall-plan";
import { Plate, type PlateReveal } from "./plate";
import { OVER_COLUMN, OVER_TREE, useGardenerLife } from "./prune-art";
import { trimmedScale } from "./prune-plan";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The old picture leaves where the ring has passed; the orchard shows only inside it. */
const OLD: PlateReveal = { transition: "ring", side: "outside" };
const ORCHARD: PlateReveal = { transition: "ring", side: "inside" };

/**
 * Scene 10, the falling orange (`fall-plan.ts`, timings in `FALL`). It opens on the gardener's
 * picture exactly as the prune scene leaves it (the branch already trimmed, the shears open, so the second arm frame is not drawn). The
 * branch is cut and drops, the gardener drifts right and out of frame, and the orange falls from
 * the branch with the camera following until it fills the center. Then the rainbow ring (the `ring`
 * transition) sweeps out from the orange: the old picture is cut away outside the ring and the
 * orchard rows (left and right, two depths each, sky between them) show only inside it, while the
 * orange, with no reveal, stays in front throughout, goes soft and keeps falling. All scrubbed by
 * progress, so it plays backwards exactly.
 */
export function FallArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const trimmed = trimmedScale(PRUNE.trim[1]);
  const still = useTransform(progress, stillBranchOpacity);
  const cut = useTransform(progress, cutBranchOpacity);
  const dropX = useTransform(progress, branchDropX);
  const dropY = useTransform(progress, branchDropY);
  const turn = useTransform(progress, branchTurn);
  const drift = useTransform(progress, gardenerX);
  const gardener = useGardenerLife();
  // The prune's words are still sinking away as the scene opens: the same haze as there, so nothing pops.
  const haze = useTextHaze(OVER_COLUMN, { strength: 0.85, stackedOnly: true });
  const treeHaze = useTextHaze(OVER_TREE, { strength: 0.8, union: true });

  const orangeX = useTransform(progress, (p) => orangeFrame(p).x);
  const orangeY = useTransform(progress, (p) => orangeFrame(p).y);
  const orangeScale = useTransform(progress, (p) => orangeFrame(p).scale);
  const orangeTurn = useTransform(progress, (p) => orangeFrame(p).rotate);
  const orangeBlur = useTransform(progress, (p) => orangeFrame(p).blur);
  const orangeOpacity = useTransform(progress, (p) => orangeFrame(p).opacity);

  return (
    <>
      <Plate id="hero/sky" />

      {/* The orchard: shown only inside the ring. */}
      <Plate id="fall/trees-left-far" reveal={ORCHARD} />
      <Plate id="fall/trees-right-far" reveal={ORCHARD} />
      <Plate id="fall/trees-left-near" reveal={ORCHARD} />
      <Plate id="fall/trees-right-near" reveal={ORCHARD} />

      {/* The gardener's picture, as the prune scene leaves it; cut away outside the ring. */}
      <Plate id="prune/column" reveal={OLD} clearing={haze} />
      <Plate id="prune/urn" reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/tree" reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/branch-left" scale={trimmed} reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/branch-right" opacity={still} reveal={OLD} clearing={treeHaze} />
      <Plate id="fall/branch-cut" opacity={cut} x={dropX} y={dropY} rotate={turn} sway={false} reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/gardener" x={drift} reveal={OLD} life={gardener} clearing={haze} />
      <Plate id="prune/gardener-arms-1" x={drift} layer={1} reveal={OLD} ride={gardener.ride("prune/gardener-arms-1")} clearing={haze} />

      {/* The orange: no reveal, so it stays in front while the ring sweeps past it. */}
      <Plate
        id="fall/falling-orange"
        position={[0, 0]}
        x={orangeX}
        y={orangeY}
        scale={orangeScale}
        rotate={orangeTurn}
        blur={orangeBlur}
        opacity={orangeOpacity}
        layer={30}
        sway={false}
      />
    </>
  );
}
