"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { DataTexture, LinearFilter, NoColorSpace, PlaneGeometry, RGBAFormat, Float32BufferAttribute, type Mesh, type ShaderMaterial, type Vector4 } from "three";

import { plateEntry, plateWorldSize, type Pair, type PlateEntry, type PlateId } from "@/art/manifest";

import { shownInTree, useIdleClock } from "./idle";
import { deformQ, figurePhase, figurePivots, lifeAt, newLifeSample, type LifeSample } from "./life";
import { TEXTURE_RELEASE_MS } from "./quality";
import { figureWeights, figureZone, rigFigures, rigGridSize, rigVertexData, rigWeightData, type RigFigure } from "./rig";
import { useSceneLayer, useStageProgress } from "./stage-context";

/**
 * Living figures on the stage canvas.
 *
 * - `useRigResources`: a figure plate's subdivided mesh (with which person each vertex belongs to)
 *   and its weight texture, built from the manifest's rig (`rig.ts`). Owned by a reference-counted
 *   cache per plate: never the shared `UNIT_PLANE`, never disposed while a plate draws from it.
 * - `useFigureLife`: one figure's life, frame by frame: its idle life on the stage's idle clock
 *   (`life.ts`), plus scrubbed acting (`acting.ts`), written into its plate's shader by `apply`, and
 *   carried to the parts of the figure on their own plates (a head, an arm) as `rides`: the joint
 *   where each part meets the body is bent exactly as the body's mesh is, so the parts stay attached.
 */

/* ------------------------------------------------------------------ */
/* Rig resources                                                       */
/* ------------------------------------------------------------------ */

export interface RigResources {
  geometry: PlaneGeometry;
  weights: DataTexture;
}

interface RigSlot extends RigResources {
  refs: number;
  timer: number;
}

const rigSlots = new Map<string, RigSlot>();

function buildRig(entry: PlateEntry): RigSlot {
  const [segX, segY] = rigGridSize(entry.size);
  const geometry = new PlaneGeometry(1, 1, segX, segY);
  geometry.setAttribute("figure", new Float32BufferAttribute(rigVertexData(entry.rig, entry.size, segX, segY), 2));
  const { data, width, height } = rigWeightData(entry.rig, entry.size);
  const weights = new DataTexture(data, width, height, RGBAFormat);
  weights.colorSpace = NoColorSpace;
  weights.magFilter = LinearFilter;
  weights.minFilter = LinearFilter;
  weights.generateMipmaps = false;
  weights.needsUpdate = true;
  return { geometry, weights, refs: 0, timer: 0 };
}

/** Holds a slot (a plate draws from it). */
function retainRig(slot: RigSlot): void {
  slot.refs++;
  window.clearTimeout(slot.timer);
}

/** Lets a slot go; the last user gone, its buffers leave the GPU a few seconds later (unless a plate takes it back). */
function releaseRig(slot: RigSlot, id: string): void {
  slot.refs = Math.max(0, slot.refs - 1);
  if (slot.refs > 0) return;
  window.clearTimeout(slot.timer);
  slot.timer = window.setTimeout(() => {
    if (slot.refs > 0 || rigSlots.get(id) !== slot) return;
    rigSlots.delete(id);
    slot.geometry.dispose();
    slot.weights.dispose();
  }, TEXTURE_RELEASE_MS);
}

/** The rig slot of a plate (built once, shared by every plate that draws it). */
function rigSlot(entry: PlateEntry): RigSlot {
  let s = rigSlots.get(entry.id);
  if (!s) {
    s = buildRig(entry);
    rigSlots.set(entry.id, s);
  }
  return s;
}

/** The rig mesh and weights of a plate while `enabled` (null otherwise). Held while mounted; released a few seconds after the last user leaves. */
export function useRigResources(entry: PlateEntry, enabled: boolean): RigResources | null {
  const slot = React.useMemo(() => (enabled ? rigSlot(entry) : null), [entry, enabled]);
  React.useEffect(() => {
    if (!slot) return;
    retainRig(slot);
    return () => releaseRig(slot, entry.id);
  }, [slot, entry.id]);
  return slot;
}

