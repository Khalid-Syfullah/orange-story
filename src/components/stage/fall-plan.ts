import { plateEntry, platePoint } from "@/art/manifest";
import { clamp01, ease, lerp, remap } from "@/lib/progress";
import { transitionOf } from "@/scroll/helpers";
import { CAMERA, FALL } from "@/scroll/script";

import { createCameraPath, getStageAspect, type CameraPath } from "./camera-path";

/**
 * Scene 10, the falling orange, as pure functions of progress (no React, no three). Timings live in
 * `FALL` (`src/scroll/script.ts`).
 *
 * - The cut branch hands over from the still branch of the prune scene (fruit and all) to a copy
 *   without its fruit, which drops and turns away; the orange sits exactly where the fruit hung and
 *   takes over from it.
 * - The gardener drifts right and out of frame.
 * - The orange is placed relative to the camera, which follows it: from the branch it settles at the
 *   rainbow ring's origin on screen, then keeps falling out of the bottom of the frame, soft and out
 *   of focus, while the camera pushes into it and then dollies up between the rows.
 */

/** The fruit on the branch that is cut (`prune/branch-right`): world centre (its `fruit` point) and diameter. */
const fruitPoint = platePoint("prune/branch-right", "fruit");
export const BRANCH_FRUIT = { x: fruitPoint[0], y: fruitPoint[1], diameter: 0.121 } as const;

/** Where the ball sits in the falling-orange sprite: its diameter and the drop of its centre below the sprite's, as fractions of the sprite. */
export const SPRITE_BALL = { diameter: 0.76, drop: 0.07 } as const;

/** The orange's scale when it is the size of the fruit on the branch. */
export const BRANCH_SCALE = BRANCH_FRUIT.diameter / (plateEntry("fall/falling-orange").height * SPRITE_BALL.diameter);
/** How much bigger than its drawn size the orange is once the camera has pushed in. */
export const PUSH_SCALE = 1.25;

/** Where the orange is on screen at the ring's origin, in normalized device y (-1 bottom, 1 top). */
export const RING_SCREEN_Y = (() => {
  const origin = transitionOf("ring").origin;
  return origin ? -(origin[1] - 0.5) * 2 : 0;
})();
/** How far down the orange is (device y) when it has fallen out of the frame. */
const GONE_SCREEN_Y = -1.35;
/** Peak blur of the orange, as a fraction of the view height. */
export const SOFT_BLUR = 0.045;
/** The gardener's drift to the right, in world units. */
export const GARDENER_DRIFT = 6;
/** How far the cut branch drops, in world units. */
export const BRANCH_DROP = 9;

const smooth = (t: number) => t * t * (3 - 2 * t);

let path: CameraPath | null = null;

interface CameraView {
  x: number;
  y: number;
  /** Half the view height at the picture plane. */
  halfHeight: number;
}

/** The stage camera at progress p (read from the same keys as the camera rig). */
function cameraAt(p: number): CameraView {
  path ??= createCameraPath(CAMERA);
  const pose = path.seek(p);
  return { x: pose.px, y: pose.py, halfHeight: Math.abs(pose.pz) * Math.tan((pose.fov * Math.PI) / 360) };
}

/** How far through the cut hand-over p is, 0 (the still branch) to 1 (the cut branch and the orange). */
export function cutAmount(p: number): number {
  return remap(p, FALL.cut[0], FALL.cut[1]);
}

/** The still branch of the prune scene (with its fruit): there until the cut. */
export function stillBranchOpacity(p: number): number {
  return 1 - cutAmount(p);
}

/** The cut branch (no fruit): drawn from the cut, gone once it has dropped away. */
export function cutBranchOpacity(p: number): number {
  return cutAmount(p) * (1 - remap(p, lerp(FALL.branch[0], FALL.branch[1], 0.7), FALL.branch[1]));
}

function dropAmount(p: number): number {
  return remap(p, FALL.branch[0], FALL.branch[1]);
}

/** The cut branch's offset: it falls faster and faster, drifting out and turning its tip down. */
export function branchDropY(p: number): number {
  const t = dropAmount(p);
  return -BRANCH_DROP * t * t;
}

export function branchDropX(p: number): number {
  return 0.5 * smooth(dropAmount(p));
}

export function branchTurn(p: number): number {
  return -1.2 * ease(dropAmount(p));
}

/** The gardener's offset to the right: he drifts away and out of frame. */
export function gardenerX(p: number): number {
  return GARDENER_DRIFT * smooth(remap(p, FALL.gardener[0], FALL.gardener[1]));
}

export interface OrangeFrame {
  /** World position of the sprite's centre. */
  x: number;
  y: number;
  /** Multiple of the drawn sprite height. */
  scale: number;
  rotate: number;
  /** Fraction of the view height. */
  blur: number;
  opacity: number;
  /** The ball's screen y (normalized device, -1 bottom to 1 top). */
  screenY: number;
}

let start: { aspect: number; dx: number; sy: number } | null = null;
let cached: { p: number; aspect: number; frame: OrangeFrame } | null = null;

/** Offsets of the fruit from the camera at the moment it lets go (world x, device y). */
function releaseOffsets() {
  // The camera is fitted to the stage's shape, so the fruit's place in the view depends on it.
  if (!start || start.aspect !== getStageAspect()) {
    const cam = cameraAt(FALL.release[0]);
    start = { aspect: getStageAspect(), dx: BRANCH_FRUIT.x - cam.x, sy: (BRANCH_FRUIT.y - cam.y) / cam.halfHeight };
  }
  return start;
}

/** The orange at progress p. */
export function orangeFrame(p: number): OrangeFrame {
  if (cached && cached.p === p && cached.aspect === getStageAspect()) return cached.frame;
  const from = releaseOffsets();
  const cam = cameraAt(p);
  const e = smooth(remap(p, FALL.release[0], FALL.release[1]));
  const push = smooth(remap(p, FALL.push[0], FALL.push[1]));
  const exit = remap(p, FALL.exit[0], FALL.exit[1]);
  const scale = lerp(BRANCH_SCALE, 1, e) * lerp(1, PUSH_SCALE, push);
  // Settles at the ring's origin, then falls away, faster and faster.
  const screenY = lerp(from.sy, RING_SCREEN_Y, e) + (GONE_SCREEN_Y - RING_SCREEN_Y) * exit * exit;
  const ballY = cam.y + screenY * cam.halfHeight;
  const sprite = plateEntry("fall/falling-orange").height * scale;
  const frame: OrangeFrame = {
    x: cam.x + from.dx * (1 - e),
    y: ballY + SPRITE_BALL.drop * sprite,
    scale,
    rotate: 0.9 * remap(p, FALL.release[0], FALL.exit[1]),
    blur: SOFT_BLUR * ease(remap(p, FALL.soften[0], FALL.soften[1])),
    opacity: cutAmount(p) * (1 - clamp01(ease(remap(p, FALL.fade[0], FALL.fade[1])))),
    screenY,
  };
  cached = { p, aspect: getStageAspect(), frame };
  return frame;
}
