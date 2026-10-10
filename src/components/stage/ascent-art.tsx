"use client";

import * as React from "react";
import { useMotionValue, useTransform, type MotionValue } from "motion/react";

import { BRANCHES, branchAt, LEAVES, leafAt, MINARET, morphAt, riseAt, shaftAt, statueAt, type LeafSpec } from "./ascent-tree";
import { GlowRipple } from "./glow-ripple";
import { HALO, ORANGE, ORANGE_WHITENING, useCrowdLife } from "./hero-art";
import { MorphPlate } from "./morph-plate";
import { colors, mixColors } from "@/styles/tokens";

import { Plate } from "./plate";
import { scenePresence } from "./presence";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { Twinkle } from "./twinkle";

/**
 * Scene 2, the ascent: the minaret becomes a tree. Everything here is a function of the story
 * progress (`ascent-tree.ts`, timings in `ASCENT`), so it plays backwards exactly.
 *
 * - The scene starts as the hero frame, plate for plate (the hero's glow included: the ripple clock
 *   is shared and the two scenes' glows trade places without adding up), then the statue, its
 *   orange and the top of the minaret rise together.
 * - The shaft is one tiling plate that grows from a fixed bottom (more tiles, never stretched) and
 *   morphs from stone to bark through the manifest's mask; branches scale out from the trunk and
 *   leaves unfurl along them.
 * - The orange keeps its brightened glow (white-hot) and carries it up; the statue, the orange and
 *   the glow leave the picture once above the frame.
 */

/** The glow stays at the hero's full brightness. */
const GLOW_LIFT = 1;
/** The soft light along the moving stone-to-bark front. */
const FRONT_GLOW = mixColors("white", "orange", 0.25);

function Leaf({ leaf, progress }: { leaf: LeafSpec; progress: MotionValue<number> }) {
  const scaleX = useTransform(progress, (p) => leafAt(leaf, p).scaleX);
  const scaleY = useTransform(progress, (p) => leafAt(leaf, p).scaleY);
  const rotate = useTransform(progress, (p) => leafAt(leaf, p).rotate);
  return <Plate id="ascent/leaf" name={leaf.id} position={leaf.position} depth={leaf.depth} scale={leaf.size} scaleX={scaleX} scaleY={scaleY} rotate={rotate} sway={false} />;
}

function Branch({ id, progress }: { id: (typeof BRANCHES)[number]; progress: MotionValue<number> }) {
  const grown = useTransform(progress, (p) => branchAt(id, p));
  // The branch splits off the trunk: it scales out from where it joins, and fades in as it goes.
  const scale = useTransform(grown, (g) => 0.08 + 0.92 * g);
  const opacity = useTransform(grown, (g) => Math.min(1, g * 3));
  return <Plate id={id} scale={scale} opacity={opacity} />;
}

export function AscentArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const rise = useTransform(progress, riseAt);
  const height = useTransform(progress, (p) => shaftAt(p).height);
  const repeatY = useTransform(progress, (p) => shaftAt(p).repeatY);
  const morph = useTransform(progress, morphAt);
  const edge = useTransform(morph, (m) => 0.35 * Math.sin(Math.PI * m));

  // The statue and its orange leave once above the frame; the glow goes with them.
  const statue = useTransform(progress, statueAt);
  // The hero's glow fades out with its scene as this one fades in: this one takes the rest, so the
  // two never add up while they cross.
  const glow = useTransform([progress, statue], ([p, s]: number[]) => {
    const handover = Math.min(1, (1 - scenePresence("hero", p)) / Math.max(0.001, scenePresence("ascent", p)));
    return handover * s;
  });
  const halo = useTransform(glow, (g) => g * (0.5 + 0.35 * GLOW_LIFT));
  const far = useCrowdLife("hero/crowd-far");
  const mid = useCrowdLife("hero/crowd-mid");
  const near = useCrowdLife("hero/crowd-near");

  return (
    <>
      <Plate id="hero/sky" />
      <GlowRipple sprite="hero/glow-droplet" source={ORANGE} offsetY={rise} opacity={glow} lift={GLOW_LIFT} />
      <Twinkle sprite="hero/glow-droplet" points={HALO} y={rise} opacity={halo} tint={colors.white} tintAmount={GLOW_LIFT} additive layer={-1} name="hero-halo" />
      <Plate id="hero/crowd-far" life={far} />
      <Plate id="hero/crowd-mid" life={mid} />
      <Plate id="hero/crowd-near" life={near} />
      <MorphPlate
        from="ascent/stone"
        to="ascent/bark"
        mask="ascent/morph-mask"
        place={MINARET}
        progress={morph}
        y={rise}
        height={height}
        uvRepeat={[1, repeatY]}
        edgeColor={FRONT_GLOW}
        edgeAmount={edge}
        name="ascent-shaft"
      />
      {BRANCHES.map((id) => (
        <Branch key={id} id={id} progress={progress} />
      ))}
      {LEAVES.map((leaf) => (
        <Leaf key={leaf.id} leaf={leaf} progress={progress} />
      ))}
      <Plate id="hero/statue" y={rise} opacity={statue} />
      <Plate id="hero/statue-orange" position={ORANGE} y={rise} opacity={statue} tint={colors.white} tintAmount={ORANGE_WHITENING} />
    </>
  );
}
