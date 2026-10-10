import { ease, remap } from "@/lib/progress";
import { ACTING } from "@/scroll/script";

import { architectLean } from "./blueprint-plan";
import { armBobAt, CAN_TIP, type Watering } from "./finale-plan";
import { shearsClosed } from "./prune-plan";

/**
 * Scrubbed acting of the painted figures, as pure functions of story progress (no React, no three):
 * a head turning, a body leaning, an arm settling. Ranges live in `ACTING` (`src/scroll/script.ts`);
 * every value is a function of progress alone, so scrolling back plays it in reverse exactly. Angles
 * are radians, counter-clockwise on screen (a figure facing the viewer's left bows its head with a
 * positive angle). The figures' idle life (`life.ts`) runs on top.
 */

/** How much further, at most, the onlookers' heads tip up toward the statue as the orange brightens. */
export const CROWD_TIP = 0.075;

/** How far the onlookers have tipped their heads up, 0 to 1. */
export function crowdLookAt(p: number): number {
  return ease(remap(p, ACTING.crowdLook[0], ACTING.crowdLook[1]));
}

/** An onlooker's extra head turn: up toward the statue, whichever way they face (`facing` +1: the statue is to their right). */
export function crowdHeadAt(p: number, facing: number): number {
  return CROWD_TIP * crowdLookAt(p) * facing;
}

/** How far the harvester's head is turned away from the orange before he takes it (he looks up, toward the descending fruit). */
export const HARVESTER_LOOK_AWAY = -0.13;

/** The harvester's head turn: away (looking up) until the hand brings the fruit, then to the orange in his own hand (0, the painted pose). */
export function harvesterHeadAt(p: number): number {
  return HARVESTER_LOOK_AWAY * (1 - ease(remap(p, ACTING.harvesterHead[0], ACTING.harvesterHead[1])));
}

/** How far the architect's head bows toward the plan once it is fully open. */
export const ARCHITECT_BOW = 0.085;

/** The architect's head bowing toward the plan as it opens. */
export function architectHeadAt(p: number): number {
  return ARCHITECT_BOW * ease(remap(p, ACTING.architectLean[0], ACTING.architectLean[1]));
}

/** The architect leans in as the plan opens: her body about her feet (`sway`, `architectLean`) and her head toward the sheet (`head`). */
export function architectActing(p: number): { sway: number; head: number } {
  return { sway: architectLean(p), head: architectHeadAt(p) };
}

/** How far the gardener's body leans into each snip. */
export const GARDENER_FOLLOW = 0.014;

/** The gardener's body follows the shears: it leans in a little as each snip closes, and back as it opens. */
export function gardenerSwayAt(p: number): number {
  return GARDENER_FOLLOW * shearsClosed(p);
}

/** How far below the point the astronomer's arm starts, before it settles. */
export const ASTRONOMER_SETTLE = -0.15;

/** The astronomer's raised arm settles into the point (0: the painted pose, where the stars grow from his fingertip). */
export function astronomerArmAt(p: number): number {
  return ASTRONOMER_SETTLE * (1 - ease(remap(p, ACTING.astronomerArm[0], ACTING.astronomerArm[1])));
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
