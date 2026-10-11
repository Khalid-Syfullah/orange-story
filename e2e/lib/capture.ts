// One pass over a cut: step p across its range in STEPS increments forward, then back, drawing each
// frame through the hook at the fixed clock, and keep what the scrub, pop and still-frame tests read
// (statistics, not frames: a cut is about 80 frames of a megapixel each).
import type { Page } from "@playwright/test";
import { pAtCut, type Cut } from "./cuts";
import { count, crestMask, delta, diffStats, dilate, pictureStats, union, type DiffStats, type PictureStats } from "./image";
import { decode, framePng, land, probe, type Raw } from "./stage";

/** Increments across a cut (docs/CHECKS.md: 40). */
export const STEPS = 40;
/** The still frames' local t (docs/CHECKS.md: 0.2, 0.5, 0.8): steps 8, 20 and 32 of 40. */
export const STILL_T = [0.2, 0.5, 0.8] as const;
/**
 * The crest band: the zone each cut's shader reports through its probe (lib.glsl.ts PROBE), scaled
 * by that cut's own band widths so that |x| <= 1 is where its crest machinery acts (the Split's rind
 * ahead and its pith and lag behind, the static's tear and its mosaic and lag, the burn's char and
 * soot, the ring's light and lag, a print-in's dots).
 */
export const CREST_W = 1;
/** The band is grown by this many pixels (a front moves between two steps). */
export const CREST_GROW = 8;
/** Tiles for locating change, px. */
export const TILE = 32;
/** A tile is judged outside the band only if at least this share of it is outside the band. */
const OUTSIDE_SHARE = 0.25;
/**
 * A pop (a texture, a scrim or a glow switching on): a region of at least POP_TILES connected tiles
 * (64x64 px) that changed at one step by more than POP_RATIO times the largest change anywhere
 * within POP_REACH tiles (64 px) of it at the steps either side, and by more than POP_FLOOR (about
 * the film grain's own step-to-step difference). A moving edge, a cloud crossing or a fruit thrown,
 * was near the step before or after; something switching on was not.
 */
export const POP_RATIO = 3;
export const POP_FLOOR = 1.5;
export const POP_REACH = 2;
export const POP_TILES = 4;

export interface StepPop {
  /** Step i: the change from frame i to frame i + 1 (with the sequences held at frame i's, when they move). */
  i: number;
  /** Share of the frame inside the crest band at either step (0 when no front is on screen). */
  crestShare: number;
  /** Mean change over the frame, inside the crest band and outside it. */
  mean: number;
  meanIn: number;
  meanOut: number;
  /** The tile that changed most: its mean change, and whether the crest band touches it. */
  topTile: number;
  topTileInCrest: boolean;
  /** The largest change of a tile the crest band does not touch. */
  topOutside: number;
}

export interface Pop {
  step: number;
  /** The region's tiles, its bounding box in px (x, y, w, h) and its largest change. */
  tiles: number;
  box: [number, number, number, number];
  value: number;
  /** The largest change near it at the steps either side. */
  around: number;
}

interface FlaggedTile {
  col: number;
  row: number;
  value: number;
  around: number;
}

export interface CutCapture {
  cut: Cut;
  ps: number[];
  /** Forward frame i against backward frame i, at the same p. */
  scrub: DiffStats[];
  pops: StepPop[];
  /** Regions outside the crest band that changed at one step while nothing near them did either side. */
  switches: Pop[];
  /** Steps at which a frame sequence moved on (judged with the sequences held: the content's own motion is not a pop). */
  contentSteps: number;
  /** Assets that failed to load while the cut was drawn (a still with its painting missing is not a picture). */
  missing: string[];
  /** The first forward frame against the last: how much the cut changes the picture. */
  span: DiffStats;
  stills: { t: number; png: Uint8Array; stats: PictureStats }[];
  width: number;
  height: number;
}

interface Step {
  d: Uint8Array;
  band: Uint8Array | null;
}

/** Tile means of `d` over the pixels where `outside` is 1, NaN where too little of the tile is outside. */
function tileMeans(d: Uint8Array, outside: Uint8Array | null, w: number, h: number): Float32Array {
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const sum = new Float64Array(cols * rows);
  const cnt = new Uint32Array(cols * rows);
  const all = new Uint32Array(cols * rows);
  for (let y = 0; y < h; y++) {
    const ty = Math.floor(y / TILE) * cols;
    for (let x = 0; x < w; x++) {
      const k = ty + Math.floor(x / TILE);
      const i = y * w + x;
      all[k]++;
      if (outside && !outside[i]) continue;
      sum[k] += d[i];
      cnt[k]++;
    }
  }
  const out = new Float32Array(cols * rows);
  for (let k = 0; k < out.length; k++) out[k] = cnt[k] >= Math.max(1, all[k] * OUTSIDE_SHARE) ? sum[k] / cnt[k] : Number.NaN;
  return out;
}

/**
 * Judge step `s` (the middle of up to three) for pops, on the pixels outside every band of the three:
 * the tiles whose change beats everything within POP_REACH tiles at the steps either side, grouped
 * into connected regions, and the regions of POP_TILES or more kept.
 */
