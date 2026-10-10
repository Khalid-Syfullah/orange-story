import { gsap } from "gsap";

import { registerGsap } from "@/scroll/stage-scroll";
import type { CameraKey } from "@/scroll/types";
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
