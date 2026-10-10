"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, Sphere, Vector2, Vector3 } from "three";

import { plateEntry, type Pair, type PlateId } from "@/art/manifest";
import { seeded } from "@/lib/progress";

import { useIdleClock } from "./idle";
import { RippleMaterial } from "./materials";
import { read, UNIT_PLANE, useInvalidateOnChange, type Num } from "./plate";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "./stage-context";
import { usePlateTexture } from "./textures";

/**
 * The hero's glow: droplets of light spill from a source (the raised orange) and spread across the
 * sky in a slow, ring-shaped ripple, like rain in reverse. One instanced draw; every droplet's
 * motion is computed in the vertex shader from idle time, so nothing runs per droplet on the CPU.
 * It plays on idle time (always on while on screen, even before scrolling), paused offscreen and
 * with reduced motion.
 *
 * `lift` (0 to 1, usually scrubbed by scroll) brightens the droplets toward white and speeds the
 * ripple up a little. The speed-up changes the rate of an accumulated clock, so the ripple never
 * jumps when it changes, and scrolling back slows it down again.
 */

/** Seconds of ripple time per second of idle time at full lift: "a little" faster. */
export const RIPPLE_SPEED_UP = 0.45;

/**
 * Per-droplet data, 4 floats each: angle, ring (0 to 1, which front it travels with), jitter (-1 to
 * 1, so a front is not a perfect circle) and size. The same on every render.
 */
export function rippleDrops(seed: string, count: number, size: number): Float32Array {
  const rand = seeded(seed);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = rand() * Math.PI * 2;
    data[i * 4 + 1] = (i + rand() * 0.9) / count;
    data[i * 4 + 2] = rand() * 2 - 1;
    data[i * 4 + 3] = size * (0.55 + rand() * 1.1);
  }
  return data;
}

export interface GlowRippleProps {
  /** The sprite of one droplet (a manifest entry). */
  sprite: PlateId;
  /** World position of the source (the orange). */
  source: Pair;
  /** 0 to 1, multiplied by the scene's presence. */
  opacity?: Num;
  /** 0 to 1: brightens toward white and speeds up. */
  lift?: Num;
  /** How far the droplets spread, in world units. Default 7. */
  reach?: number;
  count?: number;
  /** Stacking inside the scene. Negative draws behind the scene's plates (over its sky). */
  layer?: number;
  name?: string;
}

export function GlowRipple({ sprite, source, opacity, lift, reach = 7, count = 320, layer = -2, name = "glow-ripple" }: GlowRippleProps) {
  const entry = plateEntry(sprite);
  const texture = usePlateTexture(entry);
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const material = React.useMemo(() => new RippleMaterial(texture), [texture]);
  const geometry = React.useMemo(() => {
    // The shared unit quad's buffers, repeated once per droplet.
    const instanced = new InstancedBufferGeometry();
    instanced.setIndex(UNIT_PLANE.getIndex());
    for (const attribute of ["position", "normal", "uv"]) instanced.setAttribute(attribute, UNIT_PLANE.getAttribute(attribute));
    instanced.setAttribute("drop", new InstancedBufferAttribute(rippleDrops(`${name}-drops`, count, entry.height), 4));
    instanced.instanceCount = count;
    // The droplets move in the shader: their bounds are the whole reach around the source.
    instanced.boundingSphere = new Sphere(new Vector3(source[0], source[1], 0), reach);
    return instanced;
  }, [name, count, entry.height, source, reach]);

  React.useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useInvalidateOnChange([opacity, lift]);

  const state = React.useRef({ last: 0, time: 0 });
  const ref = React.useRef<Mesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const p = progress?.get() ?? 0;
    const alpha = read(opacity, 1) * (scene ? scene.presence(p) : 1);
    const shown = alpha > 0.001;
    mesh.visible = shown;
    if (shown && clock.inView(mesh)) clock.hold(key);
    else clock.drop(key);
    // Ripple time: idle time, run a little faster as the glow lifts.
    const now = clock.time();
    const s = state.current;
    const level = read(lift, 0);
    s.time += Math.max(0, now - s.last) * (1 + RIPPLE_SPEED_UP * level);
    s.last = now;
    const u = (mesh.material as RippleMaterial).uniforms;
    u.time.value = s.time;
    u.opacity.value = alpha;
    u.lift.value = level;
    u.reach.value = reach;
    (u.source.value as Vector2).set(source[0], source[1]);
  });

  // The droplets move in the shader, so the mesh's own bounds are meaningless: never cull it.
  const place = React.useMemo(() => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = name;
    return mesh;
  }, [geometry, material, name]);

  return <primitive ref={ref} object={place} renderOrder={plateRenderOrder(scene, layer)} />;
}
