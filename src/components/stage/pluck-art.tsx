"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { foliageAt, handAt, harvesterAt, heroOrangeAt } from "./pluck-harvest";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";

/**
 * Scene 4, the pluck and the harvester. Everything is a function of the story progress
 * (`pluck-harvest.ts`, timings in `PLUCK`), so it plays backwards exactly.
 *
 * - The scene starts as the graft ended: the fruiting tree, the foliage plates in three depths.
 * - A hand rises from the bottom center to the one special orange and closes on it.
 * - The camera dollies down (camera script); the hand pulls the fruit free and carries it with the
 *   camera while the near and middle foliage fall away behind.
 * - The harvester (white robe; body, right arm holding an orange, head) is revealed; the hand lets
 *   go and the fruit becomes the one in his hand (his arm arrives with it), his gaze on it.
 */
export function PluckArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const foliage = useTransform(progress, foliageAt);
  const nearOpacity = useTransform(foliage, (f) => f.near.opacity);
  const nearScale = useTransform(foliage, (f) => f.near.scale);
  const midOpacity = useTransform(foliage, (f) => f.mid.opacity);

  const orange = useTransform(progress, heroOrangeAt);
  const orangeX = useTransform(orange, (o) => o.x);
  const orangeY = useTransform(orange, (o) => o.y);
  const orangeR = useTransform(orange, (o) => o.rotate);
  const orangeS = useTransform(orange, (o) => o.scale);
  const orangeO = useTransform(orange, (o) => o.opacity);

  const hand = useTransform(progress, handAt);
  const handX = useTransform(hand, (h) => h.x);
  const handY = useTransform(hand, (h) => h.y);
  const handSX = useTransform(hand, (h) => h.scaleX);
  const handSY = useTransform(hand, (h) => h.scaleY);
  const handR = useTransform(hand, (h) => h.rotate);
  const handO = useTransform(hand, (h) => h.opacity);

  const harvester = useTransform(progress, harvesterAt);
  const harvesterO = useTransform(harvester, (h) => h.opacity);
  const harvesterY = useTransform(harvester, (h) => h.rise);
  const armO = useTransform(harvester, (h) => h.arm);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" />
      <Plate id="pluck/foliage-mid" opacity={midOpacity} />
      <Plate id="pluck/harvester-body" y={harvesterY} opacity={harvesterO} />
      <Plate id="pluck/harvester-head" y={harvesterY} opacity={harvesterO} />
      <Plate id="pluck/harvester-arm" y={harvesterY} opacity={armO} />
      <Plate id="pluck/hero-orange" x={orangeX} y={orangeY} rotate={orangeR} scale={orangeS} opacity={orangeO} />
      <Plate id="pluck/hand" x={handX} y={handY} scaleX={handSX} scaleY={handSY} rotate={handR} opacity={handO} />
      <Plate id="pluck/foliage-near" opacity={nearOpacity} scale={nearScale} />
    </>
  );
}
