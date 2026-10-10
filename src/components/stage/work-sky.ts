import { clamp01, ease, remap } from "@/lib/progress";
import { WORK } from "@/scroll/script";

/**
 * Scene 6, services in the clouds, as pure functions (no React, no three). Timings live in `WORK`
 * (`src/scroll/script.ts`); places come from the art manifest. Offsets are world units added to a
 * plate's manifest place.
 *
 * - The clouds drift from the center to the right on idle time (`driftX`, wrapped far offscreen) and
 *   shift right as the story scrolls (`cloudShiftAt`, nearer clouds more), so they pass on both
 *   sides of the cards. The camera's own dolly gives the vertical parallax.
 * - The giant orange on its minaret and the builder rise into view during the third card.
 */

/** How far the clouds travel to the right over the whole scene when scrolling, at depth 1. */
export const CLOUD_SCROLL = 7;
/** Idle drift in world units per second, at depth 1; farther clouds drift slower. */
export const CLOUD_SPEED = 0.35;
/** The clouds wrap over this width, centered on zero (wider than any view at cloud depth). */
export const WRAP_SPAN = 44;

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