/* ------------------------------------------------------------------ */
/* Figure life                                                         */
/* ------------------------------------------------------------------ */

/** Where a part rides: added to its place (world units) and its turn (radians), every frame. */
export interface PartRide {
  x: number;
  y: number;
  rotate: number;
}

/** Scrubbed acting for one person, written by an `acting` callback: extra turns in radians. */
export interface FigureActing {
  /** The whole figure about its feet. */
  sway: number;
  /** The head on the neck. */
  head: number;
  /** A raised arm on the shoulder. */
  arm: number;
}

export interface FigurePart {
  /** The part's plate. */
  id: PlateId;
  /** A head turns with the figure's head; anything else (an arm) only rides the body. */
  head?: boolean;
}

export interface FigureLifeOptions {
  /** Run at all (a plate without life still calls the hook). Default true. */
  enabled?: boolean;
  /** How lively, 1 normal. */
  strength?: number;
  /** Scrubbed acting: extra turns for person `index` at progress `p` (and idle time `t`, for the finale's loop). */
  acting?: (p: number, t: number, index: number, out: FigureActing) => void;
  /** Parts of the figure on their own plates, riding the body (a module constant: a new array rebuilds the life). */
  parts?: readonly FigurePart[];
  /** Things held at a world point, on the body or on one of its parts, that move with it (a module constant too). */
  holds?: readonly FigureHold[];
}

/**
 * Something the figure holds that is a plate of its own (the fruit in the harvester's hand, the
 * stream from the woman's jug): at world point `at`, on the body or on part `on`. `turn` adds the
 * part's own scrubbed or looped turn about its joint (the jug tipping), so the held thing follows it.
 */
export interface FigureHold {
  at: Pair;
  on?: PlateId;
  turn?: (p: number, t: number) => number;
}

/** A point of the body (a part's joint, a held thing), in the body's q space, with the rig's weights there. */
interface BodyPoint {
  q: [number, number];
  u: number;
  w: [number, number, number, number];
  index: number;
  zone: number;
  /** The raised arm of the person it belongs to (its turn is updated every frame). */
  arm: { shoulder: [number, number]; angle: number };
}

interface PartState extends BodyPoint {
  id: PlateId;
  head: boolean;
  /** The joint in the world. */
  joint: [number, number];
  ride: PartRide;
}

interface HoldState extends BodyPoint {
  hold: FigureHold;
  /** The part it is held by, if any. */
  part: PartState | null;
  ride: PartRide;
}

/** The world point of a part's joint: its rig pivot, or its anchor. */
function jointOf(part: PlateEntry): [number, number] {
  const pivot = part.rig?.pivot ?? part.anchor;
  const [w, h] = plateWorldSize(part);
  return [part.position[0] + (pivot[0] - part.anchor[0]) * w, part.position[1] + (part.anchor[1] - pivot[1]) * h];
}

/** A world point as fractions of a (facing, unrotated) plate standing at its manifest place. */
function fractionsOn(entry: PlateEntry, [x, y]: readonly [number, number]): Pair {
  const [w, h] = plateWorldSize(entry);
  return [entry.anchor[0] + (x - entry.position[0]) / w, entry.anchor[1] - (y - entry.position[1]) / h];
}

const NO_ACTING = (): void => {};
const tmpQ: [number, number] = [0, 0];
const still: PartRide = { x: 0, y: 0, rotate: 0 };

/**
 * One figure's life (`useFigureLife`): its people's idle life and acting this frame, written into its
 * plate's shader (`apply`) and carried to its parts and the things it holds (`ride`, `held`).
 */
