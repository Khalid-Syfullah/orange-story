"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3 } from "three";

import { plateEntry, type Pair, type PlateId } from "@/art/manifest";
import { seeded } from "@/lib/progress";

import { useIdleClock } from "./idle";
import { TwinkleMaterial } from "./materials";
import { read, setColorUniform, useInvalidateOnChange, type Num } from "./plate";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "./stage-context";
import { usePlateTexture } from "./textures";

/**
 * Twinkling sprites (stars, sparkles): one instanced draw for the whole field. Each point pulses in
 * brightness and size on idle time with its own phase and speed, paused offscreen and with reduced
 * motion. `reveal` (0 to 1, usually scrubbed by scroll) shows points as it passes each one's
 * `appear` threshold, so a field can grow like a constellation and shrink back when scrolling up.
 */

export interface TwinklePoint {
  /** World position of the sprite's center. */
  position: readonly [number, number, number];
  /** Height in world units (sprites are square). */
  size: number;
  /** Phase in radians. Default: seeded. */
  phase?: number;
  /** Pulses per second. Default: seeded, 0.25 to 0.7. */
  speed?: number;
  /** Reveal threshold, 0 to 1 (shown once `reveal` passes it). Default 0. */
  appear?: number;
}

export interface TwinkleFieldOptions {
  /** World x range. */
  x: Pair;
  /** World y range. */
  y: Pair;
  /** World z, or a range. Default 0. */
  z?: number | Pair;
  /** Sprite size range in world units. */
  size: Pair;
  /** Points for which this returns true are skipped (keep a corner clear). */
  keepOut?: (x: number, y: number) => boolean;
  /** Spread `appear` thresholds over 0 to 1 so the field can grow with `reveal`. */
  grow?: boolean;
}

/** A seeded field of twinkle points (the same on every render). */
export function twinkleField(seed: string, count: number, { x, y, z = 0, size, keepOut, grow = false }: TwinkleFieldOptions): TwinklePoint[] {
  const rand = seeded(seed);
  const points: TwinklePoint[] = [];
  const pick = (range: Pair) => range[0] + (range[1] - range[0]) * rand();
  for (let tries = 0; points.length < count && tries < count * 20; tries++) {
    const px = pick(x);
    const py = pick(y);
    if (keepOut?.(px, py)) continue;
    points.push({
      position: [px, py, typeof z === "number" ? z : pick(z)],
      size: pick(size),
      phase: rand() * Math.PI * 2,
      speed: 0.25 + rand() * 0.45,
      appear: grow ? (points.length / Math.max(1, count - 1)) * 0.94 : 0,
    });
  }
  return points;
}

export interface TwinkleProps {
  /** The sprite (a manifest entry). */
  sprite: PlateId;
  points: readonly TwinklePoint[];
  /** 0 to 1, multiplied by the scene's presence. */
  opacity?: Num;
  /** 0 to 1: points with `appear` below it are shown. Default 1. */
  reveal?: Num;
  tint?: string;
  tintAmount?: Num;
  /** Add light instead of covering (glows, sparkles on sky). */
  additive?: boolean;
  /** Stacking inside the scene. */
  layer?: number;
  name?: string;
}

const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();
const NO_ROTATION = new Quaternion();

export function Twinkle({ sprite, points, opacity, reveal, tint, tintAmount, additive = false, layer = 0, name = "twinkle" }: TwinkleProps) {
  const texture = usePlateTexture(plateEntry(sprite));
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const material = React.useMemo(() => new TwinkleMaterial(texture, additive), [texture, additive]);

  const mesh = React.useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    const data = new Float32Array(points.length * 4);
    const instanced = new InstancedMesh(geometry, material, points.length);
    points.forEach((point, i) => {
      const seed = seeded(`${name}-${i}`);
      data.set([point.phase ?? seed() * Math.PI * 2, point.speed ?? 0.25 + seed() * 0.45, Math.min(0.94, Math.max(0, point.appear ?? 0)), 0], i * 4);
      tmpPosition.set(...point.position);
      tmpScale.set(point.size, point.size, 1);
      instanced.setMatrixAt(i, tmpMatrix.compose(tmpPosition, NO_ROTATION, tmpScale));
    });
    geometry.setAttribute("twinkle", new InstancedBufferAttribute(data, 4));
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.name = name;
    return instanced;
  }, [points, material, name]);

  React.useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
      material.dispose();
    },
    [mesh, material],
  );
  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useInvalidateOnChange([opacity, reveal, tintAmount]);

  const ref = React.useRef<InstancedMesh>(null);
  useFrame(() => {
    const instanced = ref.current;
    if (!instanced) return;
    const p = progress?.get() ?? 0;
    const alpha = read(opacity, 1) * (scene ? scene.presence(p) : 1);
    const shown = alpha > 0.001 && points.length > 0;
    instanced.visible = shown;
    if (shown && clock.inView(instanced)) clock.hold(key);
    else clock.drop(key);
    const twinkle = instanced.material as TwinkleMaterial;
    const u = twinkle.uniforms;
    setColorUniform(twinkle, "tint", tint);
    u.opacity.value = alpha;
    u.reveal.value = read(reveal, 1);
    u.time.value = clock.time();
    u.tintAmount.value = tint ? read(tintAmount, 1) : 0;
  });

  return <primitive ref={ref} object={mesh} renderOrder={plateRenderOrder(scene, layer)} />;
}
