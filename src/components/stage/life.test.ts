import { describe, expect, it } from "vitest";

import { breathAt, deformQ, figurePhase, figurePivots, hemAt, LIFE, lifeAt, newLifeSample, shiftAt, turnAbout } from "./life";
import { figureWeights, rigFigures } from "./rig";

const PERSON = rigFigures({ head: [0.4, 0.05, 0.6, 0.18], chest: [0.3, 0.18, 0.7, 0.4], hem: [0.25, 0.8, 0.75, 0.97], pivot: [0.5, 0.99] })[0];
const ASPECT = 0.5;

/** Where a plate point (fractions) goes under a life sample, in plate heights. */
function moved(u: number, v: number, sample = lifeAt(3.7, 0.2, 1)) {
  const w = figureWeights(PERSON, u, v, ASPECT);
  const { foot, neck } = figurePivots(PERSON, ASPECT);
  const q: [number, number] = [u * ASPECT, 1 - v];
  const out = deformQ(q, w, 1, u, sample, foot, neck, null);
  return [out[0] - q[0], out[1] - q[1]];
}

describe("breathing", () => {
  it("rises and falls about 0.2 times a second", () => {
    const phase = 0.3;
    const hz = LIFE.breath.hz * (0.9 + 0.2 * phase);
    expect(hz).toBeGreaterThan(0.18);
    expect(hz).toBeLessThan(0.23);
    for (const t of [0, 1.3, 2.9]) expect(breathAt(t + 1 / hz, phase)).toBeCloseTo(breathAt(t, phase), 9);
    let low = 1;
    let high = 0;
    for (let t = 0; t < 1 / hz; t += 0.01) {
      low = Math.min(low, breathAt(t, phase));
      high = Math.max(high, breathAt(t, phase));
    }
    expect(low).toBeLessThan(0.001);
    expect(high).toBeGreaterThan(0.999);
  });

  it("lifts the chest and shoulders between 0.5 and 1% of the figure's height, the waist and feet not at all", () => {
    let low = Infinity;
    let high = -Infinity;
    for (let t = 0; t < 6; t += 0.05) {
      const s = lifeAt(t, 0.42, 1);
      s.head = 0;
      s.sway = 0;
      s.hem = 0;
      const dy = moved(0.5, 0.25, s)[1];
      low = Math.min(low, dy);
      high = Math.max(high, dy);
    }
    // The figure stands about as tall as its plate.
    expect(high - low).toBeGreaterThanOrEqual(0.005);
    expect(high - low).toBeLessThanOrEqual(0.01);
    const s = lifeAt(2, 0.42, 1);
    s.head = 0;
    s.sway = 0;
    expect(moved(0.5, 0.6, s)[1]).toBe(0);
    expect(moved(0.5, 0.99, s)[1]).toBe(0);
  });
});

describe("the hem", () => {
  it("swings a little in the breeze, its bottom most, gusting", () => {
    let most = 0;
    for (let t = 0; t < 40; t += 0.1) most = Math.max(most, hemAt(t, 0.5).swing);
    expect(most).toBeLessThanOrEqual(LIFE.hem.swing + 1e-9);
    expect(most).toBeGreaterThan(LIFE.hem.swing * 0.9);
    const s = newLifeSample();
    s.hem = LIFE.hem.swing;
    s.hemPhase = Math.PI / 2;
    const bottom = Math.abs(moved(0.5, 0.96, s)[0]);
    const top = Math.abs(moved(0.5, 0.81, s)[0]);
    expect(bottom).toBeGreaterThan(top);
    expect(bottom).toBeLessThanOrEqual(LIFE.hem.swing + 1e-9);
  });
});

describe("small shifts every few seconds", () => {
  it("hold still, then ease to a new value, and never jump", () => {
    let held = 0;
    let previous = shiftAt(0, 0.37, LIFE.head.every, LIFE.head.hold);
    let biggest = 0;
    const values = new Set<number>();
    for (let t = 0.01; t < 60; t += 0.01) {
      const v = shiftAt(t, 0.37, LIFE.head.every, LIFE.head.hold);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      biggest = Math.max(biggest, Math.abs(v - previous));
      if (v === previous) held++;
      values.add(Math.round(v * 100));
      previous = v;
    }
    expect(biggest).toBeLessThan(0.02);
    // Over half the time it holds still; and it does move about.
    expect(held).toBeGreaterThan(3000);
    expect(values.size).toBeGreaterThan(20);
  });

  it("are the figure's own: two people shift at different times", () => {
    const a = figurePhase("hero/crowd-near", 0);
    const b = figurePhase("hero/crowd-near", 1);
    expect(a).not.toBeCloseTo(b, 3);
    let differ = 0;
    for (let t = 0; t < 30; t += 0.5) if (Math.abs(lifeAt(t, a, 1).head - lifeAt(t, b, 1).head) > 0.005) differ++;
    expect(differ).toBeGreaterThan(30);
  });

  it("stay small: the head a couple of degrees, the weight a fraction of one", () => {
    for (let t = 0; t < 40; t += 0.25) {
      const s = lifeAt(t, 0.6, 1);
      expect(Math.abs(s.head)).toBeLessThanOrEqual(LIFE.head.angle);
      expect(Math.abs(s.sway)).toBeLessThanOrEqual(LIFE.weight.angle);
    }
    expect(LIFE.head.angle).toBeLessThan(0.05);
    expect(LIFE.weight.angle).toBeLessThan(0.01);
  });

  it("stop with strength 0 (a still figure)", () => {
    const s = lifeAt(12.3, 0.4, 0);
    for (const v of [s.breath, s.head, s.sway, s.hem]) expect(v).toBeCloseTo(0, 12);
  });
});

describe("the bend", () => {
  it("turns the whole figure about its feet: the feet stay planted", () => {
    const s = newLifeSample();
    s.sway = 0.01;
    const [fx, fy] = moved(0.5, 0.99, s);
    expect(Math.hypot(fx, fy)).toBeLessThan(1e-9);
    // The head moves toward the turn (counter-clockwise: to the left).
    expect(moved(0.5, 0.1, s)[0]).toBeLessThan(0);
  });

  it("turns the head on the neck, leaving the body", () => {
    const s = newLifeSample();
    s.head = 0.05;
    expect(Math.hypot(...moved(0.5, 0.1, s))).toBeGreaterThan(0.002);
    expect(Math.hypot(...moved(0.5, 0.55, s))).toBe(0);
  });

  it("turns points about a pivot exactly", () => {
    const out = turnAbout([1, 0], [0, 0], Math.PI / 2);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1]).toBeCloseTo(1, 12);
  });
});
