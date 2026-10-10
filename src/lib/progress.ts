import { cubicBezier } from "motion/react";

import { EASE } from "@/styles/tokens";

/**
 * Small pure helpers for anything scrubbed by the 0 to 1 story `progress`.
 * They hold no ranges of their own: every range comes from the caller (the scroll script).
 */

/** A `[start, end]` pair in story progress (0 to 1). */
export type ProgressRange = readonly [number, number];

/**
 * An envelope in story progress: 0 before `a`, rises to 1 at `b`, holds until `c`, falls to 0 at `d`.
 * Use `d > 1` (or `Infinity`) for a move that never releases.
 */
export type ProgressEnvelope = readonly [number, number, number, number];

/** The one easing curve as a function. */
export const ease = cubicBezier(...EASE);

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where `p` sits inside `[start, end]`, clamped to 0..1. A zero-length range is a step. */
export function remap(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0;
  return clamp01((p - start) / (end - start));
}

/** Envelope amount at `p`, eased on both ramps with the story curve. */
export function envelope(p: number, [a, b, c, d]: ProgressEnvelope): number {
  if (p <= a || p >= d) return 0;
  if (p < b) return ease(remap(p, a, b));
  if (p <= c) return 1;
  return ease(1 - remap(p, c, d));
}

/** Deterministic pseudo-random sequence (mulberry32), so hand-drawn wobble is identical on every render. */
export function seeded(seed: string | number): () => number {
  let h = typeof seed === "number" ? seed : 0;
  if (typeof seed === "string") for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i);
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
