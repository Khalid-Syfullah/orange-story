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
  swayRoom,
  velAmount,
  velSigned,
  windAt,
} from "../src/stage/motion";
import { canopySwayRoom } from "../src/stage/passes/canopy/timeline";
import { handEnvelope, reelCamera, reelDolly, reelHold, reelReach, reelRingPale, reelRings, reelRoom, SWEEP_TO, velEnvelope } from "../src/stage/passes/bridge/timeline";
import { HERO_PUSH_END, heroCam, heroCamMax, heroPush, heroRoom, heroVelGate, orbitEase, orbitRate } from "../src/stage/passes/hero/timeline";
import { COPY_WINDOWS, fitDrift, foregroundGain, FOREGROUND, groveCamera, MODEL_UNITS, pushGain, shareCamera, shareLightGain } from "../src/stage/passes/model/timeline";
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
      // The beat's drift is fitted to the frame (fitDrift: an ultrawide has no room sideways for all of it).
      const drift = fitDrift(css, tex, { pan: { x: phone ? g.framing.pan.x + g.phonePan.x : g.framing.pan.x, y: g.framing.pan.y }, zoom: g.framing.zoom }, g.drift);
      const room = coverRoom(css, tex, g.framing.zoom, { x: panX + Math.abs(drift.x) / 2, y: Math.abs(g.framing.pan.y) + Math.abs(drift.y) / 2 });
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
  // ---- phase 18: the hero, the bridge and the model --------------------------------------------

  /** Frame shapes the opening chapters are drawn at: a laptop, a 16:9 monitor, an ultrawide, a tablet upright, a phone's band. */
  const FRAMES = [
    [1440, 900],
    [1920, 1080],
    [2560, 1080],
    [1024, 1366],
    [390, 506],
  ] as const;

  test("the hero's orbit starts from rest, ends level and stays inside the room its framing and dolly leave, at every frame shape", () => {
    expect(orbitEase(0)).toBe(0);
    expect(orbitEase(1)).toBeCloseTo(1, 12);
    expect(orbitRate(0)).toBe(0);
    expect(orbitRate(1)).toBeCloseTo(1, 12);
    expect(heroCam(1).y).toBeCloseTo(0, 12);
    // Accelerating from rest, never reversing.
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const e = orbitEase(i / 100);
      expect(e).toBeGreaterThanOrEqual(last);
      last = e;
    }
    const d = art.hero.depth;
    const lead = Math.max(d.near, d.far);
    const part = d.near - d.far;
    for (const css of FRAMES) {
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        const room = heroRoom(css, heroPush(t));
        const max = heroCamMax(css, heroPush(t));
        const cam = heroCam(orbitEase(t));
        const b = { x: softBound(cam.x, max.x), y: softBound(cam.y, max.y) };
        expect(lead * Math.abs(b.x), `${css} t ${t}: x inside the room`).toBeLessThanOrEqual(room.x + 1e-12);
        expect(lead * Math.abs(b.y), `${css} t ${t}: y inside the room`).toBeLessThanOrEqual(room.y + 1e-12);
        expect(part * Math.abs(b.x) * art.hero.aspect, `${css} t ${t}: the layers part by less than the fold`).toBeLessThanOrEqual(FOLD_SHARE * d.cell + 1e-12);
        expect(part * Math.abs(b.y)).toBeLessThanOrEqual(FOLD_SHARE * d.cell + 1e-12);
      }
    }
  });

  test("the hero's speed gate closes before the bridge, so the film the hero ends on does not depend on the scroll's speed", () => {
    expect(heroVelGate(0)).toBe(1);
    expect(heroVelGate(0.5)).toBe(1);
    expect(heroVelGate(1)).toBe(0);
    for (let i = 0; i < 100; i++) expect(heroVelGate((i + 1) / 100)).toBeLessThanOrEqual(heroVelGate(i / 100) + 1e-12);
    // The bridge's own envelopes: no speed before the reel is revealed (the speed test's crest-only rule), none at its end.
    expect(velEnvelope(0)).toBe(0);
    expect(velEnvelope(0.3)).toBe(0);
    expect(velEnvelope(0.58)).toBe(0);
    expect(velEnvelope(1)).toBe(0);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => velEnvelope(i / 100)))).toBeGreaterThan(0.9);
  });

  test("the bridge reel's camera is exactly the film's until the wave has crossed, and exactly the Model's first frame at the end", () => {
    for (const css of FRAMES) {
      for (const t of [0, 0.1, 0.3, 0.5, 0.55]) {
        const c = reelCamera(css, t);
        expect(Math.abs(c.swayX), `${css} t ${t}`).toBe(0);
        expect(Math.abs(c.swayY)).toBe(0);
        expect(Math.abs(c.roll)).toBe(0);
        expect(Math.abs(c.windAmp)).toBe(0);
        expect(c.velEnv).toBe(0);
        expect(c.hold).toBe(1);
        expect(reelDolly(t)).toBeCloseTo(1 + HERO_PUSH_END, 12);
      }
      const end = reelCamera(css, 1);
      expect([end.swayX, end.swayY, end.roll, end.windAmp, end.velEnv, end.hold].map(Math.abs)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(reelDolly(1)).toBe(1);
      expect(reelHold(1)).toBe(0);
      expect(handEnvelope(1)).toBe(0);
      expect(handEnvelope(0.55)).toBe(0);
    }
  });

  test("the bridge reel's handheld camera never leaves the room the dolly and the held orbit leave it, at every frame shape", () => {
    for (const css of FRAMES) {
      let alive = 0;
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const c = reelCamera(css, t);
        const room = reelRoom(css, t);
        const reach = reelReach(css, t);
        expect(reach.x * c.scale, `${css} t ${t}: x`).toBeLessThanOrEqual(room.x + 1e-12);
        expect(reach.y * c.scale, `${css} t ${t}: y`).toBeLessThanOrEqual(room.y + 1e-12);
        alive = Math.max(alive, Math.abs(c.roll), Math.abs(c.swayX));
      }
      // It is a camera that moves: on a roomy frame the roll and the sway are really there.
      if (css[0] === 1440) expect(alive).toBeGreaterThan(0.002);
    }
  });

  test("the foreground and the share's light are exactly 0 where the share lands on the Split's frame, and the share's camera comes to rest on it", () => {
    expect(foregroundGain(0)).toBe(0);
    expect(foregroundGain(FOREGROUND.from)).toBe(0);
    expect(foregroundGain(MODEL_UNITS)).toBe(0);
    expect(foregroundGain(MODEL_UNITS + 50)).toBe(0);
    expect(Math.max(...Array.from({ length: 121 }, (_, i) => foregroundGain((i / 120) * MODEL_UNITS)))).toBeCloseTo(1, 6);
    expect(shareLightGain(0)).toBe(0);
    expect(shareLightGain(MODEL_UNITS)).toBe(0);
    // No gain while the grove -> share cut is open, so it never lays a light over a cut.
    expect(shareLightGain(840)).toBe(0);
    const c = shareCamera(MODEL_UNITS);
    expect([c.pan.x, c.pan.y, c.zoom]).toEqual([0, 0, 1]);
  });

  test("the push-through's leaves are only on while the graft hands over to the grove, and gone before the grove's copy arrives", () => {
    expect(pushGain(0)).toBe(0);
    expect(pushGain(FOREGROUND.push.from)).toBe(0);
    expect(pushGain(FOREGROUND.push.to)).toBe(0);
    expect(pushGain(MODEL_UNITS)).toBe(0);
    // The graft -> grove cut is centred on a third of the segment: the leaves are on across it.
    const third = MODEL_UNITS / 3;
    expect(pushGain(third)).toBeGreaterThan(0.8);
    // ... and have closed before the grove's copy starts to ramp in (its title leads by 12 units).
    expect(pushGain(COPY_WINDOWS.grove.in - 12)).toBe(0);
  });

  test("the signal rings run through the film and fade out by the time the knife is at rest; the reel's tilt is a bell", () => {
    expect(reelRings(0)).toBe(1);
    expect(reelRings(SWEEP_TO - 0.05)).toBeGreaterThan(0.9);
    expect(reelRings(0.9)).toBe(0);
    expect(reelRings(1)).toBe(0);
    for (let i = 0; i < 100; i++) expect(reelRings((i + 1) / 100)).toBeLessThanOrEqual(reelRings(i / 100) + 1e-12);
    // A pale ground carries them only once the film's marble is gone.
    expect(reelRingPale(0)).toBe(0);
    expect(reelRingPale(0.4)).toBe(0);
    expect(reelRingPale(0.8)).toBe(1);
    // The camera tilts up (the sample point rises): the reel's sway has a negative y share in the middle, 0 at both ends.
    const mid = reelCamera([1440, 900], 0.78);
    expect(mid.swayY).toBeLessThan(0);
    expect(Math.abs(reelCamera([1440, 900], 0.5).swayY)).toBe(0);
    expect(Math.abs(reelCamera([1440, 900], 1).swayY)).toBe(0);
  });

  test("the graft's and the grove's depth layers and sway share their frame's room and never fold", () => {
    for (const css of FRAMES) {
      const g = art.graft;
      const room = coverRoom(css, sizeFromAspect(g.aspect), g.framing.zoom, { x: Math.abs(g.framing.pan.x) + Math.abs(g.drift.x) / 2, y: Math.abs(g.framing.pan.y) + Math.abs(g.drift.y) / 2 });
      const sw = swayRoom(room, g.sway.cell, g.aspect);
      expect(sw.y).toBeLessThanOrEqual(FOLD_SHARE * g.sway.cell + 1e-12);
      const max = depthTravelMax(g.depth, { x: room.x - sw.x, y: room.y - sw.y }, g.aspect);
      const lead = Math.max(Math.abs(g.depth.near - 1), Math.abs(g.depth.far - 1));
      expect(lead * max.x + sw.x).toBeLessThanOrEqual(room.x + 1e-12);
      expect(lead * max.y + sw.y).toBeLessThanOrEqual(room.y + 1e-12);
      // The grove: the room at a frame of its camera (the zoom and the pan as they are then), the sway's share of
      // it inside the fold; the layers (rates 0.3 and 1) need no room of their own and part by less than the fold.
      const v = art.grove;
      for (let k = 0; k <= 20; k++) {
        const gc = groveCamera(((k / 20) * 0.5 + 0.2) * MODEL_UNITS);
        const vroom = coverRoom(css, sizeFromAspect(v.aspect), v.framing.zoom * gc.zoom, { x: Math.abs(v.framing.pan.x + gc.pan.x), y: Math.abs(v.framing.pan.y + gc.pan.y) });
        const vs = swayRoom(vroom, v.sway.cell, v.aspect);
        expect(vs.x + 1e-12).toBeGreaterThanOrEqual(0);
        expect(vs.x).toBeLessThanOrEqual(vroom.x + 1e-12);
        expect(vs.y).toBeLessThanOrEqual(vroom.y + 1e-12);
        expect(vs.y).toBeLessThanOrEqual(FOLD_SHARE * v.sway.cell + 1e-12);
      }
      const vmax = depthTravelMax(v.depth, { x: 1, y: 1 }, v.aspect);
      expect(Math.abs(v.depth.near - v.depth.far) * vmax.y).toBeLessThanOrEqual(FOLD_SHARE * v.depth.cell + 1e-12);
      expect(Math.abs(v.depth.near - v.depth.far) * vmax.x * v.aspect).toBeLessThanOrEqual(FOLD_SHARE * v.depth.cell + 1e-12);
      expect(Math.max(v.depth.near, v.depth.far), "the layers move no faster than the camera, so they need no room of their own").toBeLessThanOrEqual(1);
    }
  });

  test("the masks pick the hero's sky, the grove's cloudscape and the share's white ground out of the real paintings", async () => {
    const at = async (file: string, pts: readonly (readonly [number, number])[]) => {
      const img = sharp(path.join(ROOT, "public", "art", file)).removeAlpha();
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      return pts.map(([x, y]) => {
        const i = (Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * 3;
        return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255] as const;
      });
    };
    const [sky, fruit, gown, marble] = await at("hero-poster.jpg", [
      [0.2, 0.2],
      [0.7, 0.5],
      [0.47, 0.6],
      [0.65, 0.85],
    ]);
    expect(skyMask(...sky)).toBeGreaterThan(0.9);
    expect(skyMask(...fruit)).toBeLessThan(0.05);
    expect(skyMask(...gown)).toBeLessThan(0.05);
    expect(skyMask(...marble)).toBeLessThan(0.05);
    const [cloud, leaf, orange] = await at("grove/1440.jpg", [
      [0.49, 0.74],
      [0.4, 0.2],
      [0.19, 0.28],
    ]);
    expect(paleMask(...cloud), "the cloudscape is the far layer").toBeGreaterThan(0.5);
    expect(paleMask(...leaf)).toBeLessThan(0.05);
    expect(paleMask(...orange)).toBeLessThan(0.05);
    expect(foliageMask(...leaf)).toBeGreaterThan(0.9);
    expect(foliageMask(...orange), "fruit is not a leaf").toBeLessThan(0.05);
  });
});
