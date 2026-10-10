import { plateEntry } from "@/art/manifest";
import { SHARE } from "@/scroll/script";

import { turnAbout } from "./life";
import {
  arcPoint,
  dampedRelease,
  forearmRig,
  fromAnchor,
  glide,
  moves,
  noMarks,
  placeOn,
  poseThrough,
  reachWith,
  storyTime,
  track,
  type ForearmPose,
  type MotionMarks,
  type Pose,
  type SceneMotion,
  type Vec2,
  type Vec3,
} from "./motion-kit";
import { HAND_DEPTH, HELD, HELD_SCALE, heldOffset } from "./pluck-harvest";

/**
 * The cut and the share as pure functions of story progress (no React, no three), so the whole scene
 * plays backwards exactly. Timings live in `SHARE` (`src/scroll/script.ts`); places come from the
 * art manifest: the blade tip, the knife hand's wrist and elbow, the halves' cut edges and hinges,
 * the second hand's wrist, knuckles and grip, the harvester's palm (`HELD`).
 *
 * - The knife hand is a forearm plate on a whole arm (`reachWith`): its elbow stays in the folds of
 *   his mantle, the blade tip is what it aims. It comes up from his side on an arc to above the
 *   orange, lifts a little and cuts down: slow through the rind, quick through the flesh, slow to his
 *   palm, the blade rocking a little as it goes. Under the blade the whole orange gives way to its two
 *   peels. Then it draws the blade back out and drops away to his side.
 * - The halves tip apart about the foot of their cut edges (`hinge`), rock and settle in his palm
 *   (`dampedRelease`), and turn their cut faces up: each face widens from a line about its cut edge,
 *   as a disc turning toward the eye does.
 * - The second hand rises from center left on an arc to the left half, the half passes into it where
 *   both are still, it draws it a little away, and both hands bring the halves together and hold.
 * - The fruit, its halves and the second hand stand at the depth of his palm (`HAND_DEPTH`), so the
 *   camera's push never slides a half off the hand that holds it.
 */

export interface Offset {
  x: number;
  y: number;
}

/** The unit of the offsets here: the height of the orange's plate (the fruit and a little air around it). */
export const UNIT = plateEntry("pluck/hero-orange").height;

/** World x of the cut: the middle of the orange in his hand. */
export const CUT_X = HELD[0];

/** The halves are drawn at this size: together, they are the whole orange in his hand. */
export const CLOSED_SCALE = 0.9;

const range = ([a, b]: readonly [number, number], s: number) => a + (b - a) * s;

/* ------------------------------------------------------------------ */
/* The whole orange                                                    */
/* ------------------------------------------------------------------ */

/** The whole orange in his right hand, before the cut: the hero orange where the pluck left it; it gives way to its peels under the blade. */
export function wholeOrangeAt(p: number): Offset & { scale: number; opacity: number } {
  const o = heldOffset();
  const give = palmOffset(p);
  return { x: o.x + give[0], y: o.y + give[1], scale: HELD_SCALE, opacity: 1 - glide(p, SHARE.split) };
}

/* ------------------------------------------------------------------ */
/* The knife                                                           */
/* ------------------------------------------------------------------ */

const knifeEntry = plateEntry("share/knife-hand");
/** His left arm: from his left shoulder (in the mantle), across his chest, the elbow in the folds over his right shoulder. */
const KNIFE = forearmRig("share/knife-hand", { shoulder: [HELD[0] + 4.15 * UNIT, HELD[1] + 1.85 * UNIT], upper: 2.9 * UNIT, bend: -1, grip: "knife-tip" });

/** Where the blade tip goes (world): from below the frame at his side, up over the orange, down through it to his palm, out and away. */
const TIP_FROM: Vec2 = [HELD[0] + 3.2 * UNIT, HELD[1] - 2.8 * UNIT];
const TIP_ABOVE: Vec2 = [CUT_X + 0.03 * UNIT, HELD[1] + 0.42 * UNIT];
/** The blade stops at his palm: the bottom of the orange. */
const TIP_BOTTOM: Vec2 = [CUT_X - 0.02 * UNIT, HELD[1] - 0.33 * UNIT];
const TIP_OUT: Vec2 = [CUT_X + 0.12 * UNIT, HELD[1] + 0.42 * UNIT];
const TIP_AWAY: Vec2 = [HELD[0] + 3.4 * UNIT, HELD[1] - 3.2 * UNIT];

