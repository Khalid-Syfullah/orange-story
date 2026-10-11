// The pen: how far along its centre line each stroke of the handwritten word has been drawn at the
// word's own clock `g` (0..1). Strokes follow one another (src/content/handwriting.ts carries their
// share of the time, pen lifts between); within a stroke the pen is never linear: its speed goes
// 1 - cos(2 pi x), zero where it touches down and lifts, fastest in the middle, and inside that the
// stroke's own pen-speed table slows it again where the line turns (the generated tables, one per
// stroke, are the share of the stroke's time spent by each arc fraction).
import type { HandwritingStroke } from "@/content/handwriting";

/** The stroke's drawn share of its length, 0..1, at the word's clock `g`. */
export function penProgress(stroke: HandwritingStroke, g: number): number {
  const x = (g - stroke.from) / (stroke.to - stroke.from);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Time through the stroke with the pen at rest at both ends (derivative 1 - cos(2 pi x)).
  const time = x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
  // The arc fraction reached at that time: the pen-speed table, inverted.
  const table = stroke.table;
  const n = table.length - 1;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= time) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo];
  const k = span > 1e-6 ? (time - table[lo]) / span : 0;
  return Math.min(1, (lo + k) / n);
}
