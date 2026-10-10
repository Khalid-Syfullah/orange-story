"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { harvesterHeadAt } from "./acting";
import { useFigureLife, useHeldRide, type FigureHold, type FigureLife, type FigurePart } from "./figure-life";
import { carryAt, foliageAt, HELD, handAt, harvesterAt, heroOrangeAt } from "./pluck-harvest";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { useTextHaze } from "./use-text-haze";

/** The beats over the foliage (and, on a phone, over the harvester's robe): what runs behind their words recedes into the sky's haze. */
const OVER_FOLIAGE = ["found", "harvest"] as const;

/** The harvester's head and arm ride his body; the fruit in his hand moves with the arm. */
const PLUCK_PARTS: readonly FigurePart[] = [{ id: "pluck/harvester-head", head: true }, { id: "pluck/harvester-arm" }];
const PLUCK_HOLDS: readonly FigureHold[] = [{ at: HELD, on: "pluck/harvester-arm" }];

/** He is large in the frame: his idle life a little quieter than the rest of the cast's. */
export const HARVESTER_LIFE = 0.6;

/**
 * The harvester's life in the pluck: breathing, small shifts, his head turning to the orange as he
 * takes it (`harvesterHeadAt`, scrubbed), his head and arm riding his body.
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

  const haze = useTextHaze(OVER_FOLIAGE, { strength: 0.8 });
  // His robe is behind the text only on a phone (a wide screen keeps him to the right of it).
  const robeHaze = useTextHaze(OVER_FOLIAGE, { strength: 0.8, stackedOnly: true });

  const life = useHarvesterLife();
  // The fruit rides the hand only once it has reached it (the carry has landed).
  const heldRide = useHeldRide(life, 0, progress, (p) => carryAt(p));
  const harvester = useTransform(progress, harvesterAt);
  const harvesterO = useTransform(harvester, (h) => h.opacity);
  const harvesterY = useTransform(harvester, (h) => h.rise);
  const armO = useTransform(harvester, (h) => h.arm);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="pluck/foliage-far" clearing={haze} />
      <Plate id="pluck/foliage-mid" opacity={midOpacity} clearing={haze} />
      <Plate id="pluck/harvester-body" y={harvesterY} opacity={harvesterO} clearing={robeHaze} life={life} />
      <Plate id="pluck/harvester-head" y={harvesterY} opacity={harvesterO} ride={life.ride("pluck/harvester-head")} />
      <Plate id="pluck/harvester-arm" y={harvesterY} opacity={armO} ride={life.ride("pluck/harvester-arm")} />
      <Plate id="pluck/hero-orange" x={orangeX} y={orangeY} rotate={orangeR} scale={orangeS} opacity={orangeO} ride={heldRide} />
      <Plate id="pluck/hand" x={handX} y={handY} scaleX={handSX} scaleY={handSY} rotate={handR} opacity={handO} />
      <Plate id="pluck/foliage-near" opacity={nearOpacity} scale={nearScale} clearing={haze} />
    </>
  );
}
