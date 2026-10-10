import { describe, expect, it } from "vitest";

import { ADAPTIVE, adaptDpr, newFrameBudget, qualityOverride, qualityTier } from "./quality";

/** Feeds `seconds` of frames `delta` apart; returns the pixel ratio after each change. */
function run(dpr: number, max: number, delta: number, seconds: number, budget = newFrameBudget()) {
  const steps: number[] = [];
  let current = dpr;
  for (let t = 0; t < seconds; t += delta) {
    const next = adaptDpr(budget, delta, current, max);
    if (next !== current) steps.push(next);
    current = next;
  }
  return { dpr: current, steps, budget };
}

describe("adaptive pixel ratio", () => {
  it("keeps the pixel ratio on a device that keeps up", () => {
    expect(run(1.5, 1.5, 1 / 60, 10).steps).toEqual([]);
    expect(run(1.5, 1.5, 1 / 120, 10).steps).toEqual([]);
  });

  it("steps down after sustained slow frames, never below the floor", () => {
    const slow = run(1.5, 1.5, 1 / 25, 1);
    expect(slow.steps).toEqual([]);
    const longer = run(1.5, 1.5, 1 / 25, 30);
    expect(longer.steps[0]).toBeCloseTo(1.5 * ADAPTIVE.stepDown, 9);
    expect(longer.dpr).toBe(ADAPTIVE.floor);
    expect(Math.min(...longer.steps)).toBeGreaterThanOrEqual(ADAPTIVE.floor);
  });

  it("ignores pauses: an on-demand canvas that rests between frames is not slow", () => {
    expect(run(1.5, 1.5, 0.5, 60).steps).toEqual([]);
    expect(run(1.5, 1.5, 3, 60).steps).toEqual([]);
  });

  it("steps back up when the device has headroom again, up to the cap", () => {
    const up = run(ADAPTIVE.floor, 1.25, 1 / 60, 60);
    expect(up.steps[0]).toBeCloseTo(ADAPTIVE.floor * ADAPTIVE.stepUp, 9);
    expect(up.dpr).toBe(1.25);
  });

  it("never climbs back to a pixel ratio that was too slow (no see-sawing)", () => {
    const budget = newFrameBudget();
    // Too slow at 1.5: it steps down, then frames are quick for a long time.
    const down = run(1.5, 1.5, 1 / 25, 1.5, budget);
    expect(down.dpr).toBeCloseTo(1.5 * ADAPTIVE.stepDown, 9);
    // It may climb part of the way back, but never to the ratio that was too slow.
    const after = run(down.dpr, 1.5, 1 / 60, 60, budget);
    expect(after.dpr).toBeLessThan(1.5);
    for (const step of after.steps) expect(step).toBeLessThan(1.5);
  });

  it("does not allocate: it only updates the budget it is given", () => {
    const budget = newFrameBudget();
    const same = budget;
    adaptDpr(budget, 1 / 30, 1.5, 1.5);
    expect(budget).toBe(same);
    expect(budget.average).toBeGreaterThan(1 / 60);
  });
});

describe("quality tiers", () => {
  it("paints everything on a device that keeps up", () => {
    expect(qualityTier(1.5, 1.5, false)).toBe(2);
    expect(qualityTier(1, 1.5, false)).toBe(2);
  });

  it("drops the extras where the pixel ratio had to come below 1, or on a small device", () => {
    expect(qualityTier(1.5 * ADAPTIVE.stepDown ** 2, 1.5, false)).toBe(1);
    expect(qualityTier(1.25, 1.25, true)).toBe(1);
  });

  it("falls back to plain soft paint once the pixel ratio is at its floor", () => {
    expect(qualityTier(ADAPTIVE.floor, 1.5, false)).toBe(0);
    expect(qualityTier(ADAPTIVE.floor, 1.25, true)).toBe(0);
  });

  it("can be forced from the address, to look at a tier", () => {
    expect(qualityOverride("?quality=low")).toBe(0);
    expect(qualityOverride("?quality=medium&x=1")).toBe(1);
    expect(qualityOverride("?quality=high")).toBe(2);
    expect(qualityOverride("?quality=ultra")).toBeNull();
    expect(qualityOverride("")).toBeNull();
  });
});
