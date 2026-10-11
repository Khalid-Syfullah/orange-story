import { plateEntry, WORLD_SCALE, type PlateId } from "@/art/manifest";
import { GRAFT } from "@/scroll/script";

import {
  dampedRelease,
  forearmRig,
  fromAnchor,
  glide,
  moves,
  noMarks,
  poseThrough,
  reachWith,
  span,
  storyTime,
  track,
  type ForearmRig,
  type MotionChannel,
  type MotionMarks,
  type Move,
  type Pose,
  type SceneMotion,
  type TrackKey,
  type Vec2,
  type Vec3,
} from "./motion-kit";

/**
 * The graft as pure functions of story progress (no React, no three), so it plays backwards exactly.
 * Timings live in `GRAFT` (`src/scroll/script.ts`); places come from the art manifest: the hands'
 * grips, wrists, knuckles and elbows are points and joints of their plates (`rig`: the hand on its
 * wrist, the fingers on their knuckles, the elbow as the pivot), the cutting's grip a point of its own.
 *
 * Two real arms, each a two-bone chain (`solveArm`): a shoulder below the frame, an upper arm, and
 * the forearm on its plate. A hand goes to a target along an arc (`moves`) and the elbow follows; the
 * forearm plate turns about its elbow, the hand bends on its wrist and the fingers close on their
 * knuckles (the plate's rig, bent in the shader). The elbows stay below the frame, where the painted
 * sleeves are cut.
 *
 * The left hand rises in with the cutting held at its grip, lines it up over the cleft and presses it
 * in (it can never drift: it is placed from the hand's grip every time), lets go and steadies the
 * branch. The right hand winds the twine round the joint, then ties the knot in three pulls: its
 * fingers close on the twine, it pulls (the next knot frame swaps in at the quickest part of the
 * pull, squeezed tight), the twine gives a little, and the stem, bent toward the pull, springs back
 * with a damped shake. Then both let go and drop away, the right first.
 */

/** One hand length (wrist to fingertip) in world units: the unit of the offsets here. */
const HAND = WORLD_SCALE.hand;

/** A range inside another, by shares of it. */
const within = ([a, b]: readonly [number, number], [s, t]: readonly [number, number]): [number, number] => [a + (b - a) * s, a + (b - a) * t];

/* ------------------------------------------------------------------ */
/* The arms                                                            */
/* ------------------------------------------------------------------ */

interface Arm {
  id: PlateId;
  /** The plate's manifest place: its grip, the anchor. */
  position: Vec2;
  depth: number;
  rig: ForearmRig;
}

/**
 * An arm: its plate's joints (its elbow is the top of the painted sleeve's cut, the forearm's root),
 * and a shoulder `shoulder` (hand lengths, from the plate's grip at its manifest place) with an upper
 * arm `upper` hand lengths long, both well below and to the side of the frame: the arms come up from
 * the body below, so the elbows (and the cuts of the sleeves) stay under the bottom of the frame while
 * the forearms swing about them. The elbow bends to the `bend` side.
 */
function arm(id: PlateId, shoulder: Vec2, upper: number, bend: 1 | -1): Arm {
  const entry = plateEntry(id);
  const position: Vec2 = [entry.position[0], entry.position[1]];
  return { id, position, depth: entry.depth, rig: forearmRig(id, { shoulder: [position[0] + shoulder[0] * HAND, position[1] + shoulder[1] * HAND], upper: upper * HAND, bend }) };
}

/**
 * The left arm (the cutting, then the branch) and the right (the twine). Worked out so that every
 * working pose of the hands keeps the cut ends of the sleeves below the frame: the forearms stand
 * steeper than painted and the hands bend toward the joint on their wrists.
 */
const LEFT = arm("graft/hand-left", [-7.9, -2.8], 8.37, -1);
const RIGHT = arm("graft/hand-right", [5.5, -2.5], 5.7, 1);

