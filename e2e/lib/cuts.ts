// The cuts under test: every row of the table under "## The cuts" in docs/TRANSITIONS.md, with its
// scroll range read from the p column. A row the suite has no slug for fails the suite, so a cut
// added to the doc is never skipped silently.
import { readFileSync } from "node:fs";
import path from "node:path";
import { segments, type SegmentId } from "../../src/stage/script";

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
  "Model → Work": "split",
  "Work → sheet": "parchment",
  "Sheet → drawing": "soak",
  "Drawing → panel": "drawing",
  "Sheet → blue": "close",
  "Halo → canopy": "matchcut",
  "Questions → Application": "moire",
  "Application → finale": "rise",
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
    const from = Number(m[1]);
    const to = Number(m[2]);
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
