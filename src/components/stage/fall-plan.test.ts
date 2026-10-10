import { describe, expect, it } from "vitest";

import { FALL, SCENES } from "@/scroll/script";

import { BRANCH_FRUIT, BRANCH_SCALE, RING_SCREEN_Y, branchDropY, cutBranchOpacity, gardenerX, GARDENER_DRIFT, orangeFrame, SPRITE_BALL, stillBranchOpacity } from "./fall-plan";

const fall = SCENES.find((s) => s.id === "fall")!;
const steps = (a: number, b: number, n = 200) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

describe("fall plan", () => {
  it("keeps every range inside the fall scene, in order", () => {
    for (const [name, range] of Object.entries(FALL)) {
      expect(range[0], name).toBeGreaterThanOrEqual(fall.start);
      expect(range[1], name).toBeLessThanOrEqual(fall.end);
      expect(range[1], name).toBeGreaterThan(range[0]);
    }
  });

  it("holds the still branch until the cut, after the prune scene has faded out", () => {
    expect(stillBranchOpacity(fall.start)).toBe(1);
    expect(stillBranchOpacity(FALL.cut[1])).toBe(0);
    expect(cutBranchOpacity(FALL.cut[0] - 0.0001)).toBe(0);
    expect(FALL.cut[0]).toBeGreaterThan(fall.start + 0.2 * (1 / 49));
  });

  it("drops the cut branch faster and faster, and lets it go", () => {
    let prev = 0;
    let prevSpeed = 0;
    for (const p of steps(FALL.branch[0], FALL.branch[1])) {
      const y = branchDropY(p);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
    prevSpeed = prev;
    expect(prevSpeed).toBeLessThan(-5);
    expect(cutBranchOpacity(FALL.branch[1])).toBe(0);
  });

  it("drifts the gardener right and out of frame", () => {
    expect(gardenerX(FALL.gardener[0])).toBe(0);
    expect(gardenerX(FALL.gardener[1])).toBe(GARDENER_DRIFT);
    for (const p of steps(FALL.gardener[0], FALL.gardener[1])) expect(gardenerX(p)).toBeGreaterThanOrEqual(0);
  });

  it("starts the orange where the fruit hung, at the size of the fruit", () => {
    const frame = orangeFrame(FALL.release[0]);
    expect(frame.x).toBeCloseTo(BRANCH_FRUIT.x, 6);
    expect(frame.y - SPRITE_BALL.drop * 0.55 * BRANCH_SCALE).toBeCloseTo(BRANCH_FRUIT.y, 6);
    expect(frame.scale).toBeCloseTo(BRANCH_SCALE, 6);
    expect(frame.opacity).toBe(1);
  });

  it("is hidden before the cut", () => {
    expect(orangeFrame(fall.start).opacity).toBe(0);
  });

  it("puts the orange at the ring's origin when the ring starts, and keeps it in front", () => {
    const frame = orangeFrame(FALL.release[1]);
    expect(frame.screenY).toBeCloseTo(RING_SCREEN_Y, 6);
    expect(frame.x).toBeCloseTo(0, 6);
    expect(frame.blur).toBe(0);
    expect(frame.opacity).toBe(1);
  });

  it("goes soft and keeps falling, then fades out before the scene ends", () => {
    let prevBlur = 0;
    let prevY = Infinity;
    for (const p of steps(FALL.soften[0], FALL.soften[1])) {
      const { blur } = orangeFrame(p);
      expect(blur).toBeGreaterThanOrEqual(prevBlur - 1e-9);
      prevBlur = blur;
    }
    for (const p of steps(FALL.exit[0], FALL.exit[1])) {
      const { screenY } = orangeFrame(p);
      expect(screenY).toBeLessThanOrEqual(prevY + 1e-9);
      prevY = screenY;
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
