import { plateEntry, plateWorldSize } from "@/art/manifest";
import { sceneOf, transitionOf } from "@/scroll/helpers";
import { fitFov, panAmount } from "@/scroll/camera-fit";
import { CAMERA } from "@/scroll/script";

import { glide, storyTime } from "../motion-kit";
import { poseAt } from "./match-cut";

/**
 * Work to blueprint: through the cloud (pure). As the builder finishes his last blow, a gust carries a
 * bank of The Work's clouds in front of him from the left; the gust dies away as the nearest fills the
 * lens at the scene boundary (the scenes swap inside it), and the camera's pan across to the scaffold
 * carries the camera out of the bank, the clouds sliding off to the left, the nearest fastest.
 *
 * The clouds stand in the world (the camera's own pan gives the parallax), each `distance` in front of
 * the camera as it is at the swap and sized in heights of the frame there, so a tall phone frame is
 * covered as well as a wide one. They all ride the same gust: it starts strong and dies away
 * (`drift`), so near clouds cross the frame fast and large, far ones slowly. Each starts just outside
 * the left of the frame and ends outside it again: nothing fades.
 */

export const CLOUD_PASS = {
  /**
   * Back to front: the plate, its distance in front of the camera at the swap, its height in frame
   * heights there, how high it rides (frame heights above the middle), how far outside the frame's left
   * edge it starts (frame widths), its dot (a fraction of the cloud plates' own cell: about the same size
   * on screen at any distance) and how much of it is dots rather than soft paint (near the lens, out
   * of focus, it is mostly soft).
   */
  clouds: [
    { id: "work/cloud-3", distance: 2.6, height: 1.0, y: 0.3, lead: 0.05, cell: 0.55, dots: 1 },
    { id: "work/cloud-1", distance: 1.3, height: 1.4, y: -0.22, lead: 0.02, cell: 0.3, dots: 0.75 },
    { id: "work/cloud-6", distance: 0.6, height: 2.45, y: 0.08, lead: 0.01, cell: 0.13, dots: 0.32 },
  ],
  /** The solid core of a cloud plate (alpha over 80%, measured on the paintings), as [left, top, right, bottom] fractions. */
  core: [0.3, 0.3, 0.7, 0.76],
  /** How fast the gust dies away (seconds of story time for it to drop to a third). */
  decay: 0.12,
  /**
   * When the gust gets up: this share of the way from the pass's start to the swap (the builder's last
   * blows first, then the bank sweeps in and fills the frame just as the scenes swap, not long before).
   */
  gustFrom: 0.45,
  /**
   * On a tall screen a cloud deep enough to fill the frame is many frames wide, more than the pan can
   * carry the camera out of: there the bank thins away once the scenes have swapped (from this share of
   * the way from the swap to the pass's end).
   */
  thinFrom: 0.1,
} as const;

export type CloudPassCloud = (typeof CLOUD_PASS.clouds)[number];

/** The pass, from the script. */
export const CLOUD_DEF = transitionOf("cloud");
/** Where the scenes swap, inside the nearest cloud. */
export const CLOUD_SWAP = sceneOf(CLOUD_DEF.to).start;

/** The camera at the swap on a stage of this shape: the key's pose, fitted as the camera path fits it. */
export function swapPose(aspect: number) {
  // The keys either side of the swap both film the work builder: the camera holds there.
  let key = CAMERA[0];
  for (const k of CAMERA) if (k.at <= CLOUD_SWAP) key = k;
  const pan = key.pan ?? [0, 0, 0];
  const k = panAmount(aspect);
  return { x: key.position[0] + pan[0] * k, y: key.position[1] + pan[1] * k, z: key.position[2] + (pan[2] ?? 0) * k, fov: fitFov(key.fov, aspect) };
}

const plateAspect = (id: string) => {
  const [w, h] = plateWorldSize(plateEntry(id));
  return w / h;
};

/** The frame the clouds are sized for (16 by 10): on a wider one they are wider still, so they cover it as well. */
const WIDE = 1.6;

