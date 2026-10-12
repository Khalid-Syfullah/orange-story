// Phase 22: the match cut on the gilded orange and the knife's slice (docs/TRANSITIONS.md, the row
// "Graft → grove → share", docs/CHECKS.md). Two halves:
//
//   - the numbers, without a browser: where the fruit sits on screen on each side of the match cut at five
//     frame sizes (the TS twins of the shader's mapping, passes/model/match.ts), that the share's camera has
//     no jump and no velocity kink and never shows the painting's edge, and the slice's timing;
//   - the pictures, through the stage's test hook: the match cut's frames with a marker at the fruit's
//     centre (drawn here, not in the product), the slice's frames at t = 0.2, 0.5 and 0.8 in
//     docs/screenshots/model-*.png, its front printing as dots and stipple, scrubbing forward and back giving
//     the same frames, the beat starting on the study and ending on the second keyframe exactly, and the
//     Model's last frame being the Split's first.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { art } from "../src/content/art";
import { bandFor, setBand } from "../src/stage/band";
import { REST } from "../src/stage/passes/rest";
import { SCROLL_UNIT, segment } from "../src/stage/script";
import { GROVE_TEX, matchViews, matchWeight, SHARE_TEX, shareMatch, type FruitView } from "../src/stage/passes/model/match";
import { SLICE_TUNE, sliceDirection } from "../src/stage/passes/model/slice";
import {
  CUTS,
  cutAt,
  MATCH_AT,
  MODEL_UNITS,
  RAMP,
  sliceEase,
  SLICE,
  SLICE_UNITS,
  TYPE_TO,
  typedProgress,
} from "../src/stage/passes/model/timeline";
import { coverScale } from "../src/stage/framing";
import { diffStats, pictureStats } from "./lib/image";
import { ROOT } from "./lib/cuts";
import { decode, framePng, land, mixProbe, openStage, probe, type Probe } from "./lib/stage";

/** The five sizes the match cut is held at: a laptop, a desktop, an ultrawide, an upright tablet and the phone band. */
const SIZES: readonly { name: string; w: number; h: number }[] = [
  { name: "1440x900", w: 1440, h: 900 },
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "2560x1080", w: 2560, h: 1080 },
  { name: "820x1180", w: 820, h: 1180 },
  { name: "390x844", w: 390, h: 844 },
];

/** The picture's frame at a viewport (the phone's band is 0.6 of the height), with the layout state the phone pan reads. */
function frameOf(w: number, h: number): readonly [number, number] {
  const band = bandFor(w, h);
  setBand(band);
  return [w, Math.round(h * band)];
}

const pxOf = (v: FruitView, css: readonly [number, number]) => ({ x: v.x * css[0], y: v.y * css[1], r: v.r * css[0] });

