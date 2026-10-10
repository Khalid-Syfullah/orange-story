import { describe, expect, it } from "vitest";

import { colors, mixColors } from "@/styles/tokens";

import { backdropRepeat, canvasRepeat, CANVAS, figureLight, gradeColor, halftoneCoverage, halftoneGrid, halftoneRadius, halftoneTone, HALFTONE, ringTone, RINGS } from "./paint";

const linear = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
const luma = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const WARM = linear(mixColors("milk", "orange", 0.35));
const COOL = linear(colors.skySoft);

describe("the canvas", () => {
  it("lies in the plate's own space: twice the plate, twice the weave (it moves and scales with the art)", () => {
    const a = canvasRepeat(1, 2);
    const b = canvasRepeat(2, 4);
    expect(b[0]).toBeCloseTo(2 * a[0], 12);
    expect(b[3]).toBeCloseTo(2 * a[3], 12);
    expect(a[1] / a[0]).toBeCloseTo(2, 12);
    expect(a[0]).toBeCloseTo(1 / CANVAS.grainTile, 12);
  });

  it("stays square on a backdrop whatever the screen's shape", () => {
    const wide = backdropRepeat(1.6);
    expect(wide[0] / wide[1]).toBeCloseTo(1.6, 12);
    expect(backdropRepeat(0.45)[1]).toBe(CANVAS.grainTilesPerScreen);
  });

  it("is faint: the grain a few percent, the cracks fainter", () => {
    expect(CANVAS.grainAmount.backdrop).toBeLessThan(0.1);
    expect(CANVAS.crackAmount).toBeLessThan(0.1);
  });
});

describe("the grade", () => {
  it("leaves a colour alone at zero", () => {
    const c: [number, number, number] = [0.4, 0.3, 0.2];
    const out = gradeColor(c, { warm: 0, cool: 0, saturation: 0 }, WARM, COOL);
    out.forEach((v, i) => expect(v).toBeCloseTo(c[i], 12));
  });

  it("warms the highlights and cools the shadows, without changing their value much", () => {
    const grade = { warm: 0.08, cool: 0.08, saturation: 0 };
    const light: [number, number, number] = [0.8, 0.8, 0.8];
    const dark: [number, number, number] = [0.05, 0.05, 0.05];
    const l = gradeColor(light, grade, WARM, COOL);
    const d = gradeColor(dark, grade, WARM, COOL);
    expect(l[0]).toBeGreaterThan(l[2]);
    expect(d[2]).toBeGreaterThan(d[0]);
    expect(luma(l)).toBeCloseTo(luma(light), 2);
    expect(luma(d)).toBeCloseTo(luma(dark), 2);
  });

  it("trims saturation without changing the value", () => {
    const c: [number, number, number] = [0.6, 0.3, 0.1];
    const out = gradeColor(c, { warm: 0, cool: 0, saturation: -0.1 }, WARM, COOL);
    expect(luma(out)).toBeCloseTo(luma(c), 9);
    expect(out[0] - out[2]).toBeCloseTo((c[0] - c[2]) * 0.9, 9);
  });

  it("is subtler on a finished painting than on a stand-in", () => {
    expect(figureLight(true).rim).toBeLessThan(figureLight(false).rim);
    expect(figureLight(true).bounce).toBeLessThan(figureLight(false).bounce);
  });
});

describe("the halftone", () => {
  it("grows a dot from nothing as the tone rises, without popping", () => {
    expect(halftoneRadius(0)).toBe(0);
    expect(halftoneRadius(HALFTONE.low)).toBe(0);
    let previous = 0;
    for (let t = 0; t <= 1.0001; t += 0.001) {
      const r = halftoneRadius(t);
      expect(r).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(r - previous).toBeLessThan(0.05);
      previous = r;
    }
    // A full tone reaches the cell's corners: neighbouring dots merge into solid paint.
    expect(halftoneRadius(1)).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("covers about the share of the cell the threshold says", () => {
    for (const tone of [0.25, 0.5, 0.75]) {
      let covered = 0;
      const n = 200;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) covered += halftoneCoverage((i + 0.5) / n, (j + 0.5) / n, tone, 0.002);
      expect(covered / (n * n)).toBeCloseTo(Math.min(1, Math.PI * halftoneRadius(tone) ** 2), 1);
    }
    expect(halftoneTone(0.5)).toBeCloseTo(0.5, 9);
  });

  it("lays its grid at 45 degrees", () => {
    const [x, y] = halftoneGrid(1, 0);
    expect(Math.atan2(y, x)).toBeCloseTo(Math.PI / 4, 12);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
  });

  it("spreads the hero's rings out from the orange and lets them fade before the edge", () => {
    const reach = 7;
    let peak = 0;
    for (let r = 0; r < reach + 2; r += 0.05) peak = Math.max(peak, ringTone(r, 3.1, reach));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
    // Far beyond the reach nothing is left; the wave is periodic in ripple time.
    expect(ringTone(reach + 4, 3.1, reach)).toBeLessThan(0.01);
    const period = 1 / RINGS.speed / RINGS.count;
    expect(ringTone(2.3, 3.1 + period, reach)).toBeCloseTo(ringTone(2.3, 3.1, reach), 6);
  });
});
