import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compose, cutOut, edgeReport, formatManifest, guessRig, keyExcess, paintedEntry, planFit, remapPoint, remapRig, trimBox, visibleBox } from "./import-core.mjs";
import { FIGURE_SPANS, heightFor, spanOf } from "./world-scale.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** A W x H RGBA image filled with one colour, with an optional painted ellipse on it. */
function image(W, H, ground, figure = null) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = ground;
      if (figure) {
        const [cx, cy, rx, ry, colour] = figure;
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) c = colour;
      }
      px.set(c, i);
    }
  return px;
}

/** Pixels of an image whose alpha is above a level. */
const opaque = (rgba, level = 128) => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > level) n++;
  return n;
};

describe("key removal", () => {
  it("measures how far a colour leans to the key", () => {
    expect(keyExcess([255, 0, 255], [255, 0, 255])).toBeCloseTo(1);
    expect(keyExcess([233, 196, 166], [255, 0, 255])).toBe(0);
    expect(keyExcess([0, 255, 255], [0, 255, 255])).toBeCloseTo(1);
    expect(keyExcess([86, 112, 140], [255, 0, 255])).toBe(0);
  });

  it("cuts a figure out of a magenta ground with a soft matte and no coloured halo", () => {
    const W = 64;
    const H = 64;
    const src = image(W, H, [255, 0, 255, 255], [32, 32, 18, 24, [200, 160, 120, 255]]);
    const out = cutOut(src, W, H, { key: "magenta" });
    // The ground is gone, the figure stays.
    expect(out[3]).toBe(0);
    expect(out[(32 * W + 32) * 4 + 3]).toBe(255);
    const area = Math.PI * 18 * 24;
    expect(opaque(out)).toBeGreaterThan(area * 0.85);
    expect(opaque(out)).toBeLessThan(area * 1.05);
    // Every visible pixel has lost the key's cast.
    for (let i = 0; i < W * H; i++) if (out[i * 4 + 3] > 0) expect(keyExcess([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]], [255, 0, 255])).toBeLessThan(0.12);
    expect(edgeReport(out, W, H, "magenta").fringe).toBe(0);
  });

  it("pulls key spill out of the figure's edge (a pink rim on a cyan ground)", () => {
    const W = 48;
    const H = 48;
    // A figure with a 2 px rim already tinted by the cyan ground.
    const src = image(W, H, [0, 255, 255, 255], [24, 24, 16, 16, [90, 200, 205, 255]]);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - 24, y + 0.5 - 24) < 14) src.set([180, 120, 100, 255], (y * W + x) * 4);
    const out = cutOut(src, W, H, { key: "cyan" });
    const report = edgeReport(out, W, H, "cyan");
    expect(report.fringe).toBeLessThan(0.02);
    expect(out[(24 * W + 24) * 4]).toBe(180);
  });

  it("keeps a painting's own alpha when it has one", () => {
    const W = 32;
    const H = 32;
    const src = image(W, H, [255, 0, 255, 0], [16, 16, 10, 10, [255, 0, 255, 255]]);
    const out = cutOut(src, W, H, { key: "magenta" });
    // A magenta-ish figure with real alpha is not keyed away.
    expect(out[(16 * W + 16) * 4 + 3]).toBe(255);
    expect(out[3]).toBe(0);
  });
});

describe("fit", () => {
  it("trims to the painting and stands a figure on its baseline, centred on the anchor, with margins", () => {
    const box = { x0: 100, y0: 50, x1: 300, y1: 850 };
    const fit = planFit(box, [512, 1024], [0.5, 1]);
    expect(fit.rule).toBe("baseline");
    const bottom = fit.y + box.y1 * fit.scale;
    expect(bottom).toBeCloseTo(1024 * (1 - 0.004), 6);
    const top = fit.y + box.y0 * fit.scale;
    expect(top).toBeGreaterThanOrEqual(1024 * 0.03 - 1e-6);
    const left = fit.x + box.x0 * fit.scale;
    const right = fit.x + box.x1 * fit.scale;
    expect((left + right) / 2).toBeCloseTo(256, 6);
    expect(left).toBeGreaterThan(0);
  });

  it("centres a plate that is not anchored at its foot, contained", () => {
    const box = { x0: 0, y0: 0, x1: 400, y1: 200 };
    const fit = planFit(box, [256, 256], [0.5, 0.5]);
    expect(fit.rule).toBe("centre");
    expect(fit.scale).toBeCloseTo((256 * 0.94) / 400, 9);
    expect(fit.y + 100 * fit.scale).toBeCloseTo(128, 6);
  });

  it("lands the sidecar's anchor point exactly on the manifest anchor", () => {
    const box = { x0: 10, y0: 10, x1: 190, y1: 190 };
    const fit = planFit(box, [512, 512], [0.88, 0.38], { anchorPoint: [0.9, 0.3], srcSize: [200, 200] });
    expect(fit.rule).toBe("anchor");
    expect(fit.x + 180 * fit.scale).toBeCloseTo(0.88 * 512, 6);
    expect(fit.y + 60 * fit.scale).toBeCloseTo(0.38 * 512, 6);
    // Nothing leaves the canvas.
    expect(fit.x + 190 * fit.scale).toBeLessThanOrEqual(512 * 0.97 + 1e-6);
  });

  it("composes the cut-out into the canvas with a transparent margin", () => {
    const W = 40;
    const H = 80;
    const src = image(W, H, [0, 0, 0, 0], [20, 40, 15, 35, [10, 120, 200, 255]]);
    const box = trimBox(src, W, H);
    const fit = planFit(box, [64, 64], [0.5, 1]);
    const out = compose(src, W, H, fit, [64, 64]);
    const report = edgeReport(out, 64, 64);
    expect(report.margin).toBeGreaterThanOrEqual(0);
    const after = trimBox(out, 64, 64);
    expect(after.y1).toBeLessThanOrEqual(64);
    expect(after.y0).toBeGreaterThanOrEqual(1);
    expect(after.x0).toBeGreaterThanOrEqual(1);
  });
});

