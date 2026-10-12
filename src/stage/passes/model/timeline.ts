// The Model's timeline, in scroll units from the start of the `model` segment (1 unit is 1/10000
// of the story, SCROLL_UNIT in ../../script.ts). The picture (cuts, framing) and the copy (ramps,
// typing) read the same numbers from here, so the grove's words are never on screen over the share
// still. Nothing here is a `p` value: positions come from the segment, so retiming the script
// retimes the beats.
import { art, type Framing, type Point } from "@/content/art";
import type { Size } from "../../framing";
import { coverRoom } from "../../motion";
import { SCROLL_UNIT, segment } from "../../script";

const model = segment("model");

/** The length of the segment in scroll units (1200 for p 0.07-0.19). */
export const MODEL_UNITS = (model.end - model.start) / SCROLL_UNIT;

/** Scroll units into the segment at progress `p` (negative before it, beyond MODEL_UNITS after). */
export function modelUnits(p: number): number {
  return (p - model.start) / SCROLL_UNIT;
}

/** Image indices, the order of the shader's `img()`. */
export const IMG = { reel: 0, graft: 1, grove: 2, share: 3, shareLast: 4 } as const;
export type ImgIndex = (typeof IMG)[keyof typeof IMG];

const THIRD = MODEL_UNITS / 3;
/** A cut between beats runs this long, centred on the boundary. */
const CUT_UNITS = 70;

export interface Cut {
  a: ImgIndex;
  b: ImgIndex;
  from: number;
  to: number;
}

/** The static cuts in order: bridge reel -> graft, graft -> grove, grove -> share, share -> keyframe 2. */
export const CUTS: readonly Cut[] = [
  { a: IMG.reel, b: IMG.graft, from: 0, to: CUT_UNITS },
  { a: IMG.graft, b: IMG.grove, from: THIRD - CUT_UNITS / 2, to: THIRD + CUT_UNITS / 2 },
  { a: IMG.grove, b: IMG.share, from: 2 * THIRD - CUT_UNITS / 2, to: 2 * THIRD + CUT_UNITS / 2 },
  // The keyframe cut sits mid-beat: the man holds the orange, then the hands part it.
  { a: IMG.share, b: IMG.shareLast, from: 2 * THIRD + 200, to: 2 * THIRD + 200 + CUT_UNITS },
];

/** Where each beat's own drift runs (the share beat does not drift). */
export const BEAT_SPAN = {
  graft: [0, THIRD],
  grove: [THIRD, 2 * THIRD],
} as const;

/** Progress 0..1 through a beat's span, eased, for its drift. */
export function beatProgress(x: number, span: readonly [number, number]): number {
  const k = Math.min(1, Math.max(0, (x - span[0]) / (span[1] - span[0])));
  return k * k * (3 - 2 * k);
}

/** A beat's pan: its art.ts pan plus its drift walked across the beat by scroll. */
export function beatPan(pan: Point, drift: Point | undefined, progress: number): Point {
  if (!drift) return pan;
  return { x: pan.x + drift.x * (progress - 0.5), y: pan.y + drift.y * (progress - 0.5) };
}

/**
 * A beat's drift fitted to the frame: on a frame so wide that the painting's zoom is the only slack
 * sideways (an ultrawide), the art.ts drift would walk the painting's edge into view, so it is scaled
 * down to use at most `share` of the room the framing leaves (the rest is for the depth layers' travel
 * and the rest state). On every frame the drift fits the art.ts value is used as it is.
 */
