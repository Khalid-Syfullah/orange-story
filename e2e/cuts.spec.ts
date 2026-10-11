// docs/CHECKS.md, per cut of docs/TRANSITIONS.md: the scrub test, the pop test, the still-frame
// test, and the edge test at the crest of every printed front (the Split's first). Every frame is
// drawn by the stage's test hook at the clock page.clock holds (src/stage/dev/testHook.ts), so frames
// are a function of p and the same run to run. One capture per cut (40 increments forward, then
// back) feeds its three tests.
import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureCut, STEPS, type CutCapture } from "./lib/capture";
import { pAtCut, readCuts, ROOT } from "./lib/cuts";
import { land, mixProbe, openStage, probe, settle, type Probe } from "./lib/stage";

const STILLS_DIR = path.join(ROOT, "docs", "screenshots", "cuts");

/**
 * The scrub's allowance. The clock is fixed, so the breath is the same going forward and coming
 * back: what may differ is rounding, never a picture. Mean difference per channel (0..255) and the
 * share of pixels that differ visibly (more than 8 in a channel).
 */
const SCRUB_MEAN = 0.5;
const SCRUB_VISIBLE = 0.001;
/** A cut must change the picture across its range: its first and last frames differ visibly over this share. */
const SPAN_VISIBLE = 0.05;
/** The crest is on screen at a step when its band covers this share of the frame. */
const CREST_MIN = 0.005;
/** A still is a picture, not a blank: it has structure larger than a pixel (image.ts pictureStats). */
const STILL_STRUCTURE = 1;

async function newPage(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  return { context, page: await context.newPage() };
}

for (const cut of readCuts()) {
  test.describe(`cut ${cut.slug}: ${cut.name}, p ${cut.from}–${cut.to}`, () => {
    let cap: CutCapture;

    test.beforeAll(async ({ browser }, info) => {
      info.setTimeout(10 * 60_000);
      const { context, page } = await newPage(browser, info);
      await openStage(page, { p: cut.from });
      cap = await captureCut(page, cut);
      await context.close();
    });

    test("scrub: forward and backward frames match at every step (breath only)", () => {
      // The cut does something across its range (docs/TRANSITIONS.md's p column is where it runs).
      expect(cap.span.over8, `${cut.name} changes ${(cap.span.over8 * 100).toFixed(1)}% of the frame from p ${cut.from} to ${cut.to}`).toBeGreaterThan(SPAN_VISIBLE);
      const worst = cap.scrub
        .map((s, i) => ({ i, t: i / STEPS, ...s }))
        .sort((a, b) => b.mean - a.mean)[0];
      const bad = cap.scrub.flatMap((s, i) => (s.mean > SCRUB_MEAN || s.over8 > SCRUB_VISIBLE ? [{ t: i / STEPS, mean: s.mean, over8: s.over8 }] : []));
      const line = `worst step t ${worst.t.toFixed(3)}: mean ${worst.mean.toFixed(3)}, ${(worst.over8 * 100).toFixed(3)}% of pixels over 8; first to last frame ${(cap.span.over8 * 100).toFixed(1)}% changed`;
      test.info().annotations.push({ type: "scrub", description: line });
      console.log(`[scrub] ${cut.slug}: ${line}`);
      expect(bad, `steps whose forward and backward frames differ`).toEqual([]);
    });

    test("pop: the largest change is at the crest, nothing outside it switches on", () => {
      const crestSteps = cap.pops.filter((s) => s.crestShare >= CREST_MIN);
      const largest = cap.pops.reduce((a, b) => (b.topTile > a.topTile ? b : a));
      const at = `t ${(largest.i / STEPS).toFixed(3)}, tile mean ${largest.topTile.toFixed(1)}`;
      const line = `largest change at ${at}, ${largest.topTileInCrest ? "at the crest" : "away from the crest"}; crest on screen at ${crestSteps.length} of ${cap.pops.length} steps; ${cap.switches.length} switches; ${cap.contentSteps} steps judged with the sequences held`;
      test.info().annotations.push({ type: "pop", description: line });
      console.log(`[pop] ${cut.slug}: ${line}`);
      if (cut.hasFront) {
        expect(crestSteps.length, `${cut.name} has a front: its crest should be on screen`).toBeGreaterThan(0);
        expect(largest.topTileInCrest, `the largest change (${at}) sits at the crest`).toBe(true);
      }
      expect(
        cap.switches.map((p) => ({ t: p.step / STEPS, tiles: p.tiles, box: p.box, value: +p.value.toFixed(1), around: +p.around.toFixed(1) })),
        `regions outside the crest that switched on`,
      ).toEqual([]);
    });

    test("still frames at t = 0.2, 0.5, 0.8 exist and are pictures", () => {
      mkdirSync(STILLS_DIR, { recursive: true });
      expect(cap.missing, "art that failed to load while the cut was drawn").toEqual([]);
      for (const s of cap.stills) {
        const file = path.join(STILLS_DIR, `${cut.slug}-${s.t}.png`);
        writeFileSync(file, s.png);
        expect(statSync(file).size, file).toBeGreaterThan(10_000);
        expect(s.stats.blockStd, `${file} is not blank or a flat fill`).toBeGreaterThan(STILL_STRUCTURE);
      }
      expect(cap.stills.map((s) => s.t)).toEqual([0.2, 0.5, 0.8]);
    });
  });
}

