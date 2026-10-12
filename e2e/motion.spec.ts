// The motion toolkit's contracts (docs/MOTION-RULES.md, "The motion toolkit"), held on its TS twins
// (src/stage/motion.ts, the same math as the GLSL at the end of src/stage/gl/lib.glsl.ts): growth
// lands exactly and starts from rest, the velocity response is bounded and zero at rest, the wind is
// a pure function of point and clock and still under reduced motion, a bounded travel never leaves
// its room, a depth layer never shows an edge or folds, and the masks pick the right things out of
// the real paintings. No browser: these are functions of numbers (and of the paintings' pixels).
import { expect, test } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";
import { art } from "../src/content/art";
import { sizeFromAspect } from "../src/stage/framing";
import {
  backFor,
  coverRoom,
  depthShift,
  depthTravelMax,
  FOLD_SHARE,
  foliageMask,
  growSettle,
  overshootOf,
  paleMask,
  skyMask,
  softBound,
  velAmount,
  velSigned,
  windAt,
} from "../src/stage/motion";
import { canopySwayRoom } from "../src/stage/passes/canopy/timeline";
import { ROOT } from "./lib/cuts";

test.describe("motion toolkit", () => {
  test("growSettle starts from rest, overshoots by what backFor asks and lands on exactly 1", () => {
    const back = backFor(0.06);
    expect(overshootOf(back)).toBeCloseTo(0.06, 6);
    const ramp = 0.15;
    expect(growSettle(0, back, ramp)).toBe(0);
    expect(growSettle(1, back, ramp)).toBe(1);
    expect(growSettle(1.4, back, ramp)).toBe(1);
    expect(growSettle(-0.2, back, ramp)).toBe(0);
    let peak = 0;
    let worstStep = 0;
    let prev = 0;
    for (let i = 1; i <= 4000; i++) {
      const v = growSettle(i / 4000, back, ramp);
      peak = Math.max(peak, v);
      worstStep = Math.max(worstStep, Math.abs(v - prev));
      prev = v;
    }
    expect(peak - 1, "the overshoot").toBeGreaterThan(0.055);
    expect(peak - 1, "the overshoot").toBeLessThan(0.065);
    expect(worstStep, "no jump anywhere").toBeLessThan(0.002);
    const h = 1e-4;
    expect(growSettle(h, back, ramp) / h, "speed at the start (rule 4: from rest)").toBeLessThan(0.05);
    expect((1 - growSettle(1 - h, back, ramp)) / h, "speed at the landing").toBeLessThan(0.05);
  });

  test("the velocity response is bounded, zero at rest and under reduced motion, signed with the scroll", () => {
    expect(velAmount(0, 20)).toBe(0);
    expect(velAmount(40, 20, true)).toBe(0);
    expect(velAmount(5000, 20)).toBeLessThanOrEqual(1);
    expect(velAmount(20, 20)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(velAmount(8, 20)).toBeLessThan(velAmount(40, 20));
    expect(velSigned(-30, 20)).toBeCloseTo(-velAmount(30, 20), 9);
  });

  test("the wind is a pure function of point and clock, bounded, alive, and still under reduced motion", () => {
    const w = art.canopy.sway.wind;
    const xs: number[] = [];
    let changed = 0;
    for (let t = 0; t < 40; t += 0.9) {
      for (let y = 0; y <= 1; y += 0.1) {
        for (let x = 0; x <= 1.78; x += 0.1) {
          const a = windAt({ x, y }, t, w);
          const b = windAt({ x, y }, t, w);
          expect(a).toEqual(b);
          expect(windAt({ x, y }, t, w, true)).toEqual({ x: 0, y: 0 });
          xs.push(a.x);
          if (Math.abs(windAt({ x, y }, t + 0.5, w).x - a.x) > 0.02) changed++;
        }
      }
    }
    const mean = xs.reduce((s, v) => s + Math.abs(v), 0) / xs.length;
    expect(Math.max(...xs.map(Math.abs)), "bounded").toBeLessThan(2.6);
    expect(mean, "a breeze, not a gale or a calm").toBeGreaterThan(0.25);
    expect(mean).toBeLessThan(0.8);
    expect(changed / xs.length, "most points move within half a second").toBeGreaterThan(0.6);
  });

  test("softBound never reaches its room and leaves small travel alone", () => {
    for (const x of [-10, -0.02, 0.019, 3]) expect(Math.abs(softBound(x, 0.02))).toBeLessThan(0.02);
    expect(softBound(0.001, 0.02)).toBeCloseTo(0.001, 5);
    expect(depthShift(1, { x: 0.01, y: 0 }, { x: -0.01, y: 0 }, true)).toEqual({ x: 0, y: 0 });
    expect(depthShift(0, { x: 0.01, y: 0 }, { x: -0.01, y: 0 }).x).toBeCloseTo(-0.01, 9);
  });

  test("the graft's depth layers stay inside the room its framing leaves and never fold, at every frame shape", () => {
    const g = art.graft;
    const tex = sizeFromAspect(g.aspect);
    // The phone pan is added only on a tall phone (framing.ts phoned): the band of a 390x844 phone.
    for (const [css, phone] of [
      [[1440, 900], false],
      [[1280, 800], false],
      [[2560, 900], false],
      [[1024, 1366], false],
      [[390, 506], true],
    ] as const) {
      const panX = phone ? Math.abs(g.framing.pan.x + g.phonePan.x) : Math.abs(g.framing.pan.x);
      const room = coverRoom(css, tex, g.framing.zoom, { x: panX + Math.abs(g.drift.x) / 2, y: Math.abs(g.framing.pan.y) + Math.abs(g.drift.y) / 2 });
      expect(room.x, `${css}: room x`).toBeGreaterThan(0);
      expect(room.y, `${css}: room y`).toBeGreaterThan(0);
      const max = depthTravelMax(g.depth, room, g.aspect);
      const lead = Math.max(Math.abs(g.depth.near - 1), Math.abs(g.depth.far - 1));
      const part = Math.abs(g.depth.near - g.depth.far);
      expect(lead * max.x).toBeLessThanOrEqual(room.x + 1e-12);
      expect(lead * max.y).toBeLessThanOrEqual(room.y + 1e-12);
      expect(part * max.y).toBeLessThanOrEqual(FOLD_SHARE * g.depth.cell + 1e-12);
      expect(part * max.x * g.aspect).toBeLessThanOrEqual(FOLD_SHARE * g.depth.cell + 1e-12);
    }
  });

  test("the canopy's sway has room at every frame shape and never more than the fold allows", () => {
    for (const css of [
      [1440, 900],
      [2560, 900],
      [390, 506],
      [1024, 1366],
    ] as const) {
      const room = canopySwayRoom(css);
      expect(room.x, `${css}`).toBeGreaterThan(0);
      expect(room.y, `${css}`).toBeGreaterThan(0);
      expect(room.y).toBeLessThanOrEqual(FOLD_SHARE * art.canopy.sway.cell + 1e-12);
    }
  });

  test("the masks pick leaves, sky and the pale ground out of the real paintings", async () => {
    const at = async (file: string, pts: readonly (readonly [number, number])[]) => {
      const img = sharp(path.join(ROOT, "public", "art", file)).removeAlpha();
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return pts.map(([x, y]) => {
        const i = (Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * 3;
        return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255] as const;
      });
    };
    // The canopy: two leaves, the dark olive shade, two oranges, the sky.
    const [leaf, shade, orange, nearest, sky] = await at("canopy-poster.jpg", [
      [0.2, 0.3],
      [0.07, 0.42],
      [0.13, 0.12],
      [0.33, 0.27],
      [0.5, 0.5],
    ]);
    expect(foliageMask(...leaf)).toBeGreaterThan(0.9);
    expect(foliageMask(...shade)).toBeGreaterThan(0.9);
    expect(foliageMask(...orange)).toBeLessThan(0.05);
    expect(foliageMask(...nearest)).toBeLessThan(0.05);
    expect(foliageMask(...sky)).toBeLessThan(0.05);
    expect(skyMask(...sky)).toBeGreaterThan(0.9);
    expect(skyMask(...leaf)).toBeLessThan(0.05);
    // The graft: the cream ground, a hand, the branch, a leaf.
    const [ground, hand, branch, gleaf] = await at("graft/1440.jpg", [
      [0.5, 0.3],
      [0.3, 0.55],
      [0.6, 0.85],
      [0.37, 0.2],
    ]);
    expect(paleMask(...ground)).toBeGreaterThan(0.9);
    expect(paleMask(...hand)).toBeLessThan(0.05);
    expect(paleMask(...branch)).toBeLessThan(0.05);
    expect(paleMask(...gleaf)).toBeLessThan(0.05);
    expect(foliageMask(...gleaf)).toBeGreaterThan(0.9);
    expect(foliageMask(...branch), "bark is not a leaf").toBeLessThan(0.1);
  });
});
