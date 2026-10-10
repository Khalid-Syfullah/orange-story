import { describe, expect, it } from "vitest";

import { CAMERA, SCENES, SHARE } from "@/scroll/script";

import { createCameraPath } from "./camera-path";
import { HAND_DEPTH, HELD, heldOffset } from "./pluck-harvest";
import { CUT_X, halvesAt, inSecondHand, knifeTip, palmGive, secondHandAt, TIP_OPEN, UNIT, wholeOrangeAt } from "./share-cut";

const share = SCENES.find((s) => s.id === "share")!;
const path = createCameraPath(CAMERA);
const steps = (a: number, b: number, n = 300) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const at = (r: readonly [number, number], s: number) => r[0] + (r[1] - r[0]) * s;

/** World y of the bottom of the frame at a depth, at progress p. */
function frameBottom(p: number, depth: number): number {
  const pose = path.seek(p);
  return pose.py - (pose.pz + depth) * Math.tan((pose.fov * Math.PI) / 360);
}

/** The orange's radius in his hand (its ball is three quarters of its plate). */
const RADIUS = 0.33 * UNIT;

describe("the cut and the share", () => {
  it("starts as the pluck ended: the whole orange in his hand, the knife and the second hand below the frame", () => {
    const p = share.start;
    const whole = wholeOrangeAt(p);
    expect(whole.opacity).toBe(1);
    expect(whole.x).toBeCloseTo(heldOffset().x, 9);
    expect(whole.y).toBeCloseTo(heldOffset().y, 9);
    expect(knifeTip(p).y).toBeLessThan(frameBottom(p, 1.679));
    expect(secondHandAt(p).grip[1]).toBeLessThan(frameBottom(p, HAND_DEPTH));
    expect(halvesAt(p).peel).toBe(0);
  });

  it("brings the knife up over the orange and cuts down through its middle to his palm", () => {
    const above = knifeTip(SHARE.cut[0]);
    expect(above.y).toBeGreaterThan(HELD[1] + RADIUS);
    expect(Math.abs(above.x - CUT_X)).toBeLessThan(0.05 * UNIT);
    const palm = knifeTip(SHARE.cut[1]);
    expect(palm.y).toBeLessThan(HELD[1] - 0.9 * RADIUS);
    expect(palm.y).toBeGreaterThan(HELD[1] - 1.2 * RADIUS);
    // On the cut line all the way through.
    for (const p of steps(SHARE.cut[0], SHARE.cut[1], 60)) expect(Math.abs(knifeTip(p).x - CUT_X)).toBeLessThan(0.08 * UNIT);
    // A small lift before it goes in.
    expect(Math.max(...steps(SHARE.cut[0], at(SHARE.cut, 0.3), 60).map((p) => knifeTip(p).y))).toBeGreaterThan(above.y);
  });

  it("goes slower through the rind than through the flesh", () => {
    const speed = (a: number, b: number) => Math.abs(knifeTip(at(SHARE.cut, b)).y - knifeTip(at(SHARE.cut, a)).y) / (b - a);
    const { lift, rind, flesh } = SHARE.cutPace;
    expect(speed(lift, rind)).toBeLessThan(0.5 * speed(rind, flesh));
    expect(speed(flesh, 1)).toBeLessThan(0.5 * speed(rind, flesh));
  });

  it("swaps the whole orange for its peels while the blade is inside it", () => {
    const tip = knifeTip(at(SHARE.split, 0.5)).y;
    expect(tip).toBeLessThan(HELD[1] + 1.05 * RADIUS);
    expect(tip).toBeGreaterThan(HELD[1] - RADIUS);
    expect(wholeOrangeAt(SHARE.split[1]).opacity).toBe(0);
    expect(halvesAt(SHARE.split[1]).peel).toBe(1);
  });

  it("tips the halves apart about their cut edges, rocking, and lets them settle in his palm with their faces up", () => {
    expect(halvesAt(SHARE.open[0]).right.rotate).toBeCloseTo(0, 12);
    const tilts = steps(SHARE.open[0], SHARE.reach[0], 300).map((p) => -halvesAt(p).right.rotate);
    // It falls past its rest and comes back (a rock), then settles.
    expect(Math.max(...tilts)).toBeGreaterThan(TIP_OPEN * 1.02);
    // Nearly settled by the time her hand comes for the left half, and still by the end.
    expect(Math.abs(-halvesAt(SHARE.reach[0]).right.rotate - TIP_OPEN)).toBeLessThan(0.03);
    expect(-halvesAt(SHARE.together[1]).right.rotate).toBeCloseTo(TIP_OPEN, 4);
    expect(halvesAt(SHARE.faces[0]).face).toBe(0);
    expect(halvesAt(SHARE.faces[1]).face).toBe(1);
    // His palm gives under the blade, and comes back.
    expect(palmGive(at(SHARE.cut, 0.7))).toBeGreaterThan(0);
    expect(palmGive(SHARE.knifeOut[1])).toBeCloseTo(0, 9);
  });

  it("brings a second hand up to the left half, passes the half into it, and brings the halves together", () => {
    expect(inSecondHand(SHARE.take[0])).toBe(0);
    expect(inSecondHand(at(SHARE.take, 0.4))).toBe(1);
    // Where the half passes over, her grip is under it and her hand is still (only her fingers close a little round it).
    const a = secondHandAt(SHARE.take[0]).grip;
    const b = secondHandAt(at(SHARE.take, 0.35)).grip;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.025 * UNIT);
    // Together, the cut edges a hand's breadth of air apart at most, and still.
    const end = halvesAt(SHARE.together[1]);
    expect(end.rightEdge[0] - end.leftEdge[0]).toBeLessThan(0.25 * UNIT);
    expect(end.rightEdge[0] - end.leftEdge[0]).toBeGreaterThan(0);
    const last = halvesAt(share.end);
    for (const k of ["x", "y", "rotate"] as const) {
      expect(last.left[k]).toBeCloseTo(end.left[k], 4);
      expect(last.right[k]).toBeCloseTo(end.right[k], 4);
    }
  });

  it("is a pure function of progress (the same value both ways)", () => {
    const p = share.start + 0.4 * (share.end - share.start);
    const forward = JSON.stringify([knifeTip(p), halvesAt(p), secondHandAt(p), wholeOrangeAt(p)]);
    knifeTip(share.end);
    secondHandAt(share.start);
    expect(JSON.stringify([knifeTip(p), halvesAt(p), secondHandAt(p), wholeOrangeAt(p)])).toBe(forward);
  });

  it("keeps its timings inside the scene, in order, and holds before the viewfinder peaks and the camera pushes on", () => {
    const inside = (r: readonly [number, number]) => r[0] >= share.start && r[1] <= share.end && r[0] < r[1];
    for (const r of [SHARE.knifeIn, SHARE.cut, SHARE.split, SHARE.knifeOut, SHARE.open, SHARE.faces, SHARE.reach, SHARE.take, SHARE.together]) expect(inside(r)).toBe(true);
    expect(SHARE.knifeIn[1]).toBeLessThanOrEqual(SHARE.cut[0]);
    expect(SHARE.split[0]).toBeGreaterThanOrEqual(SHARE.cut[0]);
    expect(SHARE.split[1]).toBeLessThanOrEqual(SHARE.cut[1]);
    expect(SHARE.knifeOut[0]).toBeGreaterThanOrEqual(SHARE.cut[1]);
    expect(SHARE.faces[0]).toBeGreaterThanOrEqual(SHARE.open[0]);
    expect(SHARE.reach[1]).toBeLessThanOrEqual(SHARE.take[0]);
    expect(SHARE.take[1]).toBeLessThanOrEqual(SHARE.together[0]);
    // The camera reaches the halves shot by the time they are together, and pushes in after.
    const keys = CAMERA.filter((k) => k.scene === "share");
    const halvesKey = keys.find((k) => k.move === "hold" && k.position[2] < keys[0].position[2])!;
    expect(halvesKey.at).toBeLessThanOrEqual(SHARE.together[1]);
  });
});
