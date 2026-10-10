import { describe, expect, it } from "vitest";

import { CAMERA, FALL, FALL_FLIGHT, fallingOrangeAt, PHYSICS, SCENES, SCREEN, TRANSITIONS } from "@/scroll/script";

import { createCameraPath, projectPoint } from "./camera-path";
import {
  BRANCH_FRUIT,
  BRANCH_MIDDLE,
  BRANCH_SCALE,
  cutBranchAt,
  cutShake,
  fallArmsTurn,
  fallShearsClosed,
  gardenerX,
  GARDENER_DRIFT,
  orangeFrame,
  REACH,
  squashAt,
  stillBranchOpacity,
} from "./fall-plan";

const fall = SCENES.find((s) => s.id === "fall")!;
const steps = (a: number, b: number, n = 400) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const path = createCameraPath(CAMERA);

describe("fall plan", () => {
  it("keeps every range inside the fall scene, in order", () => {
    for (const [name, range] of Object.entries(FALL)) {
      expect(range[0], name).toBeGreaterThanOrEqual(fall.start);
      expect(range[1], name).toBeLessThanOrEqual(fall.end);
      expect(range[1], name).toBeGreaterThan(range[0]);
    }
    expect(FALL.reach[1]).toBeLessThanOrEqual(FALL.snip[0]);
    expect(FALL.snip[1]).toBeLessThanOrEqual(FALL.cut[0]);
    expect(FALL.release[0]).toBe(FALL.cut[1]);
    expect(FALL.lower[0]).toBeGreaterThan(FALL.cut[1]);
  });

  it("has the gardener raise the shears to the branch, squeeze them shut and lower them, the frames swapping in the quick part", () => {
    expect(fallArmsTurn(fall.start)).toBe(0);
    expect(fallArmsTurn(FALL.reach[1])).toBeCloseTo(REACH, 9);
    expect(fallShearsClosed(FALL.snip[0])).toBe(0);
    expect(fallShearsClosed(FALL.cut[0])).toBe(1);
    expect(fallShearsClosed(FALL.lower[1])).toBe(0);
    expect(fallArmsTurn(FALL.lower[1])).toBeCloseTo(0, 9);
    // Mid-swap, the arms are moving fast.
    for (const p of steps(FALL.lower[0], FALL.lower[1], 2000)) {
      const v = fallShearsClosed(p);
      if (v < 0.2 || v > 0.8) continue;
      const speed = Math.abs(fallArmsTurn(p + 1e-6) - fallArmsTurn(p - 1e-6)) / 2e-6;
      expect(speed * (FALL.lower[1] - FALL.lower[0])).toBeGreaterThan(0.5 * Math.abs(REACH));
    }
  });

  it("holds the still branch until the cut, then hands over to the cut branch at rest, which falls on its own flight", () => {
    expect(stillBranchOpacity(fall.start)).toBe(1);
    expect(stillBranchOpacity(FALL.cut[1])).toBe(0);
    expect(cutBranchAt(FALL.cut[0]).opacity).toBe(0);
    const freed = cutBranchAt(FALL.cut[1]);
    expect(freed.x).toBeCloseTo(BRANCH_MIDDLE[0], 9);
    expect(freed.y).toBeCloseTo(BRANCH_MIDDLE[1], 9);
    expect(freed.rotate).toBeCloseTo(0, 12);
    // Faster and faster down, turning, and gone by the end of its stretch.
    let last = freed.y;
    let lastDrop = 0;
    for (const p of steps(FALL.cut[1], FALL.branch[1], 40).slice(1)) {
      const y = cutBranchAt(p).y;
      expect(y).toBeLessThan(last);
      expect(last - y).toBeGreaterThan(lastDrop * 0.999);
      lastDrop = last - y;
      last = y;
    }
    expect(cutBranchAt(FALL.branch[1]).opacity).toBe(0);
    expect(Math.abs(cutBranchAt(FALL.branch[1]).rotate)).toBeGreaterThan(0.3);
    // The tree springs back as the weight comes off, and settles.
    expect(cutShake(FALL.cut[1])).toBeCloseTo(0, 12);
    expect(Math.max(...steps(FALL.cut[1], FALL.lower[1]).map((p) => Math.abs(cutShake(p))))).toBeGreaterThan(0.3);
    expect(Math.abs(cutShake(fall.end))).toBeLessThan(1e-3);
  });

  it("drifts the gardener right and out of frame, from rest", () => {
    expect(gardenerX(FALL.gardener[0])).toBe(0);
    expect(gardenerX(FALL.gardener[1])).toBe(GARDENER_DRIFT);
    for (const p of steps(FALL.gardener[0], FALL.gardener[1])) expect(gardenerX(p)).toBeGreaterThanOrEqual(0);
  });

  it("starts the orange where the fruit hung, at the size of the fruit, hidden before the cut", () => {
    const frame = orangeFrame(FALL.release[0]);
    expect(frame.x).toBeCloseTo(BRANCH_FRUIT.x, 6);
    expect(frame.y).toBeCloseTo(BRANCH_FRUIT.y, 6);
    expect(frame.scale).toBeCloseTo(BRANCH_SCALE, 6);
    expect(frame.opacity).toBe(1);
    expect(orangeFrame(fall.start).opacity).toBe(0);
  });

  it("flies a true flight: gravity and drag, never growing, faster and faster until it strikes", () => {
    const g = PHYSICS.gravity;
    const seconds = (q: number) => (q / SCREEN) * PHYSICS.secondsPerScreen;
    for (const p of steps(FALL.release[0], FALL.release[1], 50).slice(1, -1)) {
      const o = fallingOrangeAt(p);
      // The drag equation: dv/dt = -g - k v (checked by a small step).
      const dp = 1e-6;
      const later = fallingOrangeAt(p + dp);
      const accel = (later.vy - o.vy) / seconds(dp);
      expect(accel).toBeCloseTo(-g - FALL_FLIGHT.air * o.vy, 1);
      expect(orangeFrame(p).scale).toBe(BRANCH_SCALE);
    }
    const before = fallingOrangeAt(FALL.release[1] - 1e-5);
    expect(before.vy).toBeLessThan(-4);
  });

  it("strikes at the ring's origin on the screen, filling the center, and sinks, pressed flat and ringing round, its speed never jumping", () => {
    const ring = TRANSITIONS.find((t) => t.id === "ring")!;
    expect(ring.start).toBe(FALL.release[1]);
    const o = fallingOrangeAt(FALL.release[1]);
    const pose = path.seek(FALL.release[1]);
    const { x: sx, y: sy } = projectPoint(pose, [o.x, o.y, 0], 1.6, 1);
    expect(sx).toBeCloseTo(ring.origin![0] * 1.6, 2);
    expect(sy).toBeCloseTo(ring.origin![1], 2);
    // It fills the center: a fifth of the view's height.
    const half = Math.abs(pose.pz) * Math.tan((pose.fov * Math.PI) / 360);
    expect(BRANCH_FRUIT.diameter / (2 * half)).toBeGreaterThan(0.15);
    // Its speed is taken in a moment, without a jump.
    const at = (dt: number) => fallingOrangeAt(FALL.release[1] + dt).vy;
    expect(Math.abs(at(1e-7) - at(-1e-7))).toBeLessThan(0.01);
    expect(Math.abs(at(0.3 * SCREEN))).toBeLessThan(0.25 * Math.abs(at(0)));
    expect(squashAt(FALL.release[1])).toBe(0);
    expect(Math.max(...steps(FALL.release[1], FALL.push[1]).map(squashAt))).toBeGreaterThan(0.5 * FALL_FLIGHT.squash.amount);
    expect(Math.abs(squashAt(fall.end))).toBeLessThan(1e-3);
  });

  it("stays on the screen while the camera follows it down", () => {
    for (const p of steps(FALL.release[0], FALL.release[1], 60)) {
      const o = fallingOrangeAt(p);
      const { x, y: sy } = projectPoint(path.seek(p), [o.x, o.y, 0], 1.6, 1);
      const sx = x / 1.6;
      expect(sx).toBeGreaterThan(0.05);
      expect(sx).toBeLessThan(0.95);
      expect(sy).toBeGreaterThan(0.05);
      expect(sy).toBeLessThan(0.95);
    }
  });

  it("goes soft, then fades out before the scene ends", () => {
    let prevBlur = 0;
    for (const p of steps(FALL.soften[0], FALL.soften[1])) {
      const { blur } = orangeFrame(p);
      expect(blur).toBeGreaterThanOrEqual(prevBlur - 1e-9);
      prevBlur = blur;
    }
    expect(orangeFrame(FALL.soften[1]).blur).toBeGreaterThan(0.02);
    expect(orangeFrame(FALL.fade[1]).opacity).toBe(0);
  });

  it("is a pure function of progress (same answer going back)", () => {
    const a = { ...orangeFrame(0.6) };
    orangeFrame(0.5);
    expect(orangeFrame(0.6)).toEqual(a);
  });
});
