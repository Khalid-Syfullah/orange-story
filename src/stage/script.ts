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
  /** Chapter shown on the left rail; null before the story starts and from the rise on. */
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
  // The Split: the cut in the orange becomes the cut in the picture. The rail already reads The Work.
  { id: "split", start: 0.19, end: 0.22, chapter: "work", ground: { from: "milk", to: "sky", at: 0.45 } },
  // The tall plate scrolled through its own height; the three Work cards.
  { id: "work", start: 0.22, end: 0.37, chapter: "work", ground: "sky" },
  // The push into the parchment she holds; the painting fades to paper around it. The rail already
  // reads The Terms. The chrome turns to ink on the push's own uFlat ramp (Chrome.tsx), not at `at`.
  { id: "parchment", start: 0.37, end: 0.4, chapter: "terms", ground: { from: "sky", to: "paper", at: 0.5 } },
  // The procedural sheet; the drawing soaks in from the middle.
  { id: "sheet", start: 0.4, end: 0.42, chapter: "terms", ground: "paper" },
  // The orbit from eye level to plan while the window draws back toward the margin.
  { id: "drawing", start: 0.42, end: 0.48, chapter: "terms", ground: "paper" },
  // The brushed-edge panel in the left margin beside the terms copy.
  { id: "panel", start: 0.48, end: 0.5, chapter: "terms", ground: "paper" },
  // The close: the sheet burns from the bottom left into flat blue. The chrome turns to milk as the
  // front passes the frame's centre (passes/coda/timeline.ts burnTravel: about 0.56 of the close).
  { id: "close", start: 0.5, end: 0.53, chapter: "terms", ground: { from: "paper", to: "sky", at: 0.56 } },
  // The coda frames: the picking rod, the orange floats free, the halo.
  { id: "coda", start: 0.53, end: 0.58, chapter: "terms", ground: "sky" },
  // Match cut on the fruit into the canopy. The rail already reads Questions from its first frame.
  { id: "matchcut", start: 0.58, end: 0.59, chapter: "questions", ground: "sky" },
  // FAQ cards over the canopy, the handwritten title, the constellation.
  { id: "questions", start: 0.59, end: 0.76, chapter: "questions", ground: "sky" },
  // The coarse halftone screen with moiré; the next painting's clouds print in.
  { id: "moire", start: 0.76, end: 0.79, chapter: "questions", ground: "sky" },
  // The woman on the steps points at the constellation whose stars are the form fields. The rail
  // still reads Questions here; it goes dark with the rise.
  { id: "application", start: 0.79, end: 0.9, chapter: "questions", ground: "sky" },
  // The sapling prints in; the constellation retracts to her fingertip. Nothing is highlighted.
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

/**
 * One scroll unit, as progress: copy ramps and lead times in the phase prompts ("over 60 scroll
 * units", "12 units ahead") are counted in these. 1/10000 of the story is about 5 px of scroll on a
 * 900 px screen, so 60 units is a ramp of about 320 px and 12 units a lead of about 64 px.
 */
export const SCROLL_UNIT = 1e-4;

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

/**
 * Where the rail and the menu scroll to for a chapter: its anchor's segment (#terms opens on the
 * sheet, not on the push that leads into it, though the rail already reads The Terms there), else
 * the first segment of the chapter.
 */
export function chapterStart(chapter: ChapterId): SegmentId {
  if (chapter in ANCHORS) return ANCHORS[chapter];
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

/**
 * `?split=0.5` (any segment id with a local t, an empty value meaning 0): the first such query
 * parameter, so a cut can be held at any t for stills and the scrub test (docs/CHECKS.md).
 */
export function segmentFromParams(params: URLSearchParams): { id: SegmentId; t: number } | null {
  for (const s of segments) {
    const raw = params.get(s.id);
    if (raw === null) continue;
    const t = raw === "" ? 0 : Number.parseFloat(raw);
    if (Number.isFinite(t)) return { id: s.id, t: clamp01(t) };
  }
  return null;
}

/** Anchors (#model, #work, #terms, #questions, #apply) map to the segment they open. */
export const ANCHORS: Readonly<Record<string, SegmentId>> = {
  model: "model",
  work: "work",
  terms: "sheet",
  questions: "questions",
  apply: "application",
};

/**
 * Under reduced motion every transition between chapters collapses to its end frame (t = 1) with a
 * 300 ms dissolve (docs/CHECKS.md): from the moment the scroll enters one of these segments the
 * stage draws its last frame. The chapters' own segments (the model's beats, the Work, the Terms
 * copy over the panel, the coda, the Questions, the application) keep scrolling: they are content.
 */
export const REDUCED_HOLD: readonly SegmentId[] = [
  "bridge",
  "split",
  "parchment",
  "sheet",
  "drawing",
  "close",
  "matchcut",
  "moire",
  "rise",
];

const HOLD_EPS = 1e-6;

/** The progress the stage draws at under reduced motion: a transition's end frame, else `p` itself. */
export function reducedHold(p: number): number {
  const s = active(p);
  return REDUCED_HOLD.includes(s.id) && s.end < 1 ? s.end - HOLD_EPS : p;
}
