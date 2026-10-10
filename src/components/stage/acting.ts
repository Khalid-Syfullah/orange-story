import { ACTING, BLUEPRINT, PRUNE, SITE, WORK } from "@/scroll/script";
import type { SceneId } from "@/scroll/types";

import { architectLean } from "./blueprint-plan";
import { armBobAt, CAN_TIP, type Watering } from "./finale-plan";
import { beat, blows, glide, track, type MotionChannel, type Track } from "./motion-kit";
import { armTurnAt, SNIP } from "./prune-plan";

/**
 * Scrubbed acting of the painted figures, as pure functions of story progress (no React, no three):
 * a head turning, a body leaning, an arm settling, a mallet striking. Ranges live in `ACTING` and the
 * scenes' own timings (`src/scroll/script.ts`); every value is a function of progress alone, so
 * scrolling back plays it in reverse exactly, and every move starts and ends at rest (the motion
 * kit's curves), so none of them jumps in speed. Angles are radians, counter-clockwise on screen (a
 * figure facing the viewer's left bows its head with a positive angle). The figures' idle life
 * (`life.ts`) runs on top.
 */

/** How much further, at most, the onlookers' heads tip up toward the statue as the orange brightens. */
export const CROWD_TIP = 0.075;

/** How far the onlookers have tipped their heads up, 0 to 1. */
export function crowdLookAt(p: number): number {
  return glide(p, ACTING.crowdLook);
}

/** An onlooker's extra head turn: up toward the statue, whichever way they face (`facing` +1: the statue is to their right). */
export function crowdHeadAt(p: number, facing: number): number {
  return CROWD_TIP * crowdLookAt(p) * facing;
}

/** How far the harvester's head is turned away from the orange before he takes it (he looks up, toward the descending fruit). */
export const HARVESTER_LOOK_AWAY = -0.13;

/**
 * The harvester's head turn: away (looking up at the fruit coming down) until his arm is nearly up,
 * then to the orange in his own hand (0, the painted pose): it turns a beat after his arm, goes a
 * touch past and settles there, as eyes do.
 */
const harvesterHead = track(beat(ACTING.harvesterHead, HARVESTER_LOOK_AWAY, 0, { overshoot: 0.1, settle: 0.4 }));
export function harvesterHeadAt(p: number): number {
  return harvesterHead(p);
}

/** How far the architect's head bows toward the plan once it is fully open. */
export const ARCHITECT_BOW = 0.085;

/** The architect's head bowing toward the plan as it opens. */
export function architectHeadAt(p: number): number {
  return ARCHITECT_BOW * glide(p, ACTING.architectLean);
}

/** The architect leans in as the plan opens: her body about her feet (`sway`, `architectLean`) and her head toward the sheet (`head`). */
export function architectActing(p: number): { sway: number; head: number } {
  return { sway: architectLean(p), head: architectHeadAt(p) };
}

/** How far the gardener's body leans into each snip. */
export const GARDENER_FOLLOW = 0.014;

/** The gardener's body follows the shears, a beat behind his arms: it leans in a little with each squeeze, and back as he opens them. */
export function gardenerSwayAt(p: number): number {
  const lag = (0.1 * (PRUNE.trim[1] - PRUNE.trim[0])) / PRUNE.snips;
  return (GARDENER_FOLLOW * armTurnAt(p - lag)) / SNIP.shut;
}

/** How far below the point the astronomer's arm starts, before it settles. */
export const ASTRONOMER_SETTLE = -0.15;

/** The astronomer's raised arm comes up into the point, a touch past it, and settles (0: the painted pose, where the stars grow from his fingertip). */
const astronomerArm = track(beat(ACTING.astronomerArm, ASTRONOMER_SETTLE, 0, { overshoot: 0.08, settle: 0.4 }));
export function astronomerArmAt(p: number): number {
  return astronomerArm(p);
}

/** How far the woman leans into her pour, and the man into his cut, at the height of it. */
export const KEEPER_LEAN = { woman: -0.016, man: 0.012 } as const;

