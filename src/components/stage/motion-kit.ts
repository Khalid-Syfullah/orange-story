import { plateEntry, plateWorldSize, type Pair, type PlateId } from "@/art/manifest";
import { PHYSICS, SCREEN } from "@/scroll/script";

import { cameraSlopes } from "./camera-path";

/**
 * The motion kit: small pure functions (no React, no three) that move the stage's bodies and objects
 * the way bodies and objects move, under weight and gravity. The scenes feed them story progress, or
 * story time worked out from progress (`storyTime`), so every movement is a function of progress
 * alone and plays backwards exactly when scrolling up. `SCROLL.md` ("Natural motion") has the rules.
 *
 * - Bones: `solveArm` (two-bone IK: the hand goes to a target, the elbow follows) and `arcPoint`
 *   (a hand travels on an arc, not along a ruler).
 * - Weight: `track` (one smooth curve through keys: it starts and ends at rest and passes every key
 *   with the same speed on both sides, so beats join without a jump in speed) and `beat` (the keys
 *   of one move, with anticipation and overshoot as keys of their own); `glide` for a plain move.
 * - Attachment: `Pose`, `placeOn`, `holdAt`: a held thing is placed from its hand's pose at a grip
 *   point, so it can never drift.
 * - Ballistics: `ballistic`, a parabola with light air drag and a spin that matches the throw,
 *   landing with a short settle (a stiff, damped contact, so even a landing never jumps in speed).
 * - Secondary motion: `dampedRelease` (a branch let go after a pluck) and `dampedKick` (a sleeve after
 *   a fast move), functions of the time since the event, not time-based springs, so they reverse.
 * - Live lag: `springStep`, a critically damped spring for the optional time-based lag, which settles
 *   to nothing at rest.
 * - Checks: `velocityJumps` finds where a driven value's speed jumps (`motion-channels.test.ts`
 *   walks the whole script with it).
 *
 * Angles are radians, counter-clockwise; positions are world units (x right, y up).
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* What a scene moves (for the velocity check and the motion lab)      */
/* ------------------------------------------------------------------ */

/** One driven value of a scene: a position, a turn, a scale or an opacity, as a function of progress. */
export interface MotionChannel {
  /** What it is, e.g. "left hand · x". */
  name: string;
  at: (p: number) => number;
}

/** The skeleton of a scene at a moment, in world points: bones (shoulder to elbow to hand), the pivots things turn on, the grips things are held at. */
export interface MotionMarks {
  bones: (readonly [Vec3, Vec3])[];
  pivots: Vec3[];
  grips: Vec3[];
}

/** Everything a scene drives: its channels, and for the motion lab its skeleton and the paths its hands and objects travel. */
export interface SceneMotion {
  channels: readonly MotionChannel[];
  /** Bones, pivots and grips at progress p. */
  marks?: (p: number) => MotionMarks;
  /** World paths: a hand or a thing at each of a few dozen moments through the scene. */
  arcs?: () => readonly { name: string; points: Vec3[] }[];
}

/** An empty skeleton to fill. */
export const noMarks = (): MotionMarks => ({ bones: [], pivots: [], grips: [] });

/* ------------------------------------------------------------------ */
/* Story time                                                          */
/* ------------------------------------------------------------------ */

/** Seconds of story time per unit of progress (`PHYSICS.secondsPerScreen` per screen). */
export const SECONDS_PER_PROGRESS = PHYSICS.secondsPerScreen / SCREEN;

/** Story time in seconds from progress `from` to `p` (negative before it): the clock physics runs on, scrubbed by scroll. */
export function storyTime(p: number, from: number): number {
  return (p - from) * SECONDS_PER_PROGRESS;
}

/** A speed per unit of progress (a track's `velocity`) as a speed per second of story time. */
export const perSecond = (perProgress: number): number => perProgress / SECONDS_PER_PROGRESS;

/* ------------------------------------------------------------------ */
/* Curves with weight                                                  */
/* ------------------------------------------------------------------ */

