// The Work's timeline and geometry (docs/STORY.md row 2, docs/TRANSITIONS.md for the arrival).
// The picture (passes/work/frag.ts, through the uniforms of ./index.ts) and the cards
// (WorkCopy.tsx) read the same numbers from here, so a card is always beside the part of the
// painting it belongs to. Nothing here is a `p` value: positions come from the `work` segment, and
// the lengths of ramps are in scroll units (SCROLL_UNIT, 1/10000 of the story, about 5 px of
// scroll on a 900 px screen).
//
// Plate coordinates are 'plate v' (0 at the top of the 9:16 plate, 1 at its bottom) unless a name
// says screen.
import { art } from "@/content/art";
import type { Size } from "../../framing";
import { SCROLL_UNIT, segment } from "../../script";
import { PLATE_CX, PLATE_SPAN } from "../clouds";
import { splitOrigin, splitPlateScale } from "../split";

const work = segment("work");

/** The length of the segment in scroll units (1500 for p 0.22-0.37). */
export const WORK_UNITS = (work.end - work.start) / SCROLL_UNIT;

/** Scroll units into the segment at progress `p` (negative before it, beyond WORK_UNITS after). */
export function workUnits(p: number): number {
  return (p - work.start) / SCROLL_UNIT;
}

export const WORK_TUNE = {
  /** The arrival: the plate's scale eases from the Split's end state to the width-fit over this share of t. */
  arrivalSpan: 0.08,
  /** The creep: a push-in of this much per 10% of local progress, linear, never stopping. */
  creepPerTenth: 0.006,
  /** The plate scrolls with a velocity that ramps in over this share of t, and eases out over `endSpan`. */
  rampSpan: 0.14,
  endSpan: 0.16,
  /** Velocity at the end of the chapter, as a share of the cruising speed (the parchment push takes over). */
  endSpeed: 0.25,
  /** The scrim over the plate: a smoothstep over the first 20% of the chapter. */
  scrimSpan: 0.2,
  /** The big cloud walks in from the plate's right edge over this share of t. */
  driftSpan: 0.5,
  /** The print front (plate v): a soak-in band this wide (the shader bites it by two fbm fields). */
  band: 0.07,
  /** The painted edge starts this far (plate v) below the frame's bottom, so the Split's last frame is untouched. */
  frontStartGap: 0.065,
  /** The front's frame fraction (0 top, 1 bottom) in the middle of the chapter: it rises, then sweeps out. */
  frontMid: 0.7,
  frontMidAt: 0.45,
  frontEndAt: 0.92,
  /** The painted edge ends this far (plate v) beyond the plate's bottom: everything printed. */
  frontEndGap: 0.12,
  /** Cards: title lead, ramp length, screen-fraction lines at which a card comes in and leaves. */
  cardLead: 12,
  cardRamp: 60,
  cardFirstAt: 24,
  enterLine: 0.74,
  exitLine: 0.16,
  /** Two cards are never on screen closer than this (frame heights) unless the earlier one is leaving. */
  cardGap: 0.4,
  /** Cards move at this share of the plate's speed. */
  cardParallax: 0.6,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------------------------------------------------------------------------------------------
// The plate in the frame
// ---------------------------------------------------------------------------------------------

export interface PlateFit {
  /** The frame's height in plate heights (what is visible at once). */
  fh: number;
  /** Zoom beyond the width-fit (1 on desktop; more on a frame so tall the plate would not scroll). */
  zoom: number;
  /** Plate column at the frame's horizontal centre. */
  cx: number;
}

/** The same fit as `plateFit()` in the GLSL (passes/clouds.ts). */
export function plateFit(css: Size): PlateFit {
  const k = art.plate.aspect * (css[1] / css[0]);
  const zoom = Math.max(1, PLATE_SPAN * k);
  return { fh: k / zoom, zoom, cx: Math.min(1 - 0.5 / zoom, Math.max(0.5 / zoom, PLATE_CX)) };
}

// ---------------------------------------------------------------------------------------------
// The scroll through the plate
// ---------------------------------------------------------------------------------------------

const TABLE = 512;
let cumulative: Float32Array | null = null;

/** Speed of the plate at local t: ramps in (rule 4), cruises, eases out to `endSpeed` at the end. */
function speed(t: number): number {
  const { rampSpan, endSpan, endSpeed } = WORK_TUNE;
  return smooth(0, rampSpan, t) * (endSpeed + (1 - endSpeed) * smooth(0, endSpan, 1 - t));
}

/** How far through its scroll the plate is at local t, 0..1, the integral of `speed`, normalised. */
export function plateProgress(t: number): number {
  if (!cumulative) {
    cumulative = new Float32Array(TABLE + 1);
    for (let i = 1; i <= TABLE; i++) {
      cumulative[i] = cumulative[i - 1] + 0.5 * (speed((i - 1) / TABLE) + speed(i / TABLE)) / TABLE;
    }
    const total = cumulative[TABLE];
    for (let i = 0; i <= TABLE; i++) cumulative[i] /= total;
  }
  const x = clamp01(t) * TABLE;
  const i = Math.min(TABLE - 1, Math.floor(x));
  return mix(cumulative[i], cumulative[i + 1], x - i);
}

/** Plate v at the top of the frame at local t: 0 (the sky) down to the bottom of the plate in view. */
export function yTop(t: number, css: Size): number {
  return plateProgress(t) * (1 - plateFit(css).fh);
}

// ---------------------------------------------------------------------------------------------
// The arrival, the creep, the scrim, the cloud
// ---------------------------------------------------------------------------------------------

/**
 * `x*(0.45 + 0.55*x^2)` inverted: the progress x (0..1) that has covered the share tau of the
 * arrival. Fast at first, settling (the push-in's accelerating curve, run backwards).
 */
export function invertedPush(tau: number): number {
  const k = clamp01(tau);
  let x = k;
  for (let i = 0; i < 6; i++) {
    const f = x * (0.45 + 0.55 * x * x) - k;
    const d = 0.45 + 1.65 * x * x;
    x = Math.min(1, Math.max(0, x - f / d));
  }
  return x;
}

/**
 * The plate's scale about the Split's seam point. It starts where the Split left off
 * (`splitPlateScale(1)`: 1.0, the plain width-fit; docs/TRANSITIONS.md ends the cut there, so there
 * is no pop) and eases to the plain width-fit over the first `arrivalSpan` of t with the inverted
 * push. Should the cut be retuned to end pushed in, the arrival continues from there.
 */
export function arrivalScale(t: number): number {
  const from = splitPlateScale(1);
  return mix(from, 1, invertedPush(t / WORK_TUNE.arrivalSpan));
}

/** The point it is scaled about: the Split's drifted seam point (screen uv, y down). */
export function arrivalOrigin(css: Size) {
  return splitOrigin(css, 1);
}

/** The creep: a slow push-in about the frame's centre, 0.6% per 10% of t, linear, never stopping. */
export function creep(t: number): number {
  return 1 + WORK_TUNE.creepPerTenth * (clamp01(t) / 0.1);
}

/** The scrim over the plate, 0..1: smoothstep over the first `scrimSpan` of t. */
export function scrim(t: number): number {
  return smooth(0, WORK_TUNE.scrimSpan, t);
}

/** 0..1: how far the large cloud has walked in from the plate's right edge. */
export function drift(t: number): number {
  return smooth(0, WORK_TUNE.driftSpan, t);
}

// ---------------------------------------------------------------------------------------------
// The print front
// ---------------------------------------------------------------------------------------------

/** The raw frame-relative curve of the painted edge: plate v at local t, before the running maximum. */
function rawFront(t: number, css: Size): number {
  const { fh } = plateFit(css);
  const { frontStartGap, frontMid, frontMidAt, frontEndAt, frontEndGap } = WORK_TUNE;
  const start = 1 + frontStartGap / fh;
  const end = 1 + frontEndGap / fh;
  const fs = start + (frontMid - start) * smooth(0, frontMidAt, t) + (end - frontMid) * smooth(frontMidAt, frontEndAt, t);
  return yTop(t, css) + fh * fs;
}

let frontKey = "";
let frontTable = new Float32Array(0);

/**
 * The plate v of the painted edge at local t: everything above it (less the band) is the plain
 * painting; below it the painting has not arrived yet. It is held relative to the frame, so the
 * halftone screen is on screen while the plate moves under it: it starts just under the frame's
 * bottom, rises up the frame to `frontMid`, and sweeps out past the bottom of the plate. A print
 * never un-prints, so the curve is the running maximum of the frame-relative one (it waits in the
 * plate while the frame is still catching up with it, and only ever moves down the plate).
 */
export function front(t: number, css: Size): number {
  const key = `${css[0]}x${css[1]}`;
  if (key !== frontKey) {
    frontKey = key;
    frontTable = new Float32Array(TABLE + 1);
    let top = -Infinity;
    for (let i = 0; i <= TABLE; i++) {
      top = Math.max(top, rawFront(i / TABLE, css));
      frontTable[i] = top;
    }
  }
  const x = clamp01(t) * TABLE;
  const i = Math.min(TABLE - 1, Math.floor(x));
  return mix(frontTable[i], frontTable[i + 1], x - i);
}

/** Dev check: the front never moves up the plate between two samples of t, at this frame size. */
export function frontIsMonotonic(css: Size, steps = 600): boolean {
  let last = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const f = front(i / steps, css);
    if (f < last - 1e-9) return false;
    last = f;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------------------------

/** Plate v of each card's anchor (docs: card 1 in the sky, 2 at the orange's shoulder, 3 at the blueprint). */
export const CARD_ANCHORS: readonly number[] = [art.plate.anchors.sky.y, art.plate.anchors.shoulder.y, art.plate.anchors.blueprint.y];

/**
 * Screen y (uv, 0 top) of a plate point at local t, under the arrival dolly and the creep: the
 * plate's own position, which the cards follow at `cardParallax`.
 */
export function plateToScreenY(v: number, t: number, css: Size): number {
  const { fh } = plateFit(css);
  const o = arrivalOrigin(css);
  const uv2 = (v - yTop(t, css)) / fh;
  const uv1 = 0.5 + (uv2 - 0.5) * creep(t);
  return o.y + (uv1 - o.y) * arrivalScale(t);
}

/** A card's screen y (uv): it crosses the frame at `cardParallax` of the plate's speed. */
export function cardScreenY(anchor: number, t: number, css: Size): number {
  return 0.5 + WORK_TUNE.cardParallax * (plateToScreenY(anchor, t, css) - 0.5);
}

export interface CardWindow {
  /** Scroll units at which the title starts to come in (the body follows `cardLead` later). */
  inAt: number;
  /** Scroll units at which the card is gone again (Infinity: it stays to the end of the chapter). */
  outAt: number;
}

/**
 * When each card is on screen, at this frame size: it comes in as its (parallaxed) position rises
 * past `enterLine` of the frame and leaves as it passes `exitLine`, so the card arrives with the
 * part of the painting it sits beside and never shares the frame with a third. The first card is
 * already in place when the chapter starts, so it comes in after `cardFirstAt` units.
 */
export function cardWindows(css: Size): CardWindow[] {
  const { enterLine, exitLine, cardFirstAt, cardGap, cardRamp } = WORK_TUNE;
  const N = WORK_UNITS;
  const out: CardWindow[] = [];
  CARD_ANCHORS.forEach((anchor, i) => {
    let inAt = i === 0 ? cardFirstAt : N;
    let outAt = Infinity;
    let entered = i === 0;
    const prev = out[i - 1];
    for (let u = 0; u <= N; u++) {
      const y = cardScreenY(anchor, u / N, css);
      if (!entered && y <= enterLine) {
        // On a frame where two cards would overlap, this one waits for the earlier one to go.
        const crowded =
          prev !== undefined && u < prev.outAt - cardRamp && y - cardScreenY(CARD_ANCHORS[i - 1], u / N, css) < cardGap;
        if (!crowded) {
          inAt = u;
          entered = true;
        }
      }
      if (y <= exitLine) {
        outAt = u;
        break;
      }
    }
    out.push({ inAt: Math.max(inAt, i === 0 ? cardFirstAt : 0), outAt });
  });
  return out;
}

/** 0..1 ramp of a piece that starts at `from` units and takes `cardRamp`. */
export function rampIn(units: number, from: number): number {
  return smooth(0, 1, (units - from) / WORK_TUNE.cardRamp);
}

/** 1..0 ramp of a card leaving at `outAt` units (it finishes at `outAt`). */
export function rampOut(units: number, outAt: number): number {
  if (!Number.isFinite(outAt)) return 1;
  return 1 - smooth(0, 1, (units - (outAt - WORK_TUNE.cardRamp)) / WORK_TUNE.cardRamp);
}