/** A cloud's measures on a stage of this shape: the frame's height and width at its distance, its own width and height. */
function measures(cloud: CloudPassCloud, aspect: number) {
  const fh = 2 * cloud.distance * Math.tan((swapPose(aspect).fov * Math.PI) / 360);
  const height = cloud.height * fh * Math.max(1, aspect / WIDE);
  return { fh, fw: fh * aspect, height, width: height * plateAspect(cloud.id) };
}

/** The frame's left edge (world x) at depth z, filmed at progress p (the stage's own camera path and shape). */
function leftEdgeAt(p: number, z: number, aspect: number): number {
  const pose = poseAt(p);
  return pose.px - (pose.pz - z) * Math.tan((pose.fov * Math.PI) / 360) * aspect;
}

/**
 * Where a cloud starts, left of the camera's line at the swap (world units): outside the frame on the
 * left both as the pass begins (the camera is still settling into its hold, a little farther back and
 * to the right, so its frame is wider there) and at the swap.
 */
function startOffset(cloud: CloudPassCloud, aspect: number): number {
  const pose = swapPose(aspect);
  const m = measures(cloud, aspect);
  const left = Math.min(pose.x - m.fw / 2, leftEdgeAt(CLOUD_DEF.start, pose.z - cloud.distance, aspect));
  return left - pose.x - m.width / 2 - cloud.lead * m.fw;
}

/** Where the gust gets up (progress). */
export const GUST_START = CLOUD_DEF.start + CLOUD_PASS.gustFrom * (CLOUD_SWAP - CLOUD_DEF.start);

/** How far the gust has carried the clouds by progress p (world units, to the right): strong at first, dying away. */
export function cloudDrift(p: number, aspect: number): number {
  const near = CLOUD_PASS.clouds[CLOUD_PASS.clouds.length - 1];
  const tau = CLOUD_PASS.decay;
  // Strong enough that the nearest cloud stands across the middle of the frame at the swap.
  const toMiddle = -startOffset(near, aspect);
  const reach = toMiddle / -Math.expm1(-storyTime(CLOUD_SWAP, GUST_START) / tau);
  const t = Math.max(0, storyTime(p, GUST_START));
  return reach * -Math.expm1(-t / tau);
}

export interface CloudPose {
  /** World position of the cloud's middle. */
  x: number;
  y: number;
  z: number;
  /** World height of the plate. */
  height: number;
  /** Shown only while the pass runs (it starts and ends outside the frame). */
  shown: boolean;
  /** 1, or on a tall screen thinning away after the swap. */
  opacity: number;
}

/** Cloud `i` at progress p, on a stage of this shape. */
export function cloudAt(i: number, p: number, aspect: number, out: CloudPose = { x: 0, y: 0, z: 0, height: 1, shown: false, opacity: 1 }): CloudPose {
  const cloud = CLOUD_PASS.clouds[i];
  const pose = swapPose(aspect);
  const m = measures(cloud, aspect);
  out.height = m.height;
  out.x = pose.x + startOffset(cloud, aspect) + cloudDrift(p, aspect);
  out.y = pose.y + cloud.y * m.fh;
  out.z = pose.z - cloud.distance;
  out.shown = p >= CLOUD_DEF.start && p < CLOUD_DEF.end;
  const from = CLOUD_SWAP + CLOUD_PASS.thinFrom * (CLOUD_DEF.end - CLOUD_SWAP);
  out.opacity = aspect < 1 ? 1 - glide(p, [from, CLOUD_DEF.end]) : 1;
  return out;
}

/** A cloud's box and its solid core in the world at progress p (for the coverage check). */
export function cloudBoxes(i: number, p: number, aspect: number) {
  const c = cloudAt(i, p, aspect);
  const width = c.height * plateAspect(CLOUD_PASS.clouds[i].id);
  const [l, t, r, b] = CLOUD_PASS.core;
  const x0 = c.x - width / 2;
  const y1 = c.y + c.height / 2;
  return {
    box: { x0, x1: x0 + width, y0: y1 - c.height, y1, z: c.z },
    core: { x0: x0 + l * width, x1: x0 + r * width, y0: y1 - b * c.height, y1: y1 - t * c.height, z: c.z },
  };
}