/** Fraction of the way through `[a, b]`, clamped to 0..1 (a zero-length range is a step). */
export function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  const t = (p - a) / (b - a);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Ease in and out from rest to rest (the quintic smoothstep: its speed and its acceleration start and end at zero). */
export function smoother(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** A plain move over a range of progress, 0 to 1, from rest to rest: the stage's default for anything that moves. */
export function glide(p: number, [a, b]: readonly [number, number]): number {
  return smoother(span(p, a, b));
}

/** A key of a track: where (progress, or any time), the value there and, optionally, the speed it passes with. */
export type TrackKey = readonly [at: number, value: number, slope?: number];

/** A smooth curve through keys (see `track`). */
export interface Track {
  (p: number): number;
  /** The keys it passes through, sorted, repeated keys merged. */
  readonly keys: readonly TrackKey[];
  /** Its speed at p (value per unit of progress). */
  velocity(p: number): number;
}

/**
 * One smooth curve through keys: a cubic Hermite spline that starts and ends at rest and holds its
 * end values beyond them. Where a key gives no speed of its own, it gets the one that keeps the curve
 * from overshooting (`cameraSlopes`, the camera's own rule: zero where the value turns back or holds,
 * elsewhere the harmonic mean of its two neighbouring slopes). Every key is passed with one speed
 * from both sides, so the curve's speed never jumps (C1): beats chained into one track join smoothly.
 * Anticipation (a small move against the action) and overshoot (past the target, then back) are keys
 * of their own: the value turns there, so it comes to rest at the extreme, as a real body does.
 */
export function track(input: readonly TrackKey[]): Track {
  const sorted = [...input].sort((a, b) => a[0] - b[0]);
  const keys: TrackKey[] = [];
  for (const k of sorted) {
    const last = keys[keys.length - 1];
    if (last && Math.abs(last[0] - k[0]) < 1e-12) {
      if (Math.abs(last[1] - k[1]) > 1e-9) throw new Error(`track: two values at ${k[0]}`);
      if (k[2] !== undefined) keys[keys.length - 1] = k;
      continue;
    }
    keys.push(k);
  }
  if (!keys.length) throw new Error("track: no keys");
  const times = keys.map((k) => k[0]);
  const values = keys.map((k) => k[1]);
  const auto = cameraSlopes(times, values);
  const slopes = keys.map((k, i) => (i === 0 || i === keys.length - 1 ? 0 : (k[2] ?? auto[i])));
  const n = keys.length;

  const find = (p: number) => {
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= p) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const value = (p: number): number => {
    if (n === 1 || p <= times[0]) return values[0];
    if (p >= times[n - 1]) return values[n - 1];
    const i = find(p);
    const h = times[i + 1] - times[i];
    const t = (p - times[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * h * slopes[i] + (-2 * t3 + 3 * t2) * values[i + 1] + (t3 - t2) * h * slopes[i + 1];
  };
  const velocity = (p: number): number => {
    if (n === 1 || p <= times[0] || p >= times[n - 1]) return 0;
    const i = find(p);
    const h = times[i + 1] - times[i];
    const t = (p - times[i]) / h;
    const t2 = t * t;
    return ((6 * t2 - 6 * t) * values[i] + (3 * t2 - 4 * t + 1) * h * slopes[i] + (-6 * t2 + 6 * t) * values[i + 1] + (3 * t2 - 2 * t) * h * slopes[i + 1]) / h;
  };
  return Object.assign(value, { keys, velocity });
}

/** How one move is shaped (`beat`). Shares are of the move's length (anticipation, overshoot) or of the beat's time (lead, settle). */
export interface BeatShape {
  /** A small move against the action first, as a share of the move. */
  anticipate?: number;
  /** How far past the target it goes before it settles back, as a share of the move. */
  overshoot?: number;
  /** Share of the beat's time spent winding up into the anticipation. Default 0.3. */
  lead?: number;
  /** Share of the beat's time spent settling back from the overshoot. Default 0.35. */
  settle?: number;
}

/**
 * The keys of one move of a value from `from` to `to` over a range of progress: from rest, an
 * optional anticipation (it moves the other way a little first), the action, an optional overshoot,
 * and the settle onto `to`, at rest. Chain beats into one `track`; where one ends as the next starts
 * they share the key.
 */
export function beat([a, b]: readonly [number, number], from: number, to: number, shape: BeatShape = {}): TrackKey[] {
  const move = to - from;
  const keys: TrackKey[] = [[a, from]];
  if (shape.anticipate) keys.push([a + (shape.lead ?? 0.3) * (b - a), from - shape.anticipate * move]);
  if (shape.overshoot) keys.push([b - (shape.settle ?? 0.35) * (b - a), to + shape.overshoot * move]);
  keys.push([b, to]);
  return keys;
}

/**
 * Keys for a strike: from rest it swings from `from` toward `to`, faster and faster, and is stopped
 * at `to` within the last `stop` share of its time (the contact: a short, hard deceleration rather
 * than a soft landing), then bounces back `recoil` of the swing and settles over `settle` (a range
 * starting at `b`). The speed never jumps, even at the contact.
 */
export function strike([a, b]: readonly [number, number], from: number, to: number, { stop = 0.12, recoil = 0.12, settle = 0 }: { stop?: number; recoil?: number; settle?: number } = {}): TrackKey[] {
  const move = to - from;
  const contact = b - stop * (b - a);
  // A steady acceleration from rest to speed v at the contact, then a steady (much harder)
  // deceleration to rest at b: each covers half its time times v, so the whole move is v (b - a) / 2.
  const v = (2 * move) / (b - a);
  const atContact = to - (v * (b - contact)) / 2;
  const keys: TrackKey[] = [
    [a, from, 0],
    [contact, atContact, v],
    [b, to, 0],
  ];
  if (recoil && settle > 0) keys.push([b + 0.4 * settle, to - recoil * move], [b + settle, to]);
  return keys;
}

/** How one blow of a tool is shaped (`blows`): every value is a turn away from rest, with its own sign. */
export interface BlowShape {
  /** The wind-up, against the blow. */
  windUp: number;
  /** Where the blow stops (the contact). */
  hit: number;
  /** How far it bounces back off the contact, as a share of the swing. Default 0.12. */
  recoil?: number;
}

/** Shares of a blow's time: the wind-up, the swing to the contact, the recoil and settle; the rest is the lift back. */
export const BLOW_PHASES = { windUp: 0.42, swing: 0.2, recoil: 0.16 } as const;

/**
 * `count` blows of a tool over a range of progress (a mallet on a chisel, shears closing on a twig),
 * as one track from rest to rest: each a slow wind-up against the blow, a fast swing that speeds up
 * all the way to the contact and stops there hard (`strike`), a small recoil and settle, and the
 * lift back to rest. Its speed never jumps, not even at the contact.
 */
export function blows([a, b]: readonly [number, number], count: number, { windUp, hit, recoil = 0.12 }: BlowShape): Track {
  const length = (b - a) / count;
  const { windUp: up, swing, recoil: settle } = BLOW_PHASES;
  const keys: TrackKey[] = [];
  for (let i = 0; i < count; i++) {
    const c = a + i * length;
    keys.push(...beat([c, c + up * length], 0, windUp));
    keys.push(...strike([c + up * length, c + (up + swing) * length], windUp, hit, { stop: 0.14, recoil, settle: settle * length }));
    keys.push(...beat([c + (up + swing + settle) * length, c + length], hit, 0));
  }
  return track(keys);
}

/* ------------------------------------------------------------------ */
/* Arcs and bones                                                      */
/* ------------------------------------------------------------------ */

/**
 * A point at s (0 to 1) on a gentle arc from `a` to `b`, bowed `bow` of the chord's length to the
 * left of the way from a to b (negative: to the right). A hand reaching, a knife cutting, a half
 * parting all travel like this, never along a straight line. Writes into `out`.
 */
export function arcPoint(a: Vec2, b: Vec2, bow: number, s: number, out: [number, number] = [0, 0]): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // A quadratic curve whose middle is `bow` of the chord off it: the control point is twice that.
  const cx = (a[0] + b[0]) / 2 - dy * 2 * bow;
  const cy = (a[1] + b[1]) / 2 + dx * 2 * bow;
  const u = 1 - s;
  out[0] = u * u * a[0] + 2 * u * s * cx + s * s * b[0];
  out[1] = u * u * a[1] + 2 * u * s * cy + s * s * b[1];
  return out;
}

/** One move of a point (`moves`): when, where to, on what arc, with what weight. */
export interface Move {
  /** When it moves (progress). */
  range: readonly [number, number];
  /** Where it goes (world). It starts from where the move before it ended. */
  to: Vec2;
  /** The bow of its arc (`arcPoint`): a hand reaching swings out to one side. Default 0. */
  bow?: number;
  /** Its anticipation and overshoot (`beat`). */
  shape?: BeatShape;
}

/** Where a point is at progress p (`moves`), written into `out`. */
export type Path = (p: number, out?: [number, number]) => [number, number];

/**
 * A point that travels through `list`, one move after another (in order, never overlapping), each on
 * its own arc from rest to rest with its own anticipation and overshoot, and holds still between
 * them. Before the first it is at `from`. Its speed never jumps: every move starts and ends at rest.
 */
export function moves(from: Vec2, list: readonly Move[]): Path {
  const starts: Vec2[] = [];
  let at: Vec2 = from;
  let last = -Infinity;
  for (const m of list) {
    if (m.range[0] < last - 1e-12) throw new Error("moves: the moves overlap or are out of order");
    last = m.range[1];
    starts.push(at);
    at = m.to;
  }
  const shapes = list.map((m) => track(beat(m.range, 0, 1, m.shape)));
  return (p, out = [0, 0]) => {
    let i = -1;
    for (let k = 0; k < list.length; k++) if (p >= list[k].range[0]) i = k;
    if (i < 0) {
      out[0] = from[0];
      out[1] = from[1];
      return out;
    }
    const m = list[i];
    if (p >= m.range[1]) {
      out[0] = m.to[0];
      out[1] = m.to[1];
      return out;
    }
    return arcPoint(starts[i], m.to, m.bow ?? 0, shapes[i](p), out);
  };
}

/** An arm (or a leg): where it hangs from, how long its two bones are, and which way the elbow bends. */
export interface Limb {
  /** The shoulder (the root joint), world units. */
  shoulder: Vec2;
  /** Upper arm: shoulder to elbow. */
  upper: number;
  /** Forearm: elbow to the point that reaches (a grip, a fingertip). */
  fore: number;
  /** The elbow bends to the left of the shoulder-to-hand line (1) or to its right (-1). */
  bend: 1 | -1;
}

/** Where an arm is, solved for a target (`solveArm`). */
export interface LimbPose {
  elbow: [number, number];
  /** Where the hand got to: the target, or as near as the arm reaches. */
  hand: [number, number];
  /** Direction of the upper arm, shoulder to elbow. */
  upper: number;
  /** Direction of the forearm, elbow to hand. */
  fore: number;
  /** How far the arm is stretched, 0 (folded) to 1 (straight). */
  reach: number;
}

/** How far an arm may straighten: just short of a locked elbow, approached softly (a straight arm's IK has no defined speed). */
const REACH_KNEE = 0.92;
const REACH_MAX = 0.995;

/**
 * Two-bone IK: the hand goes to `target` (or as near as the arm reaches, the reach saturating softly
 * just short of a straight arm), the elbow follows on the `bend` side. Smooth in the target, so a
 * hand moved along an arc swings the forearm about the elbow and the upper arm about the shoulder.
 */
export function solveArm(limb: Limb, target: Vec2, out?: LimbPose): LimbPose {
  const pose = out ?? { elbow: [0, 0], hand: [0, 0], upper: 0, fore: 0, reach: 0 };
  const { shoulder: s, upper: l1, fore: l2, bend } = limb;
  const dx = target[0] - s[0];
  const dy = target[1] - s[1];
  const dist = Math.hypot(dx, dy);
  const longest = l1 + l2;
  const shortest = Math.abs(l1 - l2) + 1e-6 * longest;
  // Soft saturation near a straight arm: the reach follows the target, then bends over toward the limit.
  let x = dist / longest;
  if (x > REACH_KNEE) x = REACH_KNEE + (REACH_MAX - REACH_KNEE) * Math.tanh((x - REACH_KNEE) / (REACH_MAX - REACH_KNEE));
  const d = Math.max(shortest, x * longest);
  const toward = Math.atan2(dy, dx);
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const upper = toward + bend * Math.acos(cosA);
  pose.elbow[0] = s[0] + l1 * Math.cos(upper);
  pose.elbow[1] = s[1] + l1 * Math.sin(upper);
  pose.hand[0] = s[0] + d * Math.cos(toward);
  pose.hand[1] = s[1] + d * Math.sin(toward);
  pose.upper = upper;
  pose.fore = Math.atan2(pose.hand[1] - pose.elbow[1], pose.hand[0] - pose.elbow[0]);
  pose.reach = d / longest;
  return pose;
}

/* ------------------------------------------------------------------ */
/* A forearm on its own plate, reaching with a whole arm                */
/* ------------------------------------------------------------------ */

/**
 * A hand that reaches into the frame on a plate of its own (a forearm and a hand, cut at the elbow
 * by the image's edge), as part of a whole arm: a shoulder and an upper arm out of the frame, the
 * forearm on the plate. Its points (from the plate's anchor, world units at scale 1, unturned): the
 * elbow (the forearm's root, the rig's pivot), the wrist (the hand turns there), the knuckles (the
 * fingers turn and curl there) and the grip (where it holds things).
 */
export interface ForearmRig {
  elbow: Vec2;
  wrist: Vec2;
  knuckles: Vec2;
  grip: Vec2;
  limb: Limb;
  /** Direction of the forearm (elbow to wrist) and of the hand (wrist to grip) as painted. */
  foreRest: number;
  handRest: number;
  /** Wrist to grip. */
  reach: number;
}

/**
 * A forearm plate's rig: its joints from the manifest (the rig's `pivot` as the elbow, `wrist` and
 * `knuckles`, the point `grip`) and its arm: a shoulder at `shoulder` (world) with an upper arm
 * `upper` long, the elbow bending to the `bend` side.
 */
export function forearmRig(id: PlateId, { shoulder, upper, bend, grip = "grip" }: { shoulder: Vec2; upper: number; bend: 1 | -1; grip?: string }): ForearmRig {
  const rig = plateEntry(id).rig;
  if (!rig?.pivot || !rig.wrist || !rig.knuckles) throw new Error(`Plate "${id}" needs a rig with a pivot (its elbow), a wrist and knuckles`);
  const elbow = fromAnchor(id, rig.pivot);
  const wrist = fromAnchor(id, rig.wrist);
  const knuckles = fromAnchor(id, rig.knuckles);
  const at = fromAnchor(id, grip);
  return {
    elbow,
    wrist,
    knuckles,
    grip: at,
    limb: { shoulder, upper, fore: Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]), bend },
    foreRest: Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]),
    handRest: Math.atan2(at[1] - wrist[1], at[0] - wrist[0]),
    reach: Math.hypot(at[0] - wrist[0], at[1] - wrist[1]),
  };
}

