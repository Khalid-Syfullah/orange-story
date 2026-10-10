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
  /** The pose the timeline writes into (one object, reused every frame). */
  readonly pose: CameraPose;
  /** Moves the path to progress p and returns the pose there. */
  seek(p: number): CameraPose;
  kill(): void;
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
  const timeline = gsap.timeline({ paused: true });
  for (let i = 0; i + 1 < keys.length; i++) {
    const from = keys[i];
    const to = keys[i + 1];
    timeline.fromTo(pose, { ...poseOf(from) }, { ...poseOf(to), duration: to.at - from.at, ease: EASE_GSAP_NAME, immediateRender: false }, from.at);
  }
  const first = keys[0].at;
  const last = keys[keys.length - 1].at;

  return {
    pose,
    seek(p) {
      const time = Math.min(Math.max(p, first), last);
      timeline.time(time, true);
      return pose;
    },
    kill() {
      timeline.kill();
    },
  };
}
