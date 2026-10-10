import type { SceneId } from "@/scroll/types";

import data from "../../public/art/manifest.json";

/**
 * The art manifest (`public/art/manifest.json`): every painted plate of the story with its file,
 * pixel size and place in the world. Plates, the default scene renderer and the preloader read it
 * from here. `manifest.test.ts` checks every entry against its file, so a painting that replaces a
 * placeholder in place needs no code change, only a matching size.
 *
 * World units: x right, y up, z toward the viewer (the camera keys in `src/scroll/script.ts` use
 * the same space). A plate stands at z = -depth, its anchor point at `position`.
 */

/**
 * - `plate`: placed in depth at its position.
 * - `backdrop`: fills the view behind its scene and follows the camera (a sky at infinity).
 * - `texture`: read by a material (stone and bark for the morph, masks, tile patterns).
 * - `sprite`: a small image repeated by an effect (droplets, stars, sparkles).
 */
export type PlateRole = "plate" | "backdrop" | "texture" | "sprite";

export type PlateId = `${SceneId}/${string}`;

export type Pair = readonly [number, number];

/** How `npm run art:placeholders` draws the placeholder (`kind: "study"`: a character's painted stand-in). Removed when final art lands. */
export interface PlaceholderSpec {
  kind: string;
  [param: string]: unknown;
}

export interface PlateEntry {
  /** `<scene>/<name>`, the file's path under `/art` without the extension. */
  id: PlateId;
  /** Scenes that show it. The first one owns the folder; the others reuse the plate. */
  scenes: readonly SceneId[];
  role: PlateRole;
  /** URL under `public/`, e.g. `/art/hero/statue.webp`. */
  src: string;
  /** Image size in pixels: [width, height]. */
  size: Pair;
  /** Distance behind the picture plane in world units: the plate stands at z = -depth. */
  depth: number;
  /** The image point placed at `position`, as fractions from the left and from the top. */
  anchor: Pair;
  /** World x and y of the anchor. */
  position: Pair;
  /** Height in world units; the width follows the image aspect (and `repeat`). */
  height: number;
  /** Euler rotation in degrees (x, y, z) about the anchor, e.g. [-90, 0, 0] to lie flat on the ground. */
  rotation?: readonly [number, number, number];
  /** Stacking inside the scene for plates at the same depth: higher draws later. Default 0. */
  layer?: number;
  /** The image tiles (repeat wrapping). */
  tile?: boolean;
  /** How many times the image repeats across the plate: [across, down]. Default [1, 1]. */
  repeat?: Pair;
  /** Data, not color (masks): sampled without sRGB decoding or premultiplied alpha. */
  linear?: boolean;
  /** Default idle sway in degrees, for leaves and fruit. */
  sway?: number;
  /** Animation frame index inside a set of frames (the default scene shows frame 0 only). */
  frame?: number;
  /**
   * Named points on the image, as fractions from the left and from the top, that code ties things
   * to through `platePoint()`: the orange in a hand, a fingertip, a blade tip, the oranges the
   * question cards' connector lines are fixed on. A painting brings its own (its sidecar's points,
   * written here by `npm run art:import`), so positions come from the art, not from constants.
   */
  points?: Readonly<Record<string, Pair>>;
  /**
   * How a painted figure can be moved (the living stage, `src/components/stage/rig.ts`): hem, chest
   * and head rectangles ([left, top, right, bottom] fractions) and the pivots they turn on, from the
   * painting's sidecar (or, for a stand-in, from the generator). A part of a figure (a head, an arm)
   * carries only its `pivot`, the joint it turns on.
   */
  rig?: PlateRig;
  /** How the stage paints the plate: the canvas, the figure treatment, the halftone layer (see `PlatePaint`). */
  paint?: PlatePaint;
  /** What the plate shows. */
  note: string;
  /** How `npm run art:placeholders` draws the stand-in. Removed when a painting replaces the file. */
  placeholder?: PlaceholderSpec;
  /** The file is a finished painting brought in by `npm run art:import` (the generator never overwrites it). */
  painted?: boolean;
}

/** A rectangle of an image: [left, top, right, bottom] as fractions from the left and from the top. */
export type RigBox = readonly [number, number, number, number];

/** One person's regions on a plate, as fractions of the image. */
export interface PlateRigFigure {
  /** The hem of the robe, which ripples a little in the breeze. */
  hem?: RigBox;
  /** Chest and shoulders, which rise as the figure breathes (everything above rises with them). */
  chest?: RigBox;
  /** The head, which turns on `neck`. */
  head?: RigBox;
  /** A raised arm, which turns on `shoulder` (the astronomer's, settling into the point). */
  arm?: RigBox;
  /** Where the figure stands (its feet): weight shifts turn it here, the contact shadow sits here. For a part, the joint it turns on. */
  pivot?: Pair;
  /** Where the head turns. Default: the middle of the head's bottom edge. */
  neck?: Pair;
  /** Where the arm turns. */
  shoulder?: Pair;
}

/** Regions of a painted figure, as fractions of its image, for the stage to move it by. */
export interface PlateRig extends PlateRigFigure {
  /** Several people on one plate (the onlookers): each moves on its own, out of step with the others. */
  figures?: readonly PlateRigFigure[];
}