describe("points", () => {
  it("remaps a point from the source's fractions into the canvas's", () => {
    const fit = { scale: 0.5, x: 10, y: 20 };
    expect(remapPoint([0.5, 0.5], fit, [200, 100], [100, 100])).toEqual([0.6, 0.45]);
    expect(remapPoint([0, 0], fit, [200, 100], [100, 100])).toEqual([0.1, 0.2]);
  });

  it("remaps rig regions and the pivot the same way", () => {
    const fit = { scale: 1, x: 0, y: 0 };
    expect(remapRig({ head: [0.1, 0.1, 0.3, 0.2], pivot: [0.5, 0.9] }, fit, [100, 100], [100, 100])).toEqual({ head: [0.1, 0.1, 0.3, 0.2], pivot: [0.5, 0.9] });
    // Several people: each one remapped.
    const half = { scale: 0.5, x: 0, y: 0 };
    expect(remapRig({ figures: [{ pivot: [0.5, 1] }, { neck: [1, 0.5] }] }, half, [100, 100], [100, 100])).toEqual({ figures: [{ pivot: [0.25, 0.5] }, { neck: [0.5, 0.25] }] });
  });

  it("keeps the placeholder-era point when the painting's fit maps it back to itself", () => {
    // A painting already at the plate's size, fitted 1:1, leaves points where they were.
    const fit = { scale: 1, x: 0, y: 0 };
    expect(remapPoint([0.172308, 0.696923], fit, [768, 768], [768, 768])).toEqual([0.172308, 0.696923]);
  });
});

describe("the manifest after an import", () => {
  it("is written back in its own layout, byte for byte", () => {
    const text = readFileSync(path.join(ROOT, "public/art/manifest.json"), "utf8");
    expect(formatManifest(JSON.parse(text))).toBe(text);
  });

  it("drops the placeholder spec, marks the entry painted and takes the sidecar's points", () => {
    const entry = { id: "a/b", size: [10, 10], points: { keep: [0.1, 0.1], move: [0.2, 0.2] }, note: "n", placeholder: { kind: "study" } };
    const next = paintedEntry(entry, { points: { move: [0.3, 0.4] }, rig: { pivot: [0.5, 0.5] } });
    expect(next.placeholder).toBeUndefined();
    expect(next.painted).toBe(true);
    expect(next.points).toEqual({ keep: [0.1, 0.1], move: [0.3, 0.4] });
    expect(next.rig).toEqual({ pivot: [0.5, 0.5] });
    expect(Object.keys(next)).toEqual(["id", "size", "points", "rig", "note", "painted"]);
  });

  it("keeps the entry's own rig and paint when the sidecar brings no rig", () => {
    const entry = { id: "a/b", size: [10, 10], rig: { pivot: [0.5, 1] }, paint: { figure: true }, note: "n", placeholder: { kind: "study" } };
    const next = paintedEntry(entry, { points: {}, rig: undefined });
    expect(next.rig).toEqual({ pivot: [0.5, 1] });
    expect(next.paint).toEqual({ figure: true });
    expect(Object.keys(next)).toEqual(["id", "size", "rig", "paint", "note", "painted"]);
  });
});

/** A standing person painted on a transparent W x H image: a head, a torso, a robe, two feet; `x` is their middle (px). */
function paintPerson(px, W, H, x, { top = 0.05, raise = false } = {}) {
  const h = H * (0.98 - top);
  const y0 = H * top;
  const fill = (x0, y0_, x1, y1) => {
    for (let y = Math.max(0, Math.floor(y0_)); y < Math.min(H, Math.ceil(y1)); y++)
      for (let xx = Math.max(0, Math.floor(x0)); xx < Math.min(W, Math.ceil(x1)); xx++) px.set([200, 150, 120, 255], (y * W + xx) * 4);
  };
  // Head (an ellipse), neck, torso, a robe to the ankles, feet.
  for (let y = 0; y < H; y++)
    for (let xx = 0; xx < W; xx++) if (((xx + 0.5 - x) / (0.06 * h)) ** 2 + ((y + 0.5 - (y0 + 0.07 * h)) / (0.07 * h)) ** 2 <= 1) px.set([200, 150, 120, 255], (y * W + xx) * 4);
  fill(x - 0.03 * h, y0 + 0.13 * h, x + 0.03 * h, y0 + 0.17 * h);
  fill(x - 0.12 * h, y0 + 0.16 * h, x + 0.12 * h, y0 + 0.45 * h);
  fill(x - 0.15 * h, y0 + 0.45 * h, x + 0.15 * h, y0 + 0.93 * h);
  fill(x - 0.08 * h, y0 + 0.93 * h, x + 0.08 * h, y0 + h);
  // A raised arm off to the right, higher than the head (a pointing astronomer, a mallet).
  if (raise) fill(x + 0.14 * h, y0 - 0.04 * h, x + 0.17 * h, y0 + 0.2 * h);
}