export class FigureLife {
  readonly entry: PlateEntry;
  readonly figures: readonly RigFigure[];
  /** Each person's life this frame. */
  readonly samples: LifeSample[];
  /** The raised arm's turn this frame (the first person's). */
  arm = 0;
  /** The body's mesh (the figure lives while it is drawn and in view). */
  mesh: Mesh | null = null;
  private readonly aspect: number;
  private readonly height: number;
  private readonly pivots: { foot: [number, number]; neck: [number, number]; shoulder: [number, number] }[];
  private readonly phases: number[];
  private readonly parts: PartState[];
  private readonly holds: HoldState[];
  private readonly rides: Map<string, PartRide>;
  private readonly act: FigureActing = { sway: 0, head: 0, arm: 0 };
  private readonly placed = new WeakSet<ShaderMaterial>();

  constructor(entry: PlateEntry, parts: readonly FigurePart[] = [], holds: readonly FigureHold[] = []) {
    this.entry = entry;
    this.figures = rigFigures(entry.rig);
    this.aspect = entry.size[0] / entry.size[1];
    this.height = entry.height;
    this.pivots = this.figures.map((f) => figurePivots(f, this.aspect));
    this.phases = this.figures.map((_, i) => figurePhase(entry.id, i));
    this.samples = this.figures.map(() => newLifeSample());
    this.parts = parts.map(({ id, head = false }) => {
      const joint = jointOf(plateEntry(id));
      return { ...this.bodyPoint(joint), id, head, joint, ride: { x: 0, y: 0, rotate: 0 } };
    });
    this.holds = holds.map((hold) => ({ ...this.bodyPoint(hold.at), hold, part: this.parts.find((s) => s.id === hold.on) ?? null, ride: { x: 0, y: 0, rotate: 0 } }));
    this.rides = new Map(this.parts.map((s) => [s.id as string, s.ride]));
  }

  /** A world point of the body, with the rig's weights there. */
  private bodyPoint(world: Pair): BodyPoint {
    const [u, v] = fractionsOn(this.entry, world);
    const [index, zone] = figureZone(this.figures, u, this.aspect);
    const f = this.figures[index];
    const w: [number, number, number, number] = [0, 0, 0, 0];
    if (f) figureWeights(f, u, v, this.aspect, w);
    const shoulder = f ? figurePivots(f, this.aspect).shoulder : ([0, 0] as [number, number]);
    return { q: [u * this.aspect, 1 - v], u, w, index, zone, arm: { shoulder, angle: 0 } };
  }

  /** Where a part rides this frame, by plate id. */
  ride(id: PlateId): PartRide {
    return this.rides.get(id) ?? still;
  }

  /** Where the nth held thing rides this frame (offsets only). */
  held(index: number): PartRide {
    return this.holds[index]?.ride ?? still;
  }

  /** The body plate's mesh, each frame. */
  attach(mesh: Mesh | null): void {
    this.mesh = mesh;
  }

  /** The world offsets of a body point this frame: the body's mesh bent exactly as the shader bends it. */
  private bend(point: BodyPoint, out: PartRide): void {
    const s = this.samples[point.index];
    const pv = this.pivots[point.index];
    point.arm.angle = point.index === 0 ? this.arm : 0;
    deformQ(point.q, point.w, point.zone, point.u, s, pv.foot, pv.neck, point.arm, tmpQ);
    out.x = (tmpQ[0] - point.q[0]) * this.height;
    out.y = (tmpQ[1] - point.q[1]) * this.height;
  }

