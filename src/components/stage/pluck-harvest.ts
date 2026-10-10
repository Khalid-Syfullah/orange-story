import { plateEntry, platePoint, WORLD_SCALE } from "@/art/manifest";
import { clamp01, ease, lerp, remap } from "@/lib/progress";
import { CAMERA, PLUCK } from "@/scroll/script";

import { cameraTravel } from "./camera-path";

/**
 * The pluck and the harvester as pure functions of story progress (no React, no three), so the whole
 * scene plays backwards exactly. Timings live in `PLUCK` (`src/scroll/script.ts`); places come from
 * the art manifest. All offsets are world units added to a plate's manifest place, sized from the art
 * (the orange's plate height, the world scale), so they keep their proportions with the figures.
 *
 * The hand rises from below the frame to the hero orange and closes on it; the camera then dollies
 * down through the branches (the pluck camera keys, same `dolly` range) while the hand pulls the
 * fruit free and carries it down with the camera, so the fruit stays framed as the foliage rushes
 * up past it. The harvester is revealed; the hand lets go and drops away, and the orange becomes the
 * one in his right hand (the `harvester-arm` plate already holds one) as his arm arrives.
 */

export interface Offset {
  x: number;
  y: number;
}

const eased = (p: number, [a, b]: readonly [number, number]) => ease(remap(p, a, b));

/** A single bump that rises and falls over a range (0 outside it). */
const bump = (p: number, [a, b]: readonly [number, number]) => Math.sin(Math.PI * remap(p, a, b));

/**
 * Where the orange rests in the harvester's hand (centre of the ball, world units): the `orange`
 * point of his arm plate, so a painting that holds the fruit elsewhere moves it with its sidecar.
 */
const heldPoint = platePoint("pluck/harvester-arm", "orange");
export const HELD: Readonly<[number, number]> = [heldPoint[0], heldPoint[1]];

/** World size of the held orange relative to the hero orange (the arm plate's own is a little smaller). */
export const HELD_SCALE = 0.87;

/** The special orange is drawn larger than its neighbours, so it reads as the one to pick. */
export const HERO_SCALE = 1.7;

/** The ball sits a little below the middle of its plate (see the `orange` placeholder). */
const BALL_BELOW_CENTER = 0.07;

const orange = () => plateEntry("pluck/hero-orange");
const hand = () => plateEntry("pluck/hand");

/** Where the center of the ball is at rest on the branch. */
function ballRest(): Offset {
  const e = orange();
  return { x: e.position[0], y: e.position[1] - BALL_BELOW_CENTER * e.height };
}

/**
 * How far the whole carry has gone, 0 on the branch to 1 in the harvester's hand: the camera's own
 * travel down the dolly (the same path as the camera rig; the dolly starts and ends on camera keys),
 * so the fruit moves exactly with the camera and stays framed.
 */
export const carryAt = cameraTravel(CAMERA, PLUCK.dolly[0], PLUCK.dolly[1]);

/**
 * The hand starts below the frame: its fingertips this far (world units) below their manifest place,
 * just under the bottom of the first pluck frame on a wide screen (the camera key's own view).
 */
export const HAND_BELOW = (() => {
  const first = CAMERA.find((k) => k.scene === "pluck");
  if (!first) throw new Error("The pluck needs a camera key");
  const h = hand();
  const half = (first.position[2] + h.depth) * Math.tan((first.fov * Math.PI) / 360);
  return first.position[1] - 1.06 * half - h.position[1];
})();
/** The fingertips end this far above the ball's center (in orange plate heights), so the fingers wrap over its lower half. */
const FINGERS_OVER_CENTER = -0.2;
/** The tug's pull on the fruit, the hand's drift as it lets go and how far it drops away, in orange plate heights. */
const TUG = 0.56;
const LET_GO = { x: 0.12, y: 3.4 } as const;

