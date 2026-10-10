import { describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { SCENES } from "@/scroll/script";

import { BRANCHES, branchAt, frontAt, LEAVES, leafAt, morphAt, riseAt, RISE_TOTAL, shaftAt, statueAt } from "./ascent-tree";

const ascent = SCENES.find((s) => s.id === "ascent")!;
const at = (t: number) => ascent.start + (ascent.end - ascent.start) * t;
const samples = Array.from({ length: 101 }, (_, i) => at(i / 100));

describe("the ascent", () => {
  it("starts as the hero frame: nothing has risen, the stone is stone, no branch has grown", () => {
    expect(riseAt(ascent.start)).toBe(0);
    expect(riseAt(ascent.start - 0.01)).toBe(0);
    expect(morphAt(ascent.start)).toBeLessThan(0.2);
    expect(statueAt(ascent.start)).toBe(1);
    for (const id of BRANCHES) expect(branchAt(id, ascent.start)).toBe(0);
    const hero = plateEntry("hero/minaret");
    const shaft = shaftAt(ascent.start);
    expect(shaft.top).toBe(hero.position[1]);
    expect(shaft.height).toBe(hero.height);
    expect(shaft.repeatY).toBe(hero.repeat?.[1]);
  });

  it("keeps rising, and the shaft grows taller with its bottom fixed and its tiles unstretched", () => {
    const hero = plateEntry("hero/minaret");
    const tile = hero.height / (hero.repeat?.[1] ?? 1);
    let last = -1;
    for (const p of samples) {
      const rise = riseAt(p);
      expect(rise).toBeGreaterThanOrEqual(last);
      last = rise;
      const shaft = shaftAt(p);
      expect(shaft.bottom).toBe(hero.position[1] - hero.height);
      expect(shaft.height / shaft.repeatY).toBeCloseTo(tile, 6);
    }
    expect(riseAt(ascent.end)).toBeCloseTo(RISE_TOTAL, 6);
  });

  it("turns stone to bark along a climbing front, and ends all bark", () => {
    let last = -1;
    for (const p of samples) {
      const m = morphAt(p);
      expect(m).toBeGreaterThanOrEqual(last - 1e-9);
      expect(m).toBeLessThanOrEqual(1);
      last = m;
      expect(frontAt(p)).toBeLessThanOrEqual(shaftAt(p).top + 1e-9);
    }
    expect(morphAt(at(0.5))).toBeGreaterThan(0.5);
    expect(morphAt(ascent.end)).toBe(1);
  });

  it("grows the branches in order, each from nothing to full, with the last at the scene's end", () => {
    const ends = BRANCHES.map((id) => samples.find((p) => branchAt(id, p) >= 1) ?? Infinity);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    for (const id of BRANCHES) expect(branchAt(id, at(0.3))).toBe(0);
    expect(branchAt("ascent/branch-3", ascent.end)).toBe(1);
  });

  it("unfurls every leaf inside its branch's growth, from a closed bud to its resting angle", () => {
    expect(LEAVES.length).toBeGreaterThan(10);
    for (const leaf of LEAVES) {
      const bud = leafAt(leaf, leaf.range[0]);
      const open = leafAt(leaf, leaf.range[1]);
      expect(bud.scaleY).toBe(0);
      expect(open.scaleX).toBeCloseTo(1, 6);
      expect(open.scaleY).toBe(1);
      expect(open.rotate).toBeCloseTo(leaf.angle, 6);
      expect(leaf.range[1]).toBeLessThanOrEqual(ascent.end + 1e-9);
    }
  });

  it("lets the statue go only after it has risen out of the frame", () => {
    expect(statueAt(at(0.8))).toBe(1);
    expect(statueAt(ascent.end)).toBe(0);
  });
});