/** Where a forearm plate is when its hand reaches (`reachWith`). */
export interface ForearmPose {
  /** The plate's anchor (world), its turn about it and its scale. */
  pose: Pose;
  /** The hand's bend on its wrist, the fingers' turn and curl: the plate rig's acting (radians; 0 to about 0.3). */
  wrist: number;
  fingers: number;
  curl: number;
  /** Where the grip really is (world), the wrist bent and the fingers closed. */
  grip: [number, number];
  /** The hand's own turn from its painted direction. */
  turn: number;
  /** The arm's joints (world). */
  shoulder: Vec2;
  elbow: [number, number];
  wristAt: [number, number];
}

const reachLimb: LimbPose = { elbow: [0, 0], hand: [0, 0], upper: 0, fore: 0, reach: 0 };
const reachLocal: [number, number] = [0, 0];

/**
 * A forearm plate whose hand reaches for `target` with its grip, the hand turned `turn` from its
 * painted direction, its fingers turned `fingers` and curled `curl`: the wrist goes where the hand
 * needs it, the arm reaches for the wrist (two-bone IK) and the plate turns with the forearm about
 * the elbow; the hand bends on the wrist by the rest. The grip comes back as the rig bends it.
 */
export function reachWith(rig: ForearmRig, target: Vec2, turn: number, { fingers = 0, curl = 0, scale = 1 }: { fingers?: number; curl?: number; scale?: number } = {}): ForearmPose {
  const handAngle = rig.handRest + turn;
  const wristTarget: Vec2 = [target[0] - rig.reach * scale * Math.cos(handAngle), target[1] - rig.reach * scale * Math.sin(handAngle)];
  const limb = solveArm({ ...rig.limb, fore: rig.limb.fore * scale }, wristTarget, reachLimb);
  const rotate = limb.fore - rig.foreRest;
  const pose = poseThrough(limb.hand, rig.wrist, rotate, scale);
  const wrist = turn - rotate;
  // The grip as the rig bends it: the fingers about the knuckles (turned, curled in), then the hand about the wrist.
  const [kx, ky] = rig.knuckles;
  const c = Math.cos(fingers);
  const s = Math.sin(fingers);
  let gx = kx + c * (rig.grip[0] - kx) - s * (rig.grip[1] - ky);
  let gy = ky + s * (rig.grip[0] - kx) + c * (rig.grip[1] - ky);
  gx = kx + (gx - kx) * (1 - curl);
  gy = ky + (gy - ky) * (1 - curl);
  const cw = Math.cos(wrist);
  const sw = Math.sin(wrist);
  reachLocal[0] = rig.wrist[0] + cw * (gx - rig.wrist[0]) - sw * (gy - rig.wrist[1]);
  reachLocal[1] = rig.wrist[1] + sw * (gx - rig.wrist[0]) + cw * (gy - rig.wrist[1]);
  return {
    pose,
    wrist,
    fingers,
    curl,
    grip: placeOn(pose, reachLocal),
    turn,
    shoulder: rig.limb.shoulder,
    elbow: [limb.elbow[0], limb.elbow[1]],
    wristAt: [limb.hand[0], limb.hand[1]],
  };
}

