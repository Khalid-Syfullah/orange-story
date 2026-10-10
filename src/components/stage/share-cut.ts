import { plateEntry, plateWorldSize } from "@/art/manifest";
import { clamp01, ease, lerp, remap } from "@/lib/progress";
import { SHARE } from "@/scroll/script";

import { HELD, HELD_SCALE, heldOffset } from "./pluck-harvest";

/**
 * The cut and the share as pure functions of story progress (no React, no three), so the whole scene
 * plays backwards exactly. Timings live in `SHARE` (`src/scroll/script.ts`); places come from the art
 * manifest. All offsets are world units added to a plate's manifest place.
 *
 * His left hand comes in above the orange he holds, the knife plunges down through it (the whole
 * orange gives way to its two peels under the blade), the knife withdraws and the halves open, their
 * cut faces revealed as they part. A second hand reaches in from center left, takes the left half and
 * draws it a little away, then both hands bring the halves together and hold them.
 *
 * The halves are placed by their cut edges. The placeholder halves have the cut edge 0.12 of the plate
 * width from the plate center (left half: to the right of it; right half: to the left); final art
 * keeps that or changes `HALF_EDGE`.
 */

export interface Offset {
  x: number;
  y: number;
}

const eased = (p: number, [a, b]: readonly [number, number]) => ease(remap(p, a, b));

/** Distance of a half's cut edge from its plate center, as a fraction of the plate width. */
export const HALF_EDGE = 0.12;

/** The halves are drawn this much smaller while together in the harvester's hand (the whole orange's size). */
export const CLOSED_SCALE = 0.9;

/** World x of the cut where the two halves meet (the middle of the held orange). */
export const CUT_X = HELD[0];

/** World x of the cut edges while the halves are opened, drawn away and held together. */
export const EDGE = {
  openLeft: 1.4,
  openRight: 1.59,
  /** The second hand draws the left half this far out. */
  takenLeft: 1.22,
} as const;

const left = () => plateEntry("share/peel-left");
const right = () => plateEntry("share/peel-right");
const knife = () => plateEntry("share/knife-hand");

/** Cut edge of a half at scale 1 when it stands at its manifest place (the held pose). */
export function heldEdges(): { left: number; right: number } {
  const l = left();
  const r = right();
  return {
    left: l.position[0] + HALF_EDGE * plateWorldSize(l)[0],
    right: r.position[0] - HALF_EDGE * plateWorldSize(r)[0],
  };
}

/** The whole orange in his right hand, before the cut: the hero orange at the place the pluck ended. */
export function wholeOrangeAt(p: number): Offset & { scale: number; opacity: number } {
  const o = heldOffset();
  return { x: o.x, y: o.y, scale: HELD_SCALE, opacity: 1 - eased(p, SHARE.split) };
}

/** How far the halves have opened, 0 (cut but together) to 1. */
export function openAt(p: number): number {
  return eased(p, SHARE.open);
}

/** World x of the left half's cut edge. */
export function leftEdgeAt(p: number): number {
  const held = heldEdges().left;
  let v = lerp(CUT_X, EDGE.openLeft, openAt(p));
  v = lerp(v, EDGE.takenLeft, eased(p, SHARE.take));
  return lerp(v, held, eased(p, SHARE.together));
}

/** World x of the right half's cut edge (the half stays in his hand). */
export function rightEdgeAt(p: number): number {
  const held = heldEdges().right;
  const v = lerp(CUT_X, EDGE.openRight, openAt(p));
  return lerp(v, held, eased(p, SHARE.together));
}

export interface HalvesPose {
  /** Both peels appear as the whole orange goes. */
  peel: number;
  /** The cut faces are revealed as the halves part. */
  face: number;
  scale: number;
  left: Offset;
  right: Offset;
}

/** The two halves: offsets from their manifest places, so the cut edges sit where `leftEdgeAt` says. */
export function halvesAt(p: number): HalvesPose {
  const scale = lerp(CLOSED_SCALE, 1, openAt(p));
  const l = left();
  const r = right();
  const lw = plateWorldSize(l)[0] * scale;
  const rw = plateWorldSize(r)[0] * scale;
  // The cut orange is level with the whole one.
  const y = HELD[1] - l.position[1];
  return {
    peel: eased(p, SHARE.split),
    face: clamp01(remap(openAt(p), 0.25, 1)),
    scale,
    left: { x: leftEdgeAt(p) - HALF_EDGE * lw - l.position[0], y },
    right: { x: rightEdgeAt(p) + HALF_EDGE * rw - r.position[0], y },
  };
}

/* The knife hand: the plate is turned so the blade points down, and plunges through the orange. */

/** The blade points down (the plate's blade points left; this turns it a little short of a quarter). */
export const KNIFE_TILT = 1.25;

const KNIFE_ENTER: Offset = { x: 2, y: 1.5 };
/** The blade tip hangs just above the orange. */
export const KNIFE_ABOVE: Offset = { x: 0, y: 0.16 };
/** ...and goes through to just below it. */
export const KNIFE_THROUGH: Offset = { x: 0, y: -0.34 };
const KNIFE_AWAY: Offset = { x: 1.8, y: 1.3 };

export function knifeAt(p: number): Offset & { rotate: number; opacity: number } {
  const arrive = eased(p, SHARE.knifeIn);
  const plunge = eased(p, SHARE.cut);
  const leave = eased(p, SHARE.knifeOut);
  let x = lerp(KNIFE_ENTER.x, KNIFE_ABOVE.x, arrive);
  let y = lerp(KNIFE_ENTER.y, KNIFE_ABOVE.y, arrive);
  y = lerp(y, KNIFE_THROUGH.y, plunge);
  x = lerp(x, KNIFE_AWAY.x, leave);
  y = lerp(y, KNIFE_AWAY.y, leave);
  return {
    x,
    y,
    // It swings round as it arrives and tips back a little as it withdraws.
    rotate: KNIFE_TILT + 0.5 * (1 - arrive) + 0.25 * leave,
    opacity: clamp01(remap(arrive, 0, 0.4)) * (1 - clamp01(remap(leave, 0.6, 1))),
  };
}

/** Where the blade tip is in the world at progress p (the orange's top is about 0.18 above the held center). */
export function knifeTip(p: number): Offset {
  const k = knife();
  const o = knifeAt(p);
  return { x: k.position[0] + o.x, y: k.position[1] + o.y };
}

/* The second hand: from center left to the left half, takes it, and holds it with the other. */

const HAND_FROM_X = -2.4;

export interface SecondHandPose extends Offset {
  scaleY: number;
  rotate: number;
  opacity: number;
}

export function secondHandAt(p: number): SecondHandPose {
  const reach = eased(p, SHARE.reach);
  const grasp = eased(p, SHARE.take);
  const heldLeft = heldEdges().left;
  return {
    // It arrives at the half, then rides with it wherever the half goes.
    x: lerp(HAND_FROM_X, 0, reach) + (leftEdgeAt(p) - heldLeft) * reach,
    y: -0.08 * (1 - reach),
    scaleY: 1 - 0.1 * grasp,
    rotate: -0.06 * (1 - reach),
    opacity: clamp01(remap(reach, 0, 0.3)),
  };
}
