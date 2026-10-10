"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from "three";
import type { MotionValue } from "motion/react";

import { plateEntry } from "@/art/manifest";

import { DROP_EVERY, dropScatter, parcelAt, STREAM_BREAKS, type Parcel } from "./finale-plan";
import { useIdleClock } from "./idle";
import { WaterMaterial } from "./materials";
import { HALFTONE } from "./paint";
import { applyClearing, type PlateClearing } from "./plate";
import type { PartRide } from "./figure-life";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "./stage-context";

/** Points along the stream's ribbon, and the most drops in the air at once. */
const SEGMENTS = 28;
const MAX_DROPS = 28;
/** Seconds of flight the ribbon's last stretch fades over as it breaks into drops. */
const BREAK_FADE = 0.06;
/** A drop's size against the stream's width at the lip. */
const DROP_SIZE = 2;

const parcel: Parcel = { x: 0, y: 0, angle: 0, flow: 0, width: 0 };
const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();
const NO_TURN = new Quaternion();

/**
 * The water from the woman's jug (`finale-plan.ts`): a stream that leaves the spout with the pour of
 * each moment and flies a true parabola, so it bends as the jug tips (the change running down it),
 * thickens and quickens as more water comes, thins as it falls faster, and breaks into drops that
 * scatter a little as they fall out of the frame. On idle time (the loop), paused with the idle
 * clock; `weight` fades it in with the loop and `x`, `y`, `ride` carry the spout with her.
 */
export function WaterStream({ spout, x, y, ride, weight, clearing, layer, depth }: {
  spout: readonly [number, number];
  x: MotionValue<number>;
  y: MotionValue<number>;
  ride: PartRide;
  weight: (p: number) => number;
  clearing: PlateClearing;
  layer: number;
  depth: number;
}) {
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);

  const ribbon = React.useMemo(() => {
    const geometry = new BufferGeometry();
    const n = SEGMENTS + 1;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geometry.setAttribute("stream", new BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(n * 2 * 2), 2));
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    geometry.setIndex(index);
    const mesh = new Mesh(geometry, new WaterMaterial(false));
    mesh.frustumCulled = false;
    mesh.name = "water-stream";
    return mesh;
  }, []);
  const drops = React.useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute("drop", new InstancedBufferAttribute(new Float32Array(MAX_DROPS), 1));
    const mesh = new InstancedMesh(geometry, new WaterMaterial(true), MAX_DROPS);
    mesh.frustumCulled = false;
    mesh.name = "water-drops";
    return mesh;
  }, []);
  React.useEffect(
    () => () => {
      for (const mesh of [ribbon, drops]) {
        mesh.geometry.dispose();
        (mesh.material as WaterMaterial).dispose();
      }
      drops.dispose();
    },
    [ribbon, drops],
  );
  React.useEffect(() => () => clock.drop(key), [clock, key]);

  // The dots of the painted water this stream stands in for.
  const cell = HALFTONE.waterCell * (plateEntry("finale/water-1").paint?.cell ?? 1);

  const ribbonRef = React.useRef<Mesh>(null);
  const dropsRef = React.useRef<InstancedMesh>(null);

  useFrame((state) => {
    const ribbon = ribbonRef.current;
    const drops = dropsRef.current;
    if (!ribbon || !drops) return;
    const p = progress?.get() ?? 1;
    const amount = weight(p) * (scene ? scene.presence(p) : 1);
    const shown = amount > 0.001;
    ribbon.visible = shown;
    drops.visible = shown;
    if (!shown) {
      clock.drop(key);
      return;
    }
    clock.hold(key);
    const t = clock.time();
    const ox = spout[0] + x.get() + ride.x;
    const oy = spout[1] + y.get() + ride.y;
    const z = -depth;

    // The ribbon: parcels from the lip down to where the stream breaks.
    const position = ribbon.geometry.getAttribute("position") as BufferAttribute;
    const stream = ribbon.geometry.getAttribute("stream") as BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      const age = (STREAM_BREAKS.after * i) / SEGMENTS;
      parcelAt(t, age, parcel);
      const fade = 1 - Math.max(0, Math.min(1, (age - (STREAM_BREAKS.after - BREAK_FADE)) / BREAK_FADE));
      const half = parcel.width / 2;
      const nx = -Math.sin(parcel.angle) * half;
      const ny = Math.cos(parcel.angle) * half;
      const px = ox + parcel.x;
      const py = oy + parcel.y;
      position.setXYZ(2 * i, px - nx, py - ny, z);
      position.setXYZ(2 * i + 1, px + nx, py + ny, z);
      stream.setXYZ(2 * i, -1, age, parcel.flow * fade);
      stream.setXYZ(2 * i + 1, 1, age, parcel.flow * fade);
    }
    position.needsUpdate = true;
    stream.needsUpdate = true;

    // The drops: one for every DROP_EVERY seconds of water, from where the stream breaks until it has fallen out.
    const body = drops.geometry.getAttribute("drop") as InstancedBufferAttribute;
    const first = Math.ceil((t - STREAM_BREAKS.fall) / DROP_EVERY);
    const last = Math.floor((t - STREAM_BREAKS.after + BREAK_FADE) / DROP_EVERY);
    let count = 0;
    for (let k = last; k >= first && count < MAX_DROPS; k--) {
      const age = t - k * DROP_EVERY;
      parcelAt(t, age, parcel);
      if (parcel.flow < 0.02) continue;
      const scatter = dropScatter(k);
      const born = Math.max(0, Math.min(1, (age - (STREAM_BREAKS.after - BREAK_FADE)) / BREAK_FADE));
      const gone = 1 - Math.max(0, Math.min(1, (age - (STREAM_BREAKS.fall - 0.1)) / 0.1));
      const size = DROP_SIZE * scatter.size * parcel.width;
      tmpPosition.set(ox + parcel.x + scatter.across * age * -Math.sin(parcel.angle) + scatter.along * age * Math.cos(parcel.angle), oy + parcel.y + scatter.across * age * Math.cos(parcel.angle) + scatter.along * age * Math.sin(parcel.angle), z);
      tmpScale.set(size, size, 1);
      drops.setMatrixAt(count, tmpMatrix.compose(tmpPosition, NO_TURN, tmpScale));
      body.setX(count, parcel.flow * born * gone);
      count++;
    }
    drops.count = count;
    drops.instanceMatrix.needsUpdate = true;
    body.needsUpdate = true;

    for (const mesh of [ribbon, drops]) {
      const m = mesh.material as WaterMaterial;
      m.uniforms.opacity.value = amount;
      m.uniforms.time.value = t;
      m.uniforms.cell.value = cell;
      applyClearing(m, clearing, state.gl);
    }
  });

  const order = plateRenderOrder(scene, layer);
  return (
    <>
      <primitive ref={ribbonRef} object={ribbon} renderOrder={order} />
      <primitive ref={dropsRef} object={drops} renderOrder={order} />
    </>
  );
}