/* ------------------------------------------------------------------ */
/* Attachment                                                          */
/* ------------------------------------------------------------------ */

/**
 * A plate's pose: its anchor stands at `x`, `y` (world units) and it is turned `rotate` (radians,
 * counter-clockwise) and scaled `scale` about that anchor, as `Plate` draws it.
 */
export interface Pose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

export const newPose = (x = 0, y = 0, rotate = 0, scale = 1): Pose => ({ x, y, rotate, scale });

/**
 * A point of a plate, from its anchor, in world units at scale 1 and unturned: `[u, v]` fractions of
 * the image (from the left and the top), or the name of one of its manifest points.
 */
export function fromAnchor(id: PlateId, point: string | Pair): [number, number] {
  const entry = plateEntry(id);
  const uv = typeof point === "string" ? entry.points?.[point] : point;
  if (!uv) throw new Error(`Plate "${id}" has no point "${String(point)}" (see points in public/art/manifest.json)`);
  const [w, h] = plateWorldSize(entry);
  return [(uv[0] - entry.anchor[0]) * w, (entry.anchor[1] - uv[1]) * h];
}

/** Where a point of a plate (`local`, from its anchor, see `fromAnchor`) is in the world when the plate has `pose`. Writes into `out`. */
export function placeOn(pose: Pose, local: Vec2, out: [number, number] = [0, 0]): [number, number] {
  const c = Math.cos(pose.rotate);
  const s = Math.sin(pose.rotate);
  const lx = local[0] * pose.scale;
  const ly = local[1] * pose.scale;
  out[0] = pose.x + c * lx - s * ly;
  out[1] = pose.y + s * lx + c * ly;
  return out;
}

