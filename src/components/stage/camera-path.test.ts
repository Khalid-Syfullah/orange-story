import { afterEach, describe, expect, it } from "vitest";

import { plateBox } from "@/scroll/framing";
import { CAMERA } from "@/scroll/script";

import {
  cameraSlopes,
  cameraTravel,
  createCameraPath,
  fitFov,
  FIT_BELOW,
  fovScale,
  getStageAspect,
  hermiteEase,
  panAmount,
  poseOf,
  projectPoint,
  REFERENCE_ASPECT,
  setStageAspect,
  unprojectToPlane,
  type CameraPose,
} from "./camera-path";

const FIELDS: readonly (keyof CameraPose)[] = ["px", "py", "pz", "tx", "ty", "tz", "fov"];
/** The pose's values only (GSAP keeps its own bookkeeping on the target object). */
const copy = (pose: CameraPose): CameraPose => Object.fromEntries(FIELDS.map((f) => [f, pose[f]])) as unknown as CameraPose;

/** The steepest a move may get, relative to the straight line between its keys (the monotone cubic stays within 3). */
const STEEPEST = 3;

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

  it("projects world points to the stage like the rig's camera, and back", () => {
    const path = createCameraPath(CAMERA);
    const pose = copy(path.seek(0.7));
    // The target is in the middle of the stage, in front of the camera.
    const center = projectPoint(pose, [pose.tx, pose.ty, pose.tz], 1440, 900);
    expect(center.x).toBeCloseTo(720, 6);
    expect(center.y).toBeCloseTo(450, 6);
    expect(center.depth).toBeGreaterThan(0);
    // Up is up on screen, right is right.
    const above = projectPoint(pose, [pose.tx, pose.ty + 1, pose.tz], 1440, 900);
    const right = projectPoint(pose, [pose.tx + 1, pose.ty, pose.tz], 1440, 900);
    expect(above.y).toBeLessThan(450);
    expect(right.x).toBeGreaterThan(720);
    // A level camera: the top of the view at the target's distance is the top edge of the stage,
    // and the side of the view (at the stage's aspect) is its side edge.
    const level: CameraPose = { px: 0, py: 0, pz: 10, tx: 0, ty: 0, tz: 0, fov: 40 };
    const halfHeight = 10 * Math.tan((40 * Math.PI) / 360);
    expect(projectPoint(level, [0, halfHeight, 0], 1440, 900).y).toBeCloseTo(0, 6);
    expect(projectPoint(level, [halfHeight * 1.6, 0, 0], 1440, 900).x).toBeCloseTo(1440, 6);
    // A stage pixel unprojected onto a plane projects back onto the same pixel.
    for (const [x, y] of [
      [100, 120],
      [1300, 820],
      [720, 450],
    ] as const) {
      const world = unprojectToPlane(pose, x, y, 1440, 900, -0.5);
      expect(world[2]).toBe(-0.5);
      const back = projectPoint(pose, world, 1440, 900);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
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

describe("fitting the camera to the screen", () => {
  afterEach(() => setStageAspect(0));

  it("leaves every laptop, desktop and landscape tablet exactly as authored", () => {
    for (const aspect of [FIT_BELOW, 1.33, 1.6, REFERENCE_ASPECT, 2.4, 3.6]) {
      expect(fovScale(aspect)).toBe(1);
      expect(fitFov(35, aspect)).toBe(35);
      expect(panAmount(aspect)).toBe(0);
    }
    setStageAspect(1.6);
    const path = createCameraPath(CAMERA);
    for (const key of CAMERA) {
      const view = { ...path.seek(key.at) };
      const expected = poseOf(key);
      for (const field of FIELDS) expect(view[field], `${key.scene} ${field}`).toBeCloseTo(expected[field], 6);
    }
    path.kill();
  });

  it("widens the field of view as the screen gets taller and narrower, without limit cases going wrong", () => {
    let last = 35;
    for (const aspect of [1.2, 1, 0.8, 0.6, 0.46, 0.3]) {
      const fov = fitFov(35, aspect);
      expect(fov).toBeGreaterThan(last);
      expect(fov).toBeLessThan(120);
      last = fov;
    }
    expect(fovScale(0)).toBe(1);
    expect(fovScale(Number.NaN)).toBe(1);
  });

  it("frames the statue on a phone: cut off its side without the fit and its pan, large and whole with them", () => {
    const path = createCameraPath(CAMERA);
    const statue = plateBox("hero/statue");
    const corners: [number, number, number][] = [
      [statue.x0, statue.y0, statue.z],
      [statue.x1, statue.y1, statue.z],
    ];
    const phone = { width: 390, height: 844 };
    setStageAspect(0);
    const before = corners.map((c) => projectPoint(path.seek(0), c, phone.width, phone.height));
    expect(Math.max(...before.map((c) => c.x))).toBeGreaterThan(phone.width);
    setStageAspect(phone.width / phone.height);
    const view = path.seek(0);
    const [low, high] = corners.map((c) => projectPoint(view, c, phone.width, phone.height));
    for (const at of [low, high]) {
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(phone.width);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(phone.height);
    }
    // About half the phone's height (the framing table asks for 55%).
    expect((low.y - high.y) / phone.height).toBeGreaterThan(0.45);
    expect(getStageAspect()).toBeCloseTo(phone.width / phone.height, 9);
    path.kill();
  });

  it("eases the pan along with the rest of the move and keeps it between keys", () => {
    setStageAspect(0.46);
    const path = createCameraPath(CAMERA);
    const hero = CAMERA[0];
    const next = CAMERA.find((k) => k.scene === "ascent" && k.at > CAMERA[1].at)!;
    // On a phone each key films from its position moved by its full pan (x, y and nearer the picture).
    for (const key of [hero, next]) {
      const pose = path.seek(key.at);
      expect(pose.px).toBeCloseTo(key.position[0] + key.pan![0], 6);
      expect(pose.py).toBeCloseTo(key.position[1] + key.pan![1], 6);
      expect(pose.pz).toBeCloseTo(key.position[2] + (key.pan![2] ?? 0), 6);
    }
    // In between it eases: no jumps.
    let previous = path.seek(0).px;
    for (let p = 0; p <= next.at; p += next.at / 80) {
      const x = path.seek(p).px;
      expect(Math.abs(x - previous)).toBeLessThan(0.25);
      previous = x;
    }
    path.kill();
  });
});

describe("the smooth path through the keys", () => {
  const FIELDS_PLAIN: readonly (keyof CameraPose)[] = ["px", "py", "pz", "tx", "ty", "tz", "fov"];
  /** Speed of every field around p (units per progress), from the path itself (GSAP keeps time to 1e-7). */
  const speed = (path: ReturnType<typeof createCameraPath>, p: number, h = 1e-5) => {
    const a = copy(path.seek(p - h));
    const b = copy(path.seek(p + h));
    return FIELDS_PLAIN.map((f) => (b[f] - a[f]) / (2 * h));
  };
  /** The straight-line speed of each field over the segment from key i to key i + 1. */
  const secant = (i: number) => {
    const a = poseOf(CAMERA[i]);
    const b = poseOf(CAMERA[i + 1]);
    const span = CAMERA[i + 1].at - CAMERA[i].at;
    return FIELDS_PLAIN.map((f) => (b[f] - a[f]) / span);
  };
  /** Keys next to a reframe (it happens unseen under a cover and is allowed to be abrupt around itself). */
  const nearReframe = (i: number) => CAMERA[i].move === "reframe" || CAMERA[i - 1]?.move === "reframe";

  /** One-sided speeds of every field exactly at p, from the left (-1) or the right (1), second-order accurate. */
  const sideSpeed = (path: ReturnType<typeof createCameraPath>, p: number, side: -1 | 1, h = 2e-5) => {
    const f0 = copy(path.seek(p));
    const f1 = copy(path.seek(p + side * h));
    const f2 = copy(path.seek(p + side * 2 * h));
    return FIELDS_PLAIN.map((f) => (side * (-3 * f0[f] + 4 * f1[f] - f2[f])) / (2 * h));
  };

  it("never jumps in speed at a key", () => {
    const path = createCameraPath(CAMERA);
    for (let i = 1; i + 1 < CAMERA.length; i++) {
      if (nearReframe(i)) continue;
      const at = CAMERA[i].at;
      const before = sideSpeed(path, at, -1);
      const after = sideSpeed(path, at, 1);
      const scale = secant(i - 1).map((v, f) => Math.max(1, Math.abs(v), Math.abs(secant(i)[f])));
      FIELDS_PLAIN.forEach((field, f) => {
        expect(Math.abs(after[f] - before[f]) / scale[f], `${CAMERA[i].scene} at ${at} ${field}`).toBeLessThan(0.05);
      });
    }
    path.kill();
  });

  it("starts from rest after a hold and lands at rest before one", () => {
    const path = createCameraPath(CAMERA);
    let checked = 0;
    for (let i = 1; i + 1 < CAMERA.length; i++) {
      if (nearReframe(i) || CAMERA[i + 1].move === "reframe") continue;
      const prev = poseOf(CAMERA[i - 1]);
      const here = poseOf(CAMERA[i]);
      const next = poseOf(CAMERA[i + 1]);
      const heldBefore = FIELDS_PLAIN.every((f) => prev[f] === here[f]);
      const heldAfter = FIELDS_PLAIN.every((f) => here[f] === next[f]);
      if (!heldBefore && !heldAfter) continue;
      const moving = heldBefore ? secant(i) : secant(i - 1);
      const v = speed(path, CAMERA[i].at);
      FIELDS_PLAIN.forEach((field, f) => {
        if (moving[f] === 0) return;
        expect(Math.abs(v[f] / moving[f]), `${CAMERA[i].scene} at ${CAMERA[i].at} ${field}`).toBeLessThan(0.02);
      });
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
    path.kill();
  });

  it("keeps a long move moving through its middle (no early stop)", () => {
    const path = createCameraPath(CAMERA);
    const work = CAMERA.filter((k) => k.scene === "work");
    const [a, b] = [work[0], work[1]];
    // The story curve had covered 96% of the dolly half way through it, and crept for the rest.
    for (const [t, lo, hi] of [
      [0.25, 0.05, 0.4],
      [0.5, 0.25, 0.7],
      [0.75, 0.55, 0.9],
    ] as const) {
      const covered = (copy(path.seek(a.at + (b.at - a.at) * t)).py - a.position[1]) / (b.position[1] - a.position[1]);
      expect(covered, `at ${t}`).toBeGreaterThan(lo);
      expect(covered, `at ${t}`).toBeLessThan(hi);
    }
    path.kill();
  });

  it("builds monotone slopes: zero at extremes and holds, never past three times the steeper side", () => {
    expect(cameraSlopes([0, 1, 2], [0, 1, 0])).toEqual([0, 0, 0]);
    expect(cameraSlopes([0, 1, 2, 3], [0, 0, 1, 1])).toEqual([0, 0, 0, 0]);
    const s = cameraSlopes([0, 1, 2], [0, 1, 3]);
    expect(s[1]).toBeGreaterThan(1);
    expect(s[1]).toBeLessThan(2);
    // A reframe segment rests both its ends.
    expect(cameraSlopes([0, 1, 2, 3], [0, 1, 5, 6], [false, true, false])).toEqual([0, 0, 0, 0]);
  });

  it("eases each value with a Hermite that stays between its keys", () => {
    for (const [u0, u1] of [
      [0, 0],
      [3, 0],
      [0, 3],
      [1.5, 2],
    ]) {
      const ease = hermiteEase(u0, u1);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBeCloseTo(1, 12);
      for (let t = 0; t <= 1; t += 0.01) {
        expect(ease(t)).toBeGreaterThanOrEqual(-1e-9);
        expect(ease(t)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("measures how far a camera move has gone, for art that moves with it", () => {
    const pluck = CAMERA.filter((k) => k.scene === "pluck");
    const travel = cameraTravel(CAMERA, pluck[1].at, pluck[2].at);
    expect(travel(pluck[1].at - 0.01)).toBe(0);
    expect(travel(pluck[2].at + 0.01)).toBe(1);
    const mid = travel((pluck[1].at + pluck[2].at) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(travel((pluck[1].at + pluck[2].at) / 2)).toBe(mid);
  });
});