/** Where a hand is at a moment: what its plate and its rig need, and its bones for the motion lab. */
export interface HandPose {
  /** Offsets of the plate from its manifest place, and its turn about its anchor (radians). */
  x: number;
  y: number;
  rotate: number;
  /** The hand's bend on its wrist and the fingers' on their knuckles: the plate rig's turns (radians). */
  wrist: number;
  fingers: number;
  /** Where the grip really is (world), with the wrist bent and the fingers closed. */
  grip: [number, number];
  /** The hand's own direction: its turn from the painted pose (radians). */
  turn: number;
  bones: { shoulder: Vec2; elbow: [number, number]; wrist: [number, number] };
}

/**
 * A hand reaching for `target` with its grip, turned `turn` from its painted direction, its fingers
 * closed by `close` (radians, closing turns them clockwise): the wrist goes where the hand needs it,
 * the arm reaches for the wrist (two-bone IK) and the forearm plate turns with the forearm.
 */
function reachFor(a: Arm, target: Vec2, turn: number, close: number): HandPose {
  const r = reachWith(a.rig, target, turn, { fingers: -close });
  return {
    x: r.pose.x - a.position[0],
    y: r.pose.y - a.position[1],
    rotate: r.pose.rotate,
    wrist: r.wrist,
    fingers: r.fingers,
    grip: r.grip,
    turn,
    bones: { shoulder: r.shoulder, elbow: r.elbow, wrist: r.wristAt },
  };
}

/* ------------------------------------------------------------------ */
/* The cutting, the twine and the knot                                 */
/* ------------------------------------------------------------------ */

const cutting = plateEntry("graft/cutting");
/** The cutting's grip (where the fingers pinch its stem), from its anchor (the base of the stem, which goes into the cleft). */
const CUTTING_GRIP = fromAnchor("graft/cutting", "grip");
/** How far below its manifest place the cutting is pressed into the cleft (its wedge goes in, the twine covers its base). */
const SEAT_DEPTH = 0.12 * HAND;
/** Where the cutting stands once seated: under its manifest place, the base deep in the cleft. */
const SEAT: Vec2 = [cutting.position[0], cutting.position[1] - SEAT_DEPTH];
/** Its grip there. */
const SEAT_GRIP: Vec2 = [SEAT[0] + CUTTING_GRIP[0], SEAT[1] + CUTTING_GRIP[1]];

/** Each knot step's beats (`GRAFT.knotBeats`), as progress ranges. */
const KNOTS = GRAFT.knot.map((step) => ({
  reach: within(step, GRAFT.knotBeats.reach),
  grasp: within(step, GRAFT.knotBeats.grasp),
  pull: within(step, GRAFT.knotBeats.pull),
  swap: within(step, GRAFT.knotBeats.swap),
  give: within(step, GRAFT.knotBeats.give),
}));

/** How far into each pull the twine is, 0 to 1, released as it gives (the knot squeezed tight, the stem bent with it). */
const pulls = KNOTS.map((k) =>
  track([
    [k.pull[0], 0],
    [k.pull[0] + 0.7 * (k.pull[1] - k.pull[0]), 0.86],
    [k.pull[1], 1],
  ]),
);

/** How the stem rings when the pull lets go of it: a quick, well-damped shake. */
const STEM_RING = { frequency: 3.2, decay: 5.5 } as const;
/** How far (radians) the stem leans toward the pull at the height of it. */
export const STEM_LEAN = 0.06;
/** How much the knot squeezes as it is pulled tight (a share of its size), and how it gives. */
const KNOT_SQUEEZE = 0.07;
const KNOT_RING = { frequency: 4.5, decay: 7 } as const;

/**
 * Something the pulls bend (the stem, the knot), as a share of its full bend: each pull draws it from
 * wherever it is (still ringing from the pull before) to fully bent, and as the twine gives it is
 * let go and rings out (`dampedRelease`). Its speed never jumps: a pull starts and ends at rest.
 */
function pulled(p: number, ring: { frequency: number; decay: number }): number {
  let tail = 0;
  for (let i = 0; i < KNOTS.length; i++) {
    const k = KNOTS[i];
    if (p < k.pull[0]) return tail;
    if (p < k.pull[1]) {
      const a = pulls[i](p);
      return (1 - a) * tail + a;
    }
    tail = dampedRelease(1, storyTime(p, k.pull[1]), ring);
  }
  return tail;
}