const knifeOutUp = [SHARE.knifeOut[0], range(SHARE.knifeOut, 0.32)] as const;
const knifeOutAway = [range(SHARE.knifeOut, 0.32), SHARE.knifeOut[1]] as const;
const tipBefore = moves(TIP_FROM, [{ range: SHARE.knifeIn, to: TIP_ABOVE, bow: 0.2, shape: { overshoot: 0.04 } }]);
const tipAfter = moves(TIP_BOTTOM, [
  { range: knifeOutUp, to: TIP_OUT, bow: -0.15 },
  { range: knifeOutAway, to: TIP_AWAY, bow: 0.1, shape: { anticipate: 0.03, lead: 0.15 } },
]);
/** The cut's pace along its path (0 above, 1 at his palm): a small lift first, slow through the rind, quick through the flesh, slow to the palm. */
const { lift, rind, flesh } = SHARE.cutPace;
const cutPath = track([
  [SHARE.cut[0], 0],
  [range(SHARE.cut, lift), -0.05],
  [range(SHARE.cut, rind), 0.16],
  [range(SHARE.cut, flesh), 0.84],
  [SHARE.cut[1], 1],
]);
/** The blade's turn (its hand's, from the painted pose): it comes up flat, turns point down over the orange, rocks a little as it cuts, and turns back as it leaves. */
const knifeTurn = track([
  [SHARE.knifeIn[0], 0.1],
  [SHARE.knifeIn[1], 0.62],
  [range(SHARE.cut, rind), 0.6],
  [SHARE.cut[1], 0.78],
  [knifeOutUp[1], 0.6],
  [SHARE.knifeOut[1], 0.15],
]);

/** Where the blade tip is (world) at progress p. */
export function knifeTip(p: number): Offset {
  let at: [number, number];
  if (p < SHARE.cut[0]) at = tipBefore(p);
  else if (p < SHARE.cut[1]) at = arcPoint(TIP_ABOVE, TIP_BOTTOM, -0.04, cutPath(p));
  else at = tipAfter(p);
  return { x: at[0], y: at[1] };
}

const memo = { knife: { p: Number.NaN, pose: null as ForearmPose | null }, hand: { p: Number.NaN, pose: null as ForearmPose | null } };

function knifePose(p: number): ForearmPose {
  if (memo.knife.p === p && memo.knife.pose) return memo.knife.pose;
  const tip = knifeTip(p);
  const pose = reachWith(KNIFE, [tip.x, tip.y], knifeTurn(p));
  memo.knife = { p, pose };
  return pose;
}

/** The knife hand: offsets of its plate from its manifest place, its turn (radians), and its wrist's bend for its rig. */
export function knifeAt(p: number): Offset & { rotate: number; wrist: number } {
  const k = knifePose(p);
  return { x: k.pose.x - knifeEntry.position[0], y: k.pose.y - knifeEntry.position[1], rotate: k.pose.rotate, wrist: k.wrist };
}

/* ------------------------------------------------------------------ */
/* The halves                                                          */
/* ------------------------------------------------------------------ */

/** Points of a half (from its anchor, at the closed scale): its cut edge's middle and its foot, the hinge it tips about. */
const half = (id: "share/peel-left" | "share/peel-right") => ({
  edge: fromAnchor(id, "cut-edge").map((v) => v * CLOSED_SCALE) as unknown as Vec2,
  hinge: fromAnchor(id, "hinge").map((v) => v * CLOSED_SCALE) as unknown as Vec2,
  position: plateEntry(id).position,
});
const LEFT_HALF = half("share/peel-left");
const RIGHT_HALF = half("share/peel-right");

/** Distance of a half's cut edge from its anchor (the plate centre), as a fraction of the plate width: from its `cut-edge` point. */
function cutEdge(id: string, side: 1 | -1): number {
  const e = plateEntry(id);
  const pt = e.points?.["cut-edge"];
  if (!pt) throw new Error(`Plate "${id}" has no point "cut-edge"`);
  return side * (pt[0] - e.anchor[0]);
}

