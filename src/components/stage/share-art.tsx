"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { useFigureLife, useHeldRide, type FigureHold, type FigurePart } from "./figure-life";
import { HARVESTER_LIFE, usePalmRig } from "./pluck-art";
import { HAND_DEPTH, HELD } from "./pluck-harvest";
import { CLOSED_SCALE, halvesAt, inSecondHand, knifeAt, palmGive, secondHandAt, wholeOrangeAt } from "./share-cut";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The harvest beat carries on into the share: the foliage stays receded behind it. */
const OVER_FOLIAGE = ["harvest"] as const;

/** His head and open arm ride his body; what his palm holds rides his arm (his breathing). */
const SHARE_PARTS: readonly FigurePart[] = [{ id: "pluck/harvester-head", head: true }, { id: "share/arm-open" }];
const SHARE_HOLDS: readonly FigureHold[] = [{ at: HELD, on: "share/arm-open" }];

/** The cut faces widen about their cut edges (their `cut-edge` points): a face turning toward the eye. */
const FACE_LEFT = plateEntry("share/face-left").points!["cut-edge"];
const FACE_RIGHT = plateEntry("share/face-right").points!["cut-edge"];

/** Stacking: the fruit and its halves in front of the palms that hold them (her hand under the left half), the knife in front of all. */
const LAYER = { fruit: 1, hand: 2, half: 3, face: 4, knife: 5 } as const;

/**
 * Scene 5, the cut and the share. Everything is a function of the story progress (`share-cut.ts`,
 * timings in `SHARE`), so it plays backwards exactly.
 *
 * - The scene starts as the pluck ended: the harvester holding the orange in his open hand.
 * - His left hand brings the knife up over it and cuts down through it, the whole orange giving way
 *   to its two peels under the blade; his palm gives a little under the pressure. The knife draws
 *   back out and drops away.
 * - The halves tip apart, rock and settle in his palm, turning their cut faces up. A second hand
 *   rises from center left, takes the left half, draws it a little away, and both hands bring the
 *   halves together and hold them.
 * - The camera pushes in on all of it (camera script); the viewfinder and the sand are the hairline
 *   and transition layers.
 */
export function ShareArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  // The same life as in the pluck (same plates, same clock), so the two scenes meet without a seam.
  const life = useFigureLife(plateEntry("pluck/harvester-body"), { strength: HARVESTER_LIFE, parts: SHARE_PARTS, holds: SHARE_HOLDS });
  const palm = usePalmRig();
  const inHand = life.held(0);
  // The left half rides his hand until it is in hers.
  const leftRide = useHeldRide(life, 0, progress, (p) => 1 - inSecondHand(p));
  const haze = useTextHaze(OVER_FOLIAGE, { strength: 0.8 });
  const robeHaze = useTextHaze(OVER_FOLIAGE, { strength: 0.8, stackedOnly: true });
  const give = useTransform(progress, palmGive);

  const whole = useTransform(progress, wholeOrangeAt);
  const wholeX = useTransform(whole, (o) => o.x);
  const wholeY = useTransform(whole, (o) => o.y);
  const wholeS = useTransform(whole, (o) => o.scale);
  const wholeO = useTransform(whole, (o) => o.opacity);

  const halves = useTransform(progress, halvesAt);
  const peelO = useTransform(halves, (h) => h.peel);
  const faceO = useTransform(halves, (h) => h.peel * Math.min(1, h.face * 4));
  const faceW = useTransform(halves, (h) => 0.08 + 0.92 * h.face);
  const leftX = useTransform(halves, (h) => h.left.x);
  const leftY = useTransform(halves, (h) => h.left.y);
  const leftR = useTransform(halves, (h) => h.left.rotate);
  const rightX = useTransform(halves, (h) => h.right.x);
  const rightY = useTransform(halves, (h) => h.right.y);
  const rightR = useTransform(halves, (h) => h.right.rotate);
  const leftEdgeX = useTransform(halves, (h) => h.leftEdge[0]);
  const leftEdgeY = useTransform(halves, (h) => h.leftEdge[1]);
  const rightEdgeX = useTransform(halves, (h) => h.rightEdge[0]);
  const rightEdgeY = useTransform(halves, (h) => h.rightEdge[1]);

  const knife = useTransform(progress, knifeAt);
  const knifeX = useTransform(knife, (k) => k.x);
  const knifeY = useTransform(knife, (k) => k.y);
  const knifeR = useTransform(knife, (k) => k.rotate);
  const knifeRig = useFigureLife(plateEntry("share/knife-hand"), {
    strength: 0,
    acting: (p, _t, _i, out) => {
      out.head = knifeAt(p).wrist;
    },
  });

  const hand = useTransform(progress, secondHandAt);
  const handX = useTransform(hand, (h) => h.x);
  const handY = useTransform(hand, (h) => h.y);
  const handR = useTransform(hand, (h) => h.rotate);
  const handRig = useFigureLife(plateEntry("share/second-hand"), {
    strength: 0,
    acting: (p, _t, _i, out) => {
      const h = secondHandAt(p);
      out.head = h.wrist;
      out.arm = h.fingers;
    },
  });

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" clearing={haze} />
      <Plate id="pluck/harvester-body" clearing={robeHaze} life={life} />
      <Plate id="pluck/harvester-head" ride={life.ride("pluck/harvester-head")} />
      <Plate id="share/arm-open" rotate={give} ride={life.ride("share/arm-open")} life={palm} />
      <Plate id="pluck/hero-orange" depth={HAND_DEPTH} x={wholeX} y={wholeY} scale={wholeS} opacity={wholeO} sway={false} ride={inHand} layer={LAYER.fruit} />
      <Plate id="share/peel-right" depth={HAND_DEPTH} x={rightX} y={rightY} rotate={rightR} scale={CLOSED_SCALE} opacity={peelO} ride={inHand} layer={LAYER.half} />
      <Plate id="share/face-right" depth={HAND_DEPTH} position={[0, 0]} anchor={FACE_RIGHT} x={rightEdgeX} y={rightEdgeY} rotate={rightR} scale={CLOSED_SCALE} scaleX={faceW} opacity={faceO} ride={inHand} layer={LAYER.face} />
      <Plate id="share/peel-left" depth={HAND_DEPTH} x={leftX} y={leftY} rotate={leftR} scale={CLOSED_SCALE} opacity={peelO} ride={leftRide} layer={LAYER.half} />
      <Plate id="share/face-left" depth={HAND_DEPTH} position={[0, 0]} anchor={FACE_LEFT} x={leftEdgeX} y={leftEdgeY} rotate={leftR} scale={CLOSED_SCALE} scaleX={faceW} opacity={faceO} ride={leftRide} layer={LAYER.face} />
      <Plate id="share/second-hand" depth={HAND_DEPTH} x={handX} y={handY} rotate={handR} life={handRig} layer={LAYER.hand} />
      <Plate id="share/knife-hand" x={knifeX} y={knifeY} rotate={knifeR} life={knifeRig} layer={LAYER.knife} />
    </>
  );
}