/** The finale keepers shift their weight with their loop (idle time, faded in by `weight`): she leans into the pour, he into the cut. */
export function keeperSway(who: "woman" | "man", t: number, water: Watering, weight: number): number {
  if (who === "woman") return KEEPER_LEAN.woman * water.tilt * weight;
  return KEEPER_LEAN.man * (armBobAt(t) / 0.04) * weight;
}

/** The can's tip, for the arm plate (radians). */
export const canTip = (water: Watering, weight: number) => -CAN_TIP * water.tilt * weight;

/* ------------------------------------------------------------------ */
/* The builders' mallets                                               */
/* ------------------------------------------------------------------ */

/**
 * A builder's blow with his mallet, turning his raised forearm on the elbow (radians): it winds back,
 * swings down to the chisel and stops there hard, bounces a little and lifts back to the painted pose.
 */
export const MALLET = { windUp: 0.1, strike: 0.17, recoil: 0.14 } as const;
/** His body leans into each blow (a share of the forearm's turn) and his head nods with it, both a beat behind it (a share of a blow's time). */
export const MALLET_FOLLOW = { sway: 0.08, head: 0.18, lag: 0.12 } as const;

/** A builder's mallet over his stretch of the story: the forearm's turn, and how far behind it his body follows. */
export interface Mallet {
  forearm: Track;
  /** Progress by which his body and head follow the forearm. */
  lag: number;
}

/**
 * A builder at work: `count` blows over `range`. `side` is 1 when the mallet is on the picture's right
 * of his elbow and the chisel to the right (a blow turns the forearm clockwise), -1 when both are on
 * the left.
 */
export function mallet(range: readonly [number, number], count: number, side: 1 | -1): Mallet {
  return {
    forearm: blows(range, count, { windUp: side * MALLET.windUp, hit: -side * MALLET.strike, recoil: MALLET.recoil }),
    lag: (MALLET_FOLLOW.lag * (range[1] - range[0])) / count,
  };
}

/** A builder's acting at progress p: the forearm on its elbow (`arm`), the body (`sway`) and head following it a beat later. */
export function malletActing(m: Mallet, p: number, out: { arm: number; sway: number; head: number }): void {
  const later = m.forearm(p - m.lag);
  out.arm = m.forearm(p);
  out.sway = MALLET_FOLLOW.sway * later;
  out.head = MALLET_FOLLOW.head * later;
}

/** Every builder's mallet: in the work (his mallet on the left), on the blueprint's scaffold, and the two standing at the site. */
export const BUILDERS = {
  work: mallet(WORK.strikes, WORK.blows, -1),
  blueprint: mallet(BLUEPRINT.strikes, BLUEPRINT.blows, 1),
  siteLeft: mallet(SITE.strikes.left, SITE.blows, 1),
  siteRight: mallet(SITE.strikes.right, SITE.blows, -1),
} as const;

/* ------------------------------------------------------------------ */
/* For the velocity check and the motion lab                           */
/* ------------------------------------------------------------------ */

function malletChannels(who: string, m: Mallet): MotionChannel[] {
  const out = { arm: 0, sway: 0, head: 0 };
  return [
    { name: `${who} · forearm`, at: (p) => (malletActing(m, p, out), out.arm) },
    { name: `${who} · lean`, at: (p) => (malletActing(m, p, out), out.sway) },
    { name: `${who} · head`, at: (p) => (malletActing(m, p, out), out.head) },
  ];
}

/** The acting each scene drives (its figures' turns), for `motion-channels.ts`. */
export const ACTING_MOTION: Readonly<Partial<Record<SceneId, readonly MotionChannel[]>>> = {
  hero: [{ name: "onlookers · look up", at: crowdLookAt }],
  pluck: [{ name: "harvester · head", at: harvesterHeadAt }],
  share: [{ name: "harvester · head", at: harvesterHeadAt }],
  work: malletChannels("builder", BUILDERS.work),
  blueprint: [...malletChannels("builder", BUILDERS.blueprint), { name: "architect · head", at: architectHeadAt }],
  site: [...malletChannels("left builder", BUILDERS.siteLeft), ...malletChannels("right builder", BUILDERS.siteRight)],
  prune: [{ name: "gardener · lean", at: gardenerSwayAt }],
  stars: [{ name: "astronomer · arm", at: astronomerArmAt }],
};
