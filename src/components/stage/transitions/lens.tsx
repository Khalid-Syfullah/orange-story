"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type { Camera, Group, PerspectiveCamera } from "three";

/**
 * The lens: what stands between the camera and the painting during a transition. A medium that fills
 * the view while the camera reframes under it (the sand, the paper, the dust, the cloth) lives in a
 * group that follows the camera (`LensGroup`), so the cut never jolts it: its layers sit at real
 * distances in front of the lens (camera space: x right, y up, -z ahead), and their own motion carries
 * the move. A medium the camera travels through without reframing (a cloud, leaves) stands in the
 * world instead, so the camera's real move gives it parallax.
 *
 * Every lens layer draws after every scene's plates (scene stacks are `order * 1000`), far layers
 * first, so near things cover far ones: depth-sorted passes, in painter's order like the plates.
 */

/** Render order of the lens: above the plates of every scene. */
export const LENS_ORDER = 100_000;

/** The farthest a lens layer stands (world units in front of the camera), for ordering. */
const LENS_FAR = 200;

/** Render order of a lens layer `depth` in front of the camera (nearer draws later); `sub` breaks ties inside a layer. */
export function lensOrder(depth: number, sub = 0): number {
  return LENS_ORDER + Math.round((LENS_FAR - Math.min(LENS_FAR, Math.max(0, depth))) * 50) + sub;
}

/** Half the view's width and height at `depth` in front of a camera (world units): [half width, half height]. */
export function lensView(camera: Camera, depth: number, out: [number, number] = [0, 0]): [number, number] {
  const c = camera as PerspectiveCamera;
  const halfH = depth * Math.tan(((c.fov ?? 50) * Math.PI) / 360);
  out[0] = halfH * (c.aspect ?? 1);
  out[1] = halfH;
  return out;
}

/**
 * A group that is the camera: its children are placed in camera space. It follows the camera every
 * frame, after the camera rig (-2) and before the plates (0).
 *
 * `holdFov` keeps the medium's size on screen while the camera's field of view changes under it (the
 * reframe under a cover changes it in one go): it returns the field of view (degrees) to hold, or null
 * to let the medium see the camera's own. The group is scaled across by the ratio of the two.
 */
export function LensGroup({ children, name = "lens", holdFov }: { children?: React.ReactNode; name?: string; holdFov?: () => number | null }) {
  const ref = React.useRef<Group>(null);
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const hold = holdFov?.() ?? null;
    const fov = (camera as PerspectiveCamera).fov;
    const k = hold && fov ? Math.tan((fov * Math.PI) / 360) / Math.tan((hold * Math.PI) / 360) : 1;
    g.scale.set(k, k, 1);
    g.updateMatrixWorld();
  }, -1.5);
  return (
    <group ref={ref} name={name}>
      {children}
    </group>
  );
}