function judge(recent: (Step | null)[], s: number, w: number, h: number): Pop[] {
  const [a, b, c] = recent;
  if (!b) return [];
  let bands: Uint8Array | null = null;
  for (const st of recent) if (st) bands = union(bands, st.band);
  const outside = bands ? bands.map((v) => 1 - v) : null;
  const mb = tileMeans(b.d, outside, w, h);
  const ma = a ? tileMeans(a.d, outside, w, h) : null;
  const mc = c ? tileMeans(c.d, outside, w, h) : null;
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const flagged = new Map<number, FlaggedTile>();
  for (let k = 0; k < mb.length; k++) {
    const v = mb[k];
    if (!(v > POP_FLOOR)) continue;
    const col = k % cols;
    const row = Math.floor(k / cols);
    let around = 0;
    for (let dy = -POP_REACH; dy <= POP_REACH; dy++) {
      for (let dx = -POP_REACH; dx <= POP_REACH; dx++) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const n = y * cols + x;
        for (const m of [ma, mc]) if (m && m[n] > around) around = m[n];
      }
    }
    if (v > POP_RATIO * around + POP_FLOOR) flagged.set(k, { col, row, value: v, around });
  }
  // Connected regions (8-neighbours) of flagged tiles.
  const out: Pop[] = [];
  const seen = new Set<number>();
  for (const [k0] of flagged) {
    if (seen.has(k0)) continue;
    const stack = [k0];
    seen.add(k0);
    const group: FlaggedTile[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      const t = flagged.get(k)!;
      group.push(t);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = t.col + dx;
          const y = t.row + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const n = y * cols + x;
          if (flagged.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
    }
    if (group.length < POP_TILES) continue;
    const x0 = Math.min(...group.map((g) => g.col)) * TILE;
    const y0 = Math.min(...group.map((g) => g.row)) * TILE;
    const x1 = (Math.max(...group.map((g) => g.col)) + 1) * TILE;
    const y1 = (Math.max(...group.map((g) => g.row)) + 1) * TILE;
    out.push({
      step: s,
      tiles: group.length,
      box: [x0, y0, x1 - x0, y1 - y0],
      value: Math.max(...group.map((g) => g.value)),
      around: Math.max(...group.map((g) => g.around)),
    });
  }
  return out;
}

export async function captureCut(page: Page, cut: Cut): Promise<CutCapture> {
  const ps = Array.from({ length: STEPS + 1 }, (_, i) => pAtCut(cut, i / STEPS));
  const stillAt = new Map<number, number>(STILL_T.map((t) => [Math.round(t * STEPS), t]));
  const forward: Uint8Array[] = [];
  const pops: StepPop[] = [];
  const switches: Pop[] = [];
  const stills: CutCapture["stills"] = [];
  const recent: (Step | null)[] = [null, null, null];
  let prev: Raw | null = null;
  let prevCrest: Uint8Array | null = null;
  let first: Raw | null = null;
  let last: Raw | null = null;
  let contentSteps = 0;

  for (let i = 0; i <= STEPS; i++) {
    // Where a sequence would move on to another frame, first draw this p with the sequences' last
    // frames: the pop test judges that frame (the shader's change, the content held still).
    let pinned: Raw | null = null;
    if (prev && (await page.evaluate((p) => window.__stage!.sequencesMove(p), ps[i]))) {
      await page.evaluate(() => window.__stage!.pinFrames(true));
      await land(page, ps[i]);
      pinned = await decode(await framePng(page));
      await page.evaluate(() => window.__stage!.pinFrames(false));
      contentSteps++;
    }
    await land(page, ps[i]);
    const png = await framePng(page);
    forward.push(png);
    const raw = await decode(png);
    const crest = crestMask(await probe(page), CREST_W);
    const t = stillAt.get(i);
    if (t !== undefined) stills.push({ t, png, stats: pictureStats(raw) });
    if (i === 0) first = raw;
    if (i === STEPS) last = raw;
    if (prev) {
      const { width: w, height: h } = raw;
      const d = delta(prev, pinned ?? raw);
      const both = union(prevCrest, crest);
      const band = both ? dilate(both, w, h, CREST_GROW) : null;
      const inBand = band ? count(band) : 0;
      let sIn = 0;
      let sOut = 0;
      for (let k = 0; k < d.length; k++) {
        if (band && band[k]) sIn += d[k];
        else sOut += d[k];
      }
      const all = tileMeans(d, null, w, h);
      const cols = Math.ceil(w / TILE);
      const touched = new Uint8Array(all.length);
      if (band) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (band[y * w + x]) touched[Math.floor(y / TILE) * cols + Math.floor(x / TILE)] = 1;
      }
      let top = -1;
      let topK = -1;
      let topOut = 0;
      for (let k = 0; k < all.length; k++) {
        if (all[k] > top) {
          top = all[k];
          topK = k;
        }
        if (!touched[k] && all[k] > topOut) topOut = all[k];
      }
      pops.push({
        i: i - 1,
        crestShare: inBand / d.length,
        mean: (sIn + sOut) / d.length,
        meanIn: inBand > 0 ? sIn / inBand : 0,
        meanOut: d.length - inBand > 0 ? sOut / (d.length - inBand) : 0,
        topTile: top,
        topTileInCrest: topK >= 0 && touched[topK] === 1,
        topOutside: topOut,
      });
      // Slide the three-step window and judge its middle step.
      recent.shift();
      recent.push({ d, band });
      if (i >= 3) switches.push(...judge(recent, i - 2, w, h));
      if (i === 2) switches.push(...judge([null, recent[1], recent[2]], 0, w, h));
      if (i === STEPS) switches.push(...judge([recent[1], recent[2], null], STEPS - 1, w, h));
    }
    prev = raw;
    prevCrest = crest;
  }

  const scrub: DiffStats[] = new Array(STEPS + 1);
  for (let i = STEPS; i >= 0; i--) {
    await land(page, ps[i]);
    const back = await decode(await framePng(page));
    scrub[i] = diffStats(await decode(forward[i]), back);
  }

  if (!first || !last) throw new Error("no frames");
  const { missing } = await page.evaluate(() => window.__stage!.state());
  return { cut, ps, scrub, pops, switches, contentSteps, missing, span: diffStats(first, last), stills, width: first.width, height: first.height };
}
