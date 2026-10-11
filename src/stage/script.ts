// The script: the named segments of docs/STORY.md with their scroll ranges.
//
// This file is the single source of ranges. No component, pass or layer may hardcode a `p` value;
// they ask `local()`, `active()` and `nearby()` instead, so retiming the story is an edit here.
//
// `p` is smoothed scroll progress, 0 at the top of the page and 1 at the bottom (src/stage/scroll.ts).
// Segments are contiguous and cover 0..1 exactly; `active()` picks the one containing `p`.
import type { Chapter } from "@/content/copy";

export type SegmentId =
  | "hero"
  | "bridge"
  | "model"
  | "split"
  | "work"
  | "parchment"
  | "sheet"
  | "drawing"
  | "panel"
  | "close"
  | "coda"
  | "matchcut"
  | "questions"
  | "moire"
  | "application"
  | "rise"
  | "finale";

export type ChapterId = Chapter["id"];

/** The ground the chrome reads over: milk text on sky, ink on paper or on the pale model ground. */
export type Ground = "sky" | "paper" | "milk";

/** A ground for the whole segment, or a switch at a local t inside a transition segment. */
export type GroundSpec = Ground | { from: Ground; to: Ground; at: number };

export interface Segment {
  id: SegmentId;
  /** Inclusive start, exclusive end (the last segment includes 1). */
  start: number;
  end: number;
  /** Chapter shown on the left rail; null before the story starts and after Questions. */
  chapter: ChapterId | null;
  ground: GroundSpec;
}

// Ranges from the table in docs/STORY.md. The Terms (0.40–0.59) is split into its beats using the
// cut ranges in docs/TRANSITIONS.md: soak-in, orbit to plan, panel, burn, coda, match cut.
export const segments: readonly Segment[] = [
  // The hero loop with its shader clouds, glint and pour; hero copy.
  { id: "hero", start: 0.0, end: 0.04, chapter: null, ground: "sky" },
  // The 121-frame morph from plinth to branch; film hands to reel through the static treatment.
  { id: "bridge", start: 0.04, end: 0.07, chapter: "model", ground: { from: "sky", to: "milk", at: 0.6 } },
  // Three beats on a pale ground: graft, grove, share.
  { id: "model", start: 0.07, end: 0.19, chapter: "model", ground: "milk" },
  // The Split: the cut in the orange becomes the cut in the picture.
  { id: "split", start: 0.19, end: 0.22, chapter: "model", ground: { from: "milk", to: "sky", at: 0.45 } },
  // The tall plate scrolled through its own height; the three Work cards.
  { id: "work", start: 0.22, end: 0.37, chapter: "work", ground: "sky" },
  // The push into the parchment she holds; the painting fades to paper around it.
  { id: "parchment", start: 0.37, end: 0.4, chapter: "work", ground: { from: "sky", to: "paper", at: 0.5 } },
  // The procedural sheet; the drawing soaks in from the middle.
  { id: "sheet", start: 0.4, end: 0.42, chapter: "terms", ground: "paper" },
  // The orbit from eye level to plan while the window draws back toward the margin.
  { id: "drawing", start: 0.42, end: 0.48, chapter: "terms", ground: "paper" },
  // The brushed-edge panel in the left margin beside the terms copy.
  { id: "panel", start: 0.48, end: 0.5, chapter: "terms", ground: "paper" },
  // The close: the sheet burns from the bottom left into flat blue.
  { id: "close", start: 0.5, end: 0.53, chapter: "terms", ground: { from: "paper", to: "sky", at: 0.5 } },
  // The coda frames: the picking rod, the orange floats free, the halo.
  { id: "coda", start: 0.53, end: 0.58, chapter: "terms", ground: "sky" },
  // Match cut on the fruit into the canopy.
  { id: "matchcut", start: 0.58, end: 0.59, chapter: "terms", ground: "sky" },
  // FAQ cards over the canopy, the handwritten title, the constellation.
  { id: "questions", start: 0.59, end: 0.76, chapter: "questions", ground: "sky" },
  // The coarse halftone screen with moiré; the next painting's clouds print in.
  { id: "moire", start: 0.76, end: 0.79, chapter: "questions", ground: "sky" },
  // The woman on the steps points at the constellation whose stars are the form fields.
  { id: "application", start: 0.79, end: 0.9, chapter: null, ground: "sky" },
  // The sapling prints in; the constellation retracts to her fingertip.
  { id: "rise", start: 0.9, end: 0.96, chapter: null, ground: "sky" },
  // The footer loop under the wordmark.
  { id: "finale", start: 0.96, end: 1.0, chapter: null, ground: "sky" },
];

