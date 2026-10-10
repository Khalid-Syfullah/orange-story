import { gsap } from "gsap";

import { registerGsap } from "@/scroll/stage-scroll";
import type { CameraKey, Vec3 } from "@/scroll/types";
import { EASE_GSAP_NAME } from "@/styles/tokens";

/**
 * The camera path as one paused GSAP timeline, seeked by story progress (pure: no React, no three).
 * Each key starts a move (push, pull, pan, dolly up or down, reframe, hold) that tweens position,
 * target and field of view to the next key with the story's one easing curve. The camera never
 * cuts: every value is interpolated, and seeking backwards plays the same path in reverse.
 * Timeline time is progress, so a key at 0.0575 sits at 0.0575 seconds.
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

/** The shape of a stage the camera was authored for: any laptop, desktop or landscape tablet. The keys are exact here. */
export const REFERENCE_ASPECT = 16 / 9;

/**
 * Below this shape (width over height) the stage is tall and narrow: a portrait tablet or a phone.
 * There the same vertical field of view would cut the picture's sides off, so the field widens by
 * `(FIT_BELOW / aspect) ^ FIT_STRENGTH`: with a strength of 1 the picture keeps the width it has at
 * `FIT_BELOW`, and the extra height shows more sky and ground above and below (where the text goes).
 * At and above `FIT_BELOW` nothing changes.
 */
export const FIT_BELOW = 1.3;
export const FIT_STRENGTH = 1;

/** Aspect ratios between which the keys' `pan` fades in: none at `FIT_BELOW` and wider, all of it at `PAN_TO` and narrower. */
export const PAN_FROM = FIT_BELOW;
export const PAN_TO = 0.6;

/** How much wider the vertical field of view (its tangent) is on a stage of this aspect. 1 on any wide stage. */
export function fovScale(aspect: number): number {
  if (!(aspect > 0) || aspect >= FIT_BELOW) return 1;
  return (FIT_BELOW / aspect) ** FIT_STRENGTH;
}

/** A vertical field of view (degrees) fitted to a stage of this aspect. */
export function fitFov(fov: number, aspect: number): number {
  const scale = fovScale(aspect);
  return scale === 1 ? fov : (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * scale) * 180) / Math.PI;
}

/** How much of the keys' `pan` applies on a stage of this aspect, 0 (wide) to 1 (tall and narrow). */
export function panAmount(aspect: number): number {
  if (!(aspect > 0)) return 0;
  return Math.min(1, Math.max(0, (PAN_FROM - aspect) / (PAN_FROM - PAN_TO)));
}

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

export function poseOf(key: CameraKey): CameraPose {
  const [px, py, pz] = key.position;
  const [tx, ty, tz] = key.target;
  return { px, py, pz, tx, ty, tz, fov: key.fov };
}

export function createCameraPath(keys: readonly CameraKey[]): CameraPath {
  if (keys.length === 0) throw new Error("The camera path needs at least one key");
  registerGsap();
  const pose = poseOf(keys[0]);
  // The pan offsets ease along with the pose (a key without one keeps the one before it).
  const pans: (readonly [number, number])[] = [];
  keys.forEach((key, i) => pans.push(key.pan ?? pans[i - 1] ?? [0, 0]));
  const pan = { x: pans[0][0], y: pans[0][1] };
  const view: CameraPose = { ...pose };
  const timeline = gsap.timeline({ paused: true });
  for (let i = 0; i + 1 < keys.length; i++) {
    const from = keys[i];
    const to = keys[i + 1];
    const vars = { duration: to.at - from.at, ease: EASE_GSAP_NAME, immediateRender: false };
    timeline.fromTo(pose, { ...poseOf(from) }, { ...poseOf(to), ...vars }, from.at);
    timeline.fromTo(pan, { x: pans[i][0], y: pans[i][1] }, { x: pans[i + 1][0], y: pans[i + 1][1], ...vars }, from.at);
  }
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
      view.pz = pose.pz;
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
