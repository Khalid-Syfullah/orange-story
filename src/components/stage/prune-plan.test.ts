import { describe, expect, it } from "vitest";

import { PRUNE } from "@/scroll/script";

import { shearsClosed, trimmedScale } from "./prune-plan";

describe("prune plan", () => {
  it("has the shears open before and after the trim", () => {
    expect(shearsClosed(PRUNE.trim[0] - 0.001)).toBe(0);
    expect(shearsClosed(PRUNE.trim[1] + 0.001)).toBe(0);
  });

  it("closes and opens several times and stays in range", () => {
    let closes = 0;
    let prev = 0;
    for (let i = 0; i <= 2000; i++) {
      const v = shearsClosed(PRUNE.trim[0] + ((PRUNE.trim[1] - PRUNE.trim[0]) * i) / 2000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > 0.99 && prev <= 0.99) closes++;
      prev = v;
    }
    expect(closes).toBe(PRUNE.snips);
  });

  it("is a pure function of progress", () => {
    expect(shearsClosed(PRUNE.trim[0] + 0.01)).toBe(shearsClosed(PRUNE.trim[0] + 0.01));
  });

  it("shortens the branch a little", () => {
    expect(trimmedScale(0)).toBe(1);
    expect(trimmedScale(PRUNE.trim[1])).toBeLessThan(1);
    expect(trimmedScale(PRUNE.trim[1])).toBeGreaterThan(0.8);
  });
});
