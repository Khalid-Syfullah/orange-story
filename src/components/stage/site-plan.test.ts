import { describe, expect, it } from "vitest";

import { SITE } from "@/scroll/script";

import { BUILDERS } from "./acting";
import { FIELD_FROM, FIELD_TO, leavesOpacity, panelMounted, panelOpacity, seaOpacity, shrinkAt, siteShift, sideOpacity, tileField, topDownOpacity } from "./site-plan";

describe("site plan", () => {
  it("starts at ground level: the side view shows, the top-down set does not", () => {
    const p = SITE.rise[0];
    expect(sideOpacity(p)).toBe(1);
    expect(seaOpacity(p)).toBe(1);
    expect(topDownOpacity(p)).toBe(0);
    expect(shrinkAt(p)).toBe(0);
    expect(panelOpacity(p)).toBe(0);
  });

  it("has the top-down set fully in before the sea (and its sky) leaves", () => {
    expect(topDownOpacity(SITE.topDownIn[1])).toBe(1);
    expect(SITE.topDownIn[1]).toBeLessThanOrEqual(SITE.seaOut[0]);
    expect(seaOpacity(SITE.rise[1])).toBe(0);
    expect(sideOpacity(SITE.rise[1])).toBe(0);
  });

  it("shrinks into the middle of the left half and holds", () => {
    expect(siteShift(SITE.shrink[0], 10)).toBeCloseTo(0);
    expect(siteShift(SITE.shrink[1], 10)).toBeCloseTo(-5);
    expect(siteShift(SITE.end, 10)).toBeCloseTo(-5);
  });

  it("grows the tiled field around the scaffold, tile size unchanged", () => {
    const first = tileField(SITE.tiles[0]);
    const last = tileField(SITE.tiles[1]);
    expect(first.size).toBeCloseTo(FIELD_FROM);
    expect(last.size).toBeCloseTo(FIELD_TO);
    expect(first.size / first.tiles).toBeCloseTo(last.size / last.tiles);
  });

  it("fades the milk panel in over the right half, then removes it under the dust", () => {
    expect(panelOpacity(SITE.panel[1])).toBe(1);
    expect(leavesOpacity(SITE.panel[0])).toBe(0);
    expect(leavesOpacity(SITE.shrink[1])).toBe(1);
    expect(panelOpacity(SITE.end)).toBe(0);
    expect(leavesOpacity(SITE.end)).toBe(0);
    expect(panelMounted(SITE.panel[0] - 0.1)).toBe(false);
    expect(panelMounted(SITE.shrink[1])).toBe(true);
    expect(panelMounted(SITE.end + 0.1)).toBe(false);
  });

  it("works the two builders' mallets half a blow apart, and has them at rest before the view tilts away", () => {
    const left = BUILDERS.siteLeft.forearm;
    const right = BUILDERS.siteRight.forearm;
    // One winds up as the other strikes: the left one's mallet turns clockwise to strike, the right one's counter-clockwise.
    const mid = (SITE.strikes.left[0] + SITE.strikes.left[1]) / 2;
    expect(Math.abs(left(mid)) + Math.abs(right(mid))).toBeGreaterThan(0);
    expect(SITE.strikes.right[0] - SITE.strikes.left[0]).toBeCloseTo((0.5 * (SITE.strikes.left[1] - SITE.strikes.left[0])) / SITE.blows, 9);
    expect(left(SITE.sideOut[1])).toBe(0);
    expect(right(SITE.sideOut[1])).toBe(0);
  });

  it("is a pure function of progress", () => {
    const p = (SITE.shrink[0] + SITE.shrink[1]) / 2;
    expect(tileField(p)).toEqual(tileField(p));
    expect(shrinkAt(p)).toBe(shrinkAt(p));
  });
});
