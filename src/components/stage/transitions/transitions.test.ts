import { afterEach, describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { sceneOf, transitionOf } from "@/scroll/helpers";
import { PLAN_MIDDLE, SCREEN, TRANSITIONS } from "@/scroll/script";

import { setStageAspect } from "../camera-path";
import { storyTime } from "../motion-kit";
import { insideCircle, revealCircle, veilAmount } from "./choreography";
import { clothAt, simulateCloth } from "./cloth";
import { CLOUD_DEF, CLOUD_PASS, cloudAt, cloudBoxes } from "./cloud-plan";
import { DUST, DUST_CLEARING, DUST_COVERED, DUST_DEF, dustDensity, dustLift, LIFT_RAGGED, LIFT_SOFT, pageFlight } from "./dust-plan";
import { clothCrossings, FABRIC_CLEARING, FABRIC_CLOTH, FABRIC_COVERED, FABRIC_DEF, FABRIC_SWAP } from "./fabric-plan";
import { hingeTurn, PAGE_STATIONS, pageBend, pageLight, pageShape } from "./hinge";
import { canopyField, fallingField, FOLIAGE_DEF, LEAVES, LEAVES_DEF, LEAVES_SWAP, pathField } from "./leaf-plan";
import { poseAt, screenRect } from "./match-cut";
import { bakeNoise } from "./media";
import { particlesFor, PARTICLE_SHARE, transitionMode, transitionsOverride } from "./modes";
import { FOREVER, newParticleState, PARTICLE_FADE, PARTICLE_GLSL, PARTICLE_STRIDE, particleAt, particleField, SWIRL_GROWTH } from "./particles";
import { crestRatio, RING, RING_DEF, ringReveal, ringStrength } from "./ring-plan";
import { PILE_RAGGED, PILE_SOFT, pileLevel, pourField, SAND, SAND_DEF, SAND_SWAP, sandFaces, sandThin, sandTravel, streamDensity } from "./sand-plan";
import { RIGHT_PAGE, LEFT_PAGE, sheetShows, UNFOLD_CLEARING, UNFOLD_COVERED, UNFOLD_DEF } from "./unfold-plan";

/**
 * Stage shapes the transitions must hold on: a laptop, a 16:9 screen, a browser filling a 16:9 monitor
 * (its bars take some of the height: about 2 to 1), a portrait tablet and a tall phone.
 */
const SHAPES = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "16:9", width: 1920, height: 1080 },
  { name: "browser", width: 1920, height: 960 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone", width: 412, height: 915 },
] as const;

const samples = (a: number, b: number, n = 60) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

afterEach(() => setStageAspect(0));

describe("modes", () => {
  it("plays the full version, a light one on phones and the lowest tier, a calm one with reduced motion", () => {
    expect(transitionMode({ stacked: false, tier: 2, reduced: false })).toBe("full");
    expect(transitionMode({ stacked: true, tier: 2, reduced: false })).toBe("light");
    expect(transitionMode({ stacked: false, tier: 0, reduced: false })).toBe("light");
    expect(transitionMode({ stacked: true, tier: 0, reduced: true })).toBe("calm");
    expect(transitionMode({ stacked: true, tier: 0, reduced: true, override: "full" })).toBe("full");
    expect(transitionsOverride("?transitions=calm")).toBe("calm");
    expect(transitionsOverride("?transitions=fast")).toBeNull();
  });

  it("draws a share of the particles in the light mode and none in the calm one", () => {
    expect(particlesFor(1000, "full")).toBe(1000);
    expect(particlesFor(1000, "light")).toBe(Math.round(1000 * PARTICLE_SHARE.light));
    expect(particlesFor(1, "light")).toBe(1);
    expect(particlesFor(1000, "calm")).toBe(0);
  });
});