/**
 * The edge test's measures, over the boundary pixels (where the print reaches the front, the pass's
 * PROBE_MIX): the share caught between the two pictures (an alpha ramp leaves the share of its width
 * in the boundary; a print leaves only its anti-aliasing), and the share the print has put on the
 * other side of the front than its own (a clean line puts none there; a print, dots and stipple).
 */
function boundary(mix: Probe, zone: Probe): { pixels: number; between: number; flipped: number } {
  let pixels = 0;
  let between = 0;
  let flipped = 0;
  for (let i = 0; i < mix.dist.length; i++) {
    const m = mix.dist[i];
    const side = zone.dist[i];
    if (Number.isNaN(m) || Number.isNaN(side)) continue;
    pixels++;
    if (m > 0.1 && m < 0.9) between++;
    // The zone probe is + ahead of the front (the old picture, mix 0) and - behind it (the new, mix 1).
    else if (m >= 0.5 !== side < 0) flipped++;
  }
  return { pixels, between: between / Math.max(1, pixels), flipped: flipped / Math.max(1, pixels) };
}

const fmtEdge = (b: ReturnType<typeof boundary>) => `${b.pixels} px, ${(b.between * 100).toFixed(1)}% between, ${(b.flipped * 100).toFixed(1)}% across`;

/** An alpha ramp leaves pixels between the pictures; a print at most this share (its anti-aliasing). */
const EDGE_BETWEEN = 0.15;
/**
 * A print puts pixels across the front; a clean line puts none. With the page's print (Bayer 0.03
 * and stipple 0.02, a trapezoid of offsets to +-0.024, through a +-0.004 smoothstep) about a tenth of
 * the pixels it reaches land across the front; at least half of that is required.
 */
const EDGE_FLIPPED = 0.05;

/**
 * The cuts whose front hands one picture to the other through a printed boundary (lib.glsl.ts
 * printEdge, then a smoothstep), each at a local t where its crest crosses the middle of the frame.
 * The print-ins (the moire, the rise) print through halftone dots by construction, and the soak lays
 * ink down in amounts, so they have no two-picture boundary to test.
 */
const EDGES = [
  { slug: "bridge", t: 0.3 },
  { slug: "split", t: 0.4 },
  { slug: "close", t: 0.5 },
  { slug: "matchcut", t: 0.5 },
] as const;

test.describe("edge", () => {
  test("the measure tells a print from a bare front (the Split, with and without its print)", async ({ page }) => {
    const split = readCuts().find((c) => c.slug === "split")!;
    const p = pAtCut(split, 0.4);
    await openStage(page, { p });
    await land(page, p);
    const printed = boundary((await mixProbe(page))!, (await probe(page))!);
    // The same frame with the print taken out (Bayer and stipple at 0, through the Split's live tune).
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("tune", "bayer:0,stipple:0");
      window.history.replaceState(window.history.state, "", url);
    });
    await settle(page);
    const bare = boundary((await mixProbe(page))!, (await probe(page))!);
    test.info().annotations.push({ type: "edge", description: `Split printed: ${fmtEdge(printed)}; bare front: ${fmtEdge(bare)}` });
    console.log(`[edge] the measure, on the Split at t 0.4: printed ${fmtEdge(printed)}; print taken out ${fmtEdge(bare)}`);
    expect(bare.pixels).toBeGreaterThan(500);
    expect(bare.flipped, "without the print nothing crosses the front").toBeLessThan(0.02);
    expect(printed.flipped - bare.flipped, "the print is what puts pixels across the front").toBeGreaterThan(EDGE_FLIPPED);
  });

  for (const { slug, t } of EDGES) {
    test(`${slug}: the crest prints as dots and stipple, not an alpha ramp or a clean line`, async ({ page }) => {
      const cut = readCuts().find((c) => c.slug === slug);
      expect(cut, `docs/TRANSITIONS.md lists the ${slug} cut`).toBeTruthy();
      const p = pAtCut(cut!, t);
      await openStage(page, { p });
      await land(page, p);
      const b = boundary((await mixProbe(page))!, (await probe(page))!);
      test.info().annotations.push({ type: "edge", description: `${slug} at t ${t}: ${fmtEdge(b)}` });
      console.log(`[edge] ${slug} at t ${t}: ${fmtEdge(b)}`);
      expect(b.pixels, "the crest's boundary is on screen").toBeGreaterThan(2000);
      expect(b.between, "boundary pixels between the two pictures (an alpha ramp)").toBeLessThan(EDGE_BETWEEN);
      expect(b.flipped, "boundary pixels the print puts across the front (dots and stipple)").toBeGreaterThan(EDGE_FLIPPED);
    });
  }
});
