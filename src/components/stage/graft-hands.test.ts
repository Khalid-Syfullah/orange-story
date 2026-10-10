import { describe, expect, it } from "vitest";

import { GRAFT, SCENES } from "@/scroll/script";

import { cuttingAt, fruitAt, handsIn, knotAt, leftHandAt, rightHandAt, twineAt } from "./graft-hands";

const graft = SCENES.find((s) => s.id === "graft")!;

describe("the graft", () => {
  it("starts empty: hands out of frame, no twine, no knot, no fruit", () => {
    const p = graft.start;
    expect(handsIn(p)).toBe(0);
    expect(leftHandAt(p).x).toBeLessThan(-2);
    expect(rightHandAt(p).x).toBeGreaterThan(2);
    expect(twineAt(p)).toBe(0);
    expect(knotAt(p)).toEqual([0, 0, 0]);
    expect(fruitAt(p)).toBe(0);
  });

  it("ties the knot in three steps, one frame showing at the end of each", () => {
    expect(knotAt(GRAFT.knot[0][1])[0]).toBeCloseTo(1);
    expect(knotAt(GRAFT.knot[1][1])[1]).toBeCloseTo(1);
    expect(knotAt(GRAFT.knot[2][1])).toEqual([0, 0, 1]);
  });

  it("fits the cutting into the cleft, then the hands leave and the tree fruits", () => {
    expect(cuttingAt(GRAFT.fit[1])).toMatchObject({ x: 0, y: 0, rotate: 0 });
    expect(handsIn(GRAFT.exit[1])).toBe(0);
    expect(fruitAt(GRAFT.fruit[1])).toBe(1);
  });

  it("is a pure function of progress (same value both ways)", () => {
    const p = GRAFT.wrap[0] + 0.001;
    expect(twineAt(p)).toBe(twineAt(p));
    expect(knotAt(GRAFT.knot[1][0])).toEqual(knotAt(GRAFT.knot[1][0]));
  });
});
