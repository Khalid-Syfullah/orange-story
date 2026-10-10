import { describe, expect, it } from "vitest";

import { CAMERA, SCENES, SHARE } from "@/scroll/script";

import { HELD, heldOffset } from "./pluck-harvest";
import { CLOSED_SCALE, CUT_X, EDGE, halvesAt, heldEdges, knifeAt, knifeTip, leftEdgeAt, rightEdgeAt, secondHandAt, UNIT, wholeOrangeAt } from "./share-cut";

const share = SCENES.find((s) => s.id === "share")!;
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

describe("the cut and the share", () => {
  it("starts as the pluck ended: the whole orange in his hand, no knife, no second hand, no halves", () => {
    const p = share.start;
    const whole = wholeOrangeAt(p);
    expect(whole.opacity).toBe(1);
    expect(whole.x).toBeCloseTo(heldOffset().x);
    expect(knifeAt(p).opacity).toBe(0);
    expect(secondHandAt(p).opacity).toBe(0);
    const halves = halvesAt(p);
    expect(halves.peel).toBe(0);
    expect(halves.face).toBe(0);
  });

  it("brings the knife in above the orange and plunges it down through, then withdraws it", () => {
    expect(knifeAt(SHARE.knifeIn[1]).opacity).toBe(1);
    const top = knifeTip(SHARE.cut[0]);
    const bottom = knifeTip(SHARE.cut[1]);
    expect(bottom.y).toBeLessThan(top.y - 0.8 * UNIT);
    // The tip passes the whole width of the orange's height: from above its top to below its bottom.
    expect(top.y).toBeGreaterThan(HELD[1] + 0.3 * UNIT);
    expect(bottom.y).toBeLessThan(HELD[1] - 0.3 * UNIT);
    // It cuts at the middle of the orange.
    expect(top.x).toBeCloseTo(CUT_X, 1);
    expect(knifeAt(SHARE.knifeOut[1]).opacity).toBe(0);
  });

  it("swaps the whole orange for its peels while the blade is inside it", () => {
    const tip = knifeTip(mid(SHARE.split)).y;
    expect(tip).toBeLessThan(HELD[1] + 0.34 * UNIT);
    expect(tip).toBeGreaterThan(HELD[1] - 0.34 * UNIT);
    expect(wholeOrangeAt(SHARE.split[1]).opacity).toBe(0);
    expect(halvesAt(SHARE.split[1]).peel).toBe(1);
  });

  it("opens the halves from one cut line and reveals the cut faces as they part", () => {
    expect(leftEdgeAt(SHARE.open[0])).toBeCloseTo(CUT_X);
    expect(rightEdgeAt(SHARE.open[0])).toBeCloseTo(CUT_X);
    expect(halvesAt(SHARE.open[0]).scale).toBeCloseTo(CLOSED_SCALE);
    expect(halvesAt(SHARE.open[0]).face).toBe(0);
    const open = halvesAt(SHARE.open[1]);
    expect(open.face).toBe(1);
    expect(rightEdgeAt(SHARE.open[1]) - leftEdgeAt(SHARE.open[1])).toBeGreaterThan(0.3 * UNIT);
    expect(open.scale).toBeCloseTo(1);
  });

  it("brings a second hand in from center left, takes the left half and holds the halves together", () => {
    expect(secondHandAt(SHARE.reach[0]).opacity).toBe(0);
    expect(secondHandAt(SHARE.reach[0]).x).toBeLessThan(-4 * UNIT);
    // It arrives at the half, which then travels outward with it.
    const arrived = secondHandAt(SHARE.reach[1]);
    expect(arrived.opacity).toBe(1);
    expect(Math.abs(arrived.x)).toBeLessThan(0.2 * UNIT);
    expect(leftEdgeAt(SHARE.take[1])).toBeCloseTo(EDGE.takenLeft);
    expect(secondHandAt(SHARE.take[1]).x).toBeLessThan(arrived.x - 0.2 * UNIT);
    // Both hands hold the halves, side by side, at their manifest places.
    const end = SHARE.together[1];
    const held = heldEdges();
    expect(leftEdgeAt(end)).toBeCloseTo(held.left);
    expect(rightEdgeAt(end)).toBeCloseTo(held.right);
    expect(secondHandAt(end).x).toBeCloseTo(0);
    const halves = halvesAt(end);
    expect(halves.left.x).toBeCloseTo(0);
    expect(halves.right.x).toBeCloseTo(0);
    expect(halves.left.y).toBeCloseTo(0);
    // The halves are still held, not moving, at the end of the scene.
    expect(halvesAt(share.end)).toEqual(halves);
  });

  it("is a pure function of progress (the same value both ways)", () => {
    const a = share.start + 0.4 * (share.end - share.start);
    const forward = [knifeAt(a), halvesAt(a), secondHandAt(a), wholeOrangeAt(a)];
    knifeAt(share.end);
    knifeAt(share.start);
    expect([knifeAt(a), halvesAt(a), secondHandAt(a), wholeOrangeAt(a)]).toEqual(forward);
  });

  it("keeps its timings inside the scene, in order, and holds before the viewfinder peaks and the camera pushes on", () => {
    const inside = (r: readonly [number, number]) => r[0] >= share.start && r[1] <= share.end && r[0] < r[1];
    for (const r of [SHARE.knifeIn, SHARE.cut, SHARE.split, SHARE.knifeOut, SHARE.open, SHARE.reach, SHARE.take, SHARE.together]) expect(inside(r)).toBe(true);
    expect(SHARE.knifeIn[1]).toBeLessThanOrEqual(SHARE.cut[0]);
    expect(SHARE.split[0]).toBeGreaterThanOrEqual(SHARE.cut[0]);
    expect(SHARE.split[1]).toBeLessThanOrEqual(SHARE.cut[1]);
    expect(SHARE.knifeOut[0]).toBeGreaterThanOrEqual(SHARE.cut[1]);
    expect(SHARE.open[1]).toBeLessThanOrEqual(SHARE.take[0]);
    expect(SHARE.reach[1]).toBeLessThanOrEqual(SHARE.take[0]);
    expect(SHARE.take[1]).toBeLessThanOrEqual(SHARE.together[0]);
    // The camera reaches the halves shot by the time they are together, and pushes in after.
    const keys = CAMERA.filter((k) => k.scene === "share");
    // The halves shot: the first held shot nearer than the harvester's.
    const halvesKey = keys.find((k) => k.move === "hold" && k.position[2] < keys[0].position[2])!;
    expect(halvesKey.at).toBeLessThanOrEqual(SHARE.together[1]);
  });
});