/**
 * How the stage paints a plate (all optional):
 * - `figure`: a person. The figure treatment applies (a soft sky rim on the shadow edge, a faint warm
 *   bounce from below, the scene's colour grade) and, with a rig, idle life.
 * - `grain`: the canvas weave and paint tooth. Default: on for backdrops and stand-ins, always off
 *   for painted plates (a painting carries its own).
 * - `craquelure`: the faint crack network, a multiplier of the scene's strength. Default 1, 0 for
 *   painted plates (they carry their own).
 * - `halftone`: drawn as the graphic halftone layer: `cloud` (dots dense in the shadow side, the soft
 *   edge breaking into dots) or `water` (the stream as dots).
 * - `contact`: the figure stands on something: a soft contact shadow plate under its feet (the rig
 *   pivot), this many world units wide.
 * - `life`: false keeps a rigged figure still (a statue).
 */
export interface PlatePaint {
  figure?: boolean;
  grain?: boolean;
  craquelure?: number;
  halftone?: "cloud" | "water";
  contact?: number;
  life?: boolean;
}

/** The paint of a plate with its defaults resolved. */
export interface ResolvedPaint {
  figure: boolean;
  grain: boolean;
  craquelure: number;
  halftone: "cloud" | "water" | null;
  contact: number;
  /** Idle life: a figure with a rig that moves (chest, hem, head or arm regions). */
  life: boolean;
  /** A finished painting (subtler treatment, no grain). */
  painted: boolean;
}

/** True when a rig (or one of its figures) has regions that move. */
export function rigMoves(rig: PlateRig | undefined): boolean {
  if (!rig) return false;
  const moves = (f: PlateRigFigure) => Boolean(f.chest || f.hem || f.head || f.arm);
  return moves(rig) || (rig.figures ?? []).some(moves);
}

/** The paint of a plate, defaults filled in. */
export function platePaint(entry: PlateEntry): ResolvedPaint {
  const paint = entry.paint ?? {};
  const painted = entry.painted === true;
  const figure = paint.figure === true;
  const halftone = paint.halftone ?? null;
  // The halftone is a graphic layer over the painting: no canvas of its own.
  const canvas = halftone === null && (entry.role === "backdrop" || entry.role === "plate");
  return {
    figure,
    grain: !painted && canvas && paint.grain !== false,
    craquelure: canvas ? Math.max(0, paint.craquelure ?? (painted ? 0 : 1)) : 0,
    halftone,
    contact: paint.contact ?? 0,
    life: figure && paint.life !== false && rigMoves(entry.rig),
    painted,
  };
}

export interface ArtManifest {
  about: string;
  version: number;
  /** Largest side any plate image may have, in pixels. */
  maxSize: number;
  plates: readonly PlateEntry[];
}

/** The manifest as loaded. Its shape and files are checked by `src/art/manifest.test.ts`. */
export const MANIFEST = data as unknown as ArtManifest;

export const PLATES: readonly PlateEntry[] = MANIFEST.plates;

const byId = new Map<string, PlateEntry>(PLATES.map((p) => [p.id, p]));
const byScene = new Map<SceneId, PlateEntry[]>();
for (const plate of PLATES) {
  for (const scene of plate.scenes) {
    const list = byScene.get(scene) ?? [];
    list.push(plate);
    byScene.set(scene, list);
  }
}

/** The manifest entry of a plate. Throws for an unknown id. */
export function plateEntry(id: PlateId | string): PlateEntry {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown plate "${id}" (not in public/art/manifest.json)`);
  return entry;
}

export function hasPlate(id: string): id is PlateId {
  return byId.has(id);
}

/** Every plate a scene shows or reads, in manifest order (its own and the ones it reuses). */
export function scenePlates(scene: SceneId): readonly PlateEntry[] {
  return byScene.get(scene) ?? [];
}

/** Plates the default scene renderer draws: placed plates and backdrops, first frame of a set only. */
export function drawnPlates(scene: SceneId): readonly PlateEntry[] {
  return scenePlates(scene).filter((p) => (p.role === "plate" || p.role === "backdrop") && (p.frame ?? 0) === 0);
}

/**
 * Size of the plate in world units, [width, height], for a plate `height` tall showing `repeat`
 * tiles. Pass `out` to write into an existing pair instead of a new one (the frame loop does).
 */
export function plateWorldSize(entry: PlateEntry, height = entry.height, repeat: Pair = entry.repeat ?? [1, 1], out: [number, number] = [0, 0]): [number, number] {
  const [w, h] = entry.size;
  out[0] = (height * (w * repeat[0])) / (h * repeat[1]);
  out[1] = height;
  return out;
}

/**
 * World position `[x, y, z]` of a named point (`points`) of a plate standing at its manifest place.
 * Only for plates without a rotation (the plate faces the camera, so the point is on its plane).
 */
export function platePoint(id: PlateId | string, name: string): [number, number, number] {
  const entry = plateEntry(id);
  const point = entry.points?.[name];
  if (!point) throw new Error(`Plate "${id}" has no point "${name}" (see points in public/art/manifest.json)`);
  if (entry.rotation?.some((angle) => angle !== 0)) throw new Error(`Plate "${id}" is rotated; its points are not on a facing plane`);
  const [w, h] = plateWorldSize(entry);
  const [ax, ay] = entry.anchor;
  return [entry.position[0] + (point[0] - ax) * w, entry.position[1] + (ay - point[1]) * h, -entry.depth];
}

/**
 * The plates to preload while scene `index` (in `SCENES` order) is on stage: the current scene and
 * the next one only, deduplicated by file.
 */
export function preloadPlates(sceneIds: readonly SceneId[], index: number): PlateEntry[] {
  const seen = new Set<string>();
  const out: PlateEntry[] = [];
  for (const id of sceneIds.slice(Math.max(0, index), index + 2)) {
    for (const plate of scenePlates(id)) {
      if (seen.has(plate.src)) continue;
      seen.add(plate.src);
      out.push(plate);
    }
  }
  return out;
}
