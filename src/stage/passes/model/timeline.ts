// The Model's timeline, in scroll units from the start of the `model` segment (1 unit is 1/10000
// of the story, SCROLL_UNIT in ../../script.ts). The picture (cuts, framing) and the copy (ramps,
// typing) read the same numbers from here, so the grove's words are never on screen over the share
// still. Nothing here is a `p` value: positions come from the segment, so retiming the script
// retimes the beats.
import { art, type Point } from "@/content/art";
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
