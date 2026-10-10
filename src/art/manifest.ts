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
   * How a painted figure can be moved (used by the living stage): hem, chest and head rectangles
   * ([left, top, right, bottom] fractions) and a pivot point, from the painting's sidecar.
   */
  rig?: PlateRig;
  /** What the plate shows. */
  note: string;
  /** How `npm run art:placeholders` draws the stand-in. Removed when a painting replaces the file. */
  placeholder?: PlaceholderSpec;
  /** The file is a finished painting brought in by `npm run art:import` (the generator never overwrites it). */
  painted?: boolean;
}

/** Regions of a painted figure, as fractions of its image, for the stage to move it by. */
export interface PlateRig {
  hem?: readonly [number, number, number, number];
  chest?: readonly [number, number, number, number];
  head?: readonly [number, number, number, number];
  pivot?: Pair;
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
