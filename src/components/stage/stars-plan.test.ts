import { describe, expect, it } from "vitest";

import { STARS, SCENES } from "@/scroll/script";

import { constellation, edgeDraw, FINGERTIP, growth, inClearCorner, starReveal } from "./stars-plan";

describe("stars plan", () => {
  const stars = SCENES.find((s) => s.id === "stars")!;

  it("grows inside the stars scene", () => {
    expect(STARS.grow[0]).toBeGreaterThanOrEqual(stars.start);
    expect(STARS.grow[1]).toBeLessThanOrEqual(stars.end);
    expect(STARS.grow[0]).toBeLessThan(STARS.grow[1]);
  });

  it("starts empty and ends full, and is a pure function of progress", () => {
    expect(starReveal(STARS.grow[0] - 0.001)).toBe(0);
    expect(starReveal(STARS.grow[1])).toBe(1);
    expect(growth(0.9)).toBe(growth(0.9));
  });

  it("keeps the bottom right clear", () => {
    const { nodes } = constellation();
    expect(nodes.length).toBeGreaterThan(40);
    for (const n of nodes) expect(inClearCorner(n.position[0], n.position[1])).toBe(false);
  });

  it("grows outward from the fingertip", () => {
    const { nodes } = constellation();
    const d = (i: number) => Math.hypot(nodes[i].position[0] - FINGERTIP[0], nodes[i].position[1] - FINGERTIP[1]);
    const first = nodes.slice(0, 10).reduce((a, _, i) => a + d(i), 0) / 10;
    const last = nodes.slice(-10).reduce((a, _, i) => a + d(nodes.length - 10 + i), 0) / 10;
    expect(first).toBeLessThan(last);
  });

  it("joins some stars by edges that draw only after their nodes appear and undraw backwards", () => {
    const { nodes, edges } = constellation();
    expect(edges.length).toBeGreaterThan(8);
    expect(edges.length).toBeLessThan(nodes.length);
    for (const e of edges) {
      expect(edgeDraw(e, STARS.grow[0])).toBe(0);
      expect(edgeDraw(e, STARS.grow[1])).toBe(1);
    }
  });
});
