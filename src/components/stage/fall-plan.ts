import { plateEntry, platePoint, plateWorldSize } from "@/art/manifest";
import { dragAxis } from "@/lib/flight";
import { FALL, FALL_FLIGHT, fallingOrangeAt, PHYSICS, SCREEN } from "@/scroll/script";

import { beat, dampedKick, glide, noMarks, storyTime, strike, track, type MotionChannel, type MotionMarks, type SceneMotion, type Track, type Vec3 } from "./motion-kit";
import { SWAP } from "./prune-plan";

/**
 * Scene 10, the falling orange, as pure functions of progress (no React, no three). Timings live in
 * `FALL` (`src/scroll/script.ts`), the orange's flight in `FALL_FLIGHT` (the camera follows the same
 * flight, `fallingOrangeAt`).
 *
 * - As the camera comes to his face the gardener raises his shears to the foot of the branch with
 *   the orange (his arms turning on the shoulder), opens them a little and squeezes them shut: the
 *   closed-shears frame takes over inside the quick part of the squeeze. The branch comes free and
 *   the tree springs back, shaking; he lowers the shears (the open frame back in the quick part of
 *   the move), bows his head after the falling fruit and drifts right and out of frame.
 * - The cut branch falls on its own flight, tumbling, slowed by its leaves, and is gone.
 * - The orange falls in a true flight from its stem (gravity, a light air drag, a spin the air slows),
 *   the camera following and pushing in. Where the flight ends it strikes the sky as if it were
 *   water (the rainbow ring sweeps out from it): it is pressed flat and rings back round, its speed
 *   taken in a moment by the far stronger drag, and it sinks, going soft, as the camera pulls back.
 *   It is drawn at its own size: it fills the center because the camera comes close.
 *
 * Everything is a function of progress (story time is progress), so it plays backwards exactly.
 */

/** The branch that is cut, and the fruit on it (its `fruit` point): world centre and diameter (a fifth of the branch plate's height). */
const branch = plateEntry("prune/branch-right");
const fruitPoint = platePoint("prune/branch-right", "fruit");
export const BRANCH_FRUIT = { x: fruitPoint[0], y: fruitPoint[1], diameter: 0.2017 * branch.height } as const;

/** Where the ball sits in the falling-orange sprite: its diameter and the drop of its centre below the sprite's, as fractions of the sprite. */
export const SPRITE_BALL = { diameter: 0.76, drop: 0.07 } as const;
/** The sprite's anchor: the middle of the ball, so it turns and is pressed flat about it. */
export const BALL_ANCHOR: readonly [number, number] = [0.5, 0.5 + SPRITE_BALL.drop];

/** The orange's scale: the size of the fruit on the branch, all the way down (the camera comes close, the orange does not grow). */
export const BRANCH_SCALE = BRANCH_FRUIT.diameter / (plateEntry("fall/falling-orange").height * SPRITE_BALL.diameter);

/** Peak blur of the orange, as a fraction of the view height. */
export const SOFT_BLUR = 0.045;
/** The gardener's drift to the right, in world units: about twice his height, well out of the frame. */
export const GARDENER_DRIFT = 2.07 * plateEntry("prune/gardener").height;

const seconds = (p: number, from: number) => Math.max(0, storyTime(p, from));

/* ------------------------------------------------------------------ */
/* The gardener's cut                                                   */
/* ------------------------------------------------------------------ */

/** How far he raises the shears to the branch's foot (radians on the shoulder, clockwise lifts the blades), and the squeeze there. */
export const REACH = -0.36;
export const SQUEEZE = { open: 0.04, shut: -0.05, recoil: 0.25 } as const;

/** His arms' turn on the shoulder through the fall: up to the branch, the squeeze, down again. */
const armsTurn: Track = track([
  ...beat(FALL.reach, 0, REACH, { overshoot: 0.05, settle: 0.4 }),
  ...beat([FALL.snip[0], FALL.snip[0] + 0.55 * (FALL.snip[1] - FALL.snip[0])], REACH, REACH + SQUEEZE.open),
  ...strike([FALL.snip[0] + 0.55 * (FALL.snip[1] - FALL.snip[0]), FALL.snip[1]], REACH + SQUEEZE.open, REACH + SQUEEZE.shut, { stop: 0.14, recoil: SQUEEZE.recoil, settle: 0.6 * (FALL.snip[1] - FALL.snip[0]) }),
  ...beat(FALL.lower, REACH + SQUEEZE.shut, 0, { overshoot: 0.06, settle: 0.35 }),
]);

