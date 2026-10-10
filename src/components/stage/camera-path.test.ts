import { describe, expect, it } from "vitest";

import { CAMERA } from "@/scroll/script";

import { createCameraPath, poseOf, type CameraPose } from "./camera-path";

const FIELDS: readonly (keyof CameraPose)[] = ["px", "py", "pz", "tx", "ty", "tz", "fov"];
/** The pose's values only (GSAP keeps its own bookkeeping on the target object). */
const copy = (pose: CameraPose): CameraPose => Object.fromEntries(FIELDS.map((f) => [f, pose[f]])) as unknown as CameraPose;

/** The story curve's steepest slope (at its start): 1 / 0.22. */
const STEEPEST = 1 / 0.22;

describe("the camera path", () => {
  it("passes through every key of the script", () => {
    const path = createCameraPath(CAMERA);
    for (const key of CAMERA) {
      const pose = copy(path.seek(key.at));
      const expected = poseOf(key);
      for (const field of FIELDS) expect(pose[field], `${key.scene} at ${key.at} ${field}`).toBeCloseTo(expected[field], 6);
    }
    path.kill();
  });

  it("holds the first key before it and the last key after it", () => {
    const path = createCameraPath(CAMERA);
    expect(copy(path.seek(-1))).toEqual(poseOf(CAMERA[0]));
    const last = poseOf(CAMERA[CAMERA.length - 1]);
    for (const field of FIELDS) expect(path.seek(1)[field]).toBeCloseTo(last[field], 6);
    path.kill();
  });

  it("never cuts and never overshoots: every move eases from one key to the next", () => {
    const path = createCameraPath(CAMERA);
    const steps = 200;
    for (let i = 0; i + 1 < CAMERA.length; i++) {
      const a = poseOf(CAMERA[i]);
      const b = poseOf(CAMERA[i + 1]);
      const span = CAMERA[i + 1].at - CAMERA[i].at;
      let previous = copy(path.seek(CAMERA[i].at));
      for (let s = 1; s <= steps; s++) {
        const pose = copy(path.seek(CAMERA[i].at + (span * s) / steps));
        for (const field of FIELDS) {
          const lo = Math.min(a[field], b[field]) - 1e-9;
          const hi = Math.max(a[field], b[field]) + 1e-9;
          expect(pose[field] >= lo && pose[field] <= hi, `${CAMERA[i].scene} ${field} leaves its move`).toBe(true);
          const largestStep = (STEEPEST * Math.abs(b[field] - a[field])) / steps + 1e-6;
          expect(Math.abs(pose[field] - previous[field]), `${CAMERA[i].scene} ${field} jumps`).toBeLessThanOrEqual(largestStep);
        }
        previous = pose;
      }
    }
    path.kill();
  });

  it("plays backwards exactly", () => {
    const path = createCameraPath(CAMERA);
    const probes = [0.01, 0.05, 0.12, 0.2, 0.235, 0.41, 0.45, 0.6, 0.7, 0.9];
    const forward = probes.map((p) => copy(path.seek(p)));
    const backward = [...probes].reverse().map((p) => copy(path.seek(p))).reverse();
    expect(backward).toEqual(forward);
    // Jumping around lands on the same pose as arriving in order.
    path.seek(0.95);
    const jumped = copy(path.seek(0.12));
    expect(jumped).toEqual(forward[2]);
    path.kill();
  });
});
