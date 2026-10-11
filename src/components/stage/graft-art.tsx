"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry, plateWorldSize } from "@/art/manifest";
import { remap } from "@/lib/progress";

import { useFigureLife, type FigureLife } from "./figure-life";
import { cuttingAt, fruitAt, knotAt, knotScale, leftHandAt, rightHandAt, twineAt, type HandPose } from "./graft-hands";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";

/** The twine's width: it is revealed turn by turn from its left end, never stretched. */
const TWINE_WIDTH = plateWorldSize(plateEntry("graft/twine"))[0];
/** Where the knot is tied (world): the fruiting tree fills in around it. */
const KNOT_POINT = plateEntry("graft/knot-1").position;

/**
 * A grafting hand's rig, driven by the story: the hand bends on its wrist and the fingers close on
 * their knuckles (the plate's rig, `hand` and `fingers`), scrubbed by progress. No idle life: every
 * move of the hands is the graft's own.
 */
function useHandRig(id: "graft/hand-left" | "graft/hand-right", at: (p: number) => HandPose): FigureLife {
  return useFigureLife(plateEntry(id), {
    strength: 0,
    acting: (p, _t, _i, out) => {
      const hand = at(p);
      out.head = hand.wrist;
      out.arm = hand.fingers;
    },
  });
}

/**
 * Scene 3, the graft. Hands, cutting, twine and the three knot frames are separate plates, all
 * functions of the story progress (`graft-hands.ts`, timings in `GRAFT`), so the knot unties and the
 * hands leave again when scrolling back. Each forearm turns about its elbow as its arm reaches (the
 * elbow below the frame), each hand bends on its wrist and closes its fingers (the plate's rig); the
 * cutting is placed from the left hand's grip until it is seated, then leans with each pull of the
 * twine and springs back. After the knot the camera pulls out (camera script) and the fruiting tree
 * (the foliage plates with oranges, shared with the next scene) fills in and sways: clump by clump,
 * never faded half through (`grow`), the far boughs spreading out from the knot and the near ones closing
 * in from the edges, while loosened leaves drift down past the lens (the foliage pass, `leaf-plan.ts`).
 */
export function GraftArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const left = useTransform(progress, leftHandAt);
  const leftX = useTransform(left, (h) => h.x);
  const leftY = useTransform(left, (h) => h.y);
  const leftR = useTransform(left, (h) => h.rotate);
  const right = useTransform(progress, rightHandAt);
  const rightX = useTransform(right, (h) => h.x);
  const rightY = useTransform(right, (h) => h.y);
  const rightR = useTransform(right, (h) => h.rotate);
  const leftRig = useHandRig("graft/hand-left", leftHandAt);
  const rightRig = useHandRig("graft/hand-right", rightHandAt);

  const cutting = useTransform(progress, cuttingAt);
  const cuttingX = useTransform(cutting, (c) => c.x);
  const cuttingY = useTransform(cutting, (c) => c.y);
  const cuttingR = useTransform(cutting, (c) => c.rotate);

  // The twine is uncovered from its left end as it is wound: the plate narrows from the left and shows only that much of its image.
  const twine = useTransform(progress, twineAt);
  const twineX = useTransform(twine, (w) => (-(1 - w) * TWINE_WIDTH) / 2);
  const twineO = useTransform(twine, (w) => Math.min(1, w * 12));
  const knot = useTransform(progress, knotAt);
  const knot1 = useTransform(knot, (k) => k[0]);
  const knot2 = useTransform(knot, (k) => k[1]);
  const knot3 = useTransform(knot, (k) => k[2]);
  const knotS = useTransform(progress, knotScale);

  const fruit = useTransform(progress, fruitAt);
  const fruitScale = useTransform(fruit, (f) => 0.9 + 0.1 * f);
  // The crown fills in behind the graft, far boughs first, spreading out from the knot; the near boughs close in from the edges of the frame as the camera pulls back.
  const growFar = useTransform(fruit, (f) => remap(f, 0, 0.75));
  const growMid = useTransform(fruit, (f) => remap(f, 0.12, 0.88));
  const growNear = useTransform(fruit, (f) => remap(f, 0.25, 1));

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" grow={{ amount: growFar, from: KNOT_POINT }} scale={fruitScale} />
      <Plate id="pluck/foliage-mid" grow={{ amount: growMid, from: KNOT_POINT }} scale={fruitScale} />
      <Plate id="graft/branch" />
      <Plate id="graft/cutting" x={cuttingX} y={cuttingY} rotate={cuttingR} sway={false} />
      <Plate id="graft/twine" x={twineX} scaleX={twine} uvRepeat={[twine, 1]} opacity={twineO} />
      <Plate id="graft/knot-1" opacity={knot1} scale={knotS} />
      <Plate id="graft/knot-2" opacity={knot2} scale={knotS} />
      <Plate id="graft/knot-3" opacity={knot3} scale={knotS} />
      <Plate id="graft/hand-left" x={leftX} y={leftY} rotate={leftR} life={leftRig} />
      <Plate id="graft/hand-right" x={rightX} y={rightY} rotate={rightR} life={rightRig} />
      <Plate id="pluck/foliage-near" grow={{ amount: growNear, from: KNOT_POINT, inward: true }} scale={fruitScale} />
    </>
  );
}