/** The halves' cut edges from their plate centres (left half: right of it; right half: left of it). */
export const HALF_EDGE = { left: cutEdge("share/peel-left", 1), right: cutEdge("share/peel-right", -1) } as const;

/** Where a half's hinge is when the orange is whole: its cut edge on the cut, level with the orange. */
const hingeClosed = (h: typeof LEFT_HALF): Vec2 => placeOn({ x: CUT_X - h.edge[0], y: HELD[1] - h.edge[1], rotate: 0, scale: 1 }, h.hinge);
const HINGE_LEFT = hingeClosed(LEFT_HALF);
const HINGE_RIGHT = hingeClosed(RIGHT_HALF);

/** How far the halves tip apart (radians) once they rest in his palm, how they rock as they fall, and how far their feet slide apart. */
export const TIP_OPEN = 0.24;
const ROCK = { frequency: 3.4, decay: 14 } as const;
const GAP = 0.06 * UNIT;

/** How far the halves have tipped open: they fall apart from rest, rock and settle (a damped spring let go, so it starts at rest). */
function tipped(p: number): number {
  if (p <= SHARE.open[0]) return 0;
  return TIP_OPEN * (1 - dampedRelease(1, storyTime(p, SHARE.open[0]), ROCK));
}

/** How much of the left half is in the second hand: it passes over where both hands are still. */
const TAKE_OVER = [SHARE.take[0], range(SHARE.take, 0.35)] as const;
export function inSecondHand(p: number): number {
  return glide(p, TAKE_OVER);
}

