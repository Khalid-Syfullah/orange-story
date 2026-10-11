"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";

import { useMutable } from "@/lib/use-mutable";
import { plateEntry } from "@/art/manifest";
import { PHYSICS } from "@/scroll/script";
import { colors, mixColors } from "@/styles/tokens";

import { usePlateTexture } from "../textures";
import { canopyField, fallingField, leafClock, LEAVES, pathField } from "./leaf-plan";
import { lensOrder } from "./lens";
import { particlesFor } from "./modes";
import { useParticleMesh } from "./particle-field";
import { transitionShows, usePrecompile, type TransitionEffectProps } from "./transition-stage";

/**
 * The leaves (`leaf-plan.ts`): the ascent's painted leaf, as particle fields standing or falling in the
 * world, drawn after both scenes. Through the leaves: the young tree's leaves around the camera's path
 * to the branch, and two right on it that fill the lens as the scenes swap. Back out of the tree: leaves
 * drifting down past the lens. Out of focus near the lens (a smaller mip), smeared a little when the
 * story is scrolled fast. Calm: none (the scenes cross-fade).
 */

const LEAF_LOOK = (map: import("three").Texture, unfurl: number) => ({
  colorA: colors.white,
  colorB: colors.white,
  lit: colors.white,
  litAmount: 0,
  shade: mixColors("leaf", "sky", 0.4),
  map,
  spin: 0.7,
  unfurl,
});

export function LeafPass({ def, progress, mode, smear }: TransitionEffectProps) {
  const map = usePlateTexture(plateEntry("ascent/leaf"));
  const falling = def.id === "foliage";
  // The leaves on the twigs unfurl as the camera comes up to them; the falling ones come loose whole.
  const look = React.useMemo(() => LEAF_LOOK(map, falling ? 0 : LEAVES.unfurl), [map, falling]);
  const whole = React.useMemo(() => LEAF_LOOK(map, 0), [map]);
  const cloud = React.useMemo(() => (falling ? fallingField() : canopyField()), [falling]);
  const path = React.useMemo(() => pathField(), []);
  const cloudMesh = useParticleMesh(cloud, look, `leaves-${def.id}`);
  const pathMesh = useParticleMesh(path, whole, `leaves-${def.id}-path`);
  usePrecompile([cloudMesh, pathMesh]);

  const cloudRef = useMutable(cloudMesh);
  const pathRef = useMutable(pathMesh);

  useFrame(({ camera }) => {
    const cloudMesh = cloudRef.current;
    const pathMesh = pathRef.current;
    const p = progress.get();
    const m = mode();
    const on = transitionShows(def, p) && m !== "calm";
    cloudMesh.visible = on;
    pathMesh.visible = on && !falling;
    if (!on) return;
    const t = leafClock(p, def);
    const focus = (camera as PerspectiveCamera).userData.focus ?? 2;
    for (const mesh of [cloudMesh, pathMesh]) {
      const u = mesh.material.uniforms;
      u.uTime.value = t;
      u.uGravity.value = PHYSICS.gravity;
      (u.uWind.value as Vector3).set(falling ? 0.15 : 0, 0, 0);
      (u.uTravel.value as Vector3).set(0, 0, 0);
      u.uSmear.value = smear.current ?? 0;
      u.uStretch.value = 0.05;
      u.uFocus.value = focus;
      u.uAperture.value = 0.75;
      u.uOpacity.value = 1;
    }
    cloudMesh.renderOrder = lensOrder(0.8, 2);
    pathMesh.renderOrder = lensOrder(0.05, 3);
    cloudMesh.geometry.instanceCount = particlesFor(cloud.count, m);
  });

  return (
    <>
      <primitive object={cloudMesh} />
      <primitive object={pathMesh} />
    </>
  );
}