/** The stem's lean toward each pull (clockwise: the pull is to the right), springing back from each with a damped shake. */
export function stemBend(p: number): number {
  return -STEM_LEAN * pulled(p, STEM_RING);
}

/** The knot's size: squeezed as each pull draws it tight, then giving a little and settling. */
export function knotScale(p: number): number {
  return 1 - KNOT_SQUEEZE * pulled(p, KNOT_RING);
}

/** Opacity of each of the three knot frames: each swaps in over its pull's quickest part (`swap`), the one before it going as it comes. */
export function knotAt(p: number): [number, number, number] {
  const s = KNOTS.map((k) => glide(p, k.swap));
  return [s[0] * (1 - s[1]), s[1] * (1 - s[2]), s[2]];
}

/* ------------------------------------------------------------------ */
/* The left hand: the cutting, then the branch                         */
/* ------------------------------------------------------------------ */

const [enterA, enterB] = GRAFT.enter;
const enterLength = enterB - enterA;
const LEFT_ENTER: [number, number] = [enterA, enterB - GRAFT.enterLag * enterLength];
const RIGHT_ENTER: [number, number] = [enterA + GRAFT.enterLag * enterLength, enterB];
const FIT_ALIGN = within(GRAFT.fit, [0, GRAFT.fitAlign]);
const FIT_PRESS = within(GRAFT.fit, [GRAFT.fitAlign, 1]);
/** The moment the cutting is seated in the cleft: the left hand lets go of it from here. */
export const SEATED_AT = GRAFT.fit[1];
const EXIT_RIGHT = within(GRAFT.exit, [0, 0.82]);
const EXIT_LEFT = within(GRAFT.exit, [0.18, 1]);

/** Points the left hand's grip goes to (hand lengths from the seated cutting's grip). */
const L = (x: number, y: number): Vec2 => [SEAT_GRIP[0] + x * HAND, SEAT_GRIP[1] + y * HAND];
const LEFT_OUT = L(-0.55, -3.2);
const LEFT_STEADY = L(-0.6, -0.3);

const leftPath = moves(LEFT_OUT, [
  // Up from below on an arc, carrying the cutting: it swings out to the left and settles in, a touch past and back.
  { range: LEFT_ENTER, to: L(-0.16, 0.05), bow: 0.16, shape: { overshoot: 0.03 } },
  // Lines the cutting up over the cleft...
  { range: FIT_ALIGN, to: L(0, 0.08), bow: -0.1 },
  // ...and presses it in, a little deeper than it stays, and eases.
  { range: FIT_PRESS, to: SEAT_GRIP, shape: { overshoot: 0.22, settle: 0.4 } },
  // Lets go and moves to steady the branch beside the joint.
  { range: within(GRAFT.steady, [0.15, 1]), to: LEFT_STEADY, bow: 0.12 },
  // Drops away down, faster and faster.
  { range: EXIT_LEFT, to: L(-0.75, -3.4), bow: -0.1, shape: { anticipate: 0.02, lead: 0.2 } },
]);

/** The left hand reaches up to the work, its fingers pointing up and in; it bows over the branch to steady it, and turns away as it leaves. */
const leftTurn = track([
  [enterA, 0.78],
  [LEFT_ENTER[1], 0.64],
  [SEATED_AT, 0.58],
  [GRAFT.steady[1], 0.66],
  [EXIT_LEFT[0] + 0.25 * (EXIT_LEFT[1] - EXIT_LEFT[0]), 0.62],
  [EXIT_LEFT[1], 0.8],
]);

/** How closed the left fingers are (radians): on the cutting, open to let go, closed on the branch, open to leave. */
const leftClose = track([
  [enterA, 0.05],
  [LEFT_ENTER[1], 0.07],
  [FIT_PRESS[0] + 0.5 * (FIT_PRESS[1] - FIT_PRESS[0]), 0.1],
  [SEATED_AT, 0.08],
  [GRAFT.steady[0] + 0.3 * (GRAFT.steady[1] - GRAFT.steady[0]), -0.1],
  [GRAFT.steady[1], 0.06],
  [EXIT_LEFT[0], 0.06],
  [EXIT_LEFT[0] + 0.3 * (EXIT_LEFT[1] - EXIT_LEFT[0]), -0.08],
]);