describe("a first rig from the cut-out", () => {
  it("finds one person's head, neck, chest, hem and feet", () => {
    const W = 256;
    const H = 512;
    const px = new Uint8ClampedArray(W * H * 4);
    paintPerson(px, W, H, 128, { top: 0.08, raise: true });
    const rig = guessRig(px, W, H, { kind: "body" });
    const h = 0.9;
    // The head is around the painted head (not the raised arm above it).
    expect(rig.head[0]).toBeLessThan(0.5);
    expect(rig.head[2]).toBeGreaterThan(0.5);
    expect(rig.head[1]).toBeCloseTo(0.08, 1);
    expect(rig.neck[1]).toBeGreaterThan(rig.head[1]);
    expect(rig.chest[1]).toBeGreaterThanOrEqual(rig.head[3] - 0.02);
    // The robe runs to the feet; the feet are at the bottom, in the middle.
    expect(rig.hem[3]).toBeGreaterThan(0.08 + 0.8 * h);
    expect(rig.pivot[0]).toBeCloseTo(0.5, 2);
    expect(rig.pivot[1]).toBeCloseTo(0.98, 2);
  });

  it("leaves the head off a body whose head is its own plate, and the hem off a seated one", () => {
    const W = 128;
    const H = 256;
    const px = new Uint8ClampedArray(W * H * 4);
    paintPerson(px, W, H, 64);
    const rig = guessRig(px, W, H, { kind: "body", head: false, hem: false });
    expect(rig.head).toBeUndefined();
    expect(rig.hem).toBeUndefined();
    expect(rig.chest).toBeDefined();
  });

  it("finds each person of a crowd, left to right, and a part's joint", () => {
    const W = 768;
    const H = 256;
    const px = new Uint8ClampedArray(W * H * 4);
    for (const [x, top] of [[150, 0.06], [390, 0.12], [610, 0.08]]) paintPerson(px, W, H, x, { top });
    const rig = guessRig(px, W, H, { kind: "crowd" });
    expect(rig.figures.length).toBe(3);
    const centres = rig.figures.map((f) => (f.head[0] + f.head[2]) / 2);
    expect(centres[0]).toBeCloseTo(150 / W, 1);
    expect(centres[1]).toBeCloseTo(390 / W, 1);
    expect(centres[2]).toBeCloseTo(610 / W, 1);
    expect(guessRig(px, W, H, { kind: "part", anchor: [0.88, 0.12] })).toEqual({ pivot: [0.88, 0.12] });
    expect(guessRig(px, W, H, { kind: null })).toBeUndefined();
  });
});

describe("the world scale", () => {
  it("measures the visible painting, not the image", () => {
    const W = 10;
    const H = 20;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 4; y < 18; y++) for (let x = 2; x < 7; x++) rgba[(y * W + x) * 4 + 3] = 255;
    expect(visibleBox(rgba, W, H)).toEqual([0.2, 0.2, 0.7, 0.9]);
    expect(visibleBox(new Uint8ClampedArray(W * H * 4), W, H)).toEqual([0, 0, 1, 1]);
  });

  it("sizes a figure from its visible box, so more margin does not draw it smaller", () => {
    const span = FIGURE_SPANS["finale/woman-body"].span;
    const tight = heightFor("finale/woman-body", [0.3, 0.05, 0.7, 1]);
    const loose = heightFor("finale/woman-body", [0.3, 0.3, 0.7, 1]);
    expect(spanOf(tight, [0.3, 0.05, 0.7, 1])).toBeCloseTo(span, 3);
    expect(spanOf(loose, [0.3, 0.3, 0.7, 1])).toBeCloseTo(span, 3);
    expect(loose).toBeGreaterThan(tight);
    // Frames of one pose share the first frame's height; a plate the scale does not size has none.
    expect(heightFor("finale/man-arms-2", [0, 0.1, 1, 0.9], { "finale/man-arms-1": 0.58 })).toBe(0.58);
    expect(heightFor("site/orange", [0, 0, 1, 1])).toBeNull();
  });

  it("writes the box right after the height in the manifest entry", () => {
    const entry = { id: "x/y", height: 1, note: "n", placeholder: { kind: "study" } };
    const next = paintedEntry(entry, { points: {}, box: [0.1, 0.2, 0.9, 1], height: 2 });
    expect(Object.keys(next)).toEqual(["id", "height", "box", "note", "painted"]);
    expect(next.height).toBe(2);
  });
});
