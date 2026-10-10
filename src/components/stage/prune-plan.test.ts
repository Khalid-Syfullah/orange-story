import { describe, expect, it } from "vitest";

import { PRUNE } from "@/scroll/script";

import { armTurnAt, onTree, shearsClosed, SNIP, SNIP_CONTACTS, snipShake } from "./prune-plan";

const steps = (a: number, b: number, n = 4000) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

describe("prune plan", () => {
  it("has the shears open and the arms at rest before and after the trim", () => {
    for (const p of [PRUNE.trim[0] - 0.001, PRUNE.trim[0], PRUNE.trim[1], PRUNE.trim[1] + 0.001]) {
      expect(shearsClosed(p)).toBe(0);
      expect(armTurnAt(p)).toBeCloseTo(0, 12);
    }
  });

  it("snips PRUNE.snips times: a small opening, a quick squeeze that shuts the shears, the shears open again", () => {
    let closes = 0;
    let prev = 0;
    for (const p of steps(PRUNE.trim[0], PRUNE.trim[1])) {
      const v = shearsClosed(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > 0.99 && prev <= 0.99) closes++;
      prev = v;
    }
    expect(closes).toBe(PRUNE.snips);
    const turns = steps(PRUNE.trim[0], PRUNE.trim[1]).map(armTurnAt);
    expect(Math.max(...turns)).toBeCloseTo(SNIP.open, 3);
    expect(Math.min(...turns)).toBeCloseTo(SNIP.shut, 3);
  });

  it("swaps the shears' frames only inside the quick part of the move", () => {
    // Wherever the frames are mid-swap, the arms are moving fast (or have just been stopped at the contact).
    const length = (PRUNE.trim[1] - PRUNE.trim[0]) / PRUNE.snips;
    let swapping = 0;
    let quick = 0;
    for (const p of steps(PRUNE.trim[0], PRUNE.trim[1], 20000)) {
      const v = shearsClosed(p);
      if (v < 0.1 || v > 0.9) continue;
      swapping++;
      const speed = Math.abs(armTurnAt(p + 1e-6) - armTurnAt(p - 1e-6)) / 2e-6;
      const near = SNIP_CONTACTS.some((c) => Math.abs(p - c) < 0.06 * length);
      if (speed * length > 0.1 || near) quick++;
    }
    expect(swapping).toBeGreaterThan(0);
    expect(quick / swapping).toBeGreaterThan(0.9);
  });

  it("shakes the tree a little with each snip, and lets it settle", () => {
    const shake = steps(PRUNE.trim[0], PRUNE.trim[1]).map(snipShake);
    expect(Math.max(...shake.map(Math.abs))).toBeGreaterThan(0.3);
    expect(Math.abs(snipShake(PRUNE.trim[1] + 0.05))).toBeLessThan(1e-6);
    // The branches stay on the trunk when it turns.
    expect(onTree("prune/branch-left", 0).x).toBeCloseTo(0, 12);
    expect(onTree("prune/branch-left", 0).y).toBeCloseTo(0, 12);
    expect(Math.abs(onTree("prune/branch-left", 0.01).x)).toBeGreaterThan(0.005);
  });

  it("is a pure function of progress", () => {
    const p = PRUNE.trim[0] + 0.01;
    const a = [shearsClosed(p), armTurnAt(p), snipShake(p)];
    shearsClosed(PRUNE.trim[1]);
    expect([shearsClosed(p), armTurnAt(p), snipShake(p)]).toEqual(a);
  });
});
