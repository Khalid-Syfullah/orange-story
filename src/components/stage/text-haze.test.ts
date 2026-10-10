import { describe, expect, it } from "vitest";

import { beatOf } from "@/scroll/helpers";
import { BEATS } from "@/scroll/script";

import { beatArea, beatHaze, hazeAmount, SLOT_AREAS, strongestBeat } from "./text-haze";
import { cloudClearing } from "./work-sky";

describe("the art receding behind text", () => {
  it("has an area for every slot, inside the stage, on both layouts", () => {
    for (const { wide, stacked } of Object.values(SLOT_AREAS)) {
      for (const area of [wide, stacked]) {
        expect(area.left).toBeGreaterThanOrEqual(0);
        expect(area.right).toBeLessThanOrEqual(1);
        expect(area.top).toBeGreaterThanOrEqual(0);
        expect(area.bottom).toBeLessThanOrEqual(1);
        expect(area.right).toBeGreaterThan(area.left);
        expect(area.bottom).toBeGreaterThan(area.top);
      }
    }
    for (const beat of BEATS) expect(beatArea(beat.id, false)).toBe(SLOT_AREAS[beat.slot].wide);
  });

  it("recedes fully while a beat holds, not at all outside it, and follows it both ways", () => {
    const found = beatOf("found");
    expect(beatHaze("found", found.in - 1e-4)).toBe(0);
    expect(beatHaze("found", (found.hold[0] + found.hold[1]) / 2)).toBe(1);
    expect(beatHaze("found", found.out + 1e-4)).toBe(0);
    const mid = (found.in + found.hold[0]) / 2;
    expect(beatHaze("found", mid)).toBeGreaterThan(0);
    expect(beatHaze("found", mid)).toBeLessThan(1);
    // A beat that never leaves keeps the art receded to the end.
    expect(beatHaze("finale", 1)).toBe(1);
  });

  it("follows whichever of several beats is on stage", () => {
    const ids = ["found", "harvest"] as const;
    const harvest = beatOf("harvest");
    expect(strongestBeat(ids, (harvest.hold[0] + harvest.hold[1]) / 2)).toBe(1);
    expect(hazeAmount(ids, (harvest.hold[0] + harvest.hold[1]) / 2)).toBe(1);
    expect(hazeAmount(ids, (beatOf("found").out + harvest.in) / 2)).toBe(0);
  });

  it("parts the clouds around the card column for as long as the cards are up", () => {
    const first = beatOf("card-1");
    const last = beatOf("card-3");
    expect(cloudClearing(first.in - 0.05)).toBe(0);
    for (const id of ["card-1", "card-2", "card-3"] as const) {
      const beat = beatOf(id);
      expect(cloudClearing((beat.hold[0] + beat.hold[1]) / 2)).toBe(1);
    }
    expect(cloudClearing((beatOf("card-1").out + beatOf("card-2").in) / 2)).toBe(1);
    expect(cloudClearing(last.out + 0.05)).toBe(0);
  });
});
