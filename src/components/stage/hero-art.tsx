"use client";

import * as React from "react";
import { animate, useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, platePoint, plateWorldSize, type PlateId } from "@/art/manifest";
import { ease } from "@/lib/progress";
import { sceneProgress } from "@/scroll/helpers";
import { CAMERA } from "@/scroll/script";

import { crowdHeadAt } from "./acting";
import { useFigureLife, type FigureLife } from "./figure-life";
import { GlowRipple } from "./glow-ripple";
import { finishHeroIntro, heroIntroElapsed, heroIntroFinished, INTRO, introAmount, startHeroIntro, type IntroSpan } from "./hero-intro";
import { colors } from "@/styles/tokens";

import { Plate } from "./plate";
import { rigFigures } from "./rig";
import { useStageProgress } from "./stage-context";
import { Twinkle } from "./twinkle";
import { useTextHaze } from "./use-text-haze";
import type { SceneArtProps } from "./scene-layers";

/**
 * Scene 1, the hero: the raised orange. Plates (all from the manifest, so final paintings drop in):
 * the sky, the minaret, the statue with the orange as its own layer, and the onlookers in three
 * depth layers, faces tipped up toward the statue (in the paintings).
 *
 * Two things move here:
 * - the intro, once per page view: the sky first, then the statue (with its minaret and orange),
 *   then the onlookers (`hero-intro.ts`); the hero text follows;
 * - the glow, on idle time and always on: droplets of light ripple out from the orange across the
 *   sky, with a slow halo breathing behind it. As the story starts to move (over the hero scene)
 *   the glow brightens toward white and the ripple speeds up a little, and settles back when
 *   scrolling up.
 */

/**
 * The orange's place in the world, in the statue's raised hand (the `orange` point of her plate):
 * the orange plate stands there and the glow comes from there.
 */
const orangePoint = platePoint("hero/statue", "orange");
export const ORANGE: readonly [number, number] = [orangePoint[0], orangePoint[1]];
/** How far behind the picture plane the orange (and its glow) stands: the statue's depth. */
export const ORANGE_DEPTH = -orangePoint[2];

/**
 * The glow is laid out for a camera 14 world units from the orange (its ripple units); the hero's
 * camera stands nearer, so the ripple, its droplets, its rings and the halo are drawn at that ratio
 * and look the same on screen.
 */
export const GLOW_UNIT = (CAMERA[0].position[2] + ORANGE_DEPTH) / 14;

/** On a phone the onlookers stand along the bottom, under the "What we do" words: they recede into the sky's haze while those are up. */
const UNDER_WORDS = ["hero-intro"] as const;

/** World units the statue group and the crowd rise from as they appear. */
const STATUE_RISE = 0.35 * GLOW_UNIT;
const CROWD_RISE = 0.2 * GLOW_UNIT;
/** Blur (fraction of the view height) a plate arrives out of. */
const ARRIVE_BLUR = 0.012;
/** How much of the orange turns white at full lift. */
export const ORANGE_WHITENING = 0.45;

/** The halo behind the orange: one big soft droplet that breathes. */
export const HALO = [{ position: [ORANGE[0], ORANGE[1], -ORANGE_DEPTH], size: 2.6 * GLOW_UNIT, phase: 0.6, speed: 0.16 }] as const;

/**
 * Which way each onlooker on a crowd plate turns to look up at the statue: +1 when she stands to
 * their right (their `look-at` point), -1 when to their left.
 */
export function crowdFacing(id: PlateId): number[] {
  const entry = plateEntry(id);
  const look = platePoint(id, "look-at")[0];
  const [w] = plateWorldSize(entry);
  return rigFigures(entry.rig).map((f) => {
    const u = f.head ? (f.head[0] + f.head[2]) / 2 : f.centre;
    return Math.sign(look - (entry.position[0] + (u - entry.anchor[0]) * w)) || 1;
  });
}

/**
 * The onlookers' life on one crowd plate: each breathes and shifts on their own, and all tip their
 * heads up further toward the statue as the orange brightens (`crowdHeadAt`, scrubbed). The hero and
 * the ascent draw the same plates with the same life, so the crossfade between them never doubles a head.
 */
export function useCrowdLife(id: PlateId): FigureLife {
  const facing = React.useMemo(() => crowdFacing(id), [id]);
  return useFigureLife(plateEntry(id), {
    acting: (p, _t, i, out) => {
      out.head = crowdHeadAt(p, facing[i] ?? 1);
    },
  });
}