/**
 * The pose that puts a plate's point `local` exactly on the world point `at`, turned `rotate` and
 * scaled `scale` (the plate turns about its anchor, so the anchor is placed to match). Writes into `out`.
 */
export function poseThrough(at: Vec2, local: Vec2, rotate: number, scale: number, out: Pose = newPose()): Pose {
  const c = Math.cos(rotate);
  const s = Math.sin(rotate);
  const lx = local[0] * scale;
  const ly = local[1] * scale;
  out.x = at[0] - (c * lx - s * ly);
  out.y = at[1] - (s * lx + c * ly);
  out.rotate = rotate;
  out.scale = scale;
  return out;
}

const tmpGrip: [number, number] = [0, 0];

/**
 * A held thing parented to its hand: the thing's own grip point (`itemGrip`, from its anchor) sits
 * exactly on the hand's grip point (`handGrip`, from the hand's anchor) wherever the hand goes, and
 * it turns with the hand (plus `turn` of its own). It cannot drift: its pose is worked out from the
 * hand's every time. Writes into `out`.
 */
export function holdAt(hand: Pose, handGrip: Vec2, itemGrip: Vec2, { turn = 0, scale = 1 }: { turn?: number; scale?: number } = {}, out: Pose = newPose()): Pose {
  placeOn(hand, handGrip, tmpGrip);
  return poseThrough(tmpGrip, itemGrip, hand.rotate + turn, scale, out);
}

