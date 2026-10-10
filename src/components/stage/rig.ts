import type { Pair, PlateRig, PlateRigFigure, RigBox } from "@/art/manifest";

/**
 * A figure's rig, as pure functions (no React, no three): the manifest's `rig` (rectangles for the
 * hem, the chest, the head and a raised arm, and the pivots they turn on, in the plate's own
 * fractions from the left and the top) becomes
 *
 * - a weight texture (`rigWeightData`): soft-edged weights per region, so a finished painting needs
 *   no hand-painted mask, and
 * - per-vertex data for a subdivided plate mesh (`rigVertexData`): which person on the plate a
 *   vertex belongs to, so the onlookers on one plate each move on their own.
 *
 * The plate shader (`materials.ts`) deforms the mesh from both; `life.ts` says how much.
 *
 * Coordinates: `q` space is the plate in units of its own height, x from the left, y up from the
 * bottom (a point at fractions [u, v] from the left and top is q = [u * aspect, 1 - v], where
 * `aspect` is the plate's width over its height). Rotations happen there, so they keep their shape.
 */

/** At most this many people move on one plate (the shader's uniform arrays). */
export const RIG_MAX_FIGURES = 4;

/** The weight texture's longest side, in texels. Weights are smooth: a few dozen texels are plenty. */
export const RIG_TEXTURE_SIZE = 64;

/** Width of the soft edge around each region, as a fraction of the plate's height. */
export const RIG_FALLOFF = 0.045;

/** How far (fraction of the plate's height) a person's zone fades out toward a neighbour's on a shared plate. */
export const RIG_ZONE_SOFT = 0.035;

/** One person of a rig with every pivot filled in. */
export interface RigFigure {
  hem: RigBox | null;
  chest: RigBox | null;
  head: RigBox | null;
  arm: RigBox | null;
  /** The feet (fractions). */
  pivot: Pair;
  /** Where the head turns (fractions). */
  neck: Pair;
  /** Where the arm turns (fractions). */
  shoulder: Pair;
  /** The person's middle, from the left (fractions), for sharing a plate. */
  centre: number;
}

const boxCentre = (b: RigBox): Pair => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/**
 * A person with its defaults: the neck under the head, the pivot under the hem (or the plate's foot).
 * A part's hand and fingers (`hand` on `wrist`, or a whole arm's `forearm` on its `elbow`; `fingers`
 * on `knuckles`) take the head's and the arm's places: the same joints, the same weight channels and
 * the same turns in the shader.
 */
function resolve(f: PlateRigFigure): RigFigure {
  const hem = f.hem ?? null;
  const chest = f.chest ?? null;
  const head = f.head ?? f.hand ?? f.forearm ?? null;
  const arm = f.arm ?? f.fingers ?? null;
  const any = chest ?? head ?? hem ?? arm;
  const centre = any ? boxCentre(any)[0] : (f.pivot?.[0] ?? 0.5);
  const pivot: Pair = f.pivot ?? (hem ? [boxCentre(hem)[0], hem[3]] : [centre, 1]);
  const neck: Pair = f.neck ?? f.wrist ?? f.elbow ?? (head ? [boxCentre(head)[0], head[3]] : chest ? [boxCentre(chest)[0], chest[1]] : pivot);
  const shoulder: Pair = f.shoulder ?? f.knuckles ?? (arm ? [arm[0], arm[3]] : neck);
  return { hem, chest, head, arm, pivot, neck, shoulder, centre };
}

/** The people of a rig, each with its pivots resolved (one, unless the rig lists `figures`). */
export function rigFigures(rig: PlateRig | undefined): RigFigure[] {
  if (!rig) return [];
  const list = rig.figures?.length ? rig.figures : [rig];
  return list.slice(0, RIG_MAX_FIGURES).map(resolve);
}

