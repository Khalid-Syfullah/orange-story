import { plateEntry, platePoint, WORLD_SCALE, type PlateId } from "@/art/manifest";
import { CAMERA, PLUCK } from "@/scroll/script";

import { cameraTravel } from "./camera-path";
import { turnAbout } from "./life";
import {
  beat,
  dampedKick,
  fromAnchor,
  glide,
  moves,
  noMarks,
  placeOn,
  poseThrough,
  solveArm,
  storyTime,
  track,
  type LimbPose,
  type MotionMarks,
  type Pose,
  type SceneMotion,
  type Vec2,
  type Vec3,
} from "./motion-kit";

/**
 * The pluck and the harvester as pure functions of story progress (no React, no three), so the whole
 * scene plays backwards exactly. Timings live in `PLUCK` (`src/scroll/script.ts`); places come from
 * the art manifest (the hand's shoulder, elbow, knuckles and grip, the orange's stem and centre, the
 * harvester's shoulder and palm), so they keep their proportions with the figures.
 *
 * - The reaching arm is a two-bone chain (`solveArm`): its shoulder rises from below the frame, the
 *   hand goes to the fruit on an arc and the elbow follows (the plate's rig bends the forearm on the
 *   elbow). Its fingers close round the fruit (they curl in toward the knuckles; the scene draws them
 *   a second time in front of the fruit, the palm behind it).
 * - The tug: the hand pulls, the stem stretches (the fruit swings a little about it) and snaps; the
 *   hand follows through, and the branches, let go, shake and settle (`dampedKick`).
 * - From the grasp on the fruit is placed from the hand's grip (`placeOn`): it can never drift. The
 *   hand carries it down with the camera (`carryAt` reads the camera's own travel) and moves back,
 *   away from the lens, as it goes: the hand and the fruit get smaller together.
 * - The harvester's open arm swings up about his shoulder to meet it; the fruit changes hands where
 *   both are still; the hand that carried it opens and drops away; his head turns to the orange a
 *   beat after his arm arrives (`acting.ts`).
 */

const orange = plateEntry("pluck/hero-orange");
const handEntry = plateEntry("pluck/hand");

/**
 * Where the orange rests in the harvester's hand (centre of the ball, world units): the `orange`
 * point of his arm plate, so a painting that holds the fruit elsewhere moves it with its sidecar.
 */
const heldPoint = platePoint("pluck/harvester-arm", "orange");
export const HELD: Readonly<[number, number]> = [heldPoint[0], heldPoint[1]];

/** World size of the held orange relative to its plate (the harvester's palm holds it at this size). */
export const HELD_SCALE = 0.87;

/**
 * The depth everything handed from hand to hand stands at: the harvester's open arm's, a hair in
 * front of it (the reaching hand and the fruit here; the fruit, its halves and the second hand in the
 * share). Held things stand at the depth of the hand that holds them, so no camera move can slide
 * one against the other.
 */
export const HAND_DEPTH = plateEntry("share/arm-open").depth - 0.004;

/** On the branch the special orange is drawn larger, so it reads as the one to pick; the hand that reaches for it is drawn as much larger, as if nearer. */
export const HERO_SCALE = 1.4;

/** The orange plate's ball centre and stem top, from its anchor (at scale 1). */
const BALL = fromAnchor("pluck/hero-orange", "centre");
const STEM = fromAnchor("pluck/hero-orange", "stem");

/** Where the centre of the ball is at rest on the branch, at the hero scale. */
const ballRest = (): [number, number] => [orange.position[0] + BALL[0] * HERO_SCALE, orange.position[1] + BALL[1] * HERO_SCALE];
const REST = ballRest();
/** Where the stem holds it to the twig. */
const STEM_AT: [number, number] = [orange.position[0] + STEM[0] * HERO_SCALE, orange.position[1] + STEM[1] * HERO_SCALE];

/**
 * How far the whole carry has gone, 0 on the branch to 1 in the harvester's hand: the camera's own
 * travel down the dolly (the same path as the camera rig; the dolly starts and ends on camera keys),
 * so the fruit moves exactly with the camera and stays framed.
 */
export const carryAt = cameraTravel(CAMERA, PLUCK.dolly[0], PLUCK.dolly[1]);



