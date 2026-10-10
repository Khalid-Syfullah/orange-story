import { describe, expect, it } from "vitest";

import type { PlateRig } from "@/art/manifest";

import { figureWeights, figureZone, rigFigures, rigGridSize, rigProblems, rigTextureSize, rigVertexData, rigWeightData, RIG_MAX_FIGURES } from "./rig";

/** A standing person on a portrait plate (fractions from the left and the top). */
const PERSON: PlateRig = {
  head: [0.4, 0.05, 0.6, 0.18],
  chest: [0.3, 0.18, 0.7, 0.4],
  hem: [0.25, 0.8, 0.75, 0.97],
  pivot: [0.5, 0.99],
};

/** The weight texture's texel at fractions [u, v] (rows run from the bottom). */
function texel(rig: PlateRig, size: [number, number], u: number, v: number): number[] {
  const { data, width, height } = rigWeightData(rig, size);
  const x = Math.min(width - 1, Math.floor(u * width));
  const row = Math.min(height - 1, Math.floor((1 - v) * height));
  const i = (row * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("the rig", () => {
  it("fills in its pivots: the neck under the head, the feet given", () => {
    const [f] = rigFigures(PERSON);
    expect(f.neck).toEqual([0.5, 0.18]);
    expect(f.pivot).toEqual([0.5, 0.99]);
    expect(f.centre).toBeCloseTo(0.5, 9);
    // Without a pivot the feet are under the hem.
    expect(rigFigures({ hem: [0.2, 0.8, 0.6, 0.95] })[0].pivot).toEqual([0.4, 0.95]);
  });

  it("is checked: boxes inside the image and the right way round, at most four people", () => {
    expect(rigProblems(PERSON)).toEqual([]);
    expect(rigProblems({ head: [0.6, 0.1, 0.4, 0.2] })).toEqual(["head is empty or upside down"]);
    expect(rigProblems({ chest: [0.1, 0.2, 1.2, 0.3] })).toEqual(["chest is not four fractions"]);
    expect(rigProblems({ figures: Array.from({ length: 5 }, () => PERSON) })).toContain(`more than ${RIG_MAX_FIGURES} figures`);
  });
});

describe("rig to weights (the weight texture)", () => {
  const size: [number, number] = [512, 1024];

  it("lifts the chest and everything above it, not the waist", () => {
    expect(texel(PERSON, size, 0.5, 0.25)[0]).toBe(255);
    expect(texel(PERSON, size, 0.5, 0.1)[0]).toBe(255);
    expect(texel(PERSON, size, 0.5, 0.6)[0]).toBe(0);
    // Off to the side of the body, nothing breathes.
    expect(texel(PERSON, size, 0.02, 0.25)[0]).toBe(0);
  });

  it("swings the bottom of the hem most, its top not at all, the feet below not at all", () => {
    expect(texel(PERSON, size, 0.5, 0.96)[1]).toBeGreaterThan(200);
    expect(texel(PERSON, size, 0.5, 0.81)[1]).toBeLessThan(20);
    expect(texel(PERSON, size, 0.5, 0.6)[1]).toBe(0);
  });

  it("turns the head as one, with a soft edge over the neck", () => {
    expect(texel(PERSON, size, 0.5, 0.11)[2]).toBe(255);
    const neck = texel(PERSON, size, 0.5, 0.2)[2];
    expect(neck).toBeGreaterThan(0);
    expect(neck).toBeLessThan(255);
    expect(texel(PERSON, size, 0.5, 0.5)[2]).toBe(0);
    // No arm in this rig.
    expect(texel(PERSON, size, 0.5, 0.11)[3]).toBe(0);
  });

  it("falls off softly: weights never jump between neighbouring texels", () => {
    const { data, width, height } = rigWeightData(PERSON, size);
    let jump = 0;
    for (let row = 0; row < height; row++)
      for (let x = 1; x < width; x++)
        for (let k = 0; k < 4; k++) jump = Math.max(jump, Math.abs(data[(row * width + x) * 4 + k] - data[(row * width + x - 1) * 4 + k]));
    for (let row = 1; row < height; row++)
      for (let x = 0; x < width; x++)
        for (let k = 0; k < 4; k++) jump = Math.max(jump, Math.abs(data[(row * width + x) * 4 + k] - data[((row - 1) * width + x) * 4 + k]));
    expect(jump).toBeLessThan(150);
  });

  it("keeps the image's aspect in a small texture, and an even mesh", () => {
    expect(rigTextureSize([512, 1024])).toEqual([32, 64]);
    expect(rigTextureSize([1536, 512])).toEqual([64, 21]);
    expect(rigGridSize([512, 1024])).toEqual([32, 64]);
    expect(rigGridSize([1536, 512])).toEqual([64, 21]);
  });

  it("weights several people on one plate, each in their own place", () => {
    const left = { ...PERSON, head: [0.1, 0.05, 0.2, 0.18], chest: [0.05, 0.18, 0.25, 0.4], hem: [0.05, 0.8, 0.25, 0.97], pivot: [0.15, 0.99] } as const;
    const right = { ...PERSON, head: [0.7, 0.05, 0.8, 0.18], chest: [0.65, 0.18, 0.85, 0.4], hem: [0.65, 0.8, 0.85, 0.97], pivot: [0.75, 0.99] } as const;
    const crowd: PlateRig = { figures: [left, right] };
    expect(texel(crowd, [1536, 512], 0.15, 0.1)[2]).toBe(255);
    expect(texel(crowd, [1536, 512], 0.75, 0.1)[2]).toBe(255);
    expect(texel(crowd, [1536, 512], 0.45, 0.1)[2]).toBe(0);
  });
});

describe("the mesh's people", () => {
  it("gives one person the whole plate", () => {
    const data = rigVertexData(PERSON, [512, 1024], 4, 8);
    expect(data.length).toBe(5 * 9 * 2);
    for (let i = 0; i < data.length; i += 2) {
      expect(data[i]).toBe(0);
      expect(data[i + 1]).toBe(1);
    }
  });

  it("splits a shared plate between its people, fading out at each border", () => {
    const figures = rigFigures({ figures: [{ chest: [0.1, 0.2, 0.3, 0.4] }, { chest: [0.6, 0.2, 0.8, 0.4] }] });
    expect(figureZone(figures, 0.2, 3)).toEqual([0, 1]);
    expect(figureZone(figures, 0.7, 3)[0]).toBe(1);
    // Halfway between them, neither moves.
    expect(figureZone(figures, 0.45, 3)[1]).toBeCloseTo(0, 9);
    expect(figureZone(figures, 0.44, 3)[1]).toBeLessThan(1);
  });

  it("weights a point the same as the texture does", () => {
    const [f] = rigFigures(PERSON);
    const w = figureWeights(f, 0.5, 0.11, 0.5);
    expect(w[2]).toBe(1);
    expect(w[0]).toBe(1);
  });
});