function useIntroClock(): MotionValue<number> {
  const clock = useMotionValue(heroIntroElapsed());
  return clock;
}

/** Runs the intro clock (inside the Suspense boundary: it mounts when the plates have loaded). */
function IntroDriver({ clock }: { clock: MotionValue<number> }) {
  React.useEffect(() => {
    startHeroIntro();
    if (heroIntroFinished()) {
      clock.set(INTRO.total);
      return;
    }
    clock.set(heroIntroElapsed());
    const run = animate(clock, INTRO.total, { duration: Math.max(0.01, INTRO.total - clock.get()), ease: "linear", onComplete: finishHeroIntro });
    return () => run.stop();
  }, [clock]);
  return null;
}

/** An intro move as a MotionValue (0 to 1) of the clock. */
const useAmount = (clock: MotionValue<number>, span: IntroSpan) => useTransform(clock, (t) => introAmount(t, span));

/** Blur a plate arrives out of, from its intro amount. */
const useArriveBlur = (amount: MotionValue<number>) => useTransform(amount, (a) => (1 - a) * ARRIVE_BLUR);

export function HeroArt({ scene }: SceneArtProps) {
  void scene;
  const clock = useIntroClock();
  const progress = useStageProgress();
  const none = useMotionValue(0);

  const sky = useAmount(clock, INTRO.sky);
  const minaret = useAmount(clock, INTRO.minaret);
  const statue = useAmount(clock, INTRO.statue);
  const orange = useAmount(clock, INTRO.orange);
  const glow = useAmount(clock, INTRO.glow);
  const crowdFar = useAmount(clock, INTRO.crowdFar);
  const crowdMid = useAmount(clock, INTRO.crowdMid);
  const crowdNear = useAmount(clock, INTRO.crowdNear);

  // The statue, the minaret and the orange rise into place together (the minaret a little ahead).
  const statueY = useTransform(statue, (a) => -(1 - a) * STATUE_RISE);
  const orangeY = useTransform([statue, orange], ([s, o]: number[]) => -(1 - s) * STATUE_RISE + (1 - o) * 0.08);
  const minaretY = useTransform(minaret, (a) => -(1 - a) * STATUE_RISE);
  const statueBlur = useArriveBlur(statue);
  const orangeBlur = useArriveBlur(orange);
  const minaretBlur = useArriveBlur(minaret);
  const farY = useTransform(crowdFar, (a) => -(1 - a) * CROWD_RISE);
  const midY = useTransform(crowdMid, (a) => -(1 - a) * CROWD_RISE);
  const nearY = useTransform(crowdNear, (a) => -(1 - a) * CROWD_RISE);

  // The glow brightens as the story starts to move: over the hero scene, scrubbed by progress.
  const lift = useTransform(progress ?? none, (p) => (progress ? ease(sceneProgress("hero", p)) : 0));
  const whitening = useTransform(lift, (l) => l * ORANGE_WHITENING);
  const halo = useTransform([glow, lift], ([g, l]: number[]) => g * (0.5 + 0.35 * l));
  const far = useCrowdLife("hero/crowd-far");
  const mid = useCrowdLife("hero/crowd-mid");
  const near = useCrowdLife("hero/crowd-near");
  const haze = useTextHaze(UNDER_WORDS, { strength: 0.85, stackedOnly: true });

  return (
    <>
      <Plate id="hero/sky" opacity={sky} />
      <GlowRipple sprite="hero/glow-droplet" source={ORANGE} depth={ORANGE_DEPTH} unit={GLOW_UNIT} opacity={glow} lift={lift} />
      <Twinkle sprite="hero/glow-droplet" points={HALO} opacity={halo} tint={colors.white} tintAmount={lift} additive layer={-1} name="hero-halo" />
      <Plate id="hero/minaret" opacity={minaret} y={minaretY} blur={minaretBlur} />
      <Plate id="hero/crowd-far" opacity={crowdFar} y={farY} life={far} clearing={haze} />
      <Plate id="hero/crowd-mid" opacity={crowdMid} y={midY} life={mid} clearing={haze} />
      <Plate id="hero/crowd-near" opacity={crowdNear} y={nearY} life={near} clearing={haze} />
      <Plate id="hero/statue" opacity={statue} y={statueY} blur={statueBlur} />
      <Plate id="hero/statue-orange" position={ORANGE} opacity={orange} y={orangeY} blur={orangeBlur} tint={colors.white} tintAmount={whitening} />
      <IntroDriver clock={clock} />
    </>
  );
}
