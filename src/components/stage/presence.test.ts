import { describe, expect, it } from "vitest";

import { sceneIndexAt } from "@/scroll/helpers";
import { SCENES, SCREEN, TRANSITIONS } from "@/scroll/script";

import { coveredHandover, crossfadeOf, mountedScenes, presenceRange, scenePresence, swapPointOf } from "./presence";

const STEP = 1e-4;
const samples = Array.from({ length: Math.round(1 / STEP) + 1 }, (_, i) => i * STEP);

describe("scene presence", () => {
  it("starts with the hero and ends with the finale", () => {
    expect(scenePresence("hero", 0)).toBe(1);
    expect(scenePresence("finale", 1)).toBe(1);
    expect(scenePresence("ascent", 0)).toBe(0);
  });

  it("swaps scenes at the boundary, under full cover, where a transition hands one to the next", () => {
    const handovers = TRANSITIONS.filter((t) => t.layer === "canvas" && t.from !== t.to && t.peak);
    expect(handovers.map((t) => t.id)).toEqual(["sand", "cloud", "unfold", "dust", "fabric"]);
    for (const t of handovers) {
      expect(coveredHandover(t.from, t.to)).toBe(true);
      const boundary = SCENES.find((s) => s.id === t.to)!.start;
      const [covered, clearing] = t.peak!;
      expect(covered <= boundary && boundary <= clearing).toBe(true);
      expect(scenePresence(t.from, boundary - 1e-6)).toBe(1);
      expect(scenePresence(t.to, boundary - 1e-6)).toBe(0);
      expect(scenePresence(t.from, boundary)).toBe(0);
      expect(scenePresence(t.to, boundary)).toBe(1);
    }
  });

  it("crossfades plain boundaries, the incoming scene first (behind a pass, where and for as long as it says)", () => {
    const leaves = TRANSITIONS.find((t) => t.id === "leaves")!;
    expect(crossfadeOf("ascent", "graft")).toBeCloseTo(leaves.swap! * SCREEN, 9);
    expect(swapPointOf("ascent", "graft")).toBe(leaves.swapAt);
    expect(crossfadeOf("ascent", "graft", true)).toBeCloseTo(0.2 * SCREEN, 9);
    expect(crossfadeOf("pluck", "share")).toBeCloseTo(0.2 * SCREEN, 9);
    for (let i = 1; i < SCENES.length; i++) {
      const prev = SCENES[i - 1];
      const next = SCENES[i];
      if (coveredHandover(prev.id, next.id)) continue;
      const fade = crossfadeOf(prev.id, next.id);
      const at = swapPointOf(prev.id, next.id);
      expect(presenceRange(next).inStart).toBeCloseTo(at - fade, 9);
      expect(scenePresence(next, at - fade)).toBe(0);
      expect(scenePresence(next, at + fade)).toBe(1);
      expect(scenePresence(prev, at - 1e-6)).toBe(1);
      expect(scenePresence(prev, at + fade)).toBe(0);
    }
  });

  it("never leaves the stage empty", () => {
    for (const p of samples) {
      const most = Math.max(...SCENES.map((s) => scenePresence(s, p)));
      expect(most, `at ${p.toFixed(4)}`).toBeGreaterThan(0.85);
    }
  });

  it("only asks for scenes that are mounted", () => {
    for (const p of samples) {
      const mounted = new Set(mountedScenes(sceneIndexAt(p)).map((s) => s.id));
      for (const scene of SCENES) if (scenePresence(scene, p) > 0) expect(mounted.has(scene.id), `${scene.id} at ${p.toFixed(4)}`).toBe(true);
    }
  });

  it("mounts the current scene and its neighbours only", () => {
    expect(mountedScenes(0).map((s) => s.id)).toEqual(["hero", "ascent"]);
    expect(mountedScenes(5).map((s) => s.id)).toEqual(["share", "work", "blueprint"]);
    expect(mountedScenes(SCENES.length - 1).map((s) => s.id)).toEqual(["apply", "finale"]);
  });

  it("is a function of progress alone, so it plays backwards exactly", () => {
    const forward = samples.map((p) => scenePresence("pluck", p));
    const backward = [...samples].reverse().map((p) => scenePresence("pluck", p)).reverse();
    expect(backward).toEqual(forward);
  });
});
