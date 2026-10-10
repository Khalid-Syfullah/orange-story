import { clamp01, ease, envelope, remap } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import { SCREEN, WORK } from "@/scroll/script";

/**
 * Scene 6, services in the clouds, as pure functions (no React, no three). Timings live in `WORK`
 * (`src/scroll/script.ts`); places come from the art manifest. Offsets are world units added to a
 * plate's manifest place.
 *
 * - The clouds drift from the center to the right on idle time (`driftX`, wrapped far offscreen) and
 *   shift right as the story scrolls (`cloudShiftAt`, nearer clouds more). The camera's own dolly
 *   gives the vertical parallax.
 * - While the cards are on screen the clouds part around the card column (`CARD_CLEARING`,
 *   `cloudClearing`): a cloud drifting toward the text thins out and re-forms beyond it, so the
 *   clouds pass on both sides of the cards and white text never sits on a white cloud.
 * - The giant orange on its minaret and the builder rise into view during the third card.
 */

/**
 * The part of the stage the clouds keep clear while the cards are up, as fractions of the stage
 * (from the left and the top): the right column where the cards sit (from about 52% to the right
 * hairline, around the middle), or the lower part of a stacked (phone) screen, where the cards sit
 * there. `soft` is the width of the edge the clouds thin across, as a fraction of the stage width.
 */
export const CARD_CLEARING = {
  wide: { left: 0.5, right: 0.87, top: 0.3, bottom: 0.7, soft: 0.06 },
  stacked: { left: 0, right: 1, top: 0.5, bottom: 1, soft: 0.14 },
} as const;

/** Screens over which the clearing opens before the first card and closes after the last. */
const CLEARING_RAMP = 0.3;

/** How clear the card column is kept at progress p: 1 from the first card's arrival to the last card's leave. */
export function cloudClearing(p: number): number {
  const first = beatOf("card-1");
  const last = beatOf("card-3");
  const ramp = CLEARING_RAMP * SCREEN;
  return envelope(p, [first.in - ramp, first.in, last.out, last.out + ramp]);
}

/** How far the clouds travel to the right over the whole scene when scrolling, at depth 1. */
export const CLOUD_SCROLL = 7;
/** Idle drift in world units per second, at depth 1; farther clouds drift slower. */
export const CLOUD_SPEED = 0.35;
/** The clouds wrap over this width, centered on zero (wider than any view at cloud depth). */
export const WRAP_SPAN = 32;

/**
 * Each cloud plate is drawn twice, the second copy half a wrap away, a little lower and mirrored, so
 * the sky stays full while the cards keep their column clear.
 */
export const CLOUD_COPY = { x: WRAP_SPAN / 2, y: -2.4 } as const;

/** World units the giant orange and the builder start below their place. */
export const RISE_FROM = 6.5;

/** Parallax weight of a cloud at a depth: near clouds move more than far ones. */
export const cloudWeight = (depth: number) => 2.4 / (1 + depth * 0.6);

/** Scroll shift to the right of a cloud at a depth, for story progress p. Monotonic, so it reverses exactly. */
export function cloudShiftAt(p: number, depth: number): number {
  return ease(remap(p, WORK.clouds[0], WORK.clouds[1])) * CLOUD_SCROLL * cloudWeight(depth) * 0.5;
}

/** Idle drift of a cloud at idle time t, wrapped into the span so it comes round on the left again. */
export function driftX(base: number, depth: number, t: number): number {
  const travelled = base + t * CLOUD_SPEED * cloudWeight(depth);
  const half = WRAP_SPAN / 2;
  const wrapped = ((((travelled + half) % WRAP_SPAN) + WRAP_SPAN) % WRAP_SPAN) - half;
  return wrapped - base;
}

export interface Rise {
  /** World offset added to the manifest place. */
  y: number;
  opacity: number;
}

/** The giant orange rising into view over card 3. */
export function giantOrangeAt(p: number): Rise {
  const t = remap(p, WORK.rise[0], WORK.rise[1]);
  return { y: -RISE_FROM * (1 - ease(t)), opacity: clamp01(t * 6) };
}

export interface BuilderPose extends Rise {
  /** Rotation in radians: the builder's to-and-fro while he works, zero until he arrives. */
  rotate: number;
}

/** The builder rises with the orange and, once there, works to and fro as the story scrolls. */
export function builderAt(p: number): BuilderPose {
  const orange = giantOrangeAt(p);
  const arrived = remap(p, WORK.rise[0] + (WORK.rise[1] - WORK.rise[0]) * 0.6, WORK.rise[1]);
  const phase = remap(p, WORK.rise[0], WORK.rise[1]) * Math.PI * 14;
  return { ...orange, rotate: Math.sin(phase) * 0.05 * arrived };
}