test.describe("the match cut, numbers", () => {
  test.afterEach(() => setBand(1));

  test("the gilded orange is at the same place and size on both sides at the cut's middle, at five sizes (1 px)", () => {
    const worst: string[] = [];
    for (const { name, w, h } of SIZES) {
      const css = frameOf(w, h);
      // The rest state (pointer parallax and ambient drift, painting units) at its widest, in both signs: the share's is scaled so the fruit moves as the grove's does.
      const rests = [
        { x: 0, y: 0 },
        { x: REST.pointer.x + REST.drift, y: REST.pointer.y + REST.drift },
        { x: -(REST.pointer.x + REST.drift), y: REST.pointer.y - REST.drift },
      ];
      for (const rest of rests) {
        const v = matchViews(MATCH_AT, css, rest);
        const g = pxOf(v.grove, css);
        const s = pxOf(v.share, css);
        const d = { x: Math.abs(g.x - s.x), y: Math.abs(g.y - s.y), r: Math.abs(g.r - s.r) };
        worst.push(`${name}: centre off by ${d.x.toFixed(4)}, ${d.y.toFixed(4)} px, radius by ${d.r.toFixed(4)} px (rest ${rest.x.toFixed(4)},${rest.y.toFixed(4)})`);
        expect(d.x, `${name}: centre x, rest ${JSON.stringify(rest)}`).toBeLessThanOrEqual(1);
        expect(d.y, `${name}: centre y`).toBeLessThanOrEqual(1);
        expect(d.r, `${name}: radius`).toBeLessThanOrEqual(1);
        expect(v.weight).toBe(1);
      }
      // ... and everywhere the share is on screen before the middle, the grove side being the camera's own.
      const cut = CUTS[2];
      for (let x = cut.from; x <= MATCH_AT; x += 5) {
        const v = matchViews(x, css);
        const g = pxOf(v.grove, css);
        const s = pxOf(v.share, css);
        expect(Math.abs(g.x - s.x), `${name} at ${x}`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.y - s.y), `${name} at ${x}`).toBeLessThanOrEqual(1);
        expect(Math.abs(g.r - s.r), `${name} at ${x}`).toBeLessThanOrEqual(1);
      }
    }
    console.log(`[match] ${worst.join("\n[match] ")}`);
  });

  test("the share's camera has no jump and no velocity kink, and neither picture shows the painting's edge", () => {
    for (const { name, w, h } of SIZES) {
      const css = frameOf(w, h);
      // A path in screen terms: the share keyframe's fruit centre and radius, and the framing's log zoom, once a unit.
      const path: { px: number; py: number; pr: number; lz: number; pan: number }[] = [];
      for (let x = CUTS[2].from - 40; x <= MODEL_UNITS; x += 1) {
        const m = shareMatch(x, css);
        const f = m.framing;
        // The painting edge: its visible window (half-width cs / (2 zoom) at the smallest breath) plus the pan and the rest state's reach stays inside 0.5.
        for (const [tex, framing, who] of [
          [SHARE_TEX, f, "share"],
          [GROVE_TEX, m.grove, "grove"],
        ] as const) {
          if (who === "grove" && x > CUTS[2].to) continue;
          const cs = coverScale(css, tex);
          const z = framing.zoom * (1 - REST.breath);
          const slackX = 0.5 - cs[0] / (2 * z) - Math.abs(framing.pan.x) - REST.pointer.x - REST.drift;
          const slackY = 0.5 - cs[1] / (2 * z) - Math.abs(framing.pan.y) - REST.pointer.y - REST.drift;
          expect(slackX, `${name} ${who} at ${x}: the painting's edge shows on x`).toBeGreaterThanOrEqual(-1e-9);
          expect(slackY, `${name} ${who} at ${x}: the painting's edge shows on y`).toBeGreaterThanOrEqual(-1e-9);
        }
        const v = matchViews(x, css).share;
        const s = pxOf(v, css);
        path.push({ px: s.x, py: s.y, pr: s.r, lz: Math.log(f.zoom), pan: f.pan.x });
      }
      // No jump: a unit moves the fruit by pixels, not tens of them. No kink: the speed does not change by more than a small share of the fastest speed from one unit to the next.
      let maxStep = 0;
      let maxSpeed = 0;
      let maxKink = 0;
      for (let i = 1; i < path.length; i++) {
        const step = Math.hypot(path[i].px - path[i - 1].px, path[i].py - path[i - 1].py);
        maxStep = Math.max(maxStep, step);
        maxSpeed = Math.max(maxSpeed, step, Math.abs(path[i].pr - path[i - 1].pr));
      }
      for (let i = 2; i < path.length; i++) {
        const a = Math.hypot(path[i].px - path[i - 1].px, path[i].py - path[i - 1].py);
        const b = Math.hypot(path[i - 1].px - path[i - 2].px, path[i - 1].py - path[i - 2].py);
        const dr = Math.abs(path[i].pr - path[i - 1].pr) - Math.abs(path[i - 1].pr - path[i - 2].pr);
        maxKink = Math.max(maxKink, Math.abs(a - b), Math.abs(dr));
      }
      console.log(`[match] ${name}: the share's fruit moves at most ${maxStep.toFixed(2)} px a unit, the speed changes by at most ${maxKink.toFixed(3)} px a unit`);
      expect(maxStep, `${name}: no jump`).toBeLessThan(0.02 * css[0]);
      expect(maxKink, `${name}: no velocity kink`).toBeLessThan(0.03 * Math.max(maxSpeed, 1));
    }
  });

  test("the match weight is 1 through the cut's middle and 0 at the segment's end, and the camera lands exactly on rest", () => {
    expect(matchWeight(0)).toBe(1);
    expect(matchWeight(MATCH_AT)).toBe(1);
    expect(matchWeight(MODEL_UNITS)).toBe(0);
    // No speed at either end of the fall.
    const h = 0.01;
    expect((1 - matchWeight(MATCH_AT + h)) / h, "no speed where it starts to fall").toBeLessThan(0.01);
    expect(matchWeight(MODEL_UNITS - h) / h, "no speed where it lands").toBeLessThan(0.01);
    for (const { w, h: hh } of SIZES) {
      const css = frameOf(w, hh);
      const m = shareMatch(MODEL_UNITS, css);
      expect([m.camera.pan.x, m.camera.pan.y, m.camera.zoom, m.offScale]).toEqual([0, 0, 1, 1]);
    }
  });

  test("the match cut disc and the fruit anchors come from art.ts", () => {
    expect(art.grove.matchDisc.radius).toBeGreaterThan(1);
    expect(art.grove.matchDisc.soft).toBeGreaterThan(0);
    expect(art.grove.gilded.r).toBeGreaterThan(art.share.fruit.r);
  });
});