/** The branch tugs the steadying hand toward each pull a little. */
const STEADY_GIVE = 0.025 * HAND;

const memo = { left: { p: Number.NaN, pose: null as HandPose | null }, right: { p: Number.NaN, pose: null as HandPose | null } };

export function leftHandAt(p: number): HandPose {
  if (memo.left.p === p && memo.left.pose) return memo.left.pose;
  const at = leftPath(p);
  // While it steadies the branch, each pull draws the branch (and the hand) toward it a little.
  let tug = 0;
  KNOTS.forEach((k, i) => {
    if (p > k.pull[0] && p < k.give[1]) tug += pulls[i](p) * (1 - glide(p, k.give));
  });
  at[0] += STEADY_GIVE * tug;
  const pose = reachFor(LEFT, at, leftTurn(p), leftClose(p));
  memo.left = { p, pose };
  return pose;
}

/* ------------------------------------------------------------------ */
/* The right hand: the twine                                           */
/* ------------------------------------------------------------------ */

/** The joint the twine winds round (the twine's own place), and where the right hand takes the twine's end for each pull: at the coil's right end. */
const twine = plateEntry("graft/twine");
const JOINT: Vec2 = [twine.position[0], twine.position[1]];
const R = (x: number, y: number): Vec2 => [JOINT[0] + x * HAND, JOINT[1] + y * HAND];
const RIGHT_OUT = R(0.85, -3.2);
const RIGHT_READY = R(0.72, -0.42);
const TAKE = R(0.27, -0.04);
const PULL_TO = [R(0.72, -0.24), R(0.75, -0.28), R(0.78, -0.26)];
/** The share of the pull the hand comes back as the twine gives. */
const GIVE_BACK = 0.18;

/** The wrap: the right hand's grip circles the joint, on an ellipse (hand lengths, around a point right of the joint's middle), `GRAFT.wraps` times. */
const WRAP_CENTRE: Vec2 = R(0.12, -0.03);
const WRAP_RADIUS: Vec2 = [0.2 * HAND, 0.07 * HAND];
const WRAP_IN = within(GRAFT.wrap, [0, 0.14]);
const WRAP_ROUND = within(GRAFT.wrap, [0.14, 0.9]);
const WRAP_OUT = within(GRAFT.wrap, [0.9, 1]);
/** Where the circling starts and ends: on the right of the joint, a little low. */
const WRAP_FROM = -0.45;
const wrapAt = (angle: number): Vec2 => [WRAP_CENTRE[0] + WRAP_RADIUS[0] * Math.cos(angle), WRAP_CENTRE[1] + WRAP_RADIUS[1] * Math.sin(angle)];
/** The circling's angle: it gathers speed and slows again (a track from rest to rest). */
const wrapAngle = track([
  [WRAP_ROUND[0], WRAP_FROM],
  [WRAP_ROUND[1], WRAP_FROM + GRAFT.wraps * Math.PI * 2],
]);

const rightMoves: Move[] = [
  { range: RIGHT_ENTER, to: RIGHT_READY, bow: -0.16, shape: { overshoot: 0.03 } },
  { range: WRAP_IN, to: wrapAt(WRAP_FROM) },
];
const rightAfterWrap: Move[] = [{ range: WRAP_OUT, to: TAKE }];
KNOTS.forEach((k, i) => {
  if (i > 0) rightAfterWrap.push({ range: k.reach, to: TAKE, bow: 0.1 });
  // The pull: a quick tug out along an arc, gathering speed, stopped as the twine goes taut.
  rightAfterWrap.push({ range: k.pull, to: PULL_TO[i], bow: -0.14, shape: { anticipate: 0.04, lead: 0.18 } });
  // The give: the twine eases and the hand comes back a little.
  rightAfterWrap.push({ range: k.give, to: [PULL_TO[i][0] + GIVE_BACK * (TAKE[0] - PULL_TO[i][0]), PULL_TO[i][1] + GIVE_BACK * (TAKE[1] - PULL_TO[i][1])] });
});
rightAfterWrap.push({ range: EXIT_RIGHT, to: R(1.0, -3.4), bow: 0.1, shape: { anticipate: 0.02, lead: 0.2 } });
const rightBefore = moves(RIGHT_OUT, rightMoves);
const rightAfter = moves(wrapAt(WRAP_FROM), rightAfterWrap);