/** A pose as the offsets a `Plate` adds to its manifest place (`x`, `y`) and its turn and scale. */
export function offsetsFrom(pose: Pose, position: Vec2): Pose {
  return { x: pose.x - position[0], y: pose.y - position[1], rotate: pose.rotate, scale: pose.scale };
}

/* ------------------------------------------------------------------ */
/* Ballistics                                                          */
/* ------------------------------------------------------------------ */

/** Something thrown or let go: where, how fast, and how it meets the ground. */
export interface Throw {
  /** World position at release. */
  from: Vec2;
  /** Velocity at release, world units per second (from the hand that let go: `perSecond` of its track's speed). */
  velocity: Vec2;
  /** Gravity, world units per second squared. Default `PHYSICS.gravity`. */
  gravity?: number;
  /** Light air drag, per second: the speed decays as e^(-drag t). Default 0.25. */
  drag?: number;
  /** Turn at release (radians) and spin (radians per second), which the air slows down too. */
  rotate?: number;
  spin?: number;
  /** World y where it lands (the centre of the thing at contact). Default: it never lands. */
  floor?: number;
  /** How springy the contact is: the share of its speed it keeps as it leaves the ground (0 to 1). Default 0.3. */
  bounce?: number;
  /** How long one contact lasts, seconds (stiffer ground, shorter contact). Default 0.06. */
  contact?: number;
  /** How quickly it stops sliding and spinning once down, per second. Default 6. */
  friction?: number;
}

/** Where a thrown thing is at a moment (`ballistic`). */
export interface Flight {
  x: number;
  y: number;
  rotate: number;
  vx: number;
  vy: number;
  /** How far it is pressed into the ground at a contact, as a share of how far it can be (0 in the air): a squash to show. */
  squash: number;
  /** True once it has come to rest. */
  resting: boolean;
}

export const newFlight = (): Flight => ({ x: 0, y: 0, rotate: 0, vx: 0, vy: 0, squash: 0, resting: false });

/** e^(-k t) and (1 - e^(-k t)) / k, safe for a tiny k. */
const decay = (k: number, t: number) => Math.exp(-k * t);
const decayed = (k: number, t: number) => (k * t < 1e-6 ? t - (k * t * t) / 2 : -Math.expm1(-k * t) / k);

/** Free flight from (x0, y0) with (vx, vy) for t seconds under gravity g with drag k (closed form). */
function fly(x0: number, y0: number, vx: number, vy: number, g: number, k: number, t: number, out: Flight): Flight {
  const e = decay(k, t);
  const f = decayed(k, t);
  out.x = x0 + vx * f;
  out.vx = vx * e;
  if (k * t < 1e-6) {
    out.y = y0 + vy * t - (g * t * t) / 2;
    out.vy = vy - g * t;
  } else {
    const terminal = g / k;
    out.y = y0 + (vy + terminal) * f - terminal * t;
    out.vy = (vy + terminal) * e - terminal;
  }
  return out;
}

