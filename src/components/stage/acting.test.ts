import { describe, expect, it } from "vitest";

import { ACTING, BLUEPRINT, PLUCK, PRUNE, SCENES, SCREEN, STARS } from "@/scroll/script";

import { architectHeadAt, ASTRONOMER_SETTLE, astronomerArmAt, CROWD_TIP, crowdHeadAt, gardenerSwayAt, harvesterHeadAt, HARVESTER_LOOK_AWAY, keeperSway } from "./acting";
import { wateringAt } from "./finale-plan";

/** Samples a curve over the whole story, densely. */
const across = (f: (p: number) => number) => Array.from({ length: 4001 }, (_, i) => f(i / 4000));

describe("scrubbed acting", () => {
  it("is a function of progress alone: the way back is exactly the way down", () => {
    const curves = [(p: number) => crowdHeadAt(p, 1), harvesterHeadAt, architectHeadAt, gardenerSwayAt, astronomerArmAt];
    for (const f of curves) {
      const down = across(f);
      // Scrubbed back from the end: every value as it was on the way down.
      const up = Array.from({ length: 4001 }, (_, i) => f((4000 - i) / 4000)).reverse();
      expect(up).toEqual(down);
      // And it never jumps.
      for (let i = 1; i < down.length; i++) expect(Math.abs(down[i] - down[i - 1])).toBeLessThan(0.03);
    }
  });

  it("tips the onlookers' heads up as the orange brightens, toward the statue", () => {
    const [start, end] = ACTING.crowdLook;
    expect(crowdHeadAt(start, 1)).toBe(0);
    expect(crowdHeadAt(end, 1)).toBeCloseTo(CROWD_TIP, 9);
    expect(crowdHeadAt(end, -1)).toBeCloseTo(-CROWD_TIP, 9);
    expect(crowdHeadAt(1, 1)).toBeCloseTo(CROWD_TIP, 9);
    // Over the hero scene, where the glow lifts.
    expect(start).toBe(SCENES[0].start);
    expect(end).toBe(SCENES[0].end);
  });

  it("turns the harvester's head to the orange as he takes it", () => {
    expect(harvesterHeadAt(PLUCK.reveal[0])).toBeCloseTo(HARVESTER_LOOK_AWAY, 9);
    expect(harvesterHeadAt(PLUCK.handoff[1])).toBeCloseTo(0, 12);
    expect(harvesterHeadAt(PLUCK.release[1])).toBeCloseTo(0, 12);
  });

  it("bows the architect's head as the plan opens, panel by panel", () => {
    expect(architectHeadAt(BLUEPRINT.panels[0])).toBe(0);
    expect(architectHeadAt((BLUEPRINT.panels[0] + BLUEPRINT.panels[1]) / 2)).toBeGreaterThan(0);
    expect(architectHeadAt(BLUEPRINT.panels[1])).toBeGreaterThan(0.05);
  });

  it("leans the gardener's body into each snip, and back between them", () => {
    let snips = 0;
    let closed = false;
    for (let p = PRUNE.trim[0]; p <= PRUNE.trim[1]; p += 0.00002) {
      const lean = gardenerSwayAt(p);
      if (!closed && lean > 0.01) {
        snips++;
        closed = true;
      } else if (closed && lean < 0.002) closed = false;
    }
    expect(snips).toBe(PRUNE.snips);
    expect(gardenerSwayAt(PRUNE.trim[1] + SCREEN)).toBe(0);
  });

  it("settles the astronomer's arm into the point before the stars grow from his fingertip", () => {
    expect(astronomerArmAt(ACTING.astronomerArm[0])).toBeCloseTo(ASTRONOMER_SETTLE, 9);
    expect(astronomerArmAt(STARS.grow[0])).toBeCloseTo(0, 12);
    expect(ACTING.astronomerArm[1]).toBeLessThanOrEqual(STARS.grow[0]);
  });

  it("shifts the keepers' weight with their loop, and not before it fades in", () => {
    const pour = wateringAt(1.3);
    expect(keeperSway("woman", 1.3, pour, 0)).toBeCloseTo(0, 12);
    expect(keeperSway("man", 0.9, pour, 0)).toBeCloseTo(0, 12);
    let most = 0;
    for (let t = 0; t < 10; t += 0.05) most = Math.max(most, Math.abs(keeperSway("woman", t, wateringAt(t), 1)), Math.abs(keeperSway("man", t, wateringAt(t), 1)));
    expect(most).toBeGreaterThan(0.005);
    expect(most).toBeLessThan(0.03);
  });
});
