"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import type { PerspectiveCamera } from "three";

import { CAMERA } from "@/scroll/script";
import type { CameraKey } from "@/scroll/types";

import { createCameraPath } from "./camera-path";

/**
 * Drives the stage camera from the `CAMERA` keys of the script: every frame it seeks the GSAP
 * camera path to the story progress and applies position, look-at target and field of view. It runs
 * before everything else in the frame (priority -2), so plates read this frame's camera. The
 * distance to the target is the focus for depth of field (`camera.userData.focus`).
 */
export function CameraRig({ progress, keys = CAMERA }: { progress: MotionValue<number>; keys?: readonly CameraKey[] }) {
  const path = React.useMemo(() => createCameraPath(keys), [keys]);
  React.useEffect(() => () => path.kill(), [path]);

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera;
    const pose = path.seek(progress.get());
    camera.position.set(pose.px, pose.py, pose.pz);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    if (camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.userData.focus = Math.hypot(pose.tx - pose.px, pose.ty - pose.py, pose.tz - pose.pz);
    camera.updateMatrixWorld();
  }, -2);

  return null;
}
