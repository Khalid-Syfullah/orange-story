import { CAMERA } from "@/scroll/script";
import type { Vec3 } from "@/scroll/types";

import { createCameraPath, projectPoint, type CameraPath, type CameraPose } from "../camera-path";

/**
 * Match cuts and anchors (pure): where something in the world lands on the screen at a moment, through
 * the same camera path the stage films with (`camera-path.ts`, fitted to the stage's shape), and the
 * place in front of the lens that shows a thing exactly where it was. A medium can then start from the
 * picture (the sand from the halves' cut faces, the ring from the orange's impact) and a lens layer
 * can take over from a world plate without a seam (the paper of the plan).
 */

let path: CameraPath | null = null;
const cameraPath = () => (path ??= createCameraPath(CAMERA));

/** The pose the stage films from at progress p (a copy, safe to keep). */
export function poseAt(p: number): CameraPose {
  return { ...cameraPath().seek(p) };
}

/** A rectangle on the stage in px from its top left. */
export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A world box facing the camera (the shots look along -z), its corners projected at progress p on a `width` by `height` stage. */
export function screenRect(box: { x0: number; x1: number; y0: number; y1: number; z: number }, p: number, width: number, height: number): ScreenRect {
  const pose = cameraPath().seek(p);
  const a = projectPoint(pose, [box.x0, box.y1, box.z], width, height);
  const b = projectPoint(pose, [box.x1, box.y0, box.z], width, height);
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/** Where a world point lands (px) and how far in front of the camera it is, at progress p. */
export function screenPoint(point: Vec3, p: number, width: number, height: number): { x: number; y: number; depth: number } {
  return projectPoint(cameraPath().seek(p), point, width, height);
}

/** A circle in the world (centre, radius, facing the camera) as a circle on the stage at progress p: its centre (px) and radius (px). */
export function screenCircle(center: Vec3, radius: number, p: number, width: number, height: number): { x: number; y: number; radius: number; depth: number } {
  const pose = cameraPath().seek(p);
  const c = projectPoint(pose, center, width, height);
  const depth = Math.max(1e-6, c.depth);
  const tan = Math.tan((pose.fov * Math.PI) / 360);
  return { x: c.x, y: c.y, radius: (radius / (depth * tan)) * (height / 2), depth };
}

/**
 * A point of the stage (px) as a point in front of the lens at `depth` (camera space: x right, y up,
 * -z ahead), for a camera with this vertical field of view and the stage's shape.
 */
export function lensPoint(x: number, y: number, depth: number, width: number, height: number, fov: number): [number, number, number] {
  const halfH = depth * Math.tan((fov * Math.PI) / 360);
  const halfW = halfH * (width / Math.max(1, height));
  return [(x / width - 0.5) * 2 * halfW, (0.5 - y / height) * 2 * halfH, -depth];
}

/** A rectangle of the stage (px) as a rectangle in front of the lens at `depth`: its centre and size there. */
export function lensRect(rect: ScreenRect, depth: number, width: number, height: number, fov: number): { x: number; y: number; width: number; height: number } {
  const a = lensPoint(rect.x0, rect.y0, depth, width, height, fov);
  const b = lensPoint(rect.x1, rect.y1, depth, width, height, fov);
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, width: Math.abs(b[0] - a[0]), height: Math.abs(a[1] - b[1]) };
}

/**
 * How far a point in the world has moved toward the camera between two moments of a straight push
 * (the camera's forward travel, along its view): positive as the camera closes in.
 */
export function forwardTravel(from: number, to: number): number {
  const a = poseAt(from);
  const b = cameraPath().seek(to);
  const fx = a.tx - a.px;
  const fy = a.ty - a.py;
  const fz = a.tz - a.pz;
  const l = Math.hypot(fx, fy, fz) || 1;
  return ((b.px - a.px) * fx + (b.py - a.py) * fy + (b.pz - a.pz) * fz) / l;
}
