import { describe, expect, it } from "vitest";

import { sceneOf } from "@/scroll/helpers";
import { TRANSITIONS } from "@/scroll/script";
import type { TransitionDef } from "@/scroll/types";

import {
  CANVAS_KINDS,
  canvasTransitionAt,
  DUST,
  dustCoverage,
  dustFrame,
  FABRIC,
  fabricFrame,
  insideCircle,
  isCanvasKind,
  revealCircle,
  ringFrame,
  RING,
  SAND,
  sandCoverage,
  sandFrame,
  transitionPhase,
  transitionRunning,
  unfoldFrame,
} from "./choreography";

const CANVAS = TRANSITIONS.filter((t) => isCanvasKind(t.kind));
const byKind = (kind: TransitionDef["kind"]) => {
  const def = TRANSITIONS.find((t) => t.kind === kind);
  if (!def) throw new Error(`no ${kind} transition`);
  return def;
};

/** Evenly spaced samples from a to b, both included. */
const range = (a: number, b: number, n = 41) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

const ENTERED = { t: 0.5, enter: 1, exit: 0 };

describe("transition phases", () => {
  it("draws every canvas kind the script uses, and nothing else on the canvas", () => {
    expect(new Set(CANVAS.map((t) => t.kind))).toEqual(new Set(CANVAS_KINDS));
    for (const t of CANVAS) expect(t.layer).toBe("canvas");
  });

  it("never runs two canvas transitions at once", () => {
    const sorted = [...CANVAS].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
  });

  it("ramps a covering transition in, holds its peak, and ramps it out", () => {
    for (const def of CANVAS.filter((t) => t.peak)) {
      const [covered, clearing] = def.peak!;
      expect(transitionPhase(def, def.start)).toMatchObject({ t: 0, enter: 0, exit: 0 });
      expect(transitionPhase(def, covered)).toMatchObject({ enter: 1, exit: 0 });
      expect(transitionPhase(def, (covered + clearing) / 2)).toMatchObject({ enter: 1, exit: 0 });
      expect(transitionPhase(def, clearing)).toMatchObject({ enter: 1, exit: 0 });
      expect(transitionPhase(def, def.end)).toMatchObject({ t: 1, enter: 1, exit: 1 });
    }
  });

  it("finds the running canvas transition, and none between them", () => {
    for (const def of CANVAS) {
      expect(canvasTransitionAt(def.start, TRANSITIONS)?.id).toBe(def.id);
      expect(canvasTransitionAt((def.start + def.end) / 2, TRANSITIONS)?.id).toBe(def.id);
      expect(canvasTransitionAt(def.end, TRANSITIONS)?.id).not.toBe(def.id);
      expect(transitionRunning(def, def.start - 1e-6)).toBe(false);
    }
    expect(canvasTransitionAt(0, TRANSITIONS)).toBeNull();
    expect(canvasTransitionAt(1, TRANSITIONS)).toBeNull();
  });

  it("is a function of progress alone, so it plays backwards exactly", () => {
    const def = byKind("sand");
    const points = range(def.start, def.end, 101);
    const forward = points.map((p) => sandFrame(transitionPhase(def, p)));
    const backward = [...points].reverse().map((p) => sandFrame(transitionPhase(def, p))).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("sand", () => {
  // Shader positions: the sweep s runs 0 to 1 across the screen, noise moves it by up to `ragged`.
  const sweep = range(-SAND.ragged, 1 + SAND.ragged);

  it("draws nothing at its start: the old scene", () => {
    const frame = sandFrame(transitionPhase(byKind("sand"), byKind("sand").start));
    for (const s1 of sweep) for (const s2 of sweep) expect(sandCoverage(frame, s1, s2)).toEqual({ cover: 0, grains: 0 });
  });

  it("covers the whole screen across its peak", () => {
    const frame = sandFrame(ENTERED);
    for (const s1 of sweep) for (const s2 of sweep) expect(sandCoverage(frame, s1, s2).cover).toBe(1);
  });

  it("draws nothing at its end: the new scene", () => {
    const def = byKind("sand");
    const frame = sandFrame(transitionPhase(def, def.end));
    for (const s1 of sweep) for (const s2 of sweep) expect(sandCoverage(frame, s1, s2)).toEqual({ cover: 0, grains: 0 });
  });

  it("sweeps in from upwind: the upwind side is covered first", () => {
    const frame = sandFrame({ t: 0.2, enter: 0.3, exit: 0 });
    expect(sandCoverage(frame, 0, 0).cover).toBeGreaterThan(sandCoverage(frame, 1, 1).cover);
  });
});

describe("rising dust", () => {
  const heights = range(-DUST.ragged, 1 + DUST.ragged);

  it("draws nothing at its start, covers across its peak, and draws nothing at its end", () => {
    const def = byKind("dust");
    const first = dustFrame(transitionPhase(def, def.start));
    const peak = dustFrame(ENTERED);
    const last = dustFrame(transitionPhase(def, def.end));
    for (const y1 of heights)
      for (const y2 of heights) {
        expect(dustCoverage(first, y1, y2)).toEqual({ cover: 0, specks: 0 });
        expect(dustCoverage(peak, y1, y2).cover).toBe(1);
        expect(dustCoverage(last, y1, y2)).toEqual({ cover: 0, specks: 0 });
      }
  });

  it("rises from the bottom: the bottom is covered first and uncovered first", () => {
    const rising = dustFrame({ t: 0.2, enter: 0.4, exit: 0 });
    expect(dustCoverage(rising, 1, 1).cover).toBeGreaterThan(dustCoverage(rising, 0, 0).cover);
    const lifting = dustFrame({ t: 0.8, enter: 1, exit: 0.4 });
    expect(dustCoverage(lifting, 0, 0).cover).toBeGreaterThan(dustCoverage(lifting, 1, 1).cover);
  });
});

describe("paper unfold", () => {
  it("spreads the white until it covers everything, then opens the folded sheet panel by panel", () => {
    const def = byKind("unfold");
    expect(unfoldFrame(transitionPhase(def, def.start))).toMatchObject({ milk: 0, opening: 0 });
    // Fully white across the peak: the packet still lies folded and flat on the white.
    expect(unfoldFrame(ENTERED)).toMatchObject({ milk: 1, opening: 0 });
    const justOpening = unfoldFrame({ t: 0.6, enter: 1, exit: 1e-4 });
    expect(justOpening.center).toBeCloseTo(Math.PI, 6);
    expect(justOpening.left).toBeCloseTo(Math.PI / 2, 9);
    expect(justOpening.right).toBeCloseTo(Math.PI / 2, 9);
    expect(justOpening.packet).toBeLessThan(0.01);
    // Panel by panel: the middle column first, then the left, then the right.
    const mid = unfoldFrame({ t: 0.8, enter: 1, exit: 0.5 });
    expect(mid.center).toBe(0);
    expect(mid.left).toBeLessThan(Math.PI / 2);
    expect(mid.right).toBeCloseTo(Math.PI / 2, 9);
    // Flat at the end: no white, no fold, no crease, no shadow.
    expect(unfoldFrame(transitionPhase(def, def.end))).toEqual({ milk: 1, opening: 1, packet: 0, center: 0, left: 0, right: 0, crease: 0 });
  });
});

describe("rainbow ring", () => {
  const def = byKind("ring");
  const W = 1440;
  const H = 900;
  const corners = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ] as const;

  it("starts at its origin, invisible, with nothing revealed", () => {
    const ring = ringFrame(def, def.start, W, H);
    expect(ring.intensity).toBe(0);
    expect([ring.x / W, ring.y / H]).toEqual(def.origin);
    const circle = revealCircle(def, def.start, W, H);
    expect(insideCircle(circle, ring.x, ring.y)).toBe(0);
    expect(insideCircle(revealCircle(def, def.start - 1e-4, W, H), ring.x, ring.y)).toBe(0);
  });

  it("grows steadily and reveals more and more", () => {
    let last = -Infinity;
    for (const p of range(def.start, def.end)) {
      const r = revealCircle(def, p, W, H).radius;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("ends past every corner, invisible, with everything revealed", () => {
    const ring = ringFrame(def, def.end, W, H);
    expect(ring.intensity).toBe(0);
    for (const [x, y] of corners) {
      expect(Math.hypot(x - ring.x, y - ring.y)).toBeLessThan(ring.outer * RING.inner);
      expect(insideCircle(ringFrame(def, def.end - 1e-9, W, H), x, y)).toBe(1);
      expect(insideCircle(revealCircle(def, def.end, W, H), x, y)).toBe(1);
    }
  });

  it("happens inside the falling orange's scene", () => {
    const fall = sceneOf("fall");
    expect(def.from).toBe("fall");
    expect(def.start).toBeGreaterThanOrEqual(fall.start);
    expect(def.end).toBeLessThanOrEqual(fall.end);
  });
});

describe("fabric sky", () => {
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    it(`draws nothing at its start, fills across its peak and clears at its end (aspect ${aspect.toFixed(2)})`, () => {
      const def = byKind("fabric");
      const first = fabricFrame(transitionPhase(def, def.start), aspect);
      expect(first.fabric).toBe(0);
      expect(first.cloudAlpha).toBe(0);
      expect(first.fill).toBe(0);
      expect(first.hole).toBeLessThan(-(FABRIC.holeRagged + FABRIC.holeSoft));

      expect(fabricFrame(ENTERED, aspect).fill).toBe(1);

      const last = fabricFrame(transitionPhase(def, def.end), aspect);
      expect(last.fabric).toBe(0);
      expect(last.hole).toBeGreaterThan(Math.hypot(aspect / 2, 0.5) + FABRIC.holeRagged + FABRIC.holeSoft);
    });
  }

  it("spreads the cloth past both edges before the cloud fills the screen", () => {
    const frame = fabricFrame({ t: 0.3, enter: FABRIC.fill[0], exit: 0 }, 16 / 9);
    expect(frame.spread).toBeGreaterThan(1 + FABRIC.spreadSoft);
  });
});
