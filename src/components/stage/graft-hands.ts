import { WORLD_SCALE } from "@/art/manifest";
import { clamp01, ease, lerp, remap } from "@/lib/progress";
import { GRAFT } from "@/scroll/script";

/**
 * The graft as pure functions of story progress (no React, no three), so it plays backwards exactly.
 * Timings live in `GRAFT` (`src/scroll/script.ts`); places come from the art manifest.
 *
 * Hands enter from the lower corners (right carrying the cutting), fit the cutting to the cleft,
 * wind the twine, tie the knot in three steps and withdraw. All offsets are added to the plates'
 * manifest places, in hand lengths (`HAND`, the world scale's), so they keep their size with the hands.
 */

/** One hand length (wrist to fingertip) in world units: the unit of every offset here. */
const HAND = WORLD_SCALE.hand;

export interface Offset {
  x: number;
  y: number;
}

const eased = (p: number, [a, b]: readonly [number, number]) => ease(remap(p, a, b));

/** How far the hands have come in (0 out of frame, 1 at the work) and gone out again. */
export function handsIn(p: number): number {
  return eased(p, GRAFT.enter) * (1 - eased(p, GRAFT.exit));
}

const LEFT_AWAY: Offset = { x: -3.95 * HAND, y: -3.42 * HAND };
const RIGHT_AWAY: Offset = { x: 3.95 * HAND, y: -3.42 * HAND };

/** A small to-and-fro while the hands work (wrapping and tying), zero elsewhere. */
function working(p: number): number {
  const active = clamp01(remap(p, GRAFT.fit[1], GRAFT.wrap[0] + 0.02 * (GRAFT.wrap[1] - GRAFT.wrap[0]))) * (1 - clamp01(remap(p, GRAFT.knot[2][1] - 0.01, GRAFT.exit[0] + 0.02)));
  return active;
}

export function leftHandAt(p: number): Offset & { rotate: number } {
  const t = 1 - handsIn(p);
  const w = working(p);
  const wrapPhase = remap(p, GRAFT.wrap[0], GRAFT.knot[2][1]);
  return {
    x: LEFT_AWAY.x * t + 0.026 * HAND * w * Math.sin(wrapPhase * 18),
    y: LEFT_AWAY.y * t + 0.02 * HAND * w * Math.cos(wrapPhase * 18),
    rotate: 0.35 * t,
  };
}

export function rightHandAt(p: number): Offset & { rotate: number } {
  const t = 1 - handsIn(p);
  const fit = eased(p, GRAFT.fit);
  const wrapPhase = remap(p, GRAFT.wrap[0], GRAFT.knot[2][1]);
  const w = working(p);
  return {
    // Carrying the cutting up to the cleft: it holds a little above and right until fitted.
    x: RIGHT_AWAY.x * t + 0.37 * HAND * (1 - fit) * (1 - t) + 0.079 * HAND * w * Math.sin(wrapPhase * 18),
    y: RIGHT_AWAY.y * t + 0.395 * HAND * (1 - fit) * (1 - t) + 0.066 * HAND * w * Math.cos(wrapPhase * 18),
    rotate: -0.35 * t + 0.08 * w * Math.sin(wrapPhase * 18),
  };
}

/** The cutting rides with the right hand, then settles into the cleft. */
export function cuttingAt(p: number): Offset & { rotate: number; opacity: number } {
  const hand = rightHandAt(p);
  const fit = eased(p, GRAFT.fit);
  const carried = 1 - fit;
  const t = 1 - handsIn(p);
  // Before the fit, it follows the hand; after, it is in the cleft and stays.
  return {
    x: lerp(0, hand.x - 0.13 * HAND, carried) * (p < GRAFT.fit[1] ? 1 : 0),
    y: lerp(0, hand.y + 0.26 * HAND, carried) * (p < GRAFT.fit[1] ? 1 : 0),
    rotate: 0.5 * carried,
    opacity: p < GRAFT.fit[0] ? 1 - t : 1,
  };
}

/** How much of the twine is wound, 0 to 1 (it grows along the joint). */
export function twineAt(p: number): number {
  return eased(p, GRAFT.wrap);
}

/** Opacity of each of the three knot frames: step n shows from its start; the later one replaces it. */
export function knotAt(p: number): [number, number, number] {
  const s = GRAFT.knot.map((r) => eased(p, r));
  return [s[0] * (1 - s[1]), s[1] * (1 - s[2]), s[2]];
}

/** How much of the fruiting tree has filled in, 0 to 1. */
export function fruitAt(p: number): number {
  return eased(p, GRAFT.fruit);
}
