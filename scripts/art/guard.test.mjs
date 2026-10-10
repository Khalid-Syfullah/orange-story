import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { judgeTexture, measureFile, measureTexture } from "./guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("the texture guard", () => {
  it("fails a flat fill", () => {
    const W = 64;
    const H = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) rgba.set([220, 200, 170, 255], i * 4);
    const m = measureTexture(rgba, W, H);
    expect(m.lumStd).toBeLessThan(0.001);
    expect(m.colors).toBe(1);
    expect(judgeTexture(m).ok).toBe(false);
  });

  it("fails clip art: two flat shapes with hard edges", () => {
    const W = 64;
    const H = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(y < 20 ? [30, 25, 20, 255] : [236, 231, 221, 255], (y * W + x) * 4);
    const verdict = judgeTexture(measureTexture(rgba, W, H));
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/colours|high-frequency/);
  });

  it("passes a finished painted gardener", async () => {
    const m = await measureFile(path.join(ROOT, "public/art/prune/gardener.webp"));
    expect(judgeTexture(m)).toEqual({ ok: true, reasons: [] });
  });

  it("accepts finely blended linen while retaining the flat-art checks", async () => {
    const m = await measureFile(path.join(ROOT, "public/art/pluck/harvester-body.webp"));
    expect(m.colors).toBeGreaterThan(1000);
    expect(m.lumStd).toBeGreaterThan(0.15);
    expect(judgeTexture(m)).toEqual({ ok: true, reasons: [] });
  });
});
