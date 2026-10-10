import { describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { ACTING, CAMERA, PLUCK, SCENES } from "@/scroll/script";

import { harvesterHeadAt } from "./acting";
import { createCameraPath } from "./camera-path";
import { fromAnchor, newPose, placeOn } from "./motion-kit";
import { ARM_DOWN, carryAt, carryScale, foliageAt, HAND_DEPTH, HELD, HELD_SCALE, handAt, harvesterAt, HERO_SCALE, heroOrangeAt, inHisHand, SNAP } from "./pluck-harvest";

const pluck = SCENES.find((s) => s.id === "pluck")!;
const path = createCameraPath(CAMERA);
const steps = (a: number, b: number, n = 300) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const orange = plateEntry("pluck/hero-orange");
const BALL = fromAnchor("pluck/hero-orange", "centre");

/** Where the ball's centre is, at progress p (from the plate's pose). */
function ballAt(p: number): [number, number] {
  const o = heroOrangeAt(p);
  return placeOn(newPose(orange.position[0] + o.x, orange.position[1] + o.y, o.rotate, o.scale), BALL);
}

/** World y of the bottom of the frame at a depth, at progress p. */
function frameBottom(p: number, depth: number): number {
  const pose = path.seek(p);
  return pose.py - (pose.pz + depth) * Math.tan((pose.fov * Math.PI) / 360);
}

describe("the pluck", () => {
  it("starts where the graft ended: the hand below the frame, the orange on its branch", () => {
    const p = pluck.start;
    const hand = handAt(p);
    expect(hand.grip[1]).toBeLessThan(frameBottom(p, HAND_DEPTH));
    const o = heroOrangeAt(p);
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.y).toBeCloseTo(0, 9);
    expect(o.scale).toBeCloseTo(HERO_SCALE, 9);
    expect(foliageAt(p)).toEqual({ near: { opacity: 1, scale: 1 }, mid: { opacity: 1 } });
  });

  it("reaches the fruit on an arc, its elbow bending, then closes its fingers round it before the camera moves", () => {
    const reached = handAt(PLUCK.rise[1]);
    const ball = ballAt(PLUCK.rise[1]);
    expect(Math.hypot(reached.grip[0] - ball[0], reached.grip[1] - ball[1])).toBeLessThan(0.01);
    // The hand travels on an arc, not a straight line: its path bows away from the chord.
    const a = handAt(PLUCK.rise[0]).grip;
    const b = reached.grip;
    const m = handAt((PLUCK.rise[0] + PLUCK.rise[1]) / 2).grip;
    const off = Math.abs((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(off).toBeGreaterThan(0.02);
    expect(Math.abs(reached.elbow)).toBeGreaterThan(0.05);
    expect(handAt(PLUCK.grasp[0]).curl).toBeCloseTo(0, 9);
    expect(handAt(PLUCK.grasp[1]).curl).toBeGreaterThan(0.25);
    expect(PLUCK.grasp[1]).toBeLessThanOrEqual(PLUCK.tug[0]);
    expect(carryAt(PLUCK.dolly[0])).toBe(0);
  });

  it("keeps the fruit in the hand from the grasp to the handoff: its centre on the hand's grip", () => {
    for (const p of steps(PLUCK.grasp[1], PLUCK.handoff[0])) {
      const grip = handAt(p).grip;
      const ball = ballAt(p);
      expect(ball[0], `at ${p.toFixed(4)}`).toBeCloseTo(grip[0], 9);
      expect(ball[1], `at ${p.toFixed(4)}`).toBeCloseTo(grip[1], 9);
      // The fruit and the hand are drawn at one scale: it fits the hand it is in.
      expect(heroOrangeAt(p).scale / handAt(p).scale).toBeCloseTo(HELD_SCALE, 9);
    }
  });

  it("tugs until the stem snaps, then follows through", () => {
    const before = ballAt(PLUCK.tug[0])[1];
    const atSnap = ballAt(SNAP)[1];
    const after = ballAt(PLUCK.tug[1])[1];
    expect(atSnap).toBeLessThan(before);
    expect(after).toBeLessThan(atSnap);
  });

  it("carries the fruit down with the camera into the harvester's open hand, swung up to meet it", () => {
    // Within a couple of millimetres (the closed fingers shift the grip a hair; the handoff takes it the rest of the way).
    const end = ballAt(PLUCK.dolly[1]);
    expect(Math.hypot(end[0] - HELD[0], end[1] - HELD[1])).toBeLessThan(0.003);
    expect(carryScale(PLUCK.dolly[1])).toBeCloseTo(HELD_SCALE, 9);
    // His arm hangs, swings up a touch past the held pose and settles there as the fruit arrives.
    expect(harvesterAt(PLUCK.armUp[0]).arm).toBeCloseTo(ARM_DOWN, 9);
    expect(Math.min(...steps(PLUCK.armUp[0], PLUCK.armUp[1]).map((p) => harvesterAt(p).arm))).toBeLessThan(0);
    expect(harvesterAt(PLUCK.armUp[1]).arm).toBeCloseTo(0, 9);
    expect(PLUCK.armUp[1]).toBeLessThanOrEqual(PLUCK.handoff[0]);
    // It changes hands while both are still, and is his from then on.
    expect(inHisHand(PLUCK.handoff[0])).toBe(0);
    expect(inHisHand(PLUCK.handoff[1])).toBe(1);
    const held = ballAt(pluck.end);
    expect(held[0]).toBeCloseTo(HELD[0], 9);
    expect(held[1]).toBeCloseTo(HELD[1], 9);
  });

  it("drops the hand that carried it out of the frame, and turns his head to the orange a beat after his arm", () => {
    const p = PLUCK.release[1];
    const hand = handAt(p);
    // Its fingertips are below the frame by the end of the release.
    const tips = placeOn(newPose(plateEntry("pluck/hand").position[0] + hand.x, plateEntry("pluck/hand").position[1] + hand.y, hand.rotate, hand.scale), fromAnchor("pluck/hand", "fingertips"));
    expect(tips[1]).toBeLessThan(frameBottom(p, HAND_DEPTH));
    // The head settles after the arm has arrived.
    expect(ACTING.harvesterHead[0]).toBeGreaterThan(PLUCK.armUp[0]);
    expect(ACTING.harvesterHead[1]).toBeGreaterThan(PLUCK.armUp[1]);
    expect(Math.abs(harvesterHeadAt(PLUCK.armUp[1]))).toBeGreaterThan(0.02);
    expect(harvesterHeadAt(ACTING.harvesterHead[1])).toBeCloseTo(0, 12);
  });

  it("is a pure function of progress (the same value both ways)", () => {
    const a = pluck.start + 0.3 * (pluck.end - pluck.start);
    const forward = JSON.stringify([handAt(a), heroOrangeAt(a), harvesterAt(a)]);
    handAt(pluck.end);
    handAt(pluck.start);
    expect(JSON.stringify([handAt(a), heroOrangeAt(a), harvesterAt(a)])).toBe(forward);
  });

  it("keeps its timings inside the scene, in order", () => {
    const inside = (r: readonly [number, number]) => r[0] >= pluck.start && r[1] <= pluck.end && r[0] < r[1];
    for (const r of [PLUCK.rise, PLUCK.grasp, PLUCK.tug, PLUCK.dolly, PLUCK.foliage.near, PLUCK.foliage.mid, PLUCK.reveal, PLUCK.armUp, PLUCK.handoff, PLUCK.release]) expect(inside(r)).toBe(true);
    expect(PLUCK.rise[1]).toBeLessThanOrEqual(PLUCK.dolly[0]);
    expect(PLUCK.handoff[0]).toBeGreaterThanOrEqual(PLUCK.dolly[1]);
  });
});