/** How large the hand and the fruit are drawn (a multiple of their life size): large on the branch, life size in the harvester's hand. */
export function carryScale(p: number): number {
  return HERO_SCALE + (HELD_SCALE - HERO_SCALE) * carryAt(p);
}

/* ------------------------------------------------------------------ */
/* The tug and the snap                                                 */
/* ------------------------------------------------------------------ */

const [tugA, tugB] = PLUCK.tug;
const SNAP_AT = tugA + PLUCK.snap * (tugB - tugA);
/** The moment the stem snaps (the fruit comes free of the twig). */
export const SNAP = SNAP_AT;

/** How far (in orange heights, at the hero scale) the stem lets the fruit come before it snaps, and how far the hand follows through. */
const STRETCH = 0.32;
const FOLLOW = 0.45;
/** The stem stretches as the hand pulls: slowly, harder and harder, to a stop as it is about to give. */
const stretch = track([
  [tugA, 0],
  [tugA + 0.55 * (SNAP_AT - tugA), 0.42],
  [SNAP_AT, 1],
]);
/** After the snap the hand and the fruit follow through: quick, then easing into the carry. */
const follow = track(beat([SNAP_AT, tugB], 0, 1));
/** How far the fruit swings about its stem as it is pulled (radians): it tilts toward the pull. */
const SWING = 0.12;

/** The fruit's offset from its rest (world units) from the tug alone: down, a little toward the hand's side. */
function tugOffset(p: number): [number, number] {
  const unit = orange.height * HERO_SCALE;
  const down = STRETCH * unit * stretch(p) + FOLLOW * unit * follow(p);
  return [0.08 * down, -down];
}

/** The fruit's travel from where the tug leaves it to the harvester's hand (the carry takes it the rest of the way). */
const TUGGED = tugOffset(Infinity);
const GO: [number, number] = [HELD[0] - REST[0] - TUGGED[0], HELD[1] - REST[1] - TUGGED[1]];

/** How the branches react as the stem snaps: they spring back up and shake (a damped kick on their place and their turn). */
const BRANCH_RING = { frequency: 2.4, decay: 3.2 } as const;
export function branchShake(p: number, depthWeight: number): { y: number; rotate: number } {
  const t = storyTime(p, SNAP_AT);
  return { y: dampedKick(0.012 * depthWeight, t, BRANCH_RING), rotate: dampedKick(0.0045 * depthWeight, t, { frequency: 1.9, decay: 2.8 }) };
}

/* ------------------------------------------------------------------ */
/* The reaching arm                                                    */
/* ------------------------------------------------------------------ */

/** The arm plate's joints, from its anchor (the fingertips), at life size: shoulder, elbow, knuckles, grip. */
function armJoints(id: PlateId) {
  const rig = plateEntry(id).rig;
  if (!rig?.pivot || !rig.elbow || !rig.knuckles) throw new Error(`Plate "${id}" needs a rig with a pivot (its shoulder), an elbow and knuckles`);
  return { shoulder: fromAnchor(id, rig.pivot), elbow: fromAnchor(id, rig.elbow), knuckles: fromAnchor(id, rig.knuckles), grip: fromAnchor(id, "grip") };
}
const J = armJoints("pluck/hand");
const UPPER = Math.hypot(J.elbow[0] - J.shoulder[0], J.elbow[1] - J.shoulder[1]);
const FORE = Math.hypot(J.grip[0] - J.elbow[0], J.grip[1] - J.elbow[1]);
const UPPER_REST = Math.atan2(J.elbow[1] - J.shoulder[1], J.elbow[0] - J.shoulder[0]);
const FORE_REST = Math.atan2(J.grip[1] - J.elbow[1], J.grip[0] - J.elbow[0]);

/** The shoulder under the hand as it reaches (in lengths of the whole arm, from the grip: a little to the right and well below, the arm nearly straight). */
const SHOULDER_UNDER: Vec2 = [0.2, -0.87];
/** ...and further below and to the right before the body has risen into the reach. */
const SHOULDER_FROM: Vec2 = [0.36, -1.0];