/** A point at fractions [u, v] (from the left and the top) in q space. */
export function toQ([u, v]: Pair, aspect: number, out: [number, number] = [0, 0]): [number, number] {
  out[0] = u * aspect;
  out[1] = 1 - v;
  return out;
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 1 inside [lo, hi], easing to 0 over `soft` outside it. */
const band = (v: number, lo: number, hi: number, soft: number) => smoothstep(lo - soft, lo, v) * (1 - smoothstep(hi, hi + soft, v));

/** Weights of one person at fractions [u, v]: breath (chest and everything above it), hem, head, arm. */
export function figureWeights(f: RigFigure, u: number, v: number, aspect: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  // Soft edges are the same distance across and down the plate.
  const sv = RIG_FALLOFF;
  const su = RIG_FALLOFF / Math.max(1e-6, aspect);
  let breath = 0;
  if (f.chest) {
    // Across: the upper body (the chest, and the head over it). Down: everything above the middle
    // of the chest rises with it, easing to nothing at the chest's bottom edge (the waist stays).
    const left = Math.min(f.chest[0], f.head?.[0] ?? f.chest[0]);
    const right = Math.max(f.chest[2], f.head?.[2] ?? f.chest[2]);
    const across = band(u, left, right, su * 1.5);
    const mid = (f.chest[1] + f.chest[3]) / 2;
    const down = 1 - smoothstep(mid, f.chest[3] + sv, v);
    breath = across * down;
  }
  let hem = 0;
  if (f.hem) {
    // The bottom of the robe swings most, its top edge not at all; the feet below it stay planted.
    hem = band(u, f.hem[0], f.hem[2], su) * smoothstep(f.hem[1], f.hem[3], v) * (1 - smoothstep(f.hem[3], f.hem[3] + sv, v));
  }
  const head = f.head ? band(u, f.head[0], f.head[2], su) * band(v, f.head[1], f.head[3], sv) : 0;
  const arm = f.arm ? band(u, f.arm[0], f.arm[2], su) * band(v, f.arm[1], f.arm[3], sv) : 0;
  out[0] = breath;
  out[1] = hem;
  out[2] = head;
  out[3] = arm;
  return out;
}

/** Weights of every person at [u, v], the strongest of each kind. */
export function rigWeightsAt(figures: readonly RigFigure[], u: number, v: number, aspect: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  out[0] = out[1] = out[2] = out[3] = 0;
  const one: [number, number, number, number] = [0, 0, 0, 0];
  for (const f of figures) {
    figureWeights(f, u, v, aspect, one);
    for (let k = 0; k < 4; k++) out[k] = Math.max(out[k], one[k]);
  }
  return out;
}

/** Size of the weight texture for an image `size` px: the longest side `RIG_TEXTURE_SIZE`, the aspect kept. */
export function rigTextureSize([w, h]: Pair): [number, number] {
  const long = Math.max(w, h);
  return [Math.max(4, Math.round((RIG_TEXTURE_SIZE * w) / long)), Math.max(4, Math.round((RIG_TEXTURE_SIZE * h) / long))];
}

/**
 * The weight texture of a rig: RGBA bytes, `width` x `height`, rows from the bottom of the plate up
 * (as a texture is sampled: uv y = 0 at the bottom). Red: breath (the chest and all above it). Green:
 * the hem. Blue: the head. Alpha: a raised arm. Sampled `linear` (data, not colour).
 */
export function rigWeightData(rig: PlateRig | undefined, size: Pair): { data: Uint8Array; width: number; height: number } {
  const [width, height] = rigTextureSize(size);
  const aspect = size[0] / size[1];
  const figures = rigFigures(rig);
  const data = new Uint8Array(width * height * 4);
  const w: [number, number, number, number] = [0, 0, 0, 0];
  for (let row = 0; row < height; row++) {
    const v = 1 - (row + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      rigWeightsAt(figures, u, v, aspect, w);
      const i = (row * width + x) * 4;
      for (let k = 0; k < 4; k++) data[i + k] = Math.round(Math.min(1, Math.max(0, w[k])) * 255);
    }
  }
  return { data, width, height };
}

/** Segments of the subdivided plate mesh for an image `size` px: cells of about a 64th of the longest side. */
export function rigGridSize([w, h]: Pair): [number, number] {
  const cell = Math.max(16, Math.max(w, h) / 64);
  return [Math.max(8, Math.round(w / cell)), Math.max(8, Math.round(h / cell))];
}

/** Which person a point at fraction `u` belongs to, and how far inside that person's zone it is (0 at the border with a neighbour, 1 well inside). */
export function figureZone(figures: readonly RigFigure[], u: number, aspect: number): [number, number] {
  if (figures.length <= 1) return [0, 1];
  let best = 0;
  let d1 = Infinity;
  let d2 = Infinity;
  for (let i = 0; i < figures.length; i++) {
    const d = Math.abs(u - figures[i].centre) * aspect;
    if (d < d1) {
      d2 = d1;
      d1 = d;
      best = i;
    } else if (d < d2) d2 = d;
  }
  // The border between two zones is halfway between their people: d2 - d1 is twice the distance to it.
  return [best, smoothstep(0, RIG_ZONE_SOFT, (d2 - d1) / 2)];
}

/**
 * Per-vertex data of a plane geometry with `segX` x `segY` segments (three.js `PlaneGeometry` vertex
 * order: rows from the top, columns from the left): [person index, zone weight] per vertex.
 */
export function rigVertexData(rig: PlateRig | undefined, size: Pair, segX: number, segY: number): Float32Array {
  const figures = rigFigures(rig);
  const aspect = size[0] / size[1];
  const out = new Float32Array((segX + 1) * (segY + 1) * 2);
  let i = 0;
  for (let row = 0; row <= segY; row++) {
    for (let col = 0; col <= segX; col++) {
      const [index, zone] = figureZone(figures, col / segX, aspect);
      out[i++] = index;
      out[i++] = zone;
    }
  }
  return out;
}

/** Problems with a rig (empty when it is sound): boxes inside the image and the right way round, pivots on it. */
export function rigProblems(rig: PlateRig | undefined): string[] {
  if (!rig) return [];
  const problems: string[] = [];
  const unit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  const check = (f: PlateRigFigure, where: string) => {
    for (const name of ["hem", "chest", "head", "arm", "hand", "forearm", "fingers"] as const) {
      const box = f[name];
      if (!box) continue;
      if (box.length !== 4 || !box.every(unit)) problems.push(`${where}${name} is not four fractions`);
      else if (box[0] >= box[2] || box[1] >= box[3]) problems.push(`${where}${name} is empty or upside down`);
    }
    for (const name of ["pivot", "neck", "shoulder", "wrist", "elbow", "knuckles"] as const) {
      const p = f[name];
      if (p && (p.length !== 2 || !p.every(unit))) problems.push(`${where}${name} is not a point on the image`);
    }
    // A hand takes the head's place, fingers the arm's: one or the other.
    if ([f.head, f.hand, f.forearm].filter(Boolean).length > 1) problems.push(`${where}has more than one of a head, a hand and a forearm`);
    if (f.arm && f.fingers) problems.push(`${where}has both an arm and fingers`);
  };
  check(rig, "");
  rig.figures?.forEach((f, i) => check(f, `figures[${i}].`));
  if ((rig.figures?.length ?? 0) > RIG_MAX_FIGURES) problems.push(`more than ${RIG_MAX_FIGURES} figures`);
  return problems;
}
