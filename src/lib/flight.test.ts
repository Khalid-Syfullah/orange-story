import { describe, expect, it } from "vitest";

import { dragAxis } from "./flight";
import { hermiteAt, monotoneSlopes } from "./monotone";

describe("a flight with drag", () => {
  it("is a parabola without drag, and approaches the terminal speed with it", () => {
    const out: [number, number] = [0, 0];
    dragAxis(1, 2, -9.81, 0, 0.5, out);
    expect(out[0]).toBeCloseTo(1 + 2 * 0.5 - 0.5 * 9.81 * 0.25, 12);
    expect(out[1]).toBeCloseTo(2 - 9.81 * 0.5, 12);
    dragAxis(0, 0, -9.81, 2, 10, out);
    expect(out[1]).toBeCloseTo(-9.81 / 2, 6);
  });

  it("obeys dv/dt = a - k v, and starts where and as fast as it was let go", () => {
    const at = (t: number) => dragAxis(3, 1.5, -9.81, 0.7, t, [0, 0]);
    expect(at(0)).toEqual([3, 1.5]);
    for (const t of [0.1, 0.5, 1.3]) {
      const h = 1e-6;
      const [x0, v0] = at(t);
      const [x1, v1] = at(t + h);
      expect((x1 - x0) / h).toBeCloseTo(v0, 4);
      expect((v1 - v0) / h).toBeCloseTo(-9.81 - 0.7 * v0, 3);
    }
  });
});

describe("monotone curves", () => {
  it("never overshoot a key, rest at turning points, and keep going at the ends when asked", () => {
    const times = [0, 1, 2, 3];
    const values = [0, 1, 1.2, 3];
    const slopes = monotoneSlopes(times, values);
    expect(slopes[0]).toBe(0);
    expect(slopes[3]).toBe(0);
    const secant = monotoneSlopes(times, values, [], "secant");
    expect(secant[0]).toBeCloseTo(1, 12);
    expect(secant[3]).toBeCloseTo(1.8, 12);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k <= 20; k++) {
        const v = hermiteAt(i + k / 20, i, values[i], secant[i], i + 1, values[i + 1], secant[i + 1]);
        expect(v).toBeGreaterThanOrEqual(values[i] - 1e-12);
        expect(v).toBeLessThanOrEqual(values[i + 1] + 1e-12);
      }
    }
    expect(monotoneSlopes([0, 1, 2], [0, 1, 0])[1]).toBe(0);
  });
});