/** The hand's grip goes up to the fruit on an arc from below and to the right, reaching a touch past it and settling. */
const RISE_FROM: Vec2 = [0.3, -1.55];
const reach = moves([REST[0] + RISE_FROM[0], REST[1] + RISE_FROM[1]], [{ range: PLUCK.rise, to: REST, bow: -0.18, shape: { overshoot: 0.03 } }]);
/** The body under the arm: rises into the reach, and stays under the hand as it carries the fruit down. */
const lift = track(beat([PLUCK.rise[0], PLUCK.rise[1] + 0.3 * (PLUCK.rise[1] - PLUCK.rise[0])], 0, 1));

/** The fingers close round the fruit (curl in toward the knuckles, a little turn), then open to let it go. */
const CURL = 0.3;
const curl = track([
  [PLUCK.grasp[0], 0],
  [PLUCK.grasp[1], CURL],
  [PLUCK.release[0], CURL],
  [PLUCK.release[0] + 0.3 * (PLUCK.release[1] - PLUCK.release[0]), 0.02],
]);
const fingerTurn = track([
  [PLUCK.grasp[0], 0],
  [PLUCK.grasp[1], -0.06],
  [PLUCK.release[0], -0.06],
  [PLUCK.release[0] + 0.3 * (PLUCK.release[1] - PLUCK.release[0]), 0.05],
]);

/** As it lets go the hand drops away down and to the right, faster and faster, out of the frame. */
const dropAway = moves([0, 0], [{ range: [PLUCK.release[0] + 0.12 * (PLUCK.release[1] - PLUCK.release[0]), PLUCK.release[1]], to: [0.32, -1.1], bow: 0.12, shape: { anticipate: 0.03, lead: 0.2 } }]);

/** The reaching arm at a moment: what its plate and its rig need, and its bones. */
export interface ArmPose {
  /** Offsets of the plate from its manifest place, its turn about its anchor (radians) and its scale. */
  x: number;
  y: number;
  rotate: number;
  scale: number;
  /** The forearm's bend at the elbow, the fingers' turn and curl, for the plate's rig. */
  elbow: number;
  fingers: number;
  curl: number;
  /** Where its grip really is (world): the fruit's centre while it holds it. */
  grip: [number, number];
  bones: { shoulder: [number, number]; elbow: [number, number] };
}

const tmpLimb: LimbPose = { elbow: [0, 0], hand: [0, 0], upper: 0, fore: 0, reach: 0 };
const tmpPose: Pose = { x: 0, y: 0, rotate: 0, scale: 1 };
const tmpLocal: [number, number] = [0, 0];
const memo = { p: Number.NaN, arm: null as ArmPose | null };

/** Where the hand's grip goes at progress p (world): the reach, then the fruit's path. */
function gripTarget(p: number): [number, number] {
  const at = reach(p);
  const tug = tugOffset(p);
  const carry = carryAt(p);
  const away = dropAway(p);
  const k = carryScale(p) / HERO_SCALE;
  return [at[0] + tug[0] + GO[0] * carry + away[0] * k, at[1] + tug[1] + GO[1] * carry + away[1] * k];
}

/** The reaching arm at progress p. */
export function handAt(p: number): ArmPose {
  if (memo.p === p && memo.arm) return memo.arm;
  const scale = carryScale(p) / HELD_SCALE;
  const target = gripTarget(p);
  // The shoulder: from below and to the right up under the hand as the body rises into the reach, then with the hand as it carries.
  const l = lift(p);
  const length = (UPPER + FORE) * scale;
  const sx = target[0] + (SHOULDER_FROM[0] + (SHOULDER_UNDER[0] - SHOULDER_FROM[0]) * l) * length;
  const sy = target[1] + (SHOULDER_FROM[1] + (SHOULDER_UNDER[1] - SHOULDER_FROM[1]) * l) * length;
  const limb = solveArm({ shoulder: [sx, sy], upper: UPPER * scale, fore: FORE * scale, bend: -1 }, target, tmpLimb);
  const rotate = limb.upper - UPPER_REST;
  const elbow = limb.fore - limb.upper - (FORE_REST - UPPER_REST);
  const pose = poseThrough([sx, sy], J.shoulder, rotate, scale, tmpPose);
  const fingers = fingerTurn(p);
  const c = curl(p);
  // The grip as the rig bends it: the fingers about the knuckles (turned, curled in), then the forearm about the elbow.
  turnAbout(J.grip, J.knuckles, fingers, tmpLocal);
  tmpLocal[0] = J.knuckles[0] + (tmpLocal[0] - J.knuckles[0]) * (1 - c);
  tmpLocal[1] = J.knuckles[1] + (tmpLocal[1] - J.knuckles[1]) * (1 - c);
  turnAbout(tmpLocal, J.elbow, elbow, tmpLocal);
  const grip = placeOn(pose, tmpLocal, [0, 0]);
  const arm: ArmPose = {
    x: pose.x - handEntry.position[0],
    y: pose.y - handEntry.position[1],
    rotate,
    scale,
    elbow,
    fingers,
    curl: c,
    grip,
    bones: { shoulder: [sx, sy], elbow: [limb.elbow[0], limb.elbow[1]] },
  };
  memo.p = p;
  memo.arm = arm;
  return arm;
}