/** How far the gardener's arms are turned on the shoulder at progress p. */
export function fallArmsTurn(p: number): number {
  return armsTurn(p);
}

/** How far the closed-shears frame has replaced the open one: as the squeeze ends, and back in the quickest part of lowering them. */
export function fallShearsClosed(p: number): number {
  const squeeze = (FALL.snip[1] - FALL.snip[0]) * 0.45;
  const lowerMid = (FALL.lower[0] + FALL.lower[1]) / 2;
  const swap = SWAP * (FALL.lower[1] - FALL.lower[0]);
  return glide(p, [FALL.snip[1] - squeeze * 0.6, FALL.snip[1]]) * (1 - glide(p, [lowerMid - swap, lowerMid + swap]));
}

/** He bows his head after the falling fruit (a figure facing left bows with a positive turn). */
const headBow: Track = track(beat([FALL.cut[1], FALL.cut[1] + 0.6 * (FALL.lower[1] - FALL.cut[1])], 0, 0.1, { overshoot: 0.08, settle: 0.4 }));
export function fallHeadAt(p: number): number {
  return headBow(p);
}

/** He leans back a little as he lifts the shears to the branch (a figure facing left leans back with a negative turn), and comes forward again. */
export function fallLeanAt(p: number): number {
  return -0.03 * (armsTurn(p) / REACH);
}

/** The gardener's offset to the right: he drifts away and out of frame, from rest. */
export function gardenerX(p: number): number {
  return GARDENER_DRIFT * glide(p, FALL.gardener);
}

/* ------------------------------------------------------------------ */
/* The tree, and the cut branch                                         */
/* ------------------------------------------------------------------ */

/** The tree springs back as the branch's weight comes off it: a turn about its foot that rings out (radians), and the other branch's, more. */
export const RELEASE_KICK = { tree: -0.012, branch: -0.035 } as const;
const TREE_RING = { frequency: 2.2, decay: 3.2 } as const;

/** The shake from the cut, a share of RELEASE_KICK. */
export function cutShake(p: number): number {
  return dampedKick(1, seconds(p, FALL.cut[1]), TREE_RING);
}

/** The cut branch's middle (its plate's centre), where it turns about as it falls. */
const [branchW, branchH] = plateWorldSize(branch);
export const BRANCH_MIDDLE: readonly [number, number] = [branch.position[0] + (0.5 - branch.anchor[0]) * branchW, branch.position[1] + (branch.anchor[1] - 0.5) * branchH];
/** The cut branch's flight: from rest, slowed by its leaves, the air tipping it over, tip down. */
export const BRANCH_FLIGHT = { drag: 1.8, spin: -1.6, spinUp: 0.35 } as const;

export interface BranchPose {
  /** World position of the branch's middle. */
  x: number;
  y: number;
  rotate: number;
  opacity: number;
}

const axis: [number, number] = [0, 0];

/** How far the still branch (with its fruit) has handed over to the cut one and the orange, 0 to 1: at rest, as it comes free. */
export function cutAmount(p: number): number {
  return glide(p, FALL.cut);
}

/** The still branch of the prune scene (with its fruit): there until the cut. */
export function stillBranchOpacity(p: number): number {
  return 1 - cutAmount(p);
}

/** The cut branch at progress p: still until it comes free, then its own flight. */
export function cutBranchAt(p: number): BranchPose {
  const t = seconds(p, FALL.cut[1]);
  const { drag, spin, spinUp } = BRANCH_FLIGHT;
  const x = BRANCH_MIDDLE[0];
  const y = dragAxis(BRANCH_MIDDLE[1], 0, -PHYSICS.gravity, drag, t, axis)[0];
  const rotate = spunUp(spin, spinUp, t);
  const [a, b] = FALL.branch;
  return { x, y, rotate, opacity: cutAmount(p) * (1 - glide(p, [a + 0.75 * (b - a), b])) };
}

/* ------------------------------------------------------------------ */
/* The orange                                                           */
/* ------------------------------------------------------------------ */

export interface OrangeFrame {
  /** World position of the middle of the ball. */
  x: number;
  y: number;
  /** Multiple of the drawn sprite height. */
  scale: number;
  /** Pressed flat as it strikes (scale across and down). */
  scaleX: number;
  scaleY: number;
  rotate: number;
  /** Fraction of the view height. */
  blur: number;
  opacity: number;
}

