"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { cuttingAt, fruitAt, knotAt, leftHandAt, rightHandAt, twineAt } from "./graft-hands";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";

/**
 * Scene 3, the graft. Hands, cutting, twine and the three knot frames are separate plates, all
 * functions of the story progress (`graft-hands.ts`, timings in `GRAFT`), so the knot unties and the
 * hands leave again when scrolling back. After the knot the camera pulls out (camera script) and the
 * fruiting tree (the foliage plates with oranges, shared with the next scene) fills in and sways.
 */
export function GraftArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const left = useTransform(progress, leftHandAt);
  const leftX = useTransform(left, (l) => l.x);
  const leftY = useTransform(left, (l) => l.y);
  const leftR = useTransform(left, (l) => l.rotate);
  const right = useTransform(progress, rightHandAt);
  const rightX = useTransform(right, (r) => r.x);
  const rightY = useTransform(right, (r) => r.y);
  const rightR = useTransform(right, (r) => r.rotate);

  const cutting = useTransform(progress, cuttingAt);
  const cuttingX = useTransform(cutting, (c) => c.x);
  const cuttingY = useTransform(cutting, (c) => c.y);
  const cuttingR = useTransform(cutting, (c) => c.rotate);
  const cuttingO = useTransform(cutting, (c) => c.opacity);

  const twine = useTransform(progress, twineAt);
  const twineO = useTransform(twine, (t) => Math.min(1, t * 4));
  const knot = useTransform(progress, knotAt);
  const knot1 = useTransform(knot, (k) => k[0]);
  const knot2 = useTransform(knot, (k) => k[1]);
  const knot3 = useTransform(knot, (k) => k[2]);

  const fruit = useTransform(progress, fruitAt);
  const fruitScale = useTransform(fruit, (f) => 0.9 + 0.1 * f);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" opacity={fruit} scale={fruitScale} />
      <Plate id="pluck/foliage-mid" opacity={fruit} scale={fruitScale} />
      <Plate id="graft/branch" />
      <Plate id="graft/cutting" x={cuttingX} y={cuttingY} rotate={cuttingR} opacity={cuttingO} />
      <Plate id="graft/twine" scaleX={twine} opacity={twineO} />
      <Plate id="graft/knot-1" opacity={knot1} />
      <Plate id="graft/knot-2" opacity={knot2} />
      <Plate id="graft/knot-3" opacity={knot3} />
      <Plate id="graft/hand-left" x={leftX} y={leftY} rotate={leftR} />
      <Plate id="graft/hand-right" x={rightX} y={rightY} rotate={rightR} />
      <Plate id="pluck/foliage-near" opacity={fruit} scale={fruitScale} />
    </>
  );
}