describe("particles", () => {
  const air = { gravity: 9.81, wind: [0.8, 0.1, 0] as const };
  const field = () =>
    particleField("test", 400, (rand) => ({
      start: [rand(), rand(), -1 - rand()],
      born: rand() * 0.5,
      velocity: [rand() - 0.5, rand(), 0],
      drag: 0.5 + rand() * 2,
      size: 0.01,
      seed: rand(),
      tone: rand(),
      life: 0.4 + rand(),
      swirl: 0.02 * rand(),
      swirlRate: 1,
      phase: rand() * 6,
      fall: rand(),
    }));

  it("is seeded: the same field every time", () => {
    const a = field();
    const b = field();
    expect(a.data.length).toBe(400 * PARTICLE_STRIDE);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("shuffles, so the light mode's first share is an even sample of the whole", () => {
    const f = field();
    const meanX = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += f.data[i * PARTICLE_STRIDE];
      return s / n;
    };
    expect(Math.abs(meanX(particlesFor(f.count, "light")) - meanX(f.count))).toBeLessThan(0.06);
  });

  it("is a function of time alone: any moment, in any order, the same place", () => {
    const f = field();
    const a = newParticleState();
    const b = newParticleState();
    for (let i = 0; i < f.count; i += 37) {
      particleAt(f, i, 0.9, air, a);
      particleAt(f, i, 0.2, air, b);
      particleAt(f, i, 0.9, air, b);
      expect([b.x, b.y, b.z, b.alpha]).toEqual([a.x, a.y, a.z, a.alpha]);
    }
  });

  it("is unseen before it is born, leaves its birth place at its own speed, and fades out at the end of its life", () => {
    const f = field();
    const s = newParticleState();
    for (let i = 0; i < f.count; i += 13) {
      const o = i * PARTICLE_STRIDE;
      const born = f.data[o + 3];
      particleAt(f, i, born - 0.01, air, s);
      expect(s.alpha).toBe(0);
      particleAt(f, i, born, air, s);
      expect(s.x).toBeCloseTo(f.data[o], 9);
      expect(s.y).toBeCloseTo(f.data[o + 1], 9);
      expect(s.vx).toBeCloseTo(f.data[o + 4], 9);
      particleAt(f, i, born + f.data[o + 11] + 0.01, air, s);
      expect(s.alpha).toBe(0);
    }
  });

  it("falls toward the speed the drag and gravity settle on", () => {
    const f = particleField("terminal", 1, () => ({ start: [0, 0, 0], born: 0, velocity: [0, 0, 0], drag: 3, size: 0.01, seed: 0, tone: 0, life: FOREVER, swirl: 0, swirlRate: 0, phase: 0, fall: 1 }));
    const s = particleAt(f, 0, 20, air);
    expect(s.vx).toBeCloseTo(air.wind[0], 6);
    expect(s.vy).toBeCloseTo(air.wind[1] - air.gravity / 3, 6);
  });

  it("has a GLSL twin with the same constants", () => {
    expect(PARTICLE_GLSL).toContain(SWIRL_GROWTH.toFixed(2));
    expect(PARTICLE_GLSL).toContain(PARTICLE_FADE.in.toFixed(3));
    expect(PARTICLE_GLSL).toContain((1 - PARTICLE_FADE.out).toFixed(3));
    for (const step of ["dragAxis(aStart.x, aVelocity.x, k * uWind.x, k, age)", "k * uWind.y - g", "0.73 * w * age + 1.3 * phase", "0.51 * w * age + 2.1 * phase"]) expect(PARTICLE_GLSL).toContain(step);
  });
});

describe("paper on a hinge", () => {
  const range = [0.3, 0.4] as const;
  const hinge = hingeTurn(range, 0, Math.PI, { lag: 0.01 });

  it("turns from rest to rest, a little past and back as it lands", () => {
    expect(hinge.turn(range[0])).toBeCloseTo(0, 9);
    expect(hinge.turn(range[1])).toBeCloseTo(Math.PI, 9);
    const most = Math.max(...samples(range[0], range[1]).map(hinge.turn));
    expect(most).toBeGreaterThan(Math.PI);
    expect(most).toBeLessThan(Math.PI * 1.1);
  });

  it("bends while it swings, its free edge behind the hinge, and lies flat once it has settled", () => {
    const mid = pageBend(hinge, 0.35);
    expect(mid[0]).toBeGreaterThan(mid[PAGE_STATIONS - 1]);
    for (let j = 1; j < PAGE_STATIONS; j++) expect(mid[j]).toBeLessThanOrEqual(mid[j - 1] + 1e-9);
    const rest = pageBend(hinge, 0.5);
    for (const a of rest) expect(a).toBeCloseTo(Math.PI, 9);
  });

  it("keeps its length when it bends", () => {
    const shape = pageShape(pageBend(hinge, 0.35), 1);
    let length = 0;
    for (let j = 1; j < PAGE_STATIONS; j++) length += Math.hypot(shape[2 * j] - shape[2 * j - 2], shape[2 * j + 1] - shape[2 * j - 1]);
    expect(length).toBeCloseTo(1, 9);
  });

  it("is lit by the one sun, from the upper left: a page turning toward it more, one turning away less", () => {
    expect(pageLight(0.4, 1)).toBeGreaterThan(pageLight(0, 1));
    expect(pageLight(0.4, -1)).toBeLessThan(pageLight(0, 1));
    for (const a of samples(0, Math.PI, 20)) {
      for (const side of [1, -1] as const) {
        expect(pageLight(a, side)).toBeGreaterThanOrEqual(0);
        expect(pageLight(a, side)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("cloth", () => {
  const frames = simulateCloth(FABRIC_CLOTH);

  it("is simulated the same way every time and read back exactly", () => {
    const again = simulateCloth(FABRIC_CLOTH);
    expect(again.count).toBe(frames.count);
    expect(Array.from(again.positions.subarray(-300))).toEqual(Array.from(frames.positions.subarray(-300)));
    const out = new Float32Array(FABRIC_CLOTH.nx * FABRIC_CLOTH.ny * 3);
    clothAt(frames, 0, out);
    expect(Array.from(out.subarray(0, 30))).toEqual(Array.from(frames.positions.subarray(0, 30)));
    // Between two stored frames: linear.
    const size = out.length;
    clothAt(frames, 10.5 / frames.rate, out);
    expect(out[5]).toBeCloseTo((frames.positions[10 * size + 5] + frames.positions[11 * size + 5]) / 2, 5);
  });

  it("falls: it comes into view, covers the frame, uncovers it and is gone, in that order", () => {
    const c = clothCrossings(frames);
    expect(c.enters).toBeLessThan(c.covers);
    expect(c.covers).toBeLessThan(c.uncovers);
    expect(c.uncovers).toBeLessThan(c.gone);
  });

  it("covers the frame where the script says, and has gone by the transition's end", () => {
    // Let go so its hem enters the frame as the transition starts (`fabric.tsx`).
    const c = clothCrossings(frames);
    const lead = c.enters;
    const at = (p: number) => storyTime(p, FABRIC_DEF.start) + lead;
    expect(at(FABRIC_COVERED)).toBeGreaterThanOrEqual(c.covers);
    expect(at(FABRIC_CLEARING)).toBeLessThanOrEqual(c.uncovers - 1 / frames.rate);
    expect(at(FABRIC_DEF.end)).toBeGreaterThanOrEqual(c.gone);
    expect(FABRIC_COVERED <= FABRIC_SWAP && FABRIC_SWAP <= FABRIC_CLEARING).toBe(true);
    // A phone's frame is narrower: covered at least as long.
    const narrow = clothCrossings(frames, 0.25);
    expect(narrow.covers).toBeLessThanOrEqual(c.covers);
    expect(narrow.uncovers).toBeGreaterThanOrEqual(c.uncovers);
  });
});

describe("the sand", () => {
  const [covered, clearing] = SAND_DEF.peak!;

  it("pours from the halves' cut faces", () => {
    const faces = sandFaces();
    const origin = poseAt(SAND_DEF.start);
    const pour = pourField();
    for (let i = 0; i < pour.count; i += 7) {
      const o = i * PARTICLE_STRIDE;
      const x = pour.data[o] + origin.px;
      const y = pour.data[o + 1] + origin.py;
      const d = Math.min(...faces.map((f) => Math.hypot(x - f[0], (y - f[1]) / 0.6)));
      expect(d).toBeLessThanOrEqual(SAND.face + 1e-6);
    }
  });

  it("fills the frame at the cover and not long before, and is whole until the clearing", () => {
    // The dune's ragged top is past the top of the frame at the cover (and only within a hair of it just before).
    expect(pileLevel(covered) - PILE_RAGGED - PILE_SOFT).toBeGreaterThanOrEqual(1);
    expect(pileLevel(covered - 0.1 * SCREEN) - PILE_RAGGED - PILE_SOFT).toBeLessThan(1);
    expect(streamDensity(covered)).toBe(1);
    expect(sandThin(clearing)).toBe(0);
    expect(sandThin(SAND_DEF.end)).toBe(1);
    expect(covered <= SAND_SWAP && SAND_SWAP <= clearing).toBe(true);
  });

  it("thins steadily, never thickening again", () => {
    let last = -1;
    for (const p of samples(clearing, SAND_DEF.end)) {
      expect(sandThin(p)).toBeGreaterThanOrEqual(last);
      last = sandThin(p);
    }
  });

  it("carries the camera's push on without a jump and rises with The Work's dolly", () => {
    const a = sandTravel(covered - 1e-7);
    const b = sandTravel(covered + 1e-7);
    for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-4);
    expect(sandTravel(SAND_DEF.end)[1]).toBeGreaterThan(sandTravel(clearing)[1]);
  });
});

describe("the dust", () => {
  it("builds from nothing to the whole frame at the cover", () => {
    expect(dustDensity(DUST_DEF.start)).toBe(0);
    expect(dustDensity(DUST_COVERED)).toBe(1);
    let last = 0;
    for (const p of samples(DUST_DEF.start, DUST_COVERED)) {
      expect(dustDensity(p)).toBeGreaterThanOrEqual(last);
      last = dustDensity(p);
    }
  });

  it("is whole until the clearing, then lifts off the top and is gone by the end", () => {
    expect(dustLift(DUST_CLEARING) + LIFT_RAGGED + LIFT_SOFT).toBeLessThanOrEqual(0);
    expect(dustLift(DUST_DEF.end) - LIFT_RAGGED - LIFT_SOFT).toBeGreaterThanOrEqual(1);
    expect(DUST.lift[0]).toBe(dustLift(DUST_CLEARING));
  });

  it("blows the page away before the cover", () => {
    expect(pageFlight(DUST_DEF.start)).toBe(0);
    expect(pageFlight(DUST_COVERED)).toBe(1);
  });
});

describe("through the cloud", () => {
  const swap = sceneOf(CLOUD_DEF.to).start;
  const near = CLOUD_PASS.clouds.length - 1;

  for (const shape of SHAPES) {
    it(`fills the frame with the nearest cloud's solid core through the cover (${shape.name})`, () => {
      const aspect = shape.width / shape.height;
      setStageAspect(aspect);
      for (const p of [...samples(CLOUD_DEF.peak![0], CLOUD_DEF.peak![1], 8), swap]) {
        const { core } = cloudBoxes(near, p, aspect);
        const r = screenRect(core, p, shape.width, shape.height);
        expect(r.x0).toBeLessThanOrEqual(0);
        expect(r.y0).toBeLessThanOrEqual(0);
        expect(r.x1).toBeGreaterThanOrEqual(shape.width);
        expect(r.y1).toBeGreaterThanOrEqual(shape.height);
      }
    });

    it(`starts and ends with every cloud out of the frame: nothing fades in (${shape.name})`, () => {
      const aspect = shape.width / shape.height;
      setStageAspect(aspect);
      for (let i = 0; i < CLOUD_PASS.clouds.length; i++) {
        const { box } = cloudBoxes(i, CLOUD_DEF.start, aspect);
        expect(screenRect(box, CLOUD_DEF.start, shape.width, shape.height).x1).toBeLessThanOrEqual(0);
        const end = CLOUD_DEF.end - 1e-6;
        const last = screenRect(cloudBoxes(i, end, aspect).box, end, shape.width, shape.height);
        // Out of the frame by the end, or (on a tall screen, where a cloud is wider than the pan) thinned away.
        expect(last.x1 <= 0 || last.x0 >= shape.width || cloudAt(i, end, aspect).opacity < 0.01).toBe(true);
      }
    });
  }
});

describe("the paper unfold", () => {
  for (const shape of SHAPES) {
    it(`dives in until the plan's paper fills the frame where the sheet takes over (${shape.name})`, () => {
      setStageAspect(shape.width / shape.height);
      const r = screenRect(PLAN_MIDDLE, UNFOLD_COVERED, shape.width, shape.height);
      expect(r.x0).toBeLessThanOrEqual(1);
      expect(r.x1).toBeGreaterThanOrEqual(shape.width - 1);
      expect(r.y0).toBeLessThanOrEqual(1);
      expect(r.y1).toBeGreaterThanOrEqual(shape.height - 1);
    });
  }

  it("turns its pages after the cut, one after the other, each from flat to flat", () => {
    expect(sheetShows(UNFOLD_COVERED)).toBe(true);
    expect(sheetShows(UNFOLD_COVERED - 1e-6)).toBe(false);
    expect(sheetShows(UNFOLD_DEF.end)).toBe(false);
    expect(RIGHT_PAGE.turn(UNFOLD_CLEARING)).toBeCloseTo(0, 9);
    expect(LEFT_PAGE.turn(UNFOLD_CLEARING)).toBeCloseTo(0, 9);
    expect(RIGHT_PAGE.turn(UNFOLD_DEF.end)).toBeCloseTo(Math.PI, 9);
    expect(LEFT_PAGE.turn(UNFOLD_DEF.end)).toBeCloseTo(Math.PI, 9);
  });
});

describe("the ring", () => {
  it("starts at the orange and runs out past every corner, never shrinking", () => {
    expect(crestRatio(RING_DEF.start)).toBe(0);
    expect(crestRatio(RING_DEF.start + 1e-9)).toBeCloseTo(RING.from, 4);
    expect(crestRatio(RING_DEF.end)).toBeCloseTo(RING.to, 9);
    let last = 0;
    for (const p of samples(RING_DEF.start, RING_DEF.end)) {
      expect(crestRatio(p)).toBeGreaterThanOrEqual(last);
      last = crestRatio(p);
    }
  });

  for (const shape of SHAPES) {
    it(`reveals nothing before the strike and all of the new picture by the end (${shape.name})`, () => {
      setStageAspect(shape.width / shape.height);
      const before = ringReveal(RING_DEF.start - 1e-6, shape.width, shape.height);
      expect(insideCircle(before, before.x, before.y)).toBe(0);
      const last = ringReveal(RING_DEF.end - 1e-6, shape.width, shape.height);
      const far = Math.max(...[0, shape.width].flatMap((x) => [0, shape.height].map((y) => Math.hypot(x - last.x, y - last.y))));
      expect(last.radius - last.softness).toBeGreaterThanOrEqual(far);
      // The orange stays in the frame while the ring spreads from it.
      for (const p of samples(RING_DEF.start, RING_DEF.end, 12)) {
        const c = ringReveal(p, shape.width, shape.height);
        expect(c.x).toBeGreaterThan(0);
        expect(c.x).toBeLessThan(shape.width);
        expect(c.y).toBeGreaterThan(0);
        expect(c.y).toBeLessThan(shape.height);
      }
    });
  }

  it("rises with the strike and dies away by the end", () => {
    expect(ringStrength(RING_DEF.start - 1e-6)).toBe(0);
    expect(ringStrength((RING_DEF.start + RING_DEF.end) / 2)).toBe(1);
    expect(ringStrength(RING_DEF.end)).toBe(0);
  });

  it("is the only transition that reveals along a circle", () => {
    const sand = transitionOf("sand");
    expect(revealCircle(sand, sand.start, 100, 100).radius).toBeLessThan(0);
  });
});

describe("the leaves", () => {
  it("stands two leaves on the camera's path that fill the lens at the swap, beyond its near plane, on a phone too", () => {
    setStageAspect(412 / 915);
    const pose = poseAt(LEAVES_SWAP);
    const path = pathField();
    const view = 2 * Math.tan((pose.fov * Math.PI) / 360);
    for (let i = 0; i < path.count; i++) {
      const o = i * PARTICLE_STRIDE;
      const distance = pose.pz - path.data[o + 2];
      // Its middle (a leaf is drawn square to the lens, all of it at that distance) clear of the near plane.
      expect(distance).toBeGreaterThan(0.105);
      expect(path.data[o + 8] / distance).toBeGreaterThan(view);
    }
    expect(LEAVES.onPath[0]).toBeGreaterThan(0.1);
  });

  it("leaves every leaf on the twigs behind the camera by the time it settles on the branch", () => {
    const end = poseAt(LEAVES_DEF.end);
    const canopy = canopyField();
    for (let i = 0; i < canopy.count; i++) expect(canopy.data[i * PARTICLE_STRIDE + 2]).toBeGreaterThan(end.pz);
  });

  it("unfurls every leaf on the twigs before the camera reaches it", () => {
    const canopy = canopyField();
    const path = samples(LEAVES_DEF.start, LEAVES_DEF.end, 400);
    for (let i = 0; i < canopy.count; i++) {
      const o = i * PARTICLE_STRIDE;
      const reached = path.find((p) => poseAt(p).pz <= canopy.data[o + 2]) ?? LEAVES_DEF.end;
      expect(canopy.data[o + 3] + LEAVES.unfurl).toBeLessThanOrEqual(storyTime(reached, LEAVES_DEF.start) + 1e-6);
    }
  });

  it("drops every loosened leaf out of the frame before the way back out of the tree ends", () => {
    const span = storyTime(FOLIAGE_DEF.end, FOLIAGE_DEF.start);
    const falling = fallingField();
    for (let i = 0; i < falling.count; i++) {
      const o = i * PARTICLE_STRIDE;
      expect(falling.data[o + 3] + falling.data[o + 11]).toBeLessThanOrEqual(span + 1e-4);
    }
  });

  it("uses the ascent's own painted leaf", () => {
    expect(plateEntry("ascent/leaf").id).toBe("ascent/leaf");
  });
});

describe("the calm version", () => {
  it("cross-fades through a still veil that is whole through the cover", () => {
    for (const def of TRANSITIONS.filter((t) => t.layer === "canvas" && t.peak)) {
      expect(veilAmount(def, def.start)).toBe(0);
      expect(veilAmount(def, (def.peak![0] + def.peak![1]) / 2)).toBe(1);
      expect(veilAmount(def, def.end)).toBe(0);
    }
  });
});

describe("the painted noise", () => {
  it("is baked the same way every time and spans the range", () => {
    const a = bakeNoise(64);
    const b = bakeNoise(64);
    expect(Array.from(a.subarray(0, 512))).toEqual(Array.from(b.subarray(0, 512)));
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < a.length; i += 4) {
      lo = Math.min(lo, a[i]);
      hi = Math.max(hi, a[i]);
    }
    expect(lo).toBeLessThan(40);
    expect(hi).toBeGreaterThan(215);
  });
});
