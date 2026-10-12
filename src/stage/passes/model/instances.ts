// The Model's foreground instances, worked out once a frame on the CPU (passes/model/foreground.ts draws
// them): where each leaf is and how it turns, how large and how soft, the push-through's leaves and the
// share's pools of light. A leaf's place is the same for every pixel, so the GPU is handed the numbers and
// pays a distance test per leaf per pixel, not the hashes, the trig and the wind that decide them: the first
// version worked them out in the shader and cost the Model six milliseconds a frame it did not have.
//
// Every instance is a pure function of the scroll units `x`, of the gain (timeline.ts) and of the pass clock
// `tm` (0 under reduced motion, so the wind holds): nothing keeps state, so scrubbing replays them both ways.
// The hash is the library's (motion.ts); the numbers are timeline.ts FOREGROUND's.
import { hash, vnoise } from "../../motion";
import { FOREGROUND } from "./timeline";

const L = FOREGROUND.leaves;
const P = FOREGROUND.push;

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** The library's 1D hash: hash(vec2(n, n * 0.618 + 11.17)). */
const h1 = (n: number) => hash(n, n * 0.6180339887 + 11.17);

/** One leaf: its middle and direction (frame heights, radians), its half length and the softness of its edge. 0 size = not on screen. */
export interface LeafInstance {
  x: number;
  y: number;
  ang: number;
  size: number;
  blur: number;
}

/**
 * The drifting olive leaves at `x` units: each crosses the frame right to left in about `dur` units on its
 * own lane, tumbling a little and swung by the wind (two slow wanders of the clock, its own); a narrow
 * frame (the phone's band) takes smaller ones. Sizes scale with the gain, so a leaf shrinks away at the ends.
 */
export function leafInstances(x: number, tm: number, asp: number, gain: number): LeafInstance[] {
  const out: LeafInstance[] = [];
  const fit = lerp(0.6, 1, smooth(0.7, 1.4, asp));
  for (let i = 0; i < L.count; i++) {
    const fi = i;
    const a = h1(fi * 3.17 + 1.3);
    const b = h1(fi * 5.41 + 2.7);
    const c = h1(fi * 7.13 + 4.1);
    const d = h1(fi * 11.7 + 0.9);
    const dur = L.dur * (0.8 + 0.5 * a);
    const u0 = lerp(FOREGROUND.from, FOREGROUND.to - dur, (fi + 0.2 + 0.6 * b) / L.count);
    const prog = (x - u0) / dur;
    const size = lerp(L.size[0], L.size[1], c) * gain * fit;
    if (prog < -0.04 || prog > 1.04 || size < 1e-3) {
      out.push({ x: 0, y: 0, ang: 0, size: 0, blur: 0 });
      continue;
    }
    // The wind's swing on this leaf: two slow value-noise wanders of the clock, its own.
    const wx = (vnoise(tm * 0.31 + fi * 7.1, fi * 1.7) - 0.5) * 2;
    const wy = (vnoise(fi * 3.3 + 5, tm * 0.27 + 2) - 0.5) * 2;
    out.push({
      x: lerp(asp + 1.4 * size, -1.4 * size, prog) + wx * 0.02,
      y: lerp(L.lane[0], L.lane[1], d) + 0.05 * Math.sin(prog * 3.1 + a * 6) + wy * 0.03,
      ang: -0.5 + (b - 0.5) * 1.3 + prog * (c - 0.5) * 2.4 + 0.3 * wx,
      size,
      blur: L.blur * (0.6 + 1.2 * c),
    });
  }
  return out;
}

/** One push-through leaf: its middle, direction (radians) and half length, the direction it travels, its smear and the softness of its edge. 0 size = not on screen. */
export interface PushInstance {
  x: number;
  y: number;
  ang: number;
  size: number;
  dirX: number;
  dirY: number;
  len: number;
  blur: number;
}

/**
 * The push-through's leaves at `x` units: nine leaves rushing out of the frame's middle, each its own seed,
 * direction, size and pace (the larger the slower), growing as it comes toward the lens, tumbling a little,
 * smeared along its way out (a base for the push's own rate, more with the scroll's speed `v`, 0..1).
 */
export function pushInstances(x: number, asp: number, gain: number, v: number): PushInstance[] {
  const out: PushInstance[] = [];
  const cx = P.centre[0] * asp;
  const cy = P.centre[1];
  for (let i = 0; i < P.count; i++) {
    const fi = i + 40;
    const a = h1(fi * 3.17 + 1.3);
    const b = h1(fi * 5.41 + 2.7);
    const c = h1(fi * 7.13 + 4.1);
    const d = h1(fi * 11.7 + 0.9);
    const sp = lerp(P.speed[1], P.speed[0], c); // the larger, the slower
    const run = (x - P.from - a * P.stagger) * sp; // frame heights travelled
    const dist = 0.05 + run;
    if (run < 0 || dist > 1.9 || gain <= 0) {
      out.push({ x: 0, y: 0, ang: 0, size: 0, dirX: 0, dirY: 0, len: 0, blur: 0 });
      continue;
    }
    const th = b * TAU;
    const dirX = Math.cos(th);
    const dirY = Math.sin(th);
    const size = lerp(P.size[0], P.size[1], c) * (1 + 1.8 * dist) * gain;
    out.push({
      x: cx + dirX * dist,
      y: cy + dirY * dist,
      ang: th + (d - 0.5) * 1.4 + run * (a - 0.5) * 1.6,
      size,
      dirX,
      dirY,
      len: P.smear * (0.4 + dist) * (0.5 + 0.5 * v) * gain,
      blur: 0.012 + 0.02 * size,
    });
  }
  return out;
}

/** A pool of warm light on the share's white ground: its middle (frame heights), its radius and its strength. */
export interface Pool {
  x: number;
  y: number;
  r: number;
  s: number;
}

/**
 * Three pools of light drifting over the share's ground (each centre a sum of two incommensurate slow sines of
 * the clock, rule 9), the way the light moves in a room with the air: broad, warm and faint. Static at tm = 0.
 * `strength` (timeline.ts FOREGROUND.light) is the most they lay on the white.
 */
export function lightPools(tm: number, asp: number): Pool[] {
  const strength = FOREGROUND.light.strength;
  const spec = [
    { cx: 0.3, cy: 0.28, r: 0.55, s: 0.9, p1: 23.1, p2: 11.3, ph: 0.4 },
    { cx: 0.62, cy: 0.62, r: 0.7, s: 0.75, p1: 31.7, p2: 14.9, ph: 2.1 },
    { cx: 0.85, cy: 0.25, r: 0.5, s: 0.6, p1: 19.3, p2: 8.7, ph: 4.2 },
  ];
  return spec.map((p) => ({
    x: asp * p.cx + 0.12 * Math.sin((tm * TAU) / p.p1 + p.ph) + 0.06 * Math.sin((tm * TAU) / p.p2 + p.ph * 1.7),
    y: p.cy + 0.08 * Math.sin((tm * TAU) / (p.p1 * 0.8) + p.ph * 0.6) + 0.04 * Math.sin((tm * TAU) / (p.p2 * 1.3) + p.ph),
    r: p.r,
    s: p.s * strength,
  }));
}