export interface HalfPose {
  /** Offsets of the plate from its manifest place, its turn about its anchor (radians) and its scale. */
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

export interface HalvesPose {
  /** Both peels appear as the whole orange goes. */
  peel: number;
  /** How far each half has turned its cut face up, 0 (edge on) to 1. */
  face: number;
  left: HalfPose;
  right: HalfPose;
  /** Where each cut face's middle is (world) and how the face is turned: the face plates widen about it. */
  leftEdge: [number, number];
  rightEdge: [number, number];
}

const tmpPose: Pose = { x: 0, y: 0, rotate: 0, scale: 1 };

/** A half placed by its hinge (its points are already at the closed scale), turned about it. */
function halfPose(h: typeof LEFT_HALF, hinge: Vec2, rotate: number): HalfPose {
  const pose = poseThrough(hinge, h.hinge, rotate, 1, tmpPose);
  return { x: pose.x - h.position[0], y: pose.y - h.position[1], rotate, scale: CLOSED_SCALE };
}

/** The tilt the left half is held at in the second hand: a little toward the eye, its face up. */
const HELD_TILT = 0.12;

/** The two halves at progress p. */
export function halvesAt(p: number): HalvesPose {
  const t = tipped(p);
  const gap = GAP * glide(p, SHARE.open);
  const take = inSecondHand(p);
  const give = palmOffset(p);
  // The right half stays in his palm.
  const right: Vec2 = [HINGE_RIGHT[0] + gap + give[0], HINGE_RIGHT[1] + give[1]];
  const rightTurn = -t;
  // The left half, from his palm into the second hand.
  const inPalm: Vec2 = [HINGE_LEFT[0] - gap + give[0], HINGE_LEFT[1] + give[1]];
  const grip = take > 0 ? secondHandAt(p).grip : null;
  const hand: Vec2 = grip ? [grip[0] - SEAT[0], grip[1] - SEAT[1]] : inPalm;
  const left: Vec2 = [inPalm[0] + (hand[0] - inPalm[0]) * take, inPalm[1] + (hand[1] - inPalm[1]) * take];
  const leftTurn = t + (HELD_TILT - t) * take;
  const l = halfPose(LEFT_HALF, left, leftTurn);
  const r = halfPose(RIGHT_HALF, right, rightTurn);
  return {
    peel: glide(p, SHARE.split),
    face: glide(p, SHARE.faces),
    left: l,
    right: r,
    leftEdge: placeOn({ x: LEFT_HALF.position[0] + l.x, y: LEFT_HALF.position[1] + l.y, rotate: leftTurn, scale: 1 }, LEFT_HALF.edge),
    rightEdge: placeOn({ x: RIGHT_HALF.position[0] + r.x, y: RIGHT_HALF.position[1] + r.y, rotate: rightTurn, scale: 1 }, RIGHT_HALF.edge),
  };
}

/** World x of the left half's cut edge. */
export function leftEdgeAt(p: number): number {
  return halvesAt(p).leftEdge[0];
}

/** World x of the right half's cut edge. */
export function rightEdgeAt(p: number): number {
  return halvesAt(p).rightEdge[0];
}

/* ------------------------------------------------------------------ */
/* The second hand                                                     */
/* ------------------------------------------------------------------ */

const secondEntry = plateEntry("share/second-hand");
/** Her arm: a shoulder out of the frame below and to the left, the elbow under the left of the frame. */
const SECOND = forearmRig("share/second-hand", { shoulder: [CUT_X - 5.1 * UNIT, HELD[1] - 3.8 * UNIT], upper: 5.5 * UNIT, bend: -1 });

/** Where the second hand's grip goes: up from below center left on an arc to the left half, a little away with it, then beside the right half. */
const GRIP_FROM: Vec2 = [CUT_X - 0.35 * UNIT, HELD[1] - 5.1 * UNIT];
/** The left half sits on her palm by the middle of its foot: her grip is this far left of its hinge (the foot of its cut edge). */
const SEAT: Vec2 = [-0.17 * UNIT, 0];
/** Under the left half as it rests open in his palm. */
const REACHED: Vec2 = [HINGE_LEFT[0] - GAP + SEAT[0], HINGE_LEFT[1] + SEAT[1]];
const DRAWN: Vec2 = [REACHED[0] - 0.3 * UNIT, REACHED[1] + 0.05 * UNIT];
/** Together: the two cut edges a hair apart, each half in its hand. */
const TOGETHER: Vec2 = [HINGE_RIGHT[0] + GAP - 0.07 * UNIT + SEAT[0], HINGE_RIGHT[1]];
const gripPath = moves(GRIP_FROM, [
  { range: SHARE.reach, to: REACHED, bow: -0.2, shape: { overshoot: 0.025 } },
  { range: [range(SHARE.take, 0.4), SHARE.take[1]], to: DRAWN, bow: 0.1 },
  { range: SHARE.together, to: TOGETHER, bow: -0.1, shape: { overshoot: 0.04 } },
]);
/** Her hand turns palm-level as it arrives, lifts a little as it takes the weight. */
const secondTurn = track([
  [SHARE.reach[0], -0.35],
  [SHARE.reach[1], 0],
  [range(SHARE.take, 0.4), 0.05],
  [SHARE.together[1], 0.02],
]);
/** Her fingers close a little round the half as she takes it. */
const secondFingers = track([
  [SHARE.take[0], 0],
  [range(SHARE.take, 0.4), 0.09],
]);

export interface SecondHandPose extends Offset {
  rotate: number;
  scale: number;
  wrist: number;
  fingers: number;
  grip: [number, number];
}

export function secondHandAt(p: number): SecondHandPose {
  if (!(memo.hand.p === p && memo.hand.pose)) {
    const at = gripPath(p);
    memo.hand = { p, pose: reachWith(SECOND, at, secondTurn(p), { fingers: -secondFingers(p) }) };
  }
  const h = memo.hand.pose!;
  return { x: h.pose.x - secondEntry.position[0], y: h.pose.y - secondEntry.position[1], rotate: h.pose.rotate, scale: 1, wrist: h.wrist, fingers: h.fingers, grip: h.grip };
}

/* ------------------------------------------------------------------ */
/* His arm takes the weight                                            */
/* ------------------------------------------------------------------ */

/** His arm gives a little under the blade's pressure (counter-clockwise: down), and comes back. */
export function palmGive(p: number): number {
  return 0.025 * glide(p, [range(SHARE.cut, SHARE.cutPace.rind), range(SHARE.cut, SHARE.cutPace.flesh)]) * (1 - glide(p, [SHARE.cut[1], range(SHARE.knifeOut, 0.6)]));
}

/** Where his palm holds the fruit (`HELD`), turned with that give about his shoulder. */
const ARM = plateEntry("share/arm-open");
const SHOULDER: Vec2 = (() => {
  const l = fromAnchor("share/arm-open", ARM.rig?.pivot ?? ARM.anchor);
  return [ARM.position[0] + l[0], ARM.position[1] + l[1]];
})();
export function palmAt(p: number): [number, number] {
  return turnAbout(HELD, SHOULDER, palmGive(p), [0, 0]);
}

/** How far his palm has moved with that give: what is in it moves as much. */
function palmOffset(p: number): [number, number] {
  const at = palmAt(p);
  return [at[0] - HELD[0], at[1] - HELD[1]];
}

/* ------------------------------------------------------------------ */
/* What the share moves                                                */
/* ------------------------------------------------------------------ */

const at3 = (v: Vec2, z: number): Vec3 => [v[0], v[1], z];
const KNIFE_Z = -knifeEntry.depth;
const HAND_Z = -HAND_DEPTH;

export const SHARE_MOTION: SceneMotion = {
  channels: [
    { name: "knife · tip x", at: (p) => knifeTip(p).x },
    { name: "knife · tip y", at: (p) => knifeTip(p).y },
    { name: "knife · forearm turn", at: (p) => knifeAt(p).rotate },
    { name: "knife · wrist", at: (p) => knifeAt(p).wrist },
    { name: "whole orange · opacity", at: (p) => wholeOrangeAt(p).opacity },
    { name: "halves · peel", at: (p) => halvesAt(p).peel },
    { name: "halves · faces turned", at: (p) => halvesAt(p).face },
    { name: "left half · x", at: (p) => halvesAt(p).left.x },
    { name: "left half · y", at: (p) => halvesAt(p).left.y },
    { name: "left half · tip", at: (p) => halvesAt(p).left.rotate },
    { name: "right half · x", at: (p) => halvesAt(p).right.x },
    { name: "right half · tip", at: (p) => halvesAt(p).right.rotate },
    { name: "second hand · x", at: (p) => secondHandAt(p).x },
    { name: "second hand · y", at: (p) => secondHandAt(p).y },
    { name: "second hand · forearm turn", at: (p) => secondHandAt(p).rotate },
    { name: "second hand · wrist", at: (p) => secondHandAt(p).wrist },
    { name: "his palm · give", at: palmGive },
  ],
  marks(p) {
    const m: MotionMarks = noMarks();
    const k = knifePose(p);
    m.bones.push([at3(k.shoulder, KNIFE_Z), at3(k.elbow, KNIFE_Z)], [at3(k.elbow, KNIFE_Z), at3(k.wristAt, KNIFE_Z)], [at3(k.wristAt, KNIFE_Z), at3(k.grip, KNIFE_Z)]);
    m.pivots.push(at3(k.elbow, KNIFE_Z), at3(k.wristAt, KNIFE_Z));
    m.grips.push(at3(k.grip, KNIFE_Z));
    secondHandAt(p);
    const s = memo.hand.pose!;
    m.bones.push([at3(s.shoulder, HAND_Z), at3(s.elbow, HAND_Z)], [at3(s.elbow, HAND_Z), at3(s.wristAt, HAND_Z)], [at3(s.wristAt, HAND_Z), at3(s.grip, HAND_Z)]);
    m.pivots.push(at3(s.elbow, HAND_Z), at3(s.wristAt, HAND_Z));
    m.grips.push(at3(s.grip, HAND_Z), at3(palmAt(p), HAND_Z));
    const h = halvesAt(p);
    m.pivots.push(at3(h.leftEdge, HAND_Z), at3(h.rightEdge, HAND_Z));
    return m;
  },
  arcs() {
    const sample = (a: number, b: number, f: (p: number) => Vec2, z: number) => Array.from({ length: 90 }, (_, i) => at3(f(a + ((b - a) * i) / 89), z));
    return [
      { name: "blade tip", points: sample(SHARE.knifeIn[0], SHARE.knifeOut[1], (p) => [knifeTip(p).x, knifeTip(p).y], KNIFE_Z) },
      { name: "second hand", points: sample(SHARE.reach[0], SHARE.together[1], (p) => secondHandAt(p).grip, HAND_Z) },
    ];
  },
};
