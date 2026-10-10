import type { RigFigure } from "./rig";

/**
 * Idle life of the painted figures, as pure functions of idle time (no React, no three): they
 * breathe (chest and shoulders rise a little under 1% of their height, at about 0.2 Hz), the hem of a
 * robe ripples in the breeze, and every few seconds the head and the weight shift a little. Each
 * figure has its own phase, so a crowd never moves in unison. Idle time is the stage's idle clock
 * (`idle.tsx`): paused offscreen, in a hidden tab and with reduced motion, so the figures hold still
 * there.
 *
 * `lifeAt` gives the numbers for one figure at one moment; the plate shader (`materials.ts`) bends a
 * subdivided plate by them through the rig's weights, and `deformQ` does the same bend on the CPU so
 * the parts of a figure (a head, an arm on their own plates) ride along exactly.
 */

export const LIFE = {
  /** Breathing: how far the chest rises (fraction of the plate's height), how often, and the share of a breath spent breathing in. */
  breath: { rise: 0.007, hz: 0.2, inhale: 0.42 },
  /** The hem: how far it swings (fraction of the plate's height), the breeze's rate, the ripple's waves across the plate. */
  hem: { swing: 0.0045, hz: 0.31, waves: 16 },
  /** Small head turns (radians) every few seconds: the shortest and longest wait, and the share of it held still. */
  head: { angle: 0.035, every: [3.4, 6.2] as const, hold: 0.55 },
  /** Small weight shifts (radians, the whole figure about its feet), slower. */
  weight: { angle: 0.0055, every: [5.2, 8.8] as const, hold: 0.5 },
} as const;

/** One figure's life at a moment. Lengths are fractions of the plate's height, angles radians. */
export interface LifeSample {
  /** How far the chest (and all above it) has risen. */
  breath: number;
  /** The head's turn on the neck. */
  head: number;
  /** The whole figure's turn about its feet (a weight shift). */
  sway: number;
  /** How far the hem swings, and where its ripple is (radians). */
  hem: number;
  hemPhase: number;
}

export const newLifeSample = (): LifeSample => ({ breath: 0, head: 0, sway: 0, hem: 0, hemPhase: 0 });

const TAU = Math.PI * 2;
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (v: number) => v - Math.floor(v);

/** A stable hash of two integers to [0, 1). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A figure's phase, 0 to 1, from its name and its place on a shared plate. */
export function figurePhase(name: string, index = 0): number {
  let h = index * 7919;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return hash01(h, 17);
}

/** How far into a breath the chest is, 0 (out) to 1 (in): a quicker breath in, a slower breath out. */
export function breathAt(t: number, phase: number): number {
  const hz = LIFE.breath.hz * (0.9 + 0.2 * phase);
  const u = fract(t * hz + phase);
  const i = LIFE.breath.inhale;
  const w = u < i ? (u / i) * 0.5 : 0.5 + ((u - i) / (1 - i)) * 0.5;
  return 0.5 - 0.5 * Math.cos(TAU * w);
}

/**
 * A small shift that comes every few seconds: it holds, then eases to a new value, -1 to 1. The wait
 * is the figure's own (between `every[0]` and `every[1]` seconds), so neighbours shift at different
 * times. Continuous in time: it never jumps.
 */
export function shiftAt(t: number, seed: number, every: readonly [number, number], hold: number): number {
  const s = Math.floor(seed * 1e6);
  const period = every[0] + (every[1] - every[0]) * hash01(s, 1);
  const x = t / period + hash01(s, 2);
  const n = Math.floor(x);
  const from = hash01(s, n) * 2 - 1;
  const to = hash01(s, n + 1) * 2 - 1;
  return from + (to - from) * smoothstep(hold, 1, x - n);
}

/** The breeze in the hem: how far it swings now (gusts come and go) and where its ripple is. */
export function hemAt(t: number, phase: number): { swing: number; phase: number } {
  const gust = 0.55 + 0.45 * Math.sin(TAU * (0.061 * t + phase));
  return { swing: LIFE.hem.swing * gust, phase: TAU * (LIFE.hem.hz * t + phase) };
}

/** One figure's life at idle time `t`, scaled by `strength` (0 still, 1 normal). Writes into `out`. */
export function lifeAt(t: number, phase: number, strength: number, out: LifeSample = newLifeSample()): LifeSample {
  out.breath = LIFE.breath.rise * breathAt(t, phase) * strength;
  out.head = LIFE.head.angle * shiftAt(t, phase, LIFE.head.every, LIFE.head.hold) * strength;
  out.sway = LIFE.weight.angle * shiftAt(t + 11.3, fract(phase + 0.37), LIFE.weight.every, LIFE.weight.hold) * strength;
  const hem = hemAt(t, phase);
  out.hem = hem.swing * strength;
  out.hemPhase = hem.phase;
  return out;
}

/** Turns `p` about `c` by `angle` (radians, counter-clockwise with y up). Writes into `out`. */
export function turnAbout(p: readonly [number, number], c: readonly [number, number], angle: number, out: [number, number] = [0, 0]): [number, number] {
  const s = Math.sin(angle);
  const k = Math.cos(angle);
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  out[0] = c[0] + k * x - s * y;
  out[1] = c[1] + s * x + k * y;
  return out;
}

const tmpA: [number, number] = [0, 0];
const tmpP: [number, number] = [0, 0];

/**
 * Bends one point of a plate the way the plate shader bends its mesh: the arm turns on the shoulder,
 * the head on the neck, the chest (and all above) rises, the hem swings, and the whole figure turns
 * about its feet. `q` and the pivots are in q space (plate heights, y up); `w` the rig's weights at
 * the point (breath, hem, head, arm); `zone` the share of the point that belongs to this person;
 * `u` its fraction from the left (the hem's ripple runs across the plate).
 */
export function deformQ(
  q: readonly [number, number],
  w: readonly [number, number, number, number],
  zone: number,
  u: number,
  life: LifeSample,
  foot: readonly [number, number],
  neck: readonly [number, number],
  arm: { shoulder: readonly [number, number]; angle: number } | null,
  out: [number, number] = [0, 0],
): [number, number] {
  let x = q[0];
  let y = q[1];
  if (arm && w[3] > 0) {
    tmpP[0] = x;
    tmpP[1] = y;
    turnAbout(tmpP, arm.shoulder, arm.angle, tmpA);
    x += (tmpA[0] - x) * w[3];
    y += (tmpA[1] - y) * w[3];
  }
  if (w[2] > 0) {
    tmpP[0] = x;
    tmpP[1] = y;
    turnAbout(tmpP, neck, life.head * zone, tmpA);
    x += (tmpA[0] - x) * w[2];
    y += (tmpA[1] - y) * w[2];
  }
  y += life.breath * w[0] * zone;
  x += life.hem * w[1] * zone * Math.sin(life.hemPhase + u * LIFE.hem.waves);
  tmpP[0] = x;
  tmpP[1] = y;
  return turnAbout(tmpP, foot, life.sway * zone, out);
}

/** Pivots of a person in q space. */
export function figurePivots(f: RigFigure, aspect: number): { foot: [number, number]; neck: [number, number]; shoulder: [number, number] } {
  return {
    foot: [f.pivot[0] * aspect, 1 - f.pivot[1]],
    neck: [f.neck[0] * aspect, 1 - f.neck[1]],
    shoulder: [f.shoulder[0] * aspect, 1 - f.shoulder[1]],
  };
}
