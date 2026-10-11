// Driving the stage through its test hook (`window.__stage`, src/stage/dev/testHook.ts) and reading
// its frames. Every frame is drawn by the hook on demand, at the progress set with setP and the
// time page.clock holds, after every texture it samples has arrived (ready()), with the video loops
// held at one frame: so a frame is a function of p alone and reproducible run to run.
import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

/** The fixed clock the visual tests install: midnight, 1 January 2026 (UTC). */
export const FIXED_TIME = Date.UTC(2026, 0, 1);
/** Where the loops are held, seconds into each. */
export const LOOP_AT = 1.5;

export interface Raw {
  width: number;
  height: number;
  /** RGBA, row-major, top row first. */
  data: Uint8Array;
}

export interface OpenOptions {
  /** Where to land (a deep link, `/?p=`). */
  p?: number;
  /** Install page.clock and pause it once the stage is up (reproducible frames). Default true. */
  fixedClock?: boolean;
  /** Hold the video loops at LOOP_AT. Default true. */
  holdLoops?: boolean;
}

/** Open the story with the hook up, at `p`, the clock fixed and the loops held. */
export async function openStage(page: Page, opts: OpenOptions = {}): Promise<void> {
  const { p = 0, fixedClock = true, holdLoops = true } = opts;
  if (fixedClock) await page.clock.install({ time: FIXED_TIME });
  await page.goto(`/?p=${p}`);
  await expect.poll(() => page.evaluate(() => typeof window.__stage === "object"), { timeout: 60_000 }).toBe(true);
  // Let the first frames run (programs compile on the first draws, near assets start loading).
  if (fixedClock) await page.clock.runFor(500);
  else await page.waitForTimeout(500);
  if (holdLoops) await page.evaluate((at) => window.__stage!.holdLoops(at), LOOP_AT);
  if (fixedClock) await page.clock.pauseAt(FIXED_TIME + 60_000);
  await settle(page);
}

/** Wait until every texture the current frame samples is exactly the one it wants. */
export async function settle(page: Page, timeout = 60_000): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__stage!.ready()), { timeout, intervals: [20, 50, 100, 250, 500] })
    .toBe(true);
}

/** Land at p (no glide) and wait for its textures. */
export async function land(page: Page, p: number): Promise<void> {
  await page.evaluate((v) => window.__stage!.setP(v), p);
  await settle(page);
}

export async function decode(png: Uint8Array): Promise<Raw> {
  const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

/** The frame at the current p as PNG bytes (the hook draws it now; at `vel` px a frame of scroll speed when given). */
export async function framePng(page: Page, vel?: number): Promise<Uint8Array> {
  const bytes = await page.evaluate((v) => window.__stage!.frame(v ?? undefined), vel ?? null);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes as Record<string, number>));
}

/** The frame at the current p, decoded. */
export async function frame(page: Page, vel?: number): Promise<Raw> {
  return decode(await framePng(page, vel));
}

export interface Probe {
  width: number;
  height: number;
  /**
   * Each pixel's place across the cut's crest zone (lib.glsl.ts PROBE): |x| <= 1 inside it, + ahead
   * of the front, - behind it; NaN where the pass recorded no crest (a fast path, or no front).
   */
  dist: Float32Array;
}

async function probePng(page: Page, what: "zone" | "mix"): Promise<Uint8Array> {
  const bytes = await page.evaluate((w) => window.__stage!.probe(w), what);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(Object.values(bytes as Record<string, number>));
}

/**
 * A printed boundary's mix per pixel at the current p (lib.glsl.ts PROBE_MIX): how much of the new
 * picture the pixel shows after the print, 0..1; NaN where the pass recorded no boundary.
 */
export async function mixProbe(page: Page): Promise<Probe | null> {
  const png = await probePng(page, "mix");
  if (png.length === 0) return null;
  const raw = await decode(png);
  const n = raw.width * raw.height;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = raw.data[i * 4 + 2] > 127 ? raw.data[i * 4] / 255 : Number.NaN;
  return { width: raw.width, height: raw.height, dist };
}

/** The cut's crest zone per pixel at the current p, or null when the pass has no probe build. */
export async function probe(page: Page): Promise<Probe | null> {
  const png = await probePng(page, "zone");
  if (png.length === 0) return null;
  const raw = await decode(png);
  const n = raw.width * raw.height;
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = raw.data[i * 4];
    const g = raw.data[i * 4 + 1];
    const b = raw.data[i * 4 + 2];
    dist[i] = b > 127 ? ((r + g / 255) / 255 - 0.5) * 16 : Number.NaN;
  }
  return { width: raw.width, height: raw.height, dist };
}