/** When a free flight first comes down to `floor` (it must be above it), by bisection on the falling part. */
function landingTime(x0: number, y0: number, vx: number, vy: number, g: number, k: number, floor: number): number {
  const probe = newFlight();
  // Rising part: the top is where vy reaches 0.
  let lo = 0;
  let hi = 0.05;
  for (let i = 0; i < 60; i++) {
    fly(x0, y0, vx, vy, g, k, hi, probe);
    if (probe.y <= floor) break;
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    fly(x0, y0, vx, vy, g, k, mid, probe);
    if (probe.y > floor) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** How many contacts a landing plays before the thing lies still. */
const CONTACTS = 3;

/**
 * Where a thing let go at story time 0 is at story time `t` (seconds; before 0 it is at its release
 * point): a parabola under gravity with light air drag, turning with a spin the air slows down. With a
 * `floor` it lands: each contact is a short, stiff, damped spring (the ground gives a little, `squash`)
 * that sends it up again with `bounce` of its speed, a couple of times, and then it lies still, its
 * slide and spin stopped by `friction`. Its speed never jumps, even at a contact, and it is a function
 * of `t` alone: scrubbed back, it flies back up into the hand. Writes into `out`.
 */
export function ballistic(th: Throw, t: number, out: Flight = newFlight()): Flight {
  const g = th.gravity ?? PHYSICS.gravity;
  const k = th.drag ?? 0.25;
  const spin = th.spin ?? 0;
  const rotate0 = th.rotate ?? 0;
  out.squash = 0;
  out.resting = false;
  if (t <= 0) {
    out.x = th.from[0];
    out.y = th.from[1];
    out.vx = th.velocity[0];
    out.vy = th.velocity[1];
    out.rotate = rotate0;
    return out;
  }
  if (th.floor === undefined || th.from[1] <= th.floor) {
    fly(th.from[0], th.from[1], th.velocity[0], th.velocity[1], g, k, t, out);
    out.rotate = rotate0 + spin * decayed(k, t);
    return out;
  }

  const bounce = th.bounce ?? 0.3;
  const contact = th.contact ?? 0.06;
  const friction = th.friction ?? 6;
  const floor = th.floor;
  const omega = Math.PI / contact;
  const damp = (-Math.log(Math.max(1e-4, bounce)) / Math.PI) * omega;
  let x = th.from[0];
  let y = th.from[1];
  let vx = th.velocity[0];
  let vy = th.velocity[1];
  let rot = rotate0;
  let w = spin;
  let clock = 0;
  for (let n = 0; n <= CONTACTS; n++) {
    // In the air until it comes down to the floor.
    const tl = landingTime(x, y, vx, vy, g, k, floor);
    if (t < clock + tl) {
      fly(x, y, vx, vy, g, k, t - clock, out);
      out.rotate = rot + w * decayed(k, t - clock);
      return out;
    }
    fly(x, y, vx, vy, g, k, tl, out);
    rot += w * decayed(k, tl);
    w *= decay(k, tl);
    clock += tl;
    x = out.x;
    vx = out.vx;
    const vIn = -out.vy; // its speed into the ground, > 0
    const tc = t - clock;
    // While it touches the ground it slides and spins down with friction.
    out.x = x + vx * decayed(friction, tc);
    out.vx = vx * decay(friction, tc);
    out.rotate = rot + w * decayed(friction, tc);
    if (n === CONTACTS || vIn * bounce < 0.05) {
      // The last contact settles: a critically damped spring that takes all of its speed and comes
      // to rest on the floor (pressed in by vIn t e^(-omega t), its speed continuous throughout).
      const e = Math.exp(-omega * tc);
      out.y = floor - vIn * tc * e;
      out.vy = -vIn * e * (1 - omega * tc);
      out.squash = Math.min(1, omega * Math.E * tc * e);
      out.resting = tc > 6 / omega;
      return out;
    }
    if (tc < contact) {
      // A bounce: half a period of a damped spring that sends it up again with `bounce` of its speed.
      const e = Math.exp(-damp * tc);
      const sn = Math.sin(omega * tc);
      const cs = Math.cos(omega * tc);
      out.y = floor - (vIn / omega) * e * sn;
      out.vy = -(vIn / omega) * e * (omega * cs - damp * sn);
      out.squash = Math.max(0, sn * e);
      return out;
    }
    x += vx * decayed(friction, contact);
    vx *= decay(friction, contact);
    rot += w * decayed(friction, contact);
    w *= decay(friction, contact);
    clock += contact;
    y = floor;
    vy = vIn * Math.exp(-damp * contact);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Secondary motion, as a function of the time since the event         */
/* ------------------------------------------------------------------ */

/** How something rings: its frequency (cycles per second) and how fast it dies away (per second). */
export interface Ring {
  frequency: number;
  decay: number;
}

/**
 * A spring let go at rest from `from` (a branch bent by a pull, released as the fruit comes free), at
 * story time `t` after the release: it swings back through rest, overshoots and rings out. Before
 * the release it holds `from`. Its speed is zero at the release, so it joins whatever held it there
 * without a jump. Damped: `from * e^(-decay t) * (cos wt + decay / w sin wt)`.
 */
export function dampedRelease(from: number, t: number, ring: Ring): number {
  if (t <= 0) return from;
  const w = TAU * ring.frequency;
  return from * Math.exp(-ring.decay * t) * (Math.cos(w * t) + (ring.decay / w) * Math.sin(w * t));
}

/**
 * A kick (a sleeve after a fast move, leaves shaken by a snap) at story time `t` after the event:
 * `amplitude * e^(-decay t) * sin(w t)`, eased in over its first `onset` seconds (default a tenth of
 * a period) so it starts from rest, without a jump in speed. Zero before the event.
 */
export function dampedKick(amplitude: number, t: number, ring: Ring & { onset?: number }): number {
  if (t <= 0) return 0;
  const w = TAU * ring.frequency;
  const onset = ring.onset ?? 0.1 / ring.frequency;
  return amplitude * Math.exp(-ring.decay * t) * Math.sin(w * t) * smoother(t / onset);
}

/* ------------------------------------------------------------------ */
/* Live lag (time-based, settles to nothing)                           */
/* ------------------------------------------------------------------ */

/** A spring's state: where it is and how fast it moves. */
export interface Spring {
  x: number;
  v: number;
}

/**
 * One step of a critically damped spring toward `target` over `dt` seconds (exact for a target held
 * over the step, so any frame rate gives the same path): `omega` is its stiffness (radians per second;
 * it settles in about 4 / omega seconds). Pulled toward 0 it always comes back to 0, without ringing.
 */
export function springStep(state: Spring, target: number, dt: number, omega: number): Spring {
  if (dt <= 0) return state;
  const x0 = state.x - target;
  const e = Math.exp(-omega * dt);
  const c = state.v + omega * x0;
  state.x = target + (x0 + c * dt) * e;
  state.v = (state.v - omega * c * dt) * e;
  if (Math.abs(state.x - target) < 1e-7 && Math.abs(state.v) < 1e-6) {
    state.x = target;
    state.v = 0;
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

/** A jump in a driven value's speed: where, and its speed just before and just after. */
export interface VelocityJump {
  at: number;
  before: number;
  after: number;
}

/**
 * The largest change of speed across any point near `p` (within `h` of it), measured close up (over
 * steps of `h / 256`): for a jump in speed it stays about as large as the jump, for a smooth curve it
 * shrinks with the step.
 */
function closeUp(f: (p: number) => number, p: number, h: number): { size: number } & VelocityJump {
  const eps = h / 256;
  const best = { size: 0, at: p, before: 0, after: 0 };
  for (let c = p - h; c <= p + h; c += eps / 2) {
    const mid = f(c);
    const left = (mid - f(c - eps)) / eps;
    const right = (f(c + eps) - mid) / eps;
    const size = Math.abs(right - left);
    if (size > best.size) Object.assign(best, { size, at: c, before: left, after: right });
  }
  return best;
}

/**
 * Where a driven value's speed jumps between `from` and `to`. It walks the value in steps of `step`;
 * where its speed changes by more than `tolerance` of its top speed nearby (within `window` of
 * progress) from one step to the next, it zooms in (`closeUp`): a jump in speed stays as the steps
 * shrink, a quick but smooth change of speed does not. Values that barely move (a top speed under
 * `still`, per unit of progress) pass.
 */
export function velocityJumps(
  f: (p: number) => number,
  from: number,
  to: number,
  { step = 1e-5, tolerance = 0.3, window = 0.01, still = 1e-3 }: { step?: number; tolerance?: number; window?: number; still?: number } = {},
): VelocityJump[] {
  const n = Math.max(2, Math.ceil((to - from) / step));
  const h = (to - from) / n;
  const speeds = new Float64Array(n);
  let last = f(from);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const next = f(from + (i + 1) * h);
    speeds[i] = (next - last) / h;
    last = next;
    peak = Math.max(peak, Math.abs(speeds[i]));
  }
  if (peak < still) return [];
  // The top speed near each step: the largest in its block of `window` and the blocks either side.
  const size = Math.max(1, Math.round(window / h));
  const blocks = new Float64Array(Math.ceil(n / size));
  for (let i = 0; i < n; i++) blocks[Math.floor(i / size)] = Math.max(blocks[Math.floor(i / size)], Math.abs(speeds[i]));
  const near = (i: number) => {
    const b = Math.floor(i / size);
    return Math.max(blocks[b], blocks[Math.max(0, b - 1)], blocks[Math.min(blocks.length - 1, b + 1)], still);
  };
  const jumps: VelocityJump[] = [];
  for (let i = 1; i < n; i++) {
    const scale = near(i);
    if (Math.abs(speeds[i] - speeds[i - 1]) <= tolerance * scale) continue;
    const found = closeUp(f, from + i * h, h);
    if (found.size <= tolerance * scale * 0.5) continue;
    if (!jumps.length || Math.abs(jumps[jumps.length - 1].at - found.at) > 2 * h) jumps.push({ at: found.at, before: found.before, after: found.after });
  }
  return jumps;
}
