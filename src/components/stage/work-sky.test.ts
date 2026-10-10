import { describe, expect, it } from "vitest";

import { WORK, SCENES } from "@/scroll/script";

import { BUILDERS } from "./acting";
import { builderAt, cloudShiftAt, driftX, giantOrangeAt, RISE_FROM, WRAP_SPAN } from "./work-sky";

describe("the work", () => {
  it("keeps the giant orange hidden below until card 3, then rises to its place", () => {
    const work = SCENES.find((s) => s.id === "work")!;
    expect(giantOrangeAt(work.start)).toEqual({ y: -RISE_FROM, opacity: 0 });
    const done = giantOrangeAt(WORK.rise[1]);
    expect(done.y).toBeCloseTo(0);
    expect(done.opacity).toBe(1);
    expect(giantOrangeAt((WORK.rise[0] + WORK.rise[1]) / 2).y).toBeGreaterThan(-RISE_FROM);
  });

  it("brings the builder up with the orange and works his mallet only once there", () => {
    expect(builderAt(WORK.rise[1]).y).toBeCloseTo(0);
    expect(builderAt(WORK.rise[0]).opacity).toBe(0);
    const arm = BUILDERS.work.forearm;
    expect(arm(WORK.strikes[0])).toBe(0);
    expect(WORK.strikes[0]).toBeGreaterThan((WORK.rise[0] + WORK.rise[1]) / 2);
    // His mallet is on the left: a blow turns his forearm counter-clockwise.
    const values = Array.from({ length: 801 }, (_, i) => arm(WORK.strikes[0] + ((WORK.strikes[1] - WORK.strikes[0]) * i) / 800));
    expect(Math.max(...values)).toBeGreaterThan(0.15);
    expect(Math.min(...values)).toBeLessThan(-0.08);
  });

  it("shifts clouds right as the story advances, near clouds more", () => {
    const a = cloudShiftAt(WORK.clouds[0], 2);
    const b = cloudShiftAt(WORK.clouds[1], 2);
    expect(b).toBeGreaterThan(a);
    expect(cloudShiftAt(WORK.clouds[1], 1.5)).toBeGreaterThan(cloudShiftAt(WORK.clouds[1], 6));
  });

  it("drifts clouds right on idle time and wraps them far offscreen", () => {
    expect(driftX(0, 3, 10)).toBeGreaterThan(driftX(0, 3, 0));
    const x = driftX(5, 3, 1e5);
    expect(Math.abs(5 + x)).toBeLessThanOrEqual(WRAP_SPAN / 2);
  });
});
