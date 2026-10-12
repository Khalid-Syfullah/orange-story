// The cuts under test: every row of the table under "## The cuts" in docs/TRANSITIONS.md, with its
// scroll range read from the p column. A row the suite has no slug for fails the suite, so a cut
// added to the doc is never skipped silently.
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCROLL_UNIT, segment, segments, type SegmentId } from "../../src/stage/script";
import { FOREGROUND } from "../../src/stage/passes/model/timeline";

export interface Cut {
  /** The row's name in docs/TRANSITIONS.md ("Model → Work"). */
  name: string;
  /** The stills' file names: docs/screenshots/cuts/<slug>-<t>.png. */
  slug: string;
  /** The p column. */
  from: number;
  to: number;
  /** The crest column ("None" for the push into the parchment, which has no front). */
  crest: string;
  /** False for a cut whose crest column is "None": a push and a colour, nothing travels. */
  hasFront: boolean;
  /** The segments the range overlaps, in order. */
  segments: SegmentId[];
}

/** File-name slugs for the rows, keyed by the row's name. */
const SLUGS: Readonly<Record<string, string>> = {
  "Hero → Model": "bridge",
  "Graft → grove → share (inside The Model)": "model",
  "Model → Work": "split",
  "Work → sheet": "parchment",
  "Sheet → drawing": "soak",
  "Drawing → panel": "drawing",
  "Sheet → blue": "close",
  "Halo → canopy": "matchcut",
  "Questions → Application": "moire",
  "Application → finale": "rise",
};

/**
 * A cut whose row spans more than one gesture is tested over the gesture the suite can follow: 40 steps
 * across a row's whole p range would move a 70-unit cut by half its length per step. The Model's row
 * (graft -> grove -> share, p 0.07-0.19, twelve hundred scroll units with three cuts of seventy) is
 * followed across the push-through that opens the grove: the graft's leaves rushing across the lens as the
 * static treatment takes the graft to the canopy (passes/model/foreground.ts).
 */
const modelUnits = (u: number) => segment("model").start + u * SCROLL_UNIT;
const RANGES: Readonly<Record<string, readonly [number, number]>> = {
  // From the first leaf to 40 units after the last has gone (the grove's copy has begun to arrive by then).
  model: [modelUnits(FOREGROUND.push.from), modelUnits(FOREGROUND.push.to + 40)],
};

export const ROOT = path.resolve(__dirname, "..", "..");

export function readCuts(): Cut[] {
  const md = readFileSync(path.join(ROOT, "docs", "TRANSITIONS.md"), "utf8");
  const start = md.indexOf("## The cuts");
  if (start < 0) throw new Error("docs/TRANSITIONS.md has no '## The cuts' section");
  const section = md.slice(start, md.indexOf("\n## ", start + 4));
  const rows = section.split("\n").filter((l) => /^\|\s*[^|\s-]/.test(l) && !/^\|\s*Cut\s*\|/.test(l));
  const cuts = rows.map((row): Cut => {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    const [name, range, , crest] = cells;
    const m = /([0-9.]+)\s*[–-]\s*([0-9.]+)/.exec(range);
    if (!m) throw new Error(`docs/TRANSITIONS.md: no p range in the row "${name}"`);
    const slug = SLUGS[name];
    if (!slug) throw new Error(`docs/TRANSITIONS.md: the cut "${name}" has no slug in e2e/lib/cuts.ts`);
    const [from, to] = RANGES[slug] ?? [Number(m[1]), Number(m[2])];
    return {
      name,
      slug,
      from,
      to,
      crest,
      hasFront: !/^none\b/i.test(crest),
      segments: segments.filter((s) => s.start < to && s.end > from).map((s) => s.id),
    };
  });
  if (cuts.length === 0) throw new Error("docs/TRANSITIONS.md: the cuts table is empty");
  return cuts;
}

/** p at local t (0..1) of a cut's range. */
export const pAtCut = (cut: Cut, t: number): number => cut.from + (cut.to - cut.from) * t;