export function fitDrift(css: Size, tex: Size, framing: Framing, drift: Point, share = 0.7): Point {
  const base = coverRoom(css, tex, framing.zoom, { x: Math.abs(framing.pan.x), y: Math.abs(framing.pan.y) });
  const k = Math.min(
    1,
    (2 * share * base.x) / Math.max(Math.abs(drift.x), 1e-9),
    (2 * share * base.y) / Math.max(Math.abs(drift.y), 1e-9),
  );
  return { x: drift.x * k, y: drift.y * k };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface Camera {
  /** Added to the beat's framing pan. */
  pan: Point;
  /** Multiplier on the beat's framing zoom. */
  zoom: number;
}

/**
 * The grove's camera at `x` units: linear across the beat plus half a cut either side, so it is
 * already moving when the cut opens and still moving when it closes (a camera that eased to a stop
 * at every boundary is what made the beat read as a still).
 */
export function groveCamera(x: number): Camera {
  const c = art.grove.camera;
  const [a, b] = BEAT_SPAN.grove;
  const k = clamp01((x - (a - CUT_UNITS / 2)) / (b - a + CUT_UNITS));
  return {
    pan: { x: lerp(c.pan.from.x, c.pan.to.x, k), y: lerp(c.pan.from.y, c.pan.to.y, k) },
    zoom: lerp(c.zoom.from, c.zoom.to, k),
  };
}

/**
 * The share's camera at `x` units: starts moving where the grove's push-in left off and decelerates
 * (quadratic ease-out) to rest at the segment's end, where it is exactly `lastFraming`.
 */
export function shareCamera(x: number): Camera {
  const c = art.share.camera;
  const from = 2 * THIRD - CUT_UNITS / 2;
  const u = clamp01((x - from) / (MODEL_UNITS - from));
  const k = 1 - (1 - u) * (1 - u);
  return { pan: { x: lerp(c.pan.x, 0, k), y: lerp(c.pan.y, 0, k) }, zoom: lerp(c.zoom, 1, k) };
}

export interface CutState {
  a: ImgIndex;
  b: ImgIndex;
  /** Progress through the cut, 0..1; 0 when holding (the crest has not arrived). */
  s: number;
}

/** Which two images are on screen at `x` units, and how far the cut between them has run. */
export function cutAt(x: number): CutState {
  for (const cut of CUTS) {
    if (x < cut.from) return { a: cut.a, b: cut.a, s: 0 };
    if (x <= cut.to) return { a: cut.a, b: cut.b, s: (x - cut.from) / (cut.to - cut.from) };
  }
  const last = CUTS[CUTS.length - 1];
  return { a: last.b, b: last.b, s: 0 };
}

// ---- the foreground (phase 18) --------------------------------------------------------------------
// Layers in front of the grove and the share, each drifting at its own speed with the scroll (a function
// of the scroll units, so a stopped page holds them and scrubbing back replays them) and swaying in the
// wind with the clock. They are drawn over the whole frame after the cuts (passes/model/foreground.ts),
// so the grove's and the share's own camera moves are untouched; their gain is 0 before the grove has
// opened and exactly 0 at the segment's end, where the share is at rest on `art.share.lastFraming` and
// The Split opens on the same picture.

const smooth01 = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** One layer of drifting motes (pollen in the light): its own cell, speed, rise, size, density and softness. */
export interface MoteLayer {
  /** Lattice cell, in frame heights (the layer's spacing). */
  cell: number;
  /** Frame heights the layer slides per 1000 scroll units: the nearer the faster. */
  speed: number;
  /** Frame heights a second the motes rise on their own (the clock's, still under reduced motion). */
  rise: number;
  /** Radius range, frame heights (every mote its own, rule 13). */
  r: readonly [number, number];
  /** The share of cells that hold a mote. */
  density: number;
  /** Peak opacity. */
  alpha: number;
  /** Edge softness as a share of the radius: the nearest layer is out of focus, bokeh, the farthest crisp. */
  soft: number;
  seed: number;
}

export const FOREGROUND = {
  /** The layers are on once the graft -> grove cut has closed (THIRD + 35) and gone exactly at the segment's end. */
  from: THIRD + 70,
  to: MODEL_UNITS,
  /** Their gain rises over `rampIn` units and falls over `rampOut`, ending at `to`. */
  rampIn: 110,
  rampOut: 190,
  /** Leaves: a few olive leaves out of focus, crossing the frame at their own pace (a crossing takes about `dur` units). */
  leaves: {
    count: 6,
    dur: 340,
    /** Size (frame heights, the leaf's half length) and the lane's range (frame heights from the top; they cross low, under the copy). */
    size: [0.11, 0.23] as readonly [number, number],
    lane: [0.58, 1.04] as readonly [number, number],
    /** The defocus: the edge's softness in frame heights. */
    blur: 0.016,
    opacity: 0.82,
  },
  motes: [
    { cell: 0.42, speed: 3.0, rise: 0.02, r: [0.03, 0.055], density: 0.42, alpha: 0.26, soft: 0.55, seed: 11 },
    { cell: 0.26, speed: 1.7, rise: 0.014, r: [0.006, 0.016], density: 0.6, alpha: 0.6, soft: 0.3, seed: 23 },
    { cell: 0.15, speed: 0.9, rise: 0.008, r: [0.0025, 0.006], density: 0.7, alpha: 0.8, soft: 0.2, seed: 37 },
  ] as readonly MoteLayer[],
  /**
   * The push-through (docs/TRANSITIONS.md, graft -> grove): leaves of the scion sweep across the lens as the camera pushes
   * through them into the canopy. Large leaves rushing out of the frame's middle, each with its own seed, size
   * and pace (the larger the slower), smeared along the push; the window is centred on the graft -> grove cut
   * (THIRD) and has closed before the grove's copy has arrived.
   */
  push: {
    from: THIRD - 120,
    to: THIRD + 38,
    rampIn: 50,
    rampOut: 50,
    count: 9,
    /** Half length at the start (frame heights); a leaf grows 2.8x by the time it leaves the frame. */
    size: [0.15, 0.3] as readonly [number, number],
    /** Frame heights a leaf travels per scroll unit: the larger the slower. */
    speed: [0.0045, 0.0105] as readonly [number, number],
    /** Units a leaf may start late, so they do not rush out together. */
    stagger: 60,
    /** The smear along the push, in frame heights at the frame's middle (it grows with distance and with the scroll's speed). */
    smear: 0.06,
    /** Where they come from: the frame's middle, a little above (where the scion stands), as a share of the frame's width and height. */
    centre: [0.5, 0.36] as readonly [number, number],
  },
  /** The share's white ground takes a warm drifting light between these units (it is gone, exactly, at the end). */
  light: { from: 2 * THIRD + 40, rampIn: 160, rampOut: 210, strength: 0.55 },
} as const;

/** The foreground's gain at `x` units: 0 until the grove has opened, 1 through the middle, exactly 0 at the end. */
export function foregroundGain(x: number): number {
  const f = FOREGROUND;
  return smooth01((x - f.from) / f.rampIn) * (1 - smooth01((x - (f.to - f.rampOut)) / f.rampOut));
}

/** The push-through's gain at `x` units: 0 before and after its window. */
export function pushGain(x: number): number {
  const p = FOREGROUND.push;
  return smooth01((x - p.from) / p.rampIn) * (1 - smooth01((x - (p.to - p.rampOut)) / p.rampOut));
}

/** The share's ground light at `x` units: after the grove -> share cut has closed, exactly 0 at the end. */
export function shareLightGain(x: number): number {
  const l = FOREGROUND.light;
  return smooth01((x - l.from) / l.rampIn) * (1 - smooth01((x - (MODEL_UNITS - l.rampOut)) / l.rampOut));
}

// ---- the copy -----------------------------------------------------------------------------------

/** Every copy ramp is this long, in scroll units. */
export const RAMP = 60;
/** The title runs this far ahead of the rest of its beat. */
export const TITLE_LEAD = 12;

export interface BeatCopy {
  /** The rest (subtitle, tag, typed line) ramps in over [in, in + RAMP]; the title 12 units ahead. */
  in: number;
  /** ... and out over [out, out + RAMP]; the title 12 units ahead. Out ends before the next beat. */
  out: number;
}

export const COPY_WINDOWS = {
  // After the graft -> grove cut (ends THIRD + 35), gone before the grove -> share cut begins.
  grove: { in: THIRD + 50, out: 2 * THIRD - 110 },
  // After the grove -> share cut, gone as the Split opens: it ends exactly at the segment's end.
  share: { in: 2 * THIRD + 60, out: MODEL_UNITS - RAMP },
} as const satisfies Record<string, BeatCopy>;

/** The typed line runs over this stretch (units from the segment start). */
export const TYPE_FROM = 2 * THIRD + 100;
export const TYPE_TO = 2 * THIRD + 290;

const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/**
 * Opacity of a piece of copy at `x` units: ramps in over RAMP and out over RAMP. `lead` is how many
 * units earlier the piece ramps (TITLE_LEAD for the title, 0 for the rest).
 */
export function copyAlpha(window: BeatCopy, x: number, lead: number): number {
  const up = smooth((x - (window.in - lead)) / RAMP);
  const down = smooth((x - (window.out - lead)) / RAMP);
  return up * (1 - down);
}

/** How much of the typed line is out, 0..1 (by local progress, so scrubbing back untypes it). */
export function typedProgress(x: number): number {
  return clamp01((x - TYPE_FROM) / (TYPE_TO - TYPE_FROM));
}