/** The right hand reaches up to the joint, its fingers pointing up and in; the wrist rolls as it circles, and it dips into each pull. */
const rightTurnKeys: TrackKey[] = [
  [enterA, -0.8],
  [RIGHT_ENTER[1], -0.7],
  [WRAP_IN[1], -0.66],
];
KNOTS.forEach((k) => {
  rightTurnKeys.push([k.grasp[1], -0.62], [k.pull[1], -0.74], [k.give[1], -0.68]);
});
rightTurnKeys.push([EXIT_RIGHT[0] + 0.25 * (EXIT_RIGHT[1] - EXIT_RIGHT[0]), -0.66], [EXIT_RIGHT[1], -0.85]);
const rightTurn = track(rightTurnKeys);
/** The roll of the wrist as the hand circles the joint. */
const WRAP_ROLL = 0.1;

/** The right fingers: easy as it winds, closing on the twine before each pull, easing as it gives, open to leave. */
const rightCloseKeys: TrackKey[] = [
  [enterA, 0.02],
  [WRAP_ROUND[0], 0.03],
  [WRAP_ROUND[1], 0.03],
];
KNOTS.forEach((k) => {
  rightCloseKeys.push([k.grasp[0], -0.02], [k.grasp[1], 0.11], [k.pull[1], 0.12], [k.give[1], 0.04]);
});
rightCloseKeys.push([EXIT_RIGHT[0] + 0.3 * (EXIT_RIGHT[1] - EXIT_RIGHT[0]), -0.08]);
const rightClose = track(rightCloseKeys);

export function rightHandAt(p: number): HandPose {
  if (memo.right.p === p && memo.right.pose) return memo.right.pose;
  let at: [number, number];
  let roll = 0;
  if (p < WRAP_ROUND[0]) at = rightBefore(p);
  else if (p < WRAP_ROUND[1]) {
    const angle = wrapAngle(p);
    const w = wrapAt(angle);
    at = [w[0], w[1]];
    roll = WRAP_ROLL * Math.sin(angle - WRAP_FROM) * Math.min(1, 4 * span(p, WRAP_ROUND[0], WRAP_ROUND[1]), 4 * (1 - span(p, WRAP_ROUND[0], WRAP_ROUND[1])));
  } else at = rightAfter(p);
  const pose = reachFor(RIGHT, at, rightTurn(p) + roll, rightClose(p));
  memo.right = { p, pose };
  return pose;
}

/* ------------------------------------------------------------------ */
/* The cutting, the twine, the fruit                                   */
/* ------------------------------------------------------------------ */

/** The cutting's pose (plate offsets from its manifest place, and its turn). */
export interface CuttingPose {
  x: number;
  y: number;
  rotate: number;
}

const tmpPose: Pose = { x: 0, y: 0, rotate: 0, scale: 1 };

/** Turn of the cutting relative to the hand that holds it: upright (as painted) once seated. */
const HELD_TURN = -leftTurn(SEATED_AT);

/** The cutting where the left hand holds it: its grip on the hand's grip, turning with the hand (offsets from its manifest place). */
function heldCutting(p: number, out: CuttingPose): CuttingPose {
  const hand = leftHandAt(p);
  const pose = poseThrough(hand.grip, CUTTING_GRIP, hand.turn + HELD_TURN, 1, tmpPose);
  out.x = pose.x - cutting.position[0];
  out.y = pose.y - cutting.position[1];
  out.rotate = pose.rotate;
  return out;
}

/** Where the cutting sits once seated (exactly where the hand left it), from which the stem leans with each pull. */
const SEATED: CuttingPose = heldCutting(SEATED_AT, { x: 0, y: 0, rotate: 0 });

