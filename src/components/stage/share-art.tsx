"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { useFigureLife, type FigureHold, type FigurePart } from "./figure-life";
import { HARVESTER_LIFE } from "./pluck-art";
import { HELD } from "./pluck-harvest";
import { halvesAt, knifeAt, secondHandAt, wholeOrangeAt } from "./share-cut";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The harvest beat carries on into the share: the foliage stays receded behind it. */
const OVER_FOLIAGE = ["harvest"] as const;

/** His head and open arm ride his body; the orange in his hand, its halves, the knife and the second hand move with the hand. */
const SHARE_PARTS: readonly FigurePart[] = [{ id: "pluck/harvester-head", head: true }, { id: "share/arm-open" }];
const SHARE_HOLDS: readonly FigureHold[] = [{ at: HELD, on: "share/arm-open" }];

/**
 * Scene 5, the cut and the share. Everything is a function of the story progress (`share-cut.ts`,
 * timings in `SHARE`), so it plays backwards exactly.
 *
 * - The scene starts as the pluck ended: the harvester holding the orange (his arm here holds
 *   nothing; the whole orange is drawn in his hand).
 * - His left hand comes in with a knife and plunges it through the orange; the whole orange gives
 *   way to its two peels under the blade, then the knife withdraws.
 * - The halves part and their cut faces are revealed. A second hand reaches in from center left,
 *   takes the left half, and both hands bring the halves together and hold them.
 * - The camera pushes in on all of it (camera script); the viewfinder and the sand are the
 *   hairline and transition layers.
 */
export function ShareArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  // The same life as in the pluck (same plates, same clock), so the two scenes meet without a seam.
  const life = useFigureLife(plateEntry("pluck/harvester-body"), { strength: HARVESTER_LIFE, parts: SHARE_PARTS, holds: SHARE_HOLDS });
  const inHand = life.held(0);
  const haze = useTextHaze(OVER_FOLIAGE, { strength: 0.8 });
  const robeHaze = useTextHaze(OVER_FOLIAGE, { strength: 0.8, stackedOnly: true });

  const whole = useTransform(progress, wholeOrangeAt);
  const wholeX = useTransform(whole, (o) => o.x);
  const wholeY = useTransform(whole, (o) => o.y);
  const wholeS = useTransform(whole, (o) => o.scale);
  const wholeO = useTransform(whole, (o) => o.opacity);

  const halves = useTransform(progress, halvesAt);
  const peelO = useTransform(halves, (h) => h.peel);
  const faceO = useTransform(halves, (h) => h.face * h.peel);
  const halfS = useTransform(halves, (h) => h.scale);
  const leftX = useTransform(halves, (h) => h.left.x);
  const leftY = useTransform(halves, (h) => h.left.y);
  const rightX = useTransform(halves, (h) => h.right.x);
  const rightY = useTransform(halves, (h) => h.right.y);

  const knife = useTransform(progress, knifeAt);
  const knifeX = useTransform(knife, (k) => k.x);
  const knifeY = useTransform(knife, (k) => k.y);
  const knifeR = useTransform(knife, (k) => k.rotate);
  const knifeO = useTransform(knife, (k) => k.opacity);

  const hand = useTransform(progress, secondHandAt);
  const handX = useTransform(hand, (h) => h.x);
  const handY = useTransform(hand, (h) => h.y);
  const handSY = useTransform(hand, (h) => h.scaleY);
  const handR = useTransform(hand, (h) => h.rotate);
  const handO = useTransform(hand, (h) => h.opacity);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" clearing={haze} />
      <Plate id="pluck/harvester-body" clearing={robeHaze} life={life} />
      <Plate id="pluck/harvester-head" ride={life.ride("pluck/harvester-head")} />
      <Plate id="share/arm-open" ride={life.ride("share/arm-open")} />
      <Plate id="pluck/hero-orange" depth={0.6} x={wholeX} y={wholeY} scale={wholeS} opacity={wholeO} sway={false} ride={inHand} />
      <Plate id="share/peel-right" x={rightX} y={rightY} scale={halfS} opacity={peelO} ride={inHand} />
      <Plate id="share/face-right" x={rightX} y={rightY} scale={halfS} opacity={faceO} ride={inHand} />
      <Plate id="share/peel-left" x={leftX} y={leftY} scale={halfS} opacity={peelO} ride={inHand} />
      <Plate id="share/face-left" x={leftX} y={leftY} scale={halfS} opacity={faceO} ride={inHand} />
      <Plate id="share/second-hand" x={handX} y={handY} scaleY={handSY} rotate={handR} opacity={handO} ride={inHand} />
      <Plate id="share/knife-hand" x={knifeX} y={knifeY} rotate={knifeR} opacity={knifeO} ride={inHand} />
    </>
  );
}