/* ------------------------------------------------------------------ */
/* The harvester                                                       */
/* ------------------------------------------------------------------ */

/** How far below his place the harvester settles in from: a twelfth of a standing figure. */
const SETTLE_FROM = WORLD_SCALE.adult / 12;

/** How far (radians) his open arm hangs before it swings up to take the fruit (counter-clockwise: down toward his side). */
export const ARM_DOWN = 0.62;
/** His arm swings up about his shoulder, a touch past the held pose (taking the weight), and settles. */
const armTurn = track(beat(PLUCK.armUp, ARM_DOWN, 0, { overshoot: 0.035, settle: 0.3 }));

/** The harvester at progress p: how far he has settled into view (a rise) and his arm's turn about his shoulder. */
export function harvesterAt(p: number): { rise: number; arm: number } {
  return { rise: -SETTLE_FROM * (1 - glide(p, PLUCK.reveal)), arm: armTurn(p) };
}

/** How much the fruit is in his hand (0: in the hand that carried it, 1: in his palm): it changes hands where both are still. */
export function inHisHand(p: number): number {
  return glide(p, PLUCK.handoff);
}

/* ------------------------------------------------------------------ */
/* The fruit                                                           */
/* ------------------------------------------------------------------ */

/** The hero orange: offsets of its plate from its manifest place, its turn and its scale. */
export interface FruitPose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/** His shoulder: the open arm plate's pivot, at its manifest place. */
const ARM = plateEntry("share/arm-open");
const ARM_SHOULDER: Vec2 = (() => {
  const local = fromAnchor("share/arm-open", ARM.rig?.pivot ?? ARM.anchor);
  return [ARM.position[0] + local[0], ARM.position[1] + local[1]];
})();

/** Where his palm holds the fruit at progress p (before the life of his body, which the scene adds): the held point turned with his arm, risen with him. */
function inPalm(p: number): [number, number] {
  const palm = turnAbout(HELD, ARM_SHOULDER, armTurn(p), [0, 0]);
  palm[1] += harvesterAt(p).rise;
  return palm;
}

/**
 * The hero orange: on the branch, swinging a little on its stem as it is pulled, then in the hand
 * (its centre on the hand's grip, its size the hand's), then in his palm. Writes a new pose.
 */
export function heroOrangeAt(p: number): FruitPose {
  const scale = carryScale(p);
  const swing = SWING * stretch(p) * (1 - follow(p));
  let cx: number;
  let cy: number;
  if (p <= PLUCK.grasp[0]) {
    // On the branch until the fingers close round it.
    [cx, cy] = REST;
  } else {
    // Taken into the hand as the fingers close (it settles into the grip), then in the hand, then in his palm.
    const grip = handAt(p).grip;
    const palm = inPalm(p);
    const taken = glide(p, PLUCK.grasp);
    const w = inHisHand(p);
    const hx = REST[0] + (grip[0] - REST[0]) * taken;
    const hy = REST[1] + (grip[1] - REST[1]) * taken;
    cx = hx + (palm[0] - hx) * w;
    cy = hy + (palm[1] - hy) * w;
  }
  // The plate is placed by its ball's centre, turned about it as the stem bends.
  const pose = poseThrough([cx, cy], [BALL[0], BALL[1]], swing, scale, tmpPose);
  return { x: pose.x - orange.position[0], y: pose.y - orange.position[1], rotate: swing, scale };
}