/** The cutting: in the left hand until it is seated, then in the cleft, leaning with each pull of the twine and springing back. */
export function cuttingAt(p: number): CuttingPose {
  if (p < SEATED_AT) return heldCutting(p, { x: 0, y: 0, rotate: 0 });
  return { x: SEATED.x, y: SEATED.y, rotate: SEATED.rotate + stemBend(p) };
}

/** How much of the twine is wound round the joint, 0 to 1: turn by turn, with the circling hand. */
export function twineAt(p: number): number {
  if (p <= WRAP_ROUND[0]) return 0;
  if (p >= WRAP_ROUND[1]) return 1;
  return (wrapAngle(p) - WRAP_FROM) / (GRAFT.wraps * Math.PI * 2);
}

/** How much of the fruiting tree has filled in, 0 to 1. */
export function fruitAt(p: number): number {
  return glide(p, GRAFT.fruit);
}

/** How far the hands are in the frame, 0 (out) to 1: for anything that should know (the motion lab). */
export function handsIn(p: number): number {
  return glide(p, GRAFT.enter) * (1 - glide(p, GRAFT.exit));
}

/* ------------------------------------------------------------------ */
/* What the graft moves                                                */
/* ------------------------------------------------------------------ */

const z = (a: Arm): number => -a.depth;
const at3 = (v: Vec2, depth: number): Vec3 => [v[0], v[1], depth];

function handMarks(a: Arm, pose: HandPose, marks: MotionMarks): void {
  const d = z(a);
  marks.bones.push([at3(pose.bones.shoulder, d), at3(pose.bones.elbow, d)], [at3(pose.bones.elbow, d), at3(pose.bones.wrist, d)], [at3(pose.bones.wrist, d), at3(pose.grip, d)]);
  marks.pivots.push(at3(pose.bones.elbow, d), at3(pose.bones.wrist, d));
  marks.grips.push(at3(pose.grip, d));
}

const handChannels = (name: string, at: (p: number) => HandPose): MotionChannel[] => [
  { name: `${name} · x`, at: (p) => at(p).x },
  { name: `${name} · y`, at: (p) => at(p).y },
  { name: `${name} · forearm turn`, at: (p) => at(p).rotate },
  { name: `${name} · wrist`, at: (p) => at(p).wrist },
  { name: `${name} · fingers`, at: (p) => at(p).fingers },
];

export const GRAFT_MOTION: SceneMotion = {
  channels: [
    ...handChannels("left hand", leftHandAt),
    ...handChannels("right hand", rightHandAt),
    { name: "cutting · x", at: (p) => cuttingAt(p).x },
    { name: "cutting · y", at: (p) => cuttingAt(p).y },
    { name: "cutting · turn", at: (p) => cuttingAt(p).rotate },
    { name: "twine · wound", at: twineAt },
    { name: "knot 1 · opacity", at: (p) => knotAt(p)[0] },
    { name: "knot 2 · opacity", at: (p) => knotAt(p)[1] },
    { name: "knot 3 · opacity", at: (p) => knotAt(p)[2] },
    { name: "knot · size", at: knotScale },
    { name: "fruiting tree · filled in", at: fruitAt },
  ],
  marks(p) {
    const marks = noMarks();
    handMarks(LEFT, leftHandAt(p), marks);
    handMarks(RIGHT, rightHandAt(p), marks);
    const c = cuttingAt(p);
    marks.pivots.push([SEAT[0] + c.x, SEAT[1] + c.y, -cutting.depth]);
    return marks;
  },
  arcs() {
    const [a, b] = [GRAFT.enter[0], GRAFT.exit[1]];
    const sample = (f: (p: number) => [number, number], depth: number) => Array.from({ length: 121 }, (_, i) => at3(f(a + ((b - a) * i) / 120), depth));
    return [
      { name: "left grip", points: sample((p) => leftHandAt(p).grip, z(LEFT)) },
      { name: "right grip", points: sample((p) => rightHandAt(p).grip, z(RIGHT)) },
      { name: "left elbow", points: sample((p) => leftHandAt(p).bones.elbow, z(LEFT)) },
      { name: "right elbow", points: sample((p) => rightHandAt(p).bones.elbow, z(RIGHT)) },
    ];
  },
};