/** Seconds of story time from the stem to the strike. */
const STRIKE_AFTER = ((FALL.release[1] - FALL.release[0]) / SCREEN) * PHYSICS.secondsPerScreen;
const flight = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };

/**
 * A turn taken up from rest: the spin rises to `spin` over about `tau` seconds (a snap's twist, the
 * air on a leafy branch), so its speed never jumps: `spin (t - tau (1 - e^(-t / tau)))`. Its spin at t
 * is `spin (1 - e^(-t / tau))`.
 */
export function spunUp(spin: number, tau: number, t: number): number {
  return t <= 0 ? 0 : spin * (t + tau * Math.expm1(-t / tau));
}

/** The orange's turn: its spin taken up from the stem, then slowed to nothing by the sky it sinks in. */
function spinAt(t: number): number {
  const { spin, spinUp, water } = FALL_FLIGHT;
  const inAir = Math.min(t, STRIKE_AFTER);
  let turn = spunUp(spin, spinUp, inAir);
  if (t > STRIKE_AFTER) turn += (spin * -Math.expm1(-STRIKE_AFTER / spinUp) * -Math.expm1(-water * (t - STRIKE_AFTER))) / water;
  return turn;
}

/** How far it is pressed flat after the strike (0 in the air), ringing back round. */
export function squashAt(p: number): number {
  const { amount, frequency, decay } = FALL_FLIGHT.squash;
  return amount * dampedKick(1, seconds(p, FALL.release[1]), { frequency, decay, onset: 0.03 });
}

/** The orange at progress p. */
export function orangeFrame(p: number): OrangeFrame {
  fallingOrangeAt(p, flight);
  const squash = squashAt(p);
  return {
    x: flight.x,
    y: flight.y,
    scale: BRANCH_SCALE,
    scaleX: 1 + 0.6 * squash,
    scaleY: 1 - squash,
    rotate: spinAt(flight.t),
    blur: SOFT_BLUR * glide(p, FALL.soften),
    opacity: cutAmount(p) * (1 - glide(p, FALL.fade)),
  };
}

/* ------------------------------------------------------------------ */
/* For the velocity check and the motion lab                           */
/* ------------------------------------------------------------------ */

const shoulder = (() => {
  const arms = plateEntry("prune/gardener-arms-1");
  return [arms.position[0], arms.position[1], -arms.depth] as Vec3;
})();

function fallMarks(p: number): MotionMarks {
  const marks = noMarks();
  marks.pivots.push([shoulder[0] + gardenerX(p), shoulder[1], shoulder[2]]);
  const o = orangeFrame(p);
  marks.grips.push([o.x, o.y, 0]);
  const b = cutBranchAt(p);
  marks.pivots.push([b.x, b.y, -branch.depth]);
  return marks;
}

const channels: MotionChannel[] = [
  { name: "gardener · arms on the shoulder", at: fallArmsTurn },
  { name: "gardener · shears closed frame", at: fallShearsClosed },
  { name: "gardener · head", at: fallHeadAt },
  { name: "gardener · drift", at: gardenerX },
  { name: "tree · spring back", at: cutShake },
  { name: "cut branch · x", at: (p) => cutBranchAt(p).x },
  { name: "cut branch · y", at: (p) => cutBranchAt(p).y },
  { name: "cut branch · turn", at: (p) => cutBranchAt(p).rotate },
  { name: "orange · x", at: (p) => orangeFrame(p).x },
  { name: "orange · y", at: (p) => orangeFrame(p).y },
  { name: "orange · turn", at: (p) => orangeFrame(p).rotate },
  { name: "orange · pressed flat", at: squashAt },
  { name: "orange · blur", at: (p) => orangeFrame(p).blur },
];

const arcSamples = (f: (p: number) => Vec3, [a, b]: readonly [number, number]) => Array.from({ length: 49 }, (_, i) => f(a + ((b - a) * i) / 48));

export const FALL_MOTION: SceneMotion = {
  channels,
  marks: fallMarks,
  arcs: () => [
    { name: "orange", points: arcSamples((p) => [orangeFrame(p).x, orangeFrame(p).y, 0], [FALL.release[0], FALL.push[1]]) },
    { name: "cut branch", points: arcSamples((p) => [cutBranchAt(p).x, cutBranchAt(p).y, -branch.depth], FALL.branch) },
  ],
};
