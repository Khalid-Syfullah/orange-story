import { gsap } from "gsap";

import { fitFov, panAmount, REFERENCE_ASPECT } from "@/scroll/camera-fit";
import { registerGsap } from "@/scroll/stage-scroll";
import type { CameraKey, Vec3 } from "@/scroll/types";

/**
 * The camera path as one paused GSAP timeline, seeked by story progress (pure: no React, no three).
 * Each key starts a move (push, pull, pan, dolly up or down, reframe, hold) that tweens position,
 * target and field of view to the next key. The camera never cuts: every value is interpolated, and
 * seeking backwards plays the same path in reverse. Timeline time is progress, so a key at 0.0575
 * sits at 0.0575 seconds.
 *
 * The moves are joined into one smooth path (`cameraSlopes`, a monotone cubic through the keys):
 * the camera starts from rest after a hold and lands at rest before one, glides through the keys
 * of a chain of moves (the ascent's push, pan and dolly) without stopping, keeps moving through
 * the whole of a long move, and never overshoots a key. The story's easing curve is not used here:
 * scrubbed by scroll, its very fast start (7 times the average speed) reads as a jolt at every key,
 * and its long tail as a camera that has stopped.
 */

export interface CameraPose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

export interface CameraPath {
  /** The pose the timeline writes into (one object, reused every frame): the keys' own values. */
  readonly pose: CameraPose;
  /**
   * Moves the path to progress p and returns the pose to film from there: the keys' pose, made
   * to fit the stage's shape (`fitFov`, and the keys' `pan` on a tall screen). On a wide stage it
   * is the keys' pose, unchanged. One object, reused every frame.
   */
  seek(p: number): CameraPose;
  kill(): void;
}

/* ------------------------------------------------------------------ */
/* Fitting the picture to the screen                                   */
/* ------------------------------------------------------------------ */

// The fit itself is pure and lives in `@/scroll/camera-fit` (the framing table uses it too).
export { FIT_BELOW, FIT_STRENGTH, PAN_FROM, PAN_TO, REFERENCE_ASPECT, fitFov, fovScale, panAmount } from "@/scroll/camera-fit";

let stageAspect = REFERENCE_ASPECT;

/**
 * Tells the camera path the shape of the stage (width over height). The stage sets it when it is
 * measured and on every resize; every reader of the path (the rig, the connector lines, the falling
 * orange) then films and projects through the same fitted camera. Defaults to the reference shape.
 */
export function setStageAspect(aspect: number): void {
  stageAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : REFERENCE_ASPECT;
}

export function getStageAspect(): number {
  return stageAspect;
}

/** A point on the stage: px from its left and from its top, and its depth in front of the camera (world units; 0 or less is behind it). */
export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

/** The camera's axes for a pose, as the rig's `lookAt` sets them (+y up): forward, right and up. */
function cameraBasis(pose: CameraPose) {
  let fx = pose.tx - pose.px;
  let fy = pose.ty - pose.py;
  let fz = pose.tz - pose.pz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x world up; up = right x forward.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  return { fx, fy, fz, rx, rz, ux, uy, uz, tan: Math.tan((pose.fov * Math.PI) / 360) };
}

/**
 * Where a world point lands on a stage `width` by `height` px filmed from `pose` (the stage canvas
 * fills the stage, so this is where the plate point is drawn). Pure: DOM layers use it to pin things
 * to the painted world, frame by frame.
 */
export function projectPoint(pose: CameraPose, point: Vec3, width: number, height: number): ScreenPoint {
  const b = cameraBasis(pose);
  const dx = point[0] - pose.px;
  const dy = point[1] - pose.py;
  const dz = point[2] - pose.pz;
  const depth = dx * b.fx + dy * b.fy + dz * b.fz;
  const cx = dx * b.rx + dz * b.rz;
  const cy = dx * b.ux + dy * b.uy + dz * b.uz;
  const aspect = width / Math.max(1, height);
  const safe = Math.abs(depth) < 1e-9 ? 1e-9 : depth;
  const ndcX = cx / (safe * b.tan * aspect);
  const ndcY = cy / (safe * b.tan);
  return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height, depth };
}

