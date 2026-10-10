"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";
import { PLUCK } from "@/scroll/script";

import { harvesterHeadAt } from "./acting";
import { useFigureLife, useHeldRide, type FigureHold, type FigureLife, type FigurePart } from "./figure-life";
import { glide } from "./motion-kit";
import { branchShake, fingersInFront, foliageAt, HAND_DEPTH, HELD, handAt, harvesterAt, heroOrangeAt, inHisHand } from "./pluck-harvest";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The beats over the foliage (and, on a phone, over the harvester's robe): what runs behind their words recedes into the sky's haze. */
const OVER_FOLIAGE = ["found", "harvest"] as const;

/** The harvester's head and open arm ride his body; the fruit in his hand rides the arm (the plan turns it with the arm's swing, this adds his breathing). */
const PLUCK_PARTS: readonly FigurePart[] = [{ id: "pluck/harvester-head", head: true }, { id: "share/arm-open" }];
const PLUCK_HOLDS: readonly FigureHold[] = [{ at: HELD, on: "share/arm-open" }];

/** He is large in the frame: his idle life a little quieter than the rest of the cast's. */
export const HARVESTER_LIFE = 0.6;

/** The reaching hand's fingers, drawn a second time in front of the fruit they hold (the palm stays behind it). */
const FINGERS = { box: [0.3, 0, 0.74, 0.126], soft: 0.012 } as const;

/** Stacking inside the scene: the reaching hand behind the fruit, its fingers in front of it, the near foliage in front of all. */
const LAYER = { hand: 1, fruit: 2, fingers: 3, near: 4 } as const;

/**
 * The harvester's life in the pluck: breathing, small shifts, his head turning to the orange a beat
 * after his arm comes up (`harvesterHeadAt`, scrubbed), his head and arm riding his body.
 */
export function useHarvesterLife(): FigureLife {
  return useFigureLife(plateEntry("pluck/harvester-body"), {
    strength: HARVESTER_LIFE,
    parts: PLUCK_PARTS,
    holds: PLUCK_HOLDS,
    acting: (p, _t, _i, out) => {
      out.head = harvesterHeadAt(p);
    },
  });
}

/** His open hand closes a little round the fruit once it is his. */
export function usePalmRig(): FigureLife {
  return useFigureLife(plateEntry("share/arm-open"), {
    strength: 0,
    acting: (p, _t, _i, out) => {
      const holding = glide(p, [PLUCK.handoff[0], PLUCK.release[0] + 0.4 * (PLUCK.release[1] - PLUCK.release[0])]);
      out.arm = -0.07 * holding;
    },
  });
}

/**
 * Scene 4, the pluck and the harvester. Everything is a function of the story progress
 * (`pluck-harvest.ts`, timings in `PLUCK`), so it plays backwards exactly.
 *
 * - The scene starts as the graft ended: the fruiting tree, the foliage plates in three depths.
 * - An arm reaches up from below to the one special orange on an arc, its elbow bending; its fingers
 *   close round the fruit (drawn again in front of it), it tugs until the stem snaps and follows
 *   through, and the branches spring back and shake.
 * - The camera dollies down (camera script); the hand carries the fruit down with the camera while
 *   the near and middle foliage fall away behind.
 * - The harvester settles into view; his open arm swings up about his shoulder to take the fruit,
 *   the hand that carried it lets go and drops away, and his gaze settles on it.
 * - While "We get you found." and "We split the harvest." are up, the foliage behind their words
 *   recedes into the sky's haze (`useTextHaze`), so the text never sits on bright fruit.
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
  const nearShake = useTransform(progress, (p) => branchShake(p, 1));
  const nearY = useTransform(nearShake, (s) => s.y);
  const nearR = useTransform(nearShake, (s) => s.rotate);
  const midShake = useTransform(progress, (p) => branchShake(p, 0.6));
  const midY = useTransform(midShake, (s) => s.y);
  const midR = useTransform(midShake, (s) => s.rotate);

  const orange = useTransform(progress, heroOrangeAt);
  const orangeX = useTransform(orange, (o) => o.x);
  const orangeY = useTransform(orange, (o) => o.y);
  const orangeR = useTransform(orange, (o) => o.rotate);
  const orangeS = useTransform(orange, (o) => o.scale);

  const hand = useTransform(progress, handAt);
  const handX = useTransform(hand, (h) => h.x);
  const handY = useTransform(hand, (h) => h.y);
  const handR = useTransform(hand, (h) => h.rotate);
  const handS = useTransform(hand, (h) => h.scale);
  const fingers = useTransform(progress, fingersInFront);
  const handRig = useFigureLife(plateEntry("pluck/hand"), {
    strength: 0,
    acting: (p, _t, _i, out) => {
      const arm = handAt(p);
      out.head = arm.elbow;
      out.arm = arm.fingers;
      out.curl = arm.curl;
    },
  });

  const haze = useTextHaze(OVER_FOLIAGE, { strength: 0.8 });
  // His robe is behind the text only on a phone (a wide screen keeps him to the right of it).
  const robeHaze = useTextHaze(OVER_FOLIAGE, { strength: 0.8, stackedOnly: true });

  const life = useHarvesterLife();
  const palm = usePalmRig();
  // The fruit rides his hand (his breathing, his arm swinging up) once it is his.
  const heldRide = useHeldRide(life, 0, progress, inHisHand);
  const harvester = useTransform(progress, harvesterAt);
  const harvesterY = useTransform(harvester, (h) => h.rise);
  const armR = useTransform(harvester, (h) => h.arm);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" clearing={haze} />
      <Plate id="pluck/foliage-mid" y={midY} rotate={midR} opacity={midOpacity} clearing={haze} />
      <Plate id="pluck/harvester-body" y={harvesterY} clearing={robeHaze} life={life} />
      <Plate id="pluck/harvester-head" y={harvesterY} ride={life.ride("pluck/harvester-head")} />
      <Plate id="share/arm-open" y={harvesterY} rotate={armR} ride={life.ride("share/arm-open")} life={palm} />
      <Plate id="pluck/hand" depth={HAND_DEPTH} x={handX} y={handY} rotate={handR} scale={handS} life={handRig} layer={LAYER.hand} />
      <Plate id="pluck/hero-orange" depth={HAND_DEPTH} x={orangeX} y={orangeY} rotate={orangeR} scale={orangeS} ride={heldRide} sway={false} layer={LAYER.fruit} />
      <Plate id="pluck/hand" depth={HAND_DEPTH} x={handX} y={handY} rotate={handR} scale={handS} life={handRig} opacity={fingers} crop={FINGERS} layer={LAYER.fingers} name="pluck/hand:fingers" />
      <Plate id="pluck/foliage-near" y={nearY} rotate={nearR} opacity={nearOpacity} scale={nearScale} clearing={haze} layer={LAYER.near} />
    </>
  );
}