test.describe("the slice, numbers", () => {
  test("it is about 150 units, starts after the typed line has finished, ends before the segment does and is the share's own cut", () => {
    expect(SLICE_UNITS).toBe(150);
    expect(SLICE.to - SLICE.from).toBe(SLICE_UNITS);
    expect(SLICE.kind).toBe("slice");
    expect(SLICE.from, "the line is typed before the knife meets the orange").toBeGreaterThan(TYPE_TO);
    expect(typedProgress(SLICE.from)).toBe(1);
    expect(MODEL_UNITS - SLICE.to, "rests on the keyframe for the last units").toBeGreaterThanOrEqual(20);
    // The copy has not begun to leave when the slice starts (it leaves over the last RAMP units).
    expect(SLICE.from).toBeLessThan(MODEL_UNITS - RAMP);
    // It is the share keyframe handing over to the second, and holds before and after.
    expect(cutAt(SLICE.from - 1)).toEqual({ a: 3, b: 3, s: 0, kind: "static" });
    expect(cutAt(SLICE.from).kind).toBe("slice");
    expect(cutAt(SLICE.to)).toMatchObject({ a: 3, b: 4, s: 1, kind: "slice" });
    expect(cutAt(SLICE.to + 1)).toEqual({ a: 4, b: 4, s: 0, kind: "static" });
  });

  test("the front starts from rest, accelerates, never goes back and ends exactly at 1", () => {
    expect(sliceEase(0)).toBe(0);
    expect(sliceEase(1)).toBe(1);
    expect(sliceEase(-1)).toBe(0);
    expect(sliceEase(2)).toBe(1);
    const h = 1e-4;
    expect(sliceEase(h) / h, "rule 4: from rest").toBeLessThan(0.05);
    let prev = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = sliceEase(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Accelerating through the middle (the blade picks up speed): faster over the second half than the first.
    expect(sliceEase(1) - sliceEase(0.5)).toBeGreaterThan(sliceEase(0.5) - sliceEase(0));
  });

  test("the knife's line is a point and an angle in the painting, on the share's fruit, and the front travels along it", () => {
    const k = art.share.knife;
    expect(Math.hypot(k.at.x - art.share.fruit.x, k.at.y - art.share.fruit.y), "the line passes through the fruit").toBeLessThan(art.share.fruit.r);
    const dir = sliceDirection();
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 12);
    expect(dir.x * Math.cos((k.angle * Math.PI) / 180) + dir.y * Math.sin((k.angle * Math.PI) / 180)).toBeCloseTo(k.travel, 12);
    for (const v of Object.values(SLICE_TUNE)) expect(Number.isFinite(v)).toBe(true);
  });
});

// ---- the pictures --------------------------------------------------------------------------------

const SHOTS = path.join(ROOT, "docs", "screenshots");
const model = segment("model");
const pAt = (units: number) => model.start + units * SCROLL_UNIT;

interface Viewport {
  name: string;
  w: number;
  h: number;
  dpr: number;
  mobile: boolean;
}
const VIEWPORTS: readonly Viewport[] = [
  { name: "1440", w: 1440, h: 900, dpr: 1, mobile: false },
  { name: "390", w: 390, h: 844, dpr: 3, mobile: true },
];

async function openAt(browser: Browser, vp: Viewport, units: number): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await context.newPage();
  // The phone's clock runs (as phone.spec.ts): its stills are looked at, never diffed.
  await openStage(page, { p: pAt(units), fixedClock: !vp.mobile });
  return { page, close: () => context.close() };
}