/** The fruit's travel from the branch to the harvester's hand, in offsets from its manifest place. */
function travel(): Offset {
  const rest = ballRest();
  return { x: HELD[0] - rest.x, y: HELD[1] - rest.y };
}

/** Offsets from the hero orange's manifest place that put it in the harvester's hand (where the pluck ends). */
export function heldOffset(): Offset {
  return travel();
}

/** 0 while the hand holds the fruit, 1 once it let go. */
export function releaseAt(p: number): number {
  return eased(p, PLUCK.release);
}

/** A short damped wobble when the fruit comes free. */
function wobble(p: number): number {
  const t = remap(p, PLUCK.tug[0], PLUCK.tug[1] + (PLUCK.tug[1] - PLUCK.tug[0]));
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI * 4) * (1 - t) ** 2;
}

/** The hero orange: on the branch, tugged free, carried down with the camera, handed to the harvester. */
export function heroOrangeAt(p: number): Offset & { rotate: number; scale: number; opacity: number } {
  const carry = carryAt(p);
  const go = travel();
  // The tug: a quick pull down, then it settles (the hand drags the fruit before it comes free).
  const pull = TUG * orange().height * bump(p, PLUCK.tug);
  return {
    x: go.x * carry,
    y: go.y * carry - pull,
    rotate: 0.16 * wobble(p),
    scale: lerp(HERO_SCALE, HELD_SCALE, carry),
    // The orange in the harvester's hand (his arm plate) takes over once the fruit has reached it.
    opacity: 1 - eased(p, PLUCK.handoff),
  };
}

export interface HandPose extends Offset {
  scaleX: number;
  scaleY: number;
  rotate: number;
  opacity: number;
}

/** The rising hand: up from the bottom center, closes on the fruit, pulls it down, lets go. */
export function handAt(p: number): HandPose {
  const rise = eased(p, PLUCK.rise);
  const grasp = eased(p, PLUCK.grasp);
  const carry = carryAt(p);
  const release = releaseAt(p);
  const go = travel();
  const h = hand();
  // From below the frame to the fruit: its fingertips end over the ball's lower half.
  const rest = ballRest();
  const unit = orange().height;
  const toFruit = rest.y + FINGERS_OVER_CENTER * unit - h.position[1];
  const up = lerp(HAND_BELOW, toFruit, rise);
  const pull = TUG * unit * bump(p, PLUCK.tug);
  return {
    x: lerp(0, rest.x - h.position[0], rise) + go.x * carry - LET_GO.x * unit * release,
    y: up + go.y * carry - pull - LET_GO.y * unit * release,
    // Fingers close (narrower, slightly shorter) and open again as it lets go.
    scaleX: 1 - 0.16 * grasp * (1 - release),
    scaleY: 1 - 0.04 * grasp * (1 - release),
    rotate: -0.05 * grasp * (1 - release) + 0.1 * wobble(p) * (1 - release),
    // It fades as it drops away.
    opacity: clamp01(1 - release),
  };
}

/**
 * How much of the harvester has appeared, 0 to 1. His body and head are revealed first, settling in
 * from a little below as the camera comes down to him; his arm (which holds an orange) arrives with
 * the handoff, so there is never a second orange before the fruit has reached his hand.
 */
/** How far below his place the harvester settles in from: a twelfth of a standing figure. */
const SETTLE_FROM = WORLD_SCALE.adult / 12;

export function harvesterAt(p: number): { opacity: number; rise: number; arm: number } {
  const t = eased(p, PLUCK.reveal);
  return { opacity: t, rise: -SETTLE_FROM * (1 - t), arm: eased(p, PLUCK.handoff) };
}

/** The foliage layers that fall away: near first, then the middle one. */
export function foliageAt(p: number): { near: { opacity: number; scale: number }; mid: { opacity: number } } {
  const near = eased(p, PLUCK.foliage.near);
  const mid = eased(p, PLUCK.foliage.mid);
  return { near: { opacity: 1 - near, scale: 1 + 0.18 * near }, mid: { opacity: 1 - mid } };
}
