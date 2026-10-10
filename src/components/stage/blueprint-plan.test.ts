import { describe, expect, it } from "vitest";

import { BLUEPRINT } from "@/scroll/script";

import { FOLDED, PANELS, PANEL_WIDTH, panelAt, planOffset } from "./blueprint-plan";

describe("blueprint plan", () => {
  it("starts as a folded packet in the architect's hands", () => {
    const before = BLUEPRINT.bring[0];
    for (let i = 0; i < PANELS; i++) expect(panelAt(i, before).scaleX).toBeCloseTo(FOLDED);
    expect(planOffset(before).x).toBeGreaterThan(1);
  });

  it("opens the panels one after another", () => {
    const [a, b] = BLUEPRINT.panels;
    const mid = (a + b) / 2;
    expect(panelAt(0, mid).scaleX).toBeCloseTo(1);
    expect(panelAt(3, mid).scaleX).toBeCloseTo(FOLDED);
  });

  it("ends flat, centered and lit", () => {
    const end = BLUEPRINT.panels[1];
    for (let i = 0; i < PANELS; i++) {
      const pose = panelAt(i, end);
      expect(pose.scaleX).toBeCloseTo(1);
      expect(pose.x).toBeCloseTo(0);
      expect(pose.shade).toBeLessThan(0.1);
    }
    expect(PANEL_WIDTH).toBe(0.5);
  });

  it("is a pure function of progress", () => {
    const p = (BLUEPRINT.panels[0] + BLUEPRINT.panels[1]) / 2.3;
    expect(panelAt(2, p)).toEqual(panelAt(2, p));
  });
});
