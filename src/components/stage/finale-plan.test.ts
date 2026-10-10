import { describe, expect, it } from "vitest";

import { FINALE, SCENES } from "@/scroll/script";

import { figureOffset, SINK_DEPTH } from "./apply-plan";
import {
  armBobAt,
  astronomerOffset,
  CUT_AT,
  cutFruitAt,
  DROP_COUNT,
  dropAt,
  ENTER_FROM,
  FINALE_SINK,
  loopWeight,
  manAt,
  shearsAt,
  starsLift,
  starsOpacity,
  treeAt,
  TREE_RISE,
  TRIM_CYCLE,
  wateringAt,
  womanAt,
} from "./finale-plan";
import { VIEW as STARS_VIEW } from "./stars-plan";

describe("finale plan", () => {
  const finale = SCENES.find((s) => s.id === "finale")!;

  it("keeps every move inside the finale, in the order of the storyboard", () => {
    for (const range of Object.values(FINALE)) {
      expect(range[0]).toBeGreaterThanOrEqual(finale.start);
      expect(range[1]).toBeLessThanOrEqual(finale.end);
      expect(range[1]).toBeGreaterThan(range[0]);
    }
    expect(FINALE.sink[0]).toBeLessThan(FINALE.tree[0]);
    expect(FINALE.tree[1]).toBeLessThanOrEqual(FINALE.woman[1]);
    expect(FINALE.loop[0]).toBeGreaterThanOrEqual(Math.max(FINALE.woman[1], FINALE.man[1]));
  });

  it("starts the sink from the lowered apply position, with no jump at the boundary", () => {
    expect(astronomerOffset(finale.start)).toBeCloseTo(-SINK_DEPTH);
    expect(astronomerOffset(finale.start - 0.001)).toBeCloseTo(figureOffset(finale.start - 0.001));
    expect(astronomerOffset(FINALE.sink[1])).toBeCloseTo(-SINK_DEPTH - FINALE_SINK);
  });

  it("lifts and fades the stars, and puts everything back when scrolling up", () => {
    expect(starsLift(finale.start)).toBe(0);
    expect(starsOpacity(finale.start)).toBe(1);
    // Most of the stargazer's view: up and out of the frame.
    expect(starsLift(FINALE.stars[1])).toBeGreaterThan(0.7 * STARS_VIEW);
    expect(starsOpacity(FINALE.stars[1])).toBe(0);
    expect(starsLift(FINALE.stars[0] + 0.001)).toBe(starsLift(FINALE.stars[0] + 0.001));
  });

  it("raises the tree from out of the bottom of the frame", () => {
    expect(treeAt(FINALE.tree[0]).y).toBeCloseTo(-TREE_RISE);
    expect(treeAt(FINALE.tree[1]).y).toBeCloseTo(0);
    expect(treeAt(FINALE.tree[1]).scale).toBeCloseTo(1);
  });

  it("brings the woman in from the left and the man in from the right, and settles them", () => {
    expect(womanAt(FINALE.woman[0]).x).toBeCloseTo(-ENTER_FROM);
    expect(manAt(FINALE.man[0]).x).toBeCloseTo(ENTER_FROM);
    expect(womanAt(FINALE.woman[1]).x).toBeCloseTo(0);
    expect(womanAt(FINALE.woman[1]).y).toBeCloseTo(0);
    expect(manAt(1).x).toBeCloseTo(0);
    expect(manAt(1).y).toBeCloseTo(0);
  });

  it("fades the loop in only after both have settled, and is on to the end of the page", () => {
    expect(loopWeight(FINALE.woman[1])).toBe(0);
    expect(loopWeight(FINALE.loop[1])).toBe(1);
    expect(loopWeight(1)).toBe(1);
  });

  it("waters: tips the can, runs water, cycles three stream frames", () => {
    expect(wateringAt(0).tilt).toBe(0);
    const tilts = Array.from({ length: 80 }, (_, i) => wateringAt(i * 0.1));
    expect(Math.max(...tilts.map((w) => w.tilt))).toBe(1);
    expect(Math.max(...tilts.map((w) => w.stream))).toBeGreaterThan(0.9);
    expect(new Set(tilts.map((w) => w.frame))).toEqual(new Set([0, 1, 2]));
  });

  it("snips and cuts an orange free, then it drops out of the frame", () => {
    expect(shearsAt(0)).toBe(0);
    expect(shearsAt(CUT_AT)).toBeGreaterThan(0.9);
    expect(shearsAt(TRIM_CYCLE)).toBeCloseTo(shearsAt(0));
    expect(Math.abs(armBobAt(1))).toBeLessThan(0.1);
    const hanging = cutFruitAt(CUT_AT - 0.1);
    const falling = cutFruitAt(CUT_AT + 0.4);
    expect(hanging.opacity).toBe(1);
    expect(falling.y).toBeLessThan(hanging.y);
    expect(cutFruitAt(CUT_AT + 3).opacity).toBe(0);
  });

  it("drops oranges now and then, each between long pauses", () => {
    for (let n = 0; n < DROP_COUNT; n++) {
      const seen = Array.from({ length: 400 }, (_, i) => dropAt(n, i * 0.1).opacity > 0);
      const share = seen.filter(Boolean).length / seen.length;
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(0.2);
    }
  });

  it("is a pure function of time (the loop repeats exactly)", () => {
    expect(wateringAt(1.3).tilt).toBeCloseTo(wateringAt(1.3 + 5.2 * 3).tilt);
    expect(shearsAt(2.4)).toBeCloseTo(shearsAt(2.4 + TRIM_CYCLE * 2));
  });
});
