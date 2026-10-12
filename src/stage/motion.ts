// The motion toolkit's TypeScript twins (docs/MOTION-RULES.md, "The motion toolkit"): the same math
// as the GLSL at the end of src/stage/gl/lib.glsl.ts, for DOM layers that move with the paintings (a
// card leaning with the scroll's speed, a star growing with an overshoot, a label swaying in the
// wind) and for the uniforms the passes compute (the room a framing leaves, the bound on a depth
// layer's travel). Keep the two in step.
//
// Every function is pure: a function of a painting point, of values computed from `p`, and of the
// pass clock `tm` (seconds, already 0 under reduced motion). Nothing keeps state, so scrubbing gives
// identical results both ways (rule 11), and each returns its rest value when `still` is set.
// Numbers come from src/content/art.ts or the caller's timeline.ts.
import { MASKS, type Band, type Depth, type Point, type Wind } from "@/content/art";
import { coverScale, type Size } from "./framing";
import { REST } from "./passes/rest";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------------------------------------------------------------------------------------------
// Noise: the library's hash, vnoise and fbm. The GPU computes them in 32-bit floats, so the field
// here is the same field to the eye, not to the last bit.
// ---------------------------------------------------------------------------------------------

/** hash: 2D -> [0, 1), the library's (no sin). */
export function hash(x: number, y: number): number {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

/** vnoise: value noise on the integer lattice with quintic interpolation, 0..1. */
export function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/** fbm: `octaves` octaves of vnoise with the library's rotation per octave, normalised to 0..1. */
export function fbm(x: number, y: number, octaves: number): number {
  let v = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(px, py);
    norm += amp;
    // p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.0 + 17.3 (column-major, as GLSL reads it)
    const nx = (0.8 * px - 0.6 * py) * 2 + 17.3;
    const ny = (0.6 * px + 0.8 * py) * 2 + 17.3;
    px = nx;
    py = ny;
    amp *= 0.5;
  }
  return v / Math.max(norm, 1e-5);
}

// ---------------------------------------------------------------------------------------------
// (a) The wind
// ---------------------------------------------------------------------------------------------

/** The wind as the GLSL's vec4: gust scale, gust speed, flutter scale, flutter speed. */
export function windVec(w: Wind): [number, number, number, number] {
  return [w.scale, w.speed, w.flutter, w.flutterSpeed];
}

/**
 * The wind at a painting point (height units: x times the painting's aspect) at the pass clock `tm`:
 * on x (downwind) a spread of about 0.55 (95% within -0.75..1.1, rarely past 1.6), on y about a
 * third of that (y down: a leaf lifts as it swings). Gusts travel
 * downwind as two fields at different speeds and headings; a finer, faster flutter rides on them,
 * strongest inside a gust. Never a sine, never periodic. Zero when `still`.
 */
export function windAt(pt: Point, tm: number, w: Wind, still = false): Point {
  if (still) return { x: 0, y: 0 };
  const gx = pt.x * w.scale;
  const gy = pt.y * w.scale;
  const s = w.speed * tm;
  const gust = fbm(gx - s + 3.7, gy - 0.17 * s + 11.1, 3) + fbm(gx * 0.73 - 0.61 * s - 5.3, gy * 0.73 + 0.23 * s + 2.9, 3) - 1;
  const fx = gx * w.flutter;
  const fy = gy * w.flutter;
  const fs = s * w.flutterSpeed;
  const strength = 0.45 + 1.6 * Math.abs(gust);
  const x = gust * 1.8 + (fbm(fx - fs + 9.2, fy - 4.4, 2) - 0.5) * strength * 2.5;
  const y = (fbm(fx - 1.7, fy + 0.8 * fs + 6.6, 2) - 0.5) * strength - 0.15 * x * x;
  return { x, y };
}

// ---------------------------------------------------------------------------------------------
// (b) The masks
// ---------------------------------------------------------------------------------------------

/** Hue in turns (0 red, 1/6 yellow, 1/3 green, 2/3 blue) and saturation, as the GLSL computes them. */
export function hueSat(r: number, g: number, b: number): [number, number] {
  // p = b <= g ? (g, b, 0, -1/3) : (b, g, -1, 2/3); q = p.x <= r ? (r, p.y, p.z, p.x) : (p.x, p.y, p.w, r)
  const p = b <= g ? [g, b, 0, -1 / 3] : [b, g, -1, 2 / 3];
  const q = p[0] <= r ? [r, p[1], p[2], p[0]] : [p[0], p[1], p[3], r];
  const d = q[0] - Math.min(q[3], q[1]);
  return [Math.abs(q[2] + (q[3] - q[1]) / (6 * d + 1e-4)), d / (q[0] + 1e-4)];
}