// The ranges must tile 0..1 with no gap or overlap; fail loudly at module load if an edit breaks that.
(function validate() {
  if (segments[0].start !== 0 || segments[segments.length - 1].end !== 1) {
    throw new Error("script: segments must start at 0 and end at 1");
  }
  for (let i = 1; i < segments.length; i++) {
    if (Math.abs(segments[i - 1].end - segments[i].start) > 1e-9) {
      throw new Error(`script: gap between ${segments[i - 1].id} and ${segments[i].id}`);
    }
  }
})();

const byId: Record<SegmentId, Segment> = Object.fromEntries(segments.map((s) => [s.id, s])) as Record<
  SegmentId,
  Segment
>;

export const SEGMENT_IDS: readonly SegmentId[] = segments.map((s) => s.id);

/** The segment with this id. */
export function segment(id: SegmentId): Segment {
  return byId[id];
}

/** Position of a segment in the script (0-based). */
export function indexOf(id: SegmentId): number {
  return segments.indexOf(byId[id]);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Local progress 0..1 inside a segment, clamped: 0 before it, 1 after it. */
export function local(id: SegmentId, p: number): number {
  const s = byId[id];
  return clamp01((p - s.start) / (s.end - s.start));
}

/** The segment containing `p` (start inclusive, end exclusive; p >= 1 is the finale). */
export function active(p: number): Segment {
  if (!(p > 0)) return segments[0];
  for (let i = 0; i < segments.length; i++) {
    if (p < segments[i].end) return segments[i];
  }
  return segments[segments.length - 1];
}

/**
 * Every segment that overlaps [p - margin, p + margin]: the active one and those about to arrive
 * or just left. Used to gate work and preload the next segment's assets.
 */
export function nearby(p: number, margin: number): Segment[] {
  const lo = p - margin;
  const hi = p + margin;
  return segments.filter((s) => s.end >= lo && s.start <= hi);
}

/** The global `p` at local progress `t` inside a segment (for scroll targets). */
export function pAt(id: SegmentId, t = 0): number {
  const s = byId[id];
  return s.start + (s.end - s.start) * clamp01(t);
}

/** Signed distance from `p` to a segment in `p` units: 0 inside, negative before it, positive after. */
export function distance(id: SegmentId, p: number): number {
  const s = byId[id];
  if (p < s.start) return p - s.start;
  if (p >= s.end) return p - s.end;
  return 0;
}

/** The chapter the rail shows at `p`, or null. */
export function chapterAt(p: number): ChapterId | null {
  return active(p).chapter;
}

/** The first segment of a chapter (where the rail and the menu scroll to). */
export function chapterStart(chapter: ChapterId): SegmentId {
  const first = segments.find((s) => s.chapter === chapter);
  return first ? first.id : "hero";
}

/** The ground the chrome reads over at `p`, resolving mid-transition switches. */
export function groundAt(p: number): Ground {
  const s = active(p);
  if (typeof s.ground === "string") return s.ground;
  return local(s.id, p) < s.ground.at ? s.ground.from : s.ground.to;
}

/** Hairline tone at `p`: 55% milk over paintings, 20% foreground on the flat procedural sheet. */
export function surfaceAt(p: number): "paint" | "flat" {
  return groundAt(p) === "paper" ? "flat" : "paint";
}

/** Anchors (#model, #work, #terms, #questions, #apply) map to the segment they open. */
export const ANCHORS: Readonly<Record<string, SegmentId>> = {
  model: "model",
  work: "work",
  terms: "sheet",
  questions: "questions",
  apply: "application",
};
