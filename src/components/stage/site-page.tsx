"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { RepeatWrapping, Vector4 } from "three";

import { plateEntry } from "@/art/manifest";
import { useMutable } from "@/lib/use-mutable";
import { useStacked } from "@/lib/use-stacked";

import { useIdleClock } from "./idle";
import { leavesOpacity, panelOpacity } from "./site-plan";
import { useSceneLayer, useStageProgress } from "./stage-context";
import { usePlateTexture } from "./textures";
import { PAGE_STATIONS } from "./transitions/hinge";
import { LensGroup, lensOrder, lensView } from "./transitions/lens";
import { pageMesh, setPage } from "./transitions/page-material";
import { pageFlight, pageShown } from "./transitions/dust-plan";

/**
 * Scene 8's milk page: the right half of the frame (on a phone the lower half) becomes a calm sheet of
 * milk-white paper lying beside the site, with very soft shadows of leaves drifting across it, felt more
 * than seen (`site/leaf-shadow`, read at a deep mip as a heavy blur). It fades in with progress
 * (`panelOpacity`); the leaves drift on idle time. When the wind gets up (the dust), it lifts the page
 * at its upwind edge: the page curls toward the camera and flies off up and to the right, out of the
 * frame, before the dust closes over the lens (`pageFlight`). A sheet in front of the lens, far behind
 * the dust.
 */

/** How far in front of the lens the page lies (behind every layer of the dust). */
const PAGE_DEPTH = 2.4;

/** A slow drift back and forth: seconds one way, and the offsets, turn (radians) and scale at each end. */
interface LeafDrift {
  period: number;
  from: readonly [number, number, number, number];
  to: readonly [number, number, number, number];
}

/** The leaf shadows' slow drift (the panel's old CSS keyframes). */
const LEAVES: Readonly<Record<"a" | "b", LeafDrift>> = {
  a: { period: 41, from: [-0.04, 0.03, -0.035, 1], to: [0.05, -0.04, 0.052, 1.06] },
  b: { period: 53, from: [0.05, -0.02, 0.07, 1.1], to: [-0.06, 0.04, -0.052, 1] },
};

/** Where a back-and-forth drift is at idle time t: eased in and out at each end. */
function drift(t: number, d: LeafDrift, out: Vector4): Vector4 {
  const cycle = (t / d.period) % 2;
  const u = cycle < 1 ? cycle : 2 - cycle;
  const e = u * u * (3 - 2 * u);
  return out.set(d.from[0] + (d.to[0] - d.from[0]) * e, d.from[1] + (d.to[1] - d.from[1]) * e, d.from[2] + (d.to[2] - d.from[2]) * e, d.from[3] + (d.to[3] - d.from[3]) * e);
}

export function SitePage() {
  const progress = useStageProgress();
  const scene = useSceneLayer();
  const clock = useIdleClock();
  const stacked = useStacked();
  const key = React.useMemo(() => ({}), []);
  const texture = usePlateTexture(plateEntry("site/leaf-shadow"));
  const page = React.useMemo(() => {
    // The shadows repeat across the page, as the mask did: the page's own copy of the shared texture.
    const shadows = texture.clone();
    shadows.wrapS = shadows.wrapT = RepeatWrapping;
    shadows.needsUpdate = true;
    const m = pageMesh(shadows, "page", "site-page");
    m.renderOrder = lensOrder(PAGE_DEPTH);
    return { mesh: m, shadows };
  }, [texture]);
  React.useEffect(
    () => () => {
      page.mesh.geometry.dispose();
      page.mesh.material.dispose();
      page.shadows.dispose();
    },
    [page],
  );
  React.useEffect(() => () => clock.drop(key), [clock, key]);
  const meshRef = useMutable(page.mesh);
  const angles = React.useRef<number[]>(new Array(PAGE_STATIONS).fill(0));
  const view = React.useRef<[number, number]>([0, 0]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const p = progress?.get() ?? 0;
    const opacity = panelOpacity(p) * (scene?.presence(p) ?? 1);
    const shown = pageShown(p) && opacity > 0.001;
    mesh.visible = shown;
    if (!shown) {
      clock.drop(key);
      return;
    }
    clock.hold(key);
    const [halfW, halfH] = lensView(camera, PAGE_DEPTH, view.current);
    // The wind gets under the upwind edge: it curls up toward the camera, more toward the edge, and the
    // page flies off up and to the right.
    const f = pageFlight(p);
    const curl = 2.4 * f * f * (3 - 2 * f);
    const bend = angles.current;
    for (let j = 0; j < PAGE_STATIONS; j++) {
      const s = j / (PAGE_STATIONS - 1);
      bend[j] = curl * s * s;
    }
    const fly = f * f;
    const u = mesh.material.uniforms;
    if (stacked) {
      // A phone: the lower half, its hinge the right edge.
      setPage(mesh, bend, 0, -1, 2 * halfW, halfH, [halfW + fly * halfW * 1.4, -halfH / 2 + fly * halfH * 2.2, -PAGE_DEPTH + fly * PAGE_DEPTH * 0.6]);
    } else {
      // The right half, its hinge the right edge.
      setPage(mesh, bend, 0, -1, halfW, 2 * halfH, [halfW + fly * halfW * 1.6, fly * halfH * 1.4, -PAGE_DEPTH + fly * PAGE_DEPTH * 0.6]);
    }
    u.uOpacity.value = opacity;
    u.uLeaves.value = leavesOpacity(p) * (1 - f);
    const t = clock.time();
    drift(t, LEAVES.a, u.uLeafA.value as Vector4);
    drift(t, LEAVES.b, u.uLeafB.value as Vector4);
  });

  return (
    <LensGroup name="site-page">
      <primitive object={page.mesh} />
    </LensGroup>
  );
}
