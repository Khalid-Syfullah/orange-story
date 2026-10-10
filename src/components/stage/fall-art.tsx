"use client";

import { useMotionValue, useTransform } from "motion/react";

import { BALL_ANCHOR, cutBranchAt, cutShake, fallArmsTurn, fallShearsClosed, gardenerX, orangeFrame, RELEASE_KICK, stillBranchOpacity } from "./fall-plan";
import { Plate, type PlateReveal } from "./plate";
import { OVER_COLUMN, OVER_TREE, useGardenerLife } from "./prune-art";
import { onTree } from "./prune-plan";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The old picture leaves where the ring has passed; the orchard shows only inside it. */
const OLD: PlateReveal = { transition: "ring", side: "outside" };
const ORCHARD: PlateReveal = { transition: "ring", side: "inside" };

/** The cut branch is drawn about its middle, where it turns as it falls. */
const MIDDLE: readonly [number, number] = [0.5, 0.5];

/**
 * Scene 10, the falling orange (`fall-plan.ts`, timings in `FALL`, the flight in `FALL_FLIGHT`). It
 * opens on the gardener's picture exactly as the prune scene leaves it. As the camera comes to his
 * face he raises his shears to the foot of the branch with the orange and squeezes them shut: the
 * branch comes free and falls, tumbling, and the tree springs back; he lowers the shears, bows his
 * head after the fruit and drifts right and out of frame. The orange falls in a true flight, the
 * camera following and pushing in until it fills the center; it strikes the sky as if it were water,
 * pressed flat, and the rainbow ring (the `ring` transition) sweeps out from it: the old picture is
 * cut away outside the ring and the orchard rows (left and right, two depths each, sky between them)
 * show only inside it, while the orange, with no reveal, stays in front throughout, goes soft and
 * sinks. All scrubbed by progress, so it plays backwards exactly.
 */
export function FallArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const still = useTransform(progress, stillBranchOpacity);
  const cut = useTransform(progress, cutBranchAt);
  const cutX = useTransform(cut, (b) => b.x);
  const cutY = useTransform(cut, (b) => b.y);
  const cutTurn = useTransform(cut, (b) => b.rotate);
  const cutOpacity = useTransform(cut, (b) => b.opacity);
  const shake = useTransform(progress, cutShake);
  // The tree springs back as the branch comes off, the other branch riding it and swinging more.
  const treeTurn = useTransform(shake, (k) => RELEASE_KICK.tree * k);
  const leftX = useTransform(treeTurn, (a) => onTree("prune/branch-left", a).x);
  const leftY = useTransform(treeTurn, (a) => onTree("prune/branch-left", a).y);
  const leftTurn = useTransform(shake, (k) => (RELEASE_KICK.tree + RELEASE_KICK.branch) * k);
  const drift = useTransform(progress, gardenerX);
  const armsTurn = useTransform(progress, fallArmsTurn);
  const closed = useTransform(progress, fallShearsClosed);
  const open = useTransform(closed, (c) => 1 - c);
  const gardener = useGardenerLife();
  // The prune's words are still sinking away as the scene opens: the same haze as there, so nothing pops.
  const haze = useTextHaze(OVER_COLUMN, { strength: 0.85, stackedOnly: true });
  const treeHaze = useTextHaze(OVER_TREE, { strength: 0.8, union: true });

  const orange = useTransform(progress, orangeFrame);
  const orangeX = useTransform(orange, (o) => o.x);
  const orangeY = useTransform(orange, (o) => o.y);
  const orangeScaleX = useTransform(orange, (o) => o.scaleX);
  const orangeScaleY = useTransform(orange, (o) => o.scaleY);
  const orangeTurn = useTransform(orange, (o) => o.rotate);
  const orangeBlur = useTransform(orange, (o) => o.blur);
  const orangeOpacity = useTransform(orange, (o) => o.opacity);
  const scale = orangeFrame(0).scale;

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
      <Plate id="prune/tree" rotate={treeTurn} reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/branch-left" x={leftX} y={leftY} rotate={leftTurn} reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/branch-right" opacity={still} reveal={OLD} clearing={treeHaze} />
      <Plate id="fall/branch-cut" position={[0, 0]} anchor={MIDDLE} opacity={cutOpacity} x={cutX} y={cutY} rotate={cutTurn} sway={false} reveal={OLD} clearing={treeHaze} />
      <Plate id="prune/gardener" x={drift} reveal={OLD} life={gardener} clearing={haze} />
      <Plate id="prune/gardener-arms-1" x={drift} rotate={armsTurn} opacity={open} layer={1} reveal={OLD} ride={gardener.ride("prune/gardener-arms-1")} clearing={haze} />
      <Plate id="prune/gardener-arms-2" x={drift} rotate={armsTurn} opacity={closed} layer={2} reveal={OLD} ride={gardener.ride("prune/gardener-arms-2")} clearing={haze} />

      {/* The orange: no reveal, so it stays in front while the ring sweeps past it. */}
      <Plate
        id="fall/falling-orange"
        position={[0, 0]}
        anchor={BALL_ANCHOR}
        x={orangeX}
        y={orangeY}
        scale={scale}
        scaleX={orangeScaleX}
        scaleY={orangeScaleY}
        rotate={orangeTurn}
        blur={orangeBlur}
        opacity={orangeOpacity}
        layer={30}
        sway={false}
      />
    </>
  );
}
