"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, Sphere, Vector2, Vector3 } from "three";

import { plateEntry, type Pair, type PlateId } from "@/art/manifest";
import { seeded } from "@/lib/progress";
import { useStacked } from "@/lib/use-stacked";

import { useIdleClock } from "./idle";
import { HalftoneMaterial, RippleMaterial } from "./materials";
import { HALFTONE } from "./paint";
import { particleCount } from "./quality";
import { read, useInvalidateOnChange, type Num } from "./plate";
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

/**
 * Ripple time per effect name, shared by every instance of that name: the hero and the ascent draw
 * the same glow in two scenes, and while they crossfade they must ripple in step. Whichever draws
 * first in a frame advances the clock; the rest find it already current.
 */
const rippleClocks = new Map<string, { last: number; time: number }>();

function rippleClock(name: string) {
  let clock = rippleClocks.get(name);
  if (!clock) {
    clock = { last: 0, time: 0 };
    rippleClocks.set(name, clock);
  }
  return clock;
}

/**
 * The droplets' geometry: one quad of its own, repeated once per droplet, with each droplet's data.
 * The quad must never be the plates' shared `UNIT_PLANE`: disposing a geometry deletes the GL buffers
 * of every attribute it holds, and the ripple's geometry is disposed when its scene unmounts, which
 * would leave every plate on the stage drawing from deleted buffers (a blank stage).
 */
export function rippleGeometry(seed: string, count: number, size: number, source: Pair, reach: number): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1);
  const instanced = new InstancedBufferGeometry();
  instanced.setIndex(quad.getIndex());
  for (const attribute of ["position", "normal", "uv"]) instanced.setAttribute(attribute, quad.getAttribute(attribute));
  instanced.setAttribute("drop", new InstancedBufferAttribute(rippleDrops(seed, count, size), 4));
  instanced.instanceCount = count;
  // The droplets move in the shader: their bounds are the whole reach around the source.
  instanced.boundingSphere = new Sphere(new Vector3(source[0], source[1], 0), reach);
  return instanced;
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
  /** World height added to the source's (the orange rises with the statue in the ascent). */
  offsetY?: Num;
  /** How far the droplets spread, in world units. Default 7. */
  reach?: number;
  count?: number;
  /** Stacking inside the scene. Negative draws behind the scene's plates (over its sky). */
  layer?: number;
  /** World x where the rings of dots have calmed away (toward the words on the left), and where they are full. */
  calm?: Pair;
  name?: string;
}

/** World units the ring plane reaches past the droplets' reach, so no ring is ever cut by its edge. */
const RING_MARGIN = 1.6;

/** Where the rings calm away toward the hero's words on the left (world x): gone, then full. */
const CALM: Pair = [-0.5, 1.6];

/** The plane of the ripple rings (owned: never the plates' shared quad), centred on the source. */
export function ringGeometry(reach: number): PlaneGeometry {
  const size = 2 * (reach + RING_MARGIN);
  return new PlaneGeometry(size, size);
}

export function GlowRipple({ sprite, source, opacity, lift, offsetY, reach = 7, count: wanted = 320, layer = -2, calm = CALM, name = "glow-ripple" }: GlowRippleProps) {
  // Half as many droplets on a phone.
  const count = particleCount(wanted, useStacked());
  const entry = plateEntry(sprite);
  const texture = usePlateTexture(entry);
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const material = React.useMemo(() => new RippleMaterial(texture), [texture]);
  const geometry = React.useMemo(() => rippleGeometry(`${name}-drops`, count, entry.height, source, reach), [name, count, entry.height, source, reach]);
  // The concentric rings, as rings of dots (the halftone layer), on the same ripple clock as the droplets.
  const ringMaterial = React.useMemo(() => {
    const m = new HalftoneMaterial(texture, "rings");
    const size = 2 * (reach + RING_MARGIN);
    (m.uniforms.ringSize.value as Vector2).set(size, size);
    // The dot grid in world units: the same dot size on any screen.
    (m.uniforms.cells.value as Vector2).set(size / HALFTONE.ringCell, size / HALFTONE.ringCell);
    (m.uniforms.calm.value as Vector2).set(calm[0] - source[0], calm[1] - source[0]);
    m.uniforms.reach.value = reach;
    return m;
  }, [texture, reach, calm, source]);
  const rings = React.useMemo(() => ringGeometry(reach), [reach]);

  React.useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  React.useEffect(
    () => () => {
      rings.dispose();
      ringMaterial.dispose();
    },
    [rings, ringMaterial],
  );
  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useInvalidateOnChange([opacity, lift, offsetY]);

  const state = React.useRef(rippleClock(name));
  const ref = React.useRef<Mesh>(null);
  const ringRef = React.useRef<Mesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    const ring = ringRef.current;
    if (!mesh || !ring) return;
    const p = progress?.get() ?? 0;
    const alpha = read(opacity, 1) * (scene ? scene.presence(p) : 1);
    const shown = alpha > 0.001;
    mesh.visible = shown;
    ring.visible = shown;
    if (shown && clock.inView(mesh)) clock.hold(key);
    else clock.drop(key);
    // Ripple time: idle time, run a little faster as the glow lifts.
    const now = clock.time();
    const s = state.current;
    const level = read(lift, 0);
    if (now > s.last) {
      s.time += (now - s.last) * (1 + RIPPLE_SPEED_UP * level);
      s.last = now;
    }
    const y = source[1] + read(offsetY, 0);
    const u = (mesh.material as RippleMaterial).uniforms;
    u.time.value = s.time;
    u.opacity.value = alpha;
    u.lift.value = level;
    u.reach.value = reach;
    (u.source.value as Vector2).set(source[0], y);
    const r = (ring.material as HalftoneMaterial).uniforms;
    r.time.value = s.time;
    r.opacity.value = alpha;
    r.lift.value = level;
    ring.position.set(source[0], y, -0.01);
  });

  // The droplets move in the shader, so the mesh's own bounds are meaningless: never cull it.
  const place = React.useMemo(() => {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = name;
    return mesh;
  }, [geometry, material, name]);
  const ringPlace = React.useMemo(() => {
    const mesh = new Mesh(rings, ringMaterial);
    mesh.name = `${name}-rings`;
    return mesh;
  }, [rings, ringMaterial, name]);

  return (
    <>
      <primitive ref={ringRef} object={ringPlace} renderOrder={plateRenderOrder(scene, layer - 0.5)} />
      <primitive ref={ref} object={place} renderOrder={plateRenderOrder(scene, layer)} />
    </>
  );
}
