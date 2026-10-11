// The finale (docs/STORY.md row Finale, docs/TRANSITIONS.md row Application -> finale): timing and
// geometry shared by the shader (./frag.ts through ./index.ts), the wordmark canvas (./wordmark.ts)
// and the DOM layer (FinaleCopy.tsx). Nothing here is a `p` value: every ramp is a share of the
// `finale` segment (p 0.96-1.00), so retiming the story in script.ts retimes the finale with it.
// Geometry is in CSS px of the frame, y down, unless a name says otherwise.
import { finale } from "@/content/copy";

export const FINALE_TUNE = {
  /** The finale loop takes the frame over [0, coverTo] of the segment (accelerating, rule 4). */
  coverTo: 0.42,
  coverLin: 0.5,
  /** Where the loop starts printing in: in the open sky above the tree, uv. */
  origin: { x: 0.5, y: 0.2 },
  /** The pour grows in over [pourFrom, pourTo]. */
  pourFrom: 0.22,
  pourTo: 0.5,
  /** The wordmark prints in over [wordFrom, wordTo]; letter k starts at k * letterStep of that span. */
  wordFrom: 0.34,
  wordTo: 0.78,
  letterStep: 0.12,
  /** The subtitle ramps in after the last letter, the footer line after the subtitle. */
  subFrom: 0.8,
  subTo: 0.92,
  footFrom: 0.88,
  footTo: 1.0,
  /** Wordmark: font size = clamp(64, 32 + 9vw, 176) px (the `display-xxl` token), tracking, box height in em. */
  fontMin: 64,
  fontBase: 32,
  fontVw: 0.09,
  fontMax: 176,
  /** The wordmark is never taller than this share of the frame, so the subtitle under it clears the crown (1440x900: 126 px, not 161). */
  fontHeightShare: 0.14,
  tracking: -0.03,
  boxEm: 1.15,
  /** The wordmark's centre, share of the frame's height, and the lowest it may sit under the top rule. */
  centreY: 0.17,
  topRule: 72,
  /** The loop's own framing: a plain cover fit. */
  zoom: 1.0,
} as const;

const T = FINALE_TUNE;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** The loop's takeover 0..1 at local t: accelerating, with an eased start (rule 4). */
export function coverAt(t: number): number {
  const k = clamp01(t / T.coverTo);
  return k * (T.coverLin + (1 - T.coverLin) * k * k) * (0.5 + 0.5 * smooth(0, 0.15, k));
}

/** The pour's gain 0..1: it grows in as the loop arrives. */
export function pourGain(t: number): number {
  return smooth(T.pourFrom, T.pourTo, t);
}

/** The wordmark's clock 0..1 (letters stagger inside it, see ./frag.ts). */
export function wordAt(t: number): number {
  return clamp01((t - T.wordFrom) / (T.wordTo - T.wordFrom));
}

/** The subtitle's alpha at local t. */
export function subtitleAlpha(t: number): number {
  return smooth(T.subFrom, T.subTo, t);
}

/** The footer line's alpha at local t. */
export function footerAlpha(t: number): number {
  return smooth(T.footFrom, T.footTo, t);
}

export interface WordmarkLayout {
  fontPx: number;
  /** Box height, CSS px. */
  height: number;
  /** Box centre y and bottom, CSS px. */
  centreY: number;
  bottom: number;
}

/** The wordmark's size and place for a frame (the `display-xxl` size, centred in the sky above the tree). */
export function wordmarkLayout(css: readonly [number, number]): WordmarkLayout {
  const fontPx = Math.max(
    T.fontMin,
    Math.min(T.fontMax, T.fontBase + T.fontVw * css[0], T.fontHeightShare * css[1]),
  );
  const height = fontPx * T.boxEm;
  const centreY = Math.max(T.centreY * css[1], T.topRule + height / 2 + 4);
  return { fontPx, height, centreY, bottom: centreY + height / 2 };
}

/** The wordmark's letters, for the staggered print-in. */
export const WORD_LETTERS = Array.from(finale.wordmark);

/** HUD readout over the finale. */
export function finaleHudLines(t: number): string[] {
  return [
    `finale cover ${coverAt(t).toFixed(3)} pour ${pourGain(t).toFixed(2)}`,
    `word ${wordAt(t).toFixed(3)} sub ${subtitleAlpha(t).toFixed(2)} foot ${footerAlpha(t).toFixed(2)}`,
  ];
}
