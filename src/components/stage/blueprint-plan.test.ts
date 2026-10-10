import { describe, expect, it } from "vitest";

import { plateEntry, platePoint, plateWorldSize } from "@/art/manifest";
import { BLUEPRINT, PLAN_DEPTH, PLAN_HELD, SCENES } from "@/scroll/script";

import { BUILDERS, MALLET } from "./acting";
import { FOLDED_TURN, foldAt, HELD_PANEL, PANEL_IDS, PANEL_WIDTH, PANELS, panelAt, panelTurns } from "./blueprint-plan";

const blueprint = SCENES.find((s) => s.id === "blueprint")!;
const steps = (a: number, b: number, n = 400) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** World x of a panel's left and right edges (seen flat), from its pose. */
function edges(i: number, p: number): [number, number] {
  const pose = panelAt(i, p);
  if (i === HELD_PANEL) return [pose.x - PANEL_WIDTH / 2, pose.x + PANEL_WIDTH / 2];
  return [pose.x - PANEL_WIDTH * Math.cos(pose.turn), pose.x];
}

describe("the blueprint's plan", () => {
  it("is held in the architect's hands: the last panel's grip points on hers, at her depth", () => {
    const herLeft = platePoint("blueprint/architect", "grip-left");
    const herRight = platePoint("blueprint/architect", "grip-right");
    const held = plateEntry("blueprint/plan-4");
    const [w, h] = plateWorldSize(held);
    for (const p of [blueprint.start, BLUEPRINT.panels[0], BLUEPRINT.panels[1], blueprint.end]) {
      const pose = panelAt(HELD_PANEL, p);
      for (const [name, hers] of [["grip-left", herLeft], ["grip-right", herRight]] as const) {
        const [u, v] = held.points![name];
        expect(pose.x + (u - 0.5) * w).toBeCloseTo(hers[0], 2);
        expect(pose.y + (0.5 - v) * h).toBeCloseTo(hers[1], 2);
      }
      expect(pose.turn).toBe(0);
    }
    expect(PLAN_DEPTH).toBeLessThan(plateEntry("blueprint/architect").depth);
    expect(PLAN_DEPTH).toBeGreaterThan(plateEntry("blueprint/architect").depth - 0.05);
  });

  it("starts folded behind the panel in her hands, an accordion: each fold not quite flat, alternately one way and the other", () => {
    const p = blueprint.start;
    for (let k = 0; k < PANELS - 1; k++) expect(foldAt(k, p)).toBeCloseTo(FOLDED_TURN, 9);
    const turns = panelTurns(p);
    expect(turns[2]).toBeCloseTo(-FOLDED_TURN, 9);
    expect(turns[1]).toBeCloseTo(0, 9);
    expect(turns[0]).toBeCloseTo(-FOLDED_TURN, 9);
    // All four within the held panel's width, and all behind it.
    const [left, right] = edges(HELD_PANEL, p);
    for (let i = 0; i < HELD_PANEL; i++) {
      const pose = panelAt(i, p);
      expect(pose.z).toBeLessThanOrEqual(1e-9);
      for (const x of edges(i, p)) {
        expect(x).toBeGreaterThan(left - 0.02 * PANEL_WIDTH);
        expect(x).toBeLessThan(right + 0.02 * PANEL_WIDTH);
      }
    }
  });

  it("unfolds on its hinges, never stretching: neighbouring panels always meet at their shared edge", () => {
    for (const p of steps(BLUEPRINT.panels[0], BLUEPRINT.panels[1], 200)) {
      for (let i = 0; i < HELD_PANEL; i++) {
        const pose = panelAt(i, p);
        const next = panelAt(i + 1, p);
        // The hinge of panel i is the left edge of panel i + 1, in x and in depth.
        const nextLeftX = i + 1 === HELD_PANEL ? next.x - PANEL_WIDTH / 2 : next.x - PANEL_WIDTH * Math.cos(next.turn);
        const nextLeftZ = i + 1 === HELD_PANEL ? 0 : next.z + PANEL_WIDTH * Math.sin(next.turn);
        expect(pose.x).toBeCloseTo(nextLeftX, 9);
        expect(pose.z).toBeCloseTo(nextLeftZ, 9);
        expect(pose.y).toBe(next.y);
      }
    }
  });

  it("opens the panel next to her hands first, then the next, each swinging a touch past flat and settling", () => {
    const [f1, f2, f3] = BLUEPRINT.folds;
    expect(f1[0]).toBeLessThan(f2[0]);
    expect(f2[0]).toBeLessThan(f3[0]);
    expect(f1[0]).toBe(BLUEPRINT.panels[0]);
    expect(f3[1]).toBe(BLUEPRINT.panels[1]);
    for (let k = 0; k < PANELS - 1; k++) {
      const range = BLUEPRINT.folds[k];
      const turns = steps(range[0], range[1]).map((p) => foldAt(k, p));
      expect(Math.min(...turns)).toBeLessThan(-0.01);
      expect(Math.min(...turns)).toBeGreaterThan(-0.15);
      expect(foldAt(k, range[1])).toBeCloseTo(0, 12);
    }
  });

  it("ends flat in its open layout (the art's own, moved into her hands), lit", () => {
    const p = blueprint.end;
    for (let i = 0; i < PANELS; i++) {
      const pose = panelAt(i, p);
      const entry = plateEntry(PANEL_IDS[i]);
      const centre = i === HELD_PANEL ? pose.x : pose.x - PANEL_WIDTH / 2;
      expect(centre).toBeCloseTo(entry.position[0] + PLAN_HELD[0], 9);
      expect(pose.y).toBeCloseTo(entry.position[1] + PLAN_HELD[1], 9);
      expect(pose.z).toBeCloseTo(0, 9);
      expect(pose.turn).toBeCloseTo(0, 9);
      expect(pose.shade).toBeLessThan(0.01);
    }
  });

  it("works the builder's mallet while the camera is on him: a wind-up, a fast strike and a recoil", () => {
    const arm = BUILDERS.blueprint.forearm;
    const [a, b] = BLUEPRINT.strikes;
    const values = steps(a, b, 2000).map(arm);
    // Wound back against the blow, then down past the painted pose to the chisel (clockwise).
    expect(Math.max(...values)).toBeCloseTo(MALLET.windUp, 3);
    expect(Math.min(...values)).toBeCloseTo(-MALLET.strike, 3);
    // The strike is fast: from the top of the wind-up to the chisel in a fraction of a blow.
    const blow = (b - a) / BLUEPRINT.blows;
    const top = steps(a, a + blow, 2000).reduce((best, p) => (arm(p) > arm(best) ? p : best), a);
    const hit = steps(a, a + blow, 2000).reduce((best, p) => (arm(p) < arm(best) ? p : best), a);
    expect(hit - top).toBeLessThan(0.25 * blow);
    // At rest outside its stretch.
    expect(arm(a)).toBe(0);
    expect(arm(b)).toBeCloseTo(0, 12);
  });

  it("is a pure function of progress", () => {
    const p = (BLUEPRINT.panels[0] + BLUEPRINT.panels[1]) / 2.3;
    const before = JSON.stringify([0, 1, 2, 3].map((i) => panelAt(i, p)));
    panelAt(1, blueprint.end);
    expect(JSON.stringify([0, 1, 2, 3].map((i) => panelAt(i, p)))).toBe(before);
  });
});