/** Draw a marker (a ring of the fruit's radius and a cross at its centre) on a frame, by the test and not by the product. */
async function marked(png: Uint8Array, view: FruitView, res: readonly [number, number]): Promise<Buffer> {
  const x = view.x * res[0];
  const y = view.y * res[1];
  const r = view.r * res[0];
  const t = Math.max(2, Math.round(res[0] / 400));
  const svg = `<svg width="${res[0]}" height="${res[1]}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#00e5ff" stroke-width="${t}"/>
    <line x1="${x - 6 * t}" y1="${y}" x2="${x + 6 * t}" y2="${y}" stroke="#ff2bd6" stroke-width="${t}"/>
    <line x1="${x}" y1="${y - 6 * t}" x2="${x}" y2="${y + 6 * t}" stroke="#ff2bd6" stroke-width="${t}"/></svg>`;
  return sharp(Buffer.from(png)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

test.describe("the match cut and the slice, pictures", () => {
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  for (const vp of VIEWPORTS) {
    test(`${vp.name}: the match cut before, in the middle and after, with a marker at the fruit's centre`, async ({ browser }, info) => {
      info.setTimeout(10 * 60_000);
      const { page, close } = await openAt(browser, vp, CUTS[2].from - 40);
      const st = await page.evaluate(() => window.__stage!.state());
      const css = st.css;
      const res = st.res;
      // The TS twins read the layout state (the phone's pan) from the band: set it as the live stage has it.
      setBand(st.band);
      // Before (the grove, 40 units ahead of the cut), the middle, and after (the share, the cut closed and the camera easing away).
      const steps = [
        { name: "before", x: CUTS[2].from - 40 },
        { name: "middle", x: MATCH_AT },
        { name: "after", x: CUTS[2].to + 6 },
      ];
      const centres: { name: string; x: number; y: number }[] = [];
      for (const s of steps) {
        await land(page, pAt(s.x));
        const png = await framePng(page);
        const raw = await decode(png);
        const v = matchViews(s.x, css);
        // Before the middle the fruit is the grove's; after it, the share's (the camera is easing it away from the match).
        const view = s.name === "after" ? v.share : v.grove;
        writeFileSync(path.join(SHOTS, `model-match-${vp.name}-${s.name}.png`), await marked(png, view, res));
        // The marker sits on orange-gold paint: the mean of a small window at the centre.
        const cx = Math.round(view.x * raw.width);
        const cy = Math.round(view.y * raw.height);
        const win = Math.max(3, Math.round(raw.width / 150));
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let yy = cy - win; yy <= cy + win; yy++) {
          for (let xx = cx - win; xx <= cx + win; xx++) {
            const i = (yy * raw.width + xx) * 4;
            r += raw.data[i];
            g += raw.data[i + 1];
            b += raw.data[i + 2];
            n++;
          }
        }
        r /= n;
        g /= n;
        b /= n;
        centres.push({ name: s.name, x: view.x * css[0], y: view.y * css[1] });
        expect(r, `${vp.name} ${s.name}: the fruit's centre is gilded orange (red)`).toBeGreaterThan(150);
        expect(r - b, `${vp.name} ${s.name}: ... and warm`).toBeGreaterThan(80);
        expect(g, `${vp.name} ${s.name}: ... not white paper`).toBeLessThan(215);
        expect(pictureStats(raw).blockStd, `${vp.name} ${s.name} is a picture`).toBeGreaterThan(1);
      }
      console.log(`[match] ${vp.name}: fruit centres (css px) ${centres.map((c) => `${c.name} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("; ")}`);
      expect(st.missing, "art that failed to load").toEqual([]);
      setBand(1);
      await close();
    });

    test(`${vp.name}: the slice at t = 0.2, 0.5 and 0.8 are pictures with a front in them`, async ({ browser }, info) => {
      info.setTimeout(10 * 60_000);
      const { page, close } = await openAt(browser, vp, SLICE.from);
      const first = await decode(await framePng(page));
      const seen: Awaited<ReturnType<typeof decode>>[] = [];
      for (const t of [0.2, 0.5, 0.8] as const) {
        await land(page, pAt(SLICE.from + SLICE_UNITS * t));
        const png = await framePng(page);
        writeFileSync(path.join(SHOTS, `model-slice-${vp.name}-${t}.png`), png);
        const raw = await decode(png);
        expect(pictureStats(raw).blockStd, `${vp.name} slice at ${t} is a picture`).toBeGreaterThan(1);
        seen.push(raw);
      }
      // Something is happening: each still differs from the study (the first frame) and from its neighbour.
      for (const [i, raw] of seen.entries()) expect(diffStats(first, raw).over8, `${vp.name}: the still ${i} differs from the study`).toBeGreaterThan(0.02);
      expect(diffStats(seen[0], seen[1]).over8).toBeGreaterThan(0.02);
      expect(diffStats(seen[1], seen[2]).over8).toBeGreaterThan(0.02);
      await close();
    });
  }
});

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
    else if (m >= 0.5 !== side < 0) flipped++;
  }
  return { pixels, between: between / Math.max(1, pixels), flipped: flipped / Math.max(1, pixels) };
}

test.describe("the slice, in the shader", () => {
  test("the front prints as dots and stipple: pixels across the front, none caught between the pictures", async ({ browser }, info) => {
    info.setTimeout(10 * 60_000);
    const { page, close } = await openAt(browser, VIEWPORTS[0], SLICE.from + SLICE_UNITS * 0.4);
    await land(page, pAt(SLICE.from + SLICE_UNITS * 0.4));
    const mix = await mixProbe(page);
    const zone = await probe(page);
    expect(mix, "the probe build is up").not.toBeNull();
    const b = boundary(mix!, zone!);
    console.log(`[slice] edge at 0.4: ${b.pixels} px, ${(b.between * 100).toFixed(1)}% between, ${(b.flipped * 100).toFixed(1)}% across`);
    expect(b.pixels, "the front's boundary is on screen").toBeGreaterThan(1000);
    expect(b.between, "boundary pixels between the two pictures (an alpha ramp)").toBeLessThan(0.15);
    expect(b.flipped, "boundary pixels the print puts across the front (dots and stipple)").toBeGreaterThan(0.05);
    await close();
  });

  test("scrubbing the share beat forward and back at a fixed clock gives the same frames", async ({ browser }, info) => {
    info.setTimeout(15 * 60_000);
    const { page, close } = await openAt(browser, VIEWPORTS[0], SLICE.from - 20);
    const from = SLICE.from - 20;
    const to = SLICE.to + 20;
    const steps = 20;
    const fwd: Awaited<ReturnType<typeof decode>>[] = [];
    for (let i = 0; i <= steps; i++) {
      await land(page, pAt(from + ((to - from) * i) / steps));
      fwd.push(await decode(await framePng(page)));
    }
    for (let i = steps; i >= 0; i--) {
      await land(page, pAt(from + ((to - from) * i) / steps));
      const back = await decode(await framePng(page));
      const d = diffStats(fwd[i], back);
      expect(d.mean, `step ${i}: forward and back differ`).toBeLessThanOrEqual(0.5);
      expect(d.over8, `step ${i}: forward and back differ`).toBeLessThanOrEqual(0.001);
    }
    await close();
  });

  test("the beat's slice begins on the study and ends on the second keyframe, and the Model's last frame is the Split's first", async ({ browser }, info) => {
    info.setTimeout(10 * 60_000);
    const { page, close } = await openAt(browser, VIEWPORTS[0], SLICE.from - 1);
    const frameAt = async (units: number) => {
      await land(page, pAt(units));
      return decode(await framePng(page));
    };
    // The slice's first frame is the study held just before it (a hundredth of a unit moves the camera by a fraction of a pixel).
    const hold = await frameAt(SLICE.from - 0.01);
    const open = await frameAt(SLICE.from);
    expect(diffStats(hold, open).over8, "the first frame of the slice is the study").toBeLessThan(1e-5);
    expect(diffStats(hold, open).mean).toBeLessThan(0.1);
    // ... and its last is the second keyframe held just after it, with nothing of the front or the lag left.
    const done = await frameAt(SLICE.to);
    const rest = await frameAt(SLICE.to + 0.01);
    expect(diffStats(done, rest).over8, "the last frame of the slice is the second keyframe").toBeLessThan(1e-5);
    expect(diffStats(done, rest).mean).toBeLessThan(0.1);
    // The Split opens on the Model's last frame: p at the segment's end, then just past it (the Split's t = 0).
    const end = await frameAt(MODEL_UNITS - 0.001);
    const split = segment("split");
    await land(page, split.start);
    const first = await decode(await framePng(page));
    const d = diffStats(end, first);
    console.log(`[slice] Model end vs Split t = 0: mean ${d.mean.toFixed(4)}, max ${d.max}, over8 ${d.over8}`);
    expect(d.max, "the Split at t = 0 is the Model's last frame").toBeLessThanOrEqual(2);
    expect(d.mean).toBeLessThan(0.05);
    await close();
  });
});