/** Offsets from the hero orange's manifest place that put it in the harvester's hand (where the pluck ends): his palm, his arm at rest. */
export function heldOffset(): { x: number; y: number } {
  const pose = poseThrough(HELD, [BALL[0], BALL[1]], 0, HELD_SCALE, tmpPose);
  return { x: pose.x - orange.position[0], y: pose.y - orange.position[1] };
}

/** The foliage layers that fall away as the camera passes below them: near first, then the middle one. */
export function foliageAt(p: number): { near: { opacity: number; scale: number }; mid: { opacity: number } } {
  const near = glide(p, PLUCK.foliage.near);
  const mid = glide(p, PLUCK.foliage.mid);
  return { near: { opacity: 1 - near, scale: 1 + 0.18 * near }, mid: { opacity: 1 - mid } };
}

/** True while the fingers are drawn in front of the fruit (they have it, until they let go). */
export function fingersInFront(p: number): number {
  return glide(p, [PLUCK.grasp[0], PLUCK.grasp[0] + 0.3 * (PLUCK.grasp[1] - PLUCK.grasp[0])]) * (1 - glide(p, [PLUCK.release[0] + 0.15 * (PLUCK.release[1] - PLUCK.release[0]), PLUCK.release[0] + 0.3 * (PLUCK.release[1] - PLUCK.release[0])]));
}

/* ------------------------------------------------------------------ */
/* What the pluck moves                                                */
/* ------------------------------------------------------------------ */

const HAND_Z = -HAND_DEPTH;
const at3 = (v: Vec2, z: number): Vec3 => [v[0], v[1], z];

export const PLUCK_MOTION: SceneMotion = {
  channels: [
    { name: "hand · x", at: (p) => handAt(p).x },
    { name: "hand · y", at: (p) => handAt(p).y },
    { name: "hand · arm turn", at: (p) => handAt(p).rotate },
    { name: "hand · elbow", at: (p) => handAt(p).elbow },
    { name: "hand · fingers curl", at: (p) => handAt(p).curl },
    { name: "hand · size", at: (p) => handAt(p).scale },
    { name: "orange · x", at: (p) => heroOrangeAt(p).x },
    { name: "orange · y", at: (p) => heroOrangeAt(p).y },
    { name: "orange · turn", at: (p) => heroOrangeAt(p).rotate },
    { name: "orange · size", at: (p) => heroOrangeAt(p).scale },
    { name: "near foliage · opacity", at: (p) => foliageAt(p).near.opacity },
    { name: "near foliage · shake", at: (p) => branchShake(p, 1).rotate },
    { name: "middle foliage · opacity", at: (p) => foliageAt(p).mid.opacity },
    { name: "harvester · rise", at: (p) => harvesterAt(p).rise },
    { name: "harvester · arm turn", at: (p) => harvesterAt(p).arm },
    { name: "fingers in front", at: fingersInFront },
  ],
  marks(p) {
    const m: MotionMarks = noMarks();
    const arm = handAt(p);
    m.bones.push([at3(arm.bones.shoulder, HAND_Z), at3(arm.bones.elbow, HAND_Z)], [at3(arm.bones.elbow, HAND_Z), at3(arm.grip, HAND_Z)]);
    m.pivots.push(at3(arm.bones.elbow, HAND_Z), at3(STEM_AT, -orange.depth));
    m.grips.push(at3(arm.grip, HAND_Z));
    const joint: Vec2 = [ARM_SHOULDER[0], ARM_SHOULDER[1] + harvesterAt(p).rise];
    const palm = inPalm(p);
    m.bones.push([at3(joint, -ARM.depth), at3(palm, -ARM.depth)]);
    m.pivots.push(at3(joint, -ARM.depth));
    m.grips.push(at3(palm, -ARM.depth));
    return m;
  },
  arcs() {
    const [a, b] = [PLUCK.rise[0], PLUCK.release[1]];
    return [{ name: "grip", points: Array.from({ length: 160 }, (_, i) => at3(handAt(a + ((b - a) * i) / 159).grip, HAND_Z)) }];
  },
};