/** The inverse of `projectPoint` onto the plane z = `z`: the world point seen at stage pixel (x, y). */
export function unprojectToPlane(pose: CameraPose, x: number, y: number, width: number, height: number, z: number): Vec3 {
  const b = cameraBasis(pose);
  const aspect = width / Math.max(1, height);
  const sx = ((x / width) * 2 - 1) * b.tan * aspect;
  const sy = (1 - (y / height) * 2) * b.tan;
  const dirX = b.fx + b.rx * sx + b.ux * sy;
  const dirY = b.fy + b.uy * sy;
  const dirZ = b.fz + b.rz * sx + b.uz * sy;
  const s = (z - pose.pz) / dirZ;
  return [pose.px + dirX * s, pose.py + dirY * s, z];
}

/** A key's tall-screen pan as [x, y, z] (a two-value pan moves the camera sideways and up only), or undefined. */
export function panOf(key: CameraKey): readonly [number, number, number] | undefined {
  if (!key.pan) return undefined;
  return [key.pan[0], key.pan[1], key.pan[2] ?? 0];
}

export function poseOf(key: CameraKey): CameraPose {
  const [px, py, pz] = key.position;
  const [tx, ty, tz] = key.target;
  return { px, py, pz, tx, ty, tz, fov: key.fov };
}

/* ------------------------------------------------------------------ */
/* The smooth path through the keys                                    */
/* ------------------------------------------------------------------ */

/**
 * The slope (units per progress) the path passes each key with, for one value sampled at the keys
 * (`times`, strictly increasing). A monotone cubic (Fritsch and Butland's harmonic mean): zero at the
 * first and last key, at a key where the value turns back or holds still, and on both sides of a
 * segment marked `rest` (a reframe, which happens unseen under a covering transition and must not
 * bend the moves around it); elsewhere the weighted harmonic mean of the two neighbouring slopes, so
 * the value never overshoots a key and its speed never jumps.
 */
export function cameraSlopes(times: readonly number[], values: readonly number[], rest: readonly boolean[] = []): number[] {
  const n = times.length;
  const slopes = new Array<number>(n).fill(0);
  for (let i = 1; i + 1 < n; i++) {
    if (rest[i - 1] || rest[i]) continue;
    const h0 = times[i] - times[i - 1];
    const h1 = times[i + 1] - times[i];
    const d0 = (values[i] - values[i - 1]) / h0;
    const d1 = (values[i + 1] - values[i]) / h1;
    if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) continue;
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    slopes[i] = (w0 + w1) / (w0 / d0 + w1 / d1);
  }
  return slopes;
}

/**
 * A GSAP ease for one value over one segment: the cubic Hermite from 0 to 1 that leaves with slope
 * `u0` and arrives with slope `u1`, both relative to the straight line between the two keys (1 is
 * the straight line's own slope, 0 is from or to rest). `cameraSlopes` keeps both within 0 to 3, so
 * the curve stays between 0 and 1.
 */
export function hermiteEase(u0: number, u1: number): (t: number) => number {
  return (t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return -2 * t3 + 3 * t2 + (t3 - 2 * t2 + t) * u0 + (t3 - t2) * u1;
  };
}

type Field = keyof CameraPose;
const POSE_FIELDS: readonly Field[] = ["px", "py", "pz", "tx", "ty", "tz", "fov"];

/**
 * Adds one value's moves to the timeline: one tween per segment where it changes, each eased along
 * the smooth path (`cameraSlopes`, `hermiteEase`).
 */
function addValueTweens(
  timeline: gsap.core.Timeline,
  target: Record<string, number>,
  field: string,
  times: readonly number[],
  values: readonly number[],
  rest: readonly boolean[],
): void {
  const slopes = cameraSlopes(times, values, rest);
  for (let i = 0; i + 1 < times.length; i++) {
    const a = values[i];
    const b = values[i + 1];
    if (a === b) continue;
    const span = times[i + 1] - times[i];
    const ease = hermiteEase((slopes[i] * span) / (b - a), (slopes[i + 1] * span) / (b - a));
    timeline.fromTo(target, { [field]: a }, { [field]: b, duration: span, ease, immediateRender: false }, times[i]);
  }
}