  /** This frame's life at progress p and idle time t: every person, then the parts and the held things. */
  step(p: number, t: number, strength: number, acting: (p: number, t: number, index: number, out: FigureActing) => void): void {
    const act = this.act;
    for (let i = 0; i < this.figures.length; i++) {
      const s = lifeAt(t, this.phases[i], strength, this.samples[i]);
      act.sway = 0;
      act.head = 0;
      act.arm = 0;
      acting(p, t, i, act);
      s.head += act.head;
      s.sway += act.sway;
      if (i === 0) this.arm = act.arm;
    }
    for (const part of this.parts) {
      this.bend(part, part.ride);
      const s = this.samples[part.index];
      part.ride.rotate = s.sway * part.zone + (part.head ? s.head : 0);
    }
    for (const held of this.holds) {
      if (!held.part) {
        this.bend(held, held.ride);
        continue;
      }
      // On a part: the part's ride, and the held point turned with the part about its joint.
      const part = held.part;
      const turn = part.ride.rotate + (held.hold.turn?.(p, t) ?? 0);
      const dx = held.hold.at[0] - part.joint[0];
      const dy = held.hold.at[1] - part.joint[1];
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      held.ride.x = part.ride.x + (c * dx - sn * dy - dx);
      held.ride.y = part.ride.y + (sn * dx + c * dy - dy);
    }
  }

  /** Writes this frame's life into the body plate's material. */
  apply(material: ShaderMaterial): void {
    const u = material.uniforms;
    if (!u.lifeOn) return;
    u.lifeOn.value = this.figures.length ? 1 : 0;
    u.plateAspect.value = this.aspect;
    const a = u.lifeA.value as Vector4[];
    const b = u.lifeB.value as Vector4[];
    const c = u.lifeC.value as Vector4[];
    const first = !this.placed.has(material);
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      a[i].set(s.breath, s.head, s.sway, s.hem);
      c[i].x = s.hemPhase;
      if (first) b[i].set(this.pivots[i].foot[0], this.pivots[i].foot[1], this.pivots[i].neck[0], this.pivots[i].neck[1]);
    }
    this.placed.add(material);
    const shoulder = this.pivots[0]?.shoulder ?? [0, 0];
    (u.armTurn.value as Vector4).set(shoulder[0], shoulder[1], this.arm, 0);
  }
}

/**
 * The life of one figure plate (and the parts riding it). The plate draws it with `life={...}`;
 * each part with `ride={life.ride(id)}`. Runs before the plates in every frame (priority -0.5), so
 * they all draw the same moment.
 */
export function useFigureLife(entry: PlateEntry, { enabled = true, strength = 1, acting, parts, holds }: FigureLifeOptions = {}): FigureLife {
  const clock = useIdleClock();
  const progress = useStageProgress();
  const scene = useSceneLayer();
  const key = React.useMemo(() => ({}), []);
  const life = React.useMemo(() => new FigureLife(entry, parts, holds), [entry, parts, holds]);
  React.useEffect(() => () => clock.drop(key), [clock, key]);

  // After the idle clock (-1), before the plates (0).
  useFrame(() => {
    if (!enabled || !life.figures.length) return;
    const p = progress?.get() ?? 0;
    const mesh = life.mesh;
    const present = (scene ? scene.presence(p) : 1) > 0.001;
    if (present && mesh && shownInTree(mesh) && clock.inView(mesh)) clock.hold(key);
    else clock.drop(key);
    life.step(p, clock.time(), strength, acting ?? NO_ACTING);
  }, -0.5);

  return life;
}

/** Writes a held thing's ride, weighted (0: it goes its own way, 1: it moves with the hand). */
function followHeld(out: PartRide, held: PartRide, k: number): void {
  out.x = held.x * k;
  out.y = held.y * k;
}

/**
 * A held thing's ride, weighted by how far it is in the figure's hand at progress p (0: not yet held,
 * it goes its own way; 1: it moves with the hand). Updated every frame after the figure's life.
 */
export function useHeldRide(life: FigureLife, index: number, progress: MotionValue<number>, weight: (p: number) => number): PartRide {
  const ride = React.useMemo<PartRide>(() => ({ x: 0, y: 0, rotate: 0 }), []);
  useFrame(() => followHeld(ride, life.held(index), weight(progress.get())), -0.4);
  return ride;
}
