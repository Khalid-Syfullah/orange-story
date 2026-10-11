// Frame arithmetic for the checks: differences, masks and picture statistics. Values are 0..255
// throughout (a change of 1 is one step of an 8-bit channel).
import type { Probe, Raw } from "./stage";

/** Per-pixel change between two frames: the largest of the three channels' absolute differences. */
export function delta(a: Raw, b: Raw): Uint8Array {
  if (a.width !== b.width || a.height !== b.height) throw new Error("frames differ in size");
  const n = a.width * a.height;
  const out = new Uint8Array(n);
  const A = a.data;
  const B = b.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const dr = Math.abs(A[j] - B[j]);
    const dg = Math.abs(A[j + 1] - B[j + 1]);
    const db = Math.abs(A[j + 2] - B[j + 2]);
    out[i] = dr > dg ? (dr > db ? dr : db) : dg > db ? dg : db;
  }
  return out;
}

export interface DiffStats {
  /** Mean absolute difference over every channel of every pixel. */
  mean: number;
  /** Share of pixels whose largest channel difference exceeds 8 and 24 (visible, and plainly visible). */
  over8: number;
  over24: number;
  max: number;
}

export function diffStats(a: Raw, b: Raw): DiffStats {
  const n = a.width * a.height;
  let sum = 0;
  let o8 = 0;
  let o24 = 0;
  let max = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const dr = Math.abs(a.data[j] - b.data[j]);
    const dg = Math.abs(a.data[j + 1] - b.data[j + 1]);
    const db = Math.abs(a.data[j + 2] - b.data[j + 2]);
    sum += dr + dg + db;
    const m = Math.max(dr, dg, db);
    if (m > 8) o8++;
    if (m > 24) o24++;
    if (m > max) max = m;
  }
  return { mean: sum / (3 * n), over8: o8 / n, over24: o24 / n, max };
}

/** Rec. 601 luma of a pixel, 0..255. */
export const lumaAt = (raw: Raw, i: number): number =>
  0.299 * raw.data[i * 4] + 0.587 * raw.data[i * 4 + 1] + 0.114 * raw.data[i * 4 + 2];

export interface PictureStats {
  /** Standard deviation of luma over the frame. */
  lumaStd: number;
  /**
   * Standard deviation of the frame's 16x16 block means of luma: structure larger than a pixel. A
   * cleared canvas or a flat fill (grain and all) has none (a flat sky with the film grain: 0.13);
   * the faintest picture on the page, the bare sheet with a ghost of the parchment, about 2.3.
   */
  blockStd: number;
}

/** Enough to tell a picture from a blank or a flat fill. */
export function pictureStats(raw: Raw): PictureStats {
  const { width: w, height: h } = raw;
  const n = w * h;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const l = lumaAt(raw, i);
    s += l;
    s2 += l * l;
  }
  const mean = s / n;
  const B = 16;
  let bs = 0;
  let bs2 = 0;
  let blocks = 0;
  for (let by = 0; by + B <= h; by += B) {
    for (let bx = 0; bx + B <= w; bx += B) {
      let t = 0;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) t += lumaAt(raw, y * w + x);
      const m = t / (B * B);
      bs += m;
      bs2 += m * m;
      blocks++;
    }
  }
  const bm = bs / Math.max(1, blocks);
  return { lumaStd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), blockStd: Math.sqrt(Math.max(0, bs2 / Math.max(1, blocks) - bm * bm)) };
}

/** The crest band of a probe: pixels within `w` frame heights of a front. */
export function crestMask(p: Probe | null, w: number): Uint8Array | null {
  if (!p) return null;
  const out = new Uint8Array(p.dist.length);
  let any = false;
  for (let i = 0; i < out.length; i++) {
    const d = p.dist[i];
    if (!Number.isNaN(d) && Math.abs(d) <= w) {
      out[i] = 1;
      any = true;
    }
  }
  return any ? out : null;
}

/** Union of two masks (either may be null). */
export function union(a: Uint8Array | null, b: Uint8Array | null): Uint8Array | null {
  if (!a) return b;
  if (!b) return a;
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] | b[i];
  return out;
}

/** Grow a mask by r pixels (a square neighbourhood), separably. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) run = x;
      tmp[y * w + x] = x - run <= r ? 1 : 0;
    }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) run = x;
      if (run - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      out[y * w + x] = y - run <= r ? 1 : 0;
    }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

export function count(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}