/**
 * How far the camera has travelled through the move between its keys at progress `from` and `to`:
 * 0 up to `from`, 1 from `to` on, and in between the share of the way covered by the value that
 * changes most over the move, on the path's own curve. For art that moves in step with a camera
 * move (the fruit carried down the pluck's dolly, the site sliding aside as the camera pulls out).
 * The path is built on first use; the last answer is kept, so several readers in one frame seek once.
 */
export function cameraTravel(keys: readonly CameraKey[], from: number, to: number): (p: number) => number {
  let path: CameraPath | null = null;
  let field: Field = "px";
  let start = 0;
  let end = 1;
  const last = { p: Number.NaN, travel: 0 };
  const setup = () => {
    const a = keys.find((k) => k.at === from);
    const b = keys.find((k) => k.at === to);
    if (!a || !b) throw new Error(`cameraTravel: no camera keys at ${from} and ${to}`);
    const pa = poseOf(a);
    const pb = poseOf(b);
    field = POSE_FIELDS.reduce((best, f) => (Math.abs(pb[f] - pa[f]) > Math.abs(pb[best] - pa[best]) ? f : best), POSE_FIELDS[0]);
    start = pa[field];
    end = pb[field];
    return createCameraPath(keys);
  };
  return (p) => {
    if (last.p === p) return last.travel;
    let travel: number;
    if (p <= from) travel = 0;
    else if (p >= to) travel = 1;
    else {
      path ??= setup();
      path.seek(p);
      travel = end === start ? 1 : Math.min(1, Math.max(0, (path.pose[field] - start) / (end - start)));
    }
    last.p = p;
    last.travel = travel;
    return travel;
  };
}

export function createCameraPath(keys: readonly CameraKey[]): CameraPath {
  if (keys.length === 0) throw new Error("The camera path needs at least one key");
  registerGsap();
  const pose = poseOf(keys[0]);
  // The pan offsets move along with the pose (a key without one keeps the one before it).
  const pans: (readonly [number, number, number])[] = [];
  keys.forEach((key, i) => pans.push(panOf(key) ?? pans[i - 1] ?? [0, 0, 0]));
  const pan = { x: pans[0][0], y: pans[0][1], z: pans[0][2] };
  const view: CameraPose = { ...pose };
  const timeline = gsap.timeline({ paused: true });
  const times = keys.map((key) => key.at);
  const rest = keys.map((key) => key.move === "reframe");
  const poses = keys.map(poseOf);
  for (const field of POSE_FIELDS)
    addValueTweens(timeline, pose as unknown as Record<string, number>, field, times, poses.map((p) => p[field]), rest);
  addValueTweens(timeline, pan, "x", times, pans.map((p) => p[0]), rest);
  addValueTweens(timeline, pan, "y", times, pans.map((p) => p[1]), rest);
  addValueTweens(timeline, pan, "z", times, pans.map((p) => p[2]), rest);
  const first = keys[0].at;
  const last = keys[keys.length - 1].at;

  return {
    pose,
    seek(p) {
      const time = Math.min(Math.max(p, first), last);
      timeline.time(time, true);
      const k = panAmount(stageAspect);
      const dx = pan.x * k;
      const dy = pan.y * k;
      view.px = pose.px + dx;
      view.py = pose.py + dy;
      // The pan's third value moves the camera alone, nearer the picture (negative) or away from it: the subject keeps its size on a tall screen.
      view.pz = pose.pz + pan.z * k;
      view.tx = pose.tx + dx;
      view.ty = pose.ty + dy;
      view.tz = pose.tz;
      view.fov = fitFov(pose.fov, stageAspect);
      return view;
    },
    kill() {
      timeline.kill();
    },
  };
}