/** 1 inside the band, 0 outside, each edge eased over +-soft. */
export function bandMask(x: number, r: Band, soft: number): number {
  return smoothstep(r[0] - soft, r[0] + soft, x) * (1 - smoothstep(r[1] - soft, r[1] + soft, x));
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Leaves, lit yellow-green to dark olive (art.ts MASKS.foliage). Colours 0..1. */
export function foliageMask(r: number, g: number, b: number): number {
  const [h, s] = hueSat(r, g, b);
  const k = MASKS.foliage;
  return bandMask(h, k.hue, k.soft) * bandMask(s, k.sat, k.soft) * bandMask(luma(r, g, b), k.lum, k.soft);
}

/** The pale, unsaturated things of any hue: a cream ground, linen, marble, paper (art.ts MASKS.pale). */
export function paleMask(r: number, g: number, b: number): number {
  const k = MASKS.pale;
  return bandMask(hueSat(r, g, b)[1], k.sat, k.soft) * bandMask(luma(r, g, b), k.lum, k.soft);
}

/** A painting's blue sky. */
export function skyMask(r: number, g: number, b: number): number {
  return smoothstep(0.08, 0.22, b - Math.max(r, g));
}

// ---------------------------------------------------------------------------------------------
// (c) Depth, and the room a framing leaves
// ---------------------------------------------------------------------------------------------

/** x squeezed smoothly inside (-room, room): slope 1 at 0, never reaching the room, no kink. */
export function softBound(x: number, room: number): number {
  return x / Math.sqrt(1 + (x * x) / Math.max(room * room, 1e-10));
}

/**
 * The layer offset of a point in a two-layer depth parallax: `farOff` where `near` (0..1) is 0,
 * `nearOff` where it is 1, eased between. Zero when `still`.
 */
export function depthShift(near: number, nearOff: Point, farOff: Point, still = false): Point {
  if (still) return { x: 0, y: 0 };
  const k = smoothstep(0, 1, near);
  return { x: mix(farOff.x, nearOff.x, k), y: mix(farOff.y, nearOff.y, k) };
}

/**
 * The room (painting units, per axis) a cover-fitted painting leaves beyond its framing: the slack
 * `(1 - visible) / 2` at its smallest breath, less what the framing already uses (`used`: the pan's
 * and the camera's widest excursion from the centre) and less the rest state's pointer parallax and
 * ambient drift. Never negative. Anything that moves a picture further (a layer, a sway) stays inside it.
 */
export function coverRoom(css: Size, tex: Size, zoom: number, used: Point): Point {
  const cs = coverScale(css, tex);
  const z = zoom * (1 - REST.breath);
  return {
    x: Math.max(0, (1 - cs[0] / z) / 2 - Math.abs(used.x) - REST.pointer.x - REST.drift),
    y: Math.max(0, (1 - cs[1] / z) / 2 - Math.abs(used.y) - REST.pointer.y - REST.drift),
  };
}

/**
 * How much of a mask lattice cell a displacement may span (lib.glsl.ts SOFT_MASK): a full 0..1 change
 * across one cell has a smoothstep slope of 1.5 per cell, so 0.4 of a cell compresses the picture by
 * at most 60% where the mask changes, and never folds it.
 */
export const FOLD_SHARE = 0.6 / 1.5;

/**
 * The bound (painting units, per axis) on the camera travel a two-layer depth parallax is fed, so
 * that neither layer's extra offset ((rate - 1) times the travel) leaves `room`, and the two layers
 * never part by more than FOLD_SHARE of the mask's lattice cell. `aspect` is the painting's (the cell
 * is in painting heights). Feed it to softBound with the travel.
 */
export function depthTravelMax(depth: Depth, room: Point, aspect: number): Point {
  const lead = Math.max(Math.abs(depth.near - 1), Math.abs(depth.far - 1), 1e-6);
  const part = Math.max(Math.abs(depth.near - depth.far), 1e-6);
  return {
    x: Math.min(room.x / lead, (FOLD_SHARE * depth.cell) / aspect / part),
    y: Math.min(room.y / lead, (FOLD_SHARE * depth.cell) / part),
  };
}

// ---------------------------------------------------------------------------------------------
// (d) The scroll's speed
// ---------------------------------------------------------------------------------------------

/** The scroll's speed (px a frame) as a bounded response 0..1: 1 - exp(-|vel| / knee). Zero when `still`. */
export function velAmount(vel: number, knee: number, still = false): number {
  if (still) return 0;
  return 1 - Math.exp(-Math.abs(vel) / Math.max(knee, 1e-3));
}

/** The same with the scroll's direction (+ scrolling down). */
export function velSigned(vel: number, knee: number, still = false): number {
  return Math.sign(vel) * velAmount(vel, knee, still);
}

// ---------------------------------------------------------------------------------------------
// (e) Growth: overshoot and settle
// ---------------------------------------------------------------------------------------------

/**
 * The growth ease: 0 at x = 0, exactly 1 from x = 1 on, starting from rest (a smoothstep ramp over the
 * first `ramp` of x), peaking at 1 + overshoot and settling with no speed left at x = 1.
 */
export function growSettle(x: number, back: number, ramp: number): number {
  let u = clamp01(x);
  u *= smoothstep(0, Math.max(ramp, 1e-4), u);
  const v = u - 1;
  return 1 + (back + 1) * v * v * v + back * v * v;
}

/** The overshoot (fraction past 1) of growSettle with this `back`: 4 back^3 / (27 (back + 1)^2). */
export function overshootOf(back: number): number {
  return (4 * back * back * back) / (27 * (back + 1) * (back + 1));
}

/** The `back` that gives an overshoot of `over` (0.06 for 6%), solved by bisection. */
export function backFor(over: number): number {
  if (!(over > 0)) return 0;
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (overshootOf(mid) < over) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
