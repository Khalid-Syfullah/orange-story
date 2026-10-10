import { describe, expect, it } from "vitest";

import { envelope } from "@/lib/progress";

import {
  beatLineRanges,
  beatOf,
  beatVisible,
  chapterIndexAt,
  currentChapter,
  currentScene,
  sceneAt,
  sceneProgress,
  toneAt,
  visibleBeats,
} from "./helpers";
import { ANCHORS, BEATS, CAMERA, CHAPTERS, HAIRLINES, SCENES, SCREEN, SCRIPT, STAGE_VH, TRANSITIONS } from "./script";
import type { BeatDef, StoryScript } from "./types";
import { ScriptError, scriptProblems, validateScript } from "./validate";

const replaceBeat = (script: StoryScript, id: string, patch: Partial<BeatDef>): StoryScript => ({
  ...script,
  beats: script.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

describe("the story script", () => {
  it("passes validation", () => {
    expect(scriptProblems()).toEqual([]);
    expect(() => validateScript()).not.toThrow();
  });

  it("pins a 5000vh stage, about 50 screens of scrolling", () => {
    expect(STAGE_VH).toBe(5000);
    expect(SCREEN).toBeCloseTo(1 / 49, 12);
  });

  it("lays the scenes out in storyboard order with the planned shares", () => {
    expect(SCENES.map((s) => [s.id, s.share])).toEqual([
      ["hero", 0.03],
      ["ascent", 0.05],
      ["graft", 0.05],
      ["pluck", 0.06],
      ["share", 0.042],
      ["work", 0.1],
      ["blueprint", 0.068],
      ["site", 0.08],
      ["prune", 0.075],
      ["fall", 0.073],
      ["faq", 0.14],
      ["stars", 0.05],
      ["apply", 0.08],
      ["finale", 0.102],
    ]);
    const end = (id: string) => SCENES.find((s) => s.id === id)?.end;
    expect(SCENES[0].start).toBe(0);
    expect(end("share")).toBe(0.232);
    expect(end("blueprint")).toBe(0.4);
    expect(end("fall")).toBe(0.628);
    expect(end("finale")).toBe(1);
  });

  it("switches chapters exactly at the reference fractions", () => {
    expect(CHAPTERS.map((c) => [c.id, c.start])).toEqual([
      ["model", 0.012],
      ["work", 0.232],
      ["terms", 0.4],
      ["questions", 0.628],
    ]);
    expect(currentChapter(0).id).toBe("model");
    expect(currentChapter(0.2319999).id).toBe("model");
    expect(currentChapter(0.232).id).toBe("work");
    expect(currentChapter(0.3999999).id).toBe("work");
    expect(currentChapter(0.4).id).toBe("terms");
    expect(currentChapter(0.628).id).toBe("questions");
    expect(currentChapter(1).id).toBe("questions");
    expect(chapterIndexAt(0.95)).toBe(3);
  });

  it("gives every scene at least one camera key, starting at 0", () => {
    expect(CAMERA[0].at).toBe(0);
    for (const scene of SCENES) expect(CAMERA.some((k) => k.scene === scene.id)).toBe(true);
  });

  it("covers every scene swap under a transition or keeps the camera continuous", () => {
    for (let i = 1; i < SCENES.length; i++) {
      const boundary = SCENES[i].start;
      const covered = TRANSITIONS.some((t) => t.peak && t.peak[0] <= boundary && boundary <= t.peak[1]);
      const before = [...CAMERA].reverse().find((k) => k.at < boundary);
      const from = CAMERA.find((k) => k.at >= boundary);
      if (!covered && before && from && from.at === boundary && before.move === "hold") {
        // A held shot that meets the next scene's first key must not jump.
        expect(from.position).toEqual(before.position);
      }
    }
  });

  it("names every transition from the storyboard", () => {
    expect(new Set(TRANSITIONS.map((t) => t.kind))).toEqual(new Set(["sand", "unfold", "dust", "ring", "fabric", "viewfinder", "smoke"]));
  });

  it("moves the hairlines out at every chapter change", () => {
    const exits = HAIRLINES.filter((c) => c.kind === "exit");
    for (const chapter of CHAPTERS.slice(1)) {
      expect(exits.some((cue) => envelope(chapter.start, cue.at) > 0.99)).toBe(true);
    }
  });

  it("lands chapter anchors inside their chapters, after covering transitions", () => {
    expect(currentChapter(ANCHORS.work).id).toBe("work");
    expect(currentChapter(ANCHORS.terms).id).toBe("terms");
    expect(currentChapter(ANCHORS.questions).id).toBe("questions");
    expect(currentScene(ANCHORS.apply).id).toBe("apply");
    expect(beatVisible("apply-form", ANCHORS.apply)).toBe(true);
  });

  it("keeps the milk tone to the unfold and the top-down site", () => {
    expect(toneAt(0.1)).toBe("sky");
    expect(toneAt(0.4)).toBe("milk");
    expect(toneAt(0.45)).toBe("milk");
    expect(toneAt(0.5)).toBe("sky");
  });
});

describe("validateScript", () => {
  it("rejects scenes that do not tile 0 to 1", () => {
    const gap: StoryScript = {
      ...SCRIPT,
      scenes: SCRIPT.scenes.map((s) => (s.id === "pluck" ? { ...s, start: s.start + 0.002, share: s.share - 0.002 } : s)),
    };
    expect(() => validateScript(gap)).toThrow(ScriptError);
    expect(scriptProblems(gap).some((p) => p.includes("gap between"))).toBe(true);

    const short: StoryScript = { ...SCRIPT, scenes: SCRIPT.scenes.slice(0, -1) };
    expect(scriptProblems(short).some((p) => p.includes("must end at 1"))).toBe(true);
  });

  it("rejects beats that overlap in a slot", () => {
    const card1 = beatOf("card-1");
    const overlapping = replaceBeat(SCRIPT, "card-2", { in: card1.out - SCREEN / 2 });
    expect(() => validateScript(overlapping)).toThrow(ScriptError);
    expect(scriptProblems(overlapping).some((p) => p.includes("overlap in the right slot"))).toBe(true);
  });

  it("rejects a beat shorter than one screen", () => {
    const found = beatOf("found");
    const brief = replaceBeat(SCRIPT, "found", { out: found.in + SCREEN * 0.8, hold: [found.in + SCREEN * 0.2, found.in + SCREEN * 0.6] });
    expect(() => validateScript(brief)).toThrow(ScriptError);
    expect(scriptProblems(brief).some((p) => p.includes("at least one screen"))).toBe(true);
  });

  it("rejects a copy key that is not in the copy deck", () => {
    const missing = replaceBeat(SCRIPT, "found", { copy: "model.nowhere" as BeatDef["copy"] });
    expect(scriptProblems(missing).some((p) => p.includes("is not in src/content/copy.ts"))).toBe(true);
  });

  it("lists every problem at once", () => {
    const card1 = beatOf("card-1");
    const broken = replaceBeat(replaceBeat(SCRIPT, "card-2", { in: card1.out - SCREEN / 2 }), "found", { slot: "nowhere" as BeatDef["slot"] });
    expect(scriptProblems(broken).length).toBeGreaterThanOrEqual(2);
  });
});

describe("helpers", () => {
  it("finds the scene at each boundary (scenes own [start, end))", () => {
    for (const scene of SCENES) {
      expect(currentScene(scene.start).id).toBe(scene.id);
      expect(currentScene((scene.start + scene.end) / 2).id).toBe(scene.id);
    }
    expect(currentScene(1).id).toBe("finale");
  });

  it("measures progress through a scene, clamped", () => {
    expect(sceneProgress("pluck", 0.1)).toBe(0);
    expect(sceneProgress("pluck", 0.16)).toBeCloseTo(0.5, 9);
    expect(sceneProgress("pluck", 0.3)).toBe(1);
    expect(sceneProgress("pluck", sceneAt("pluck", 0.25))).toBeCloseTo(0.25, 9);
  });

  it("knows when a beat is on stage", () => {
    const found = beatOf("found");
    expect(beatVisible("found", found.in - 1e-4)).toBe(false);
    expect(beatVisible("found", found.in)).toBe(true);
    expect(beatVisible("found", found.out - 1e-4)).toBe(true);
    expect(beatVisible("found", found.out)).toBe(false);
    expect(beatVisible("hero", 0)).toBe(true);
    expect(beatVisible("finale", 1)).toBe(true);
    expect(visibleBeats(0).map((b) => b.id)).toEqual(["hero", "hero-intro"]);
  });

  it("staggers lines inside the beat, in order, both ways", () => {
    for (const beat of BEATS) {
      const lines = [0, 1, 2].map((i) => beatLineRanges(beat, i, 3));
      for (const { arrive, leave } of lines) {
        expect(arrive[0]).toBeGreaterThanOrEqual(beat.in - 1e-9);
        expect(arrive[1]).toBeLessThanOrEqual(beat.hold[1] + 1e-9);
        expect(leave[0]).toBeGreaterThanOrEqual(beat.hold[1] - 1e-9);
        expect(leave[1]).toBeLessThanOrEqual(beat.out + 1e-9);
      }
      expect(lines[0].arrive[0]).toBeLessThanOrEqual(lines[1].arrive[0]);
      expect(lines[0].leave[0]).toBeLessThanOrEqual(lines[2].leave[0]);
    }
  });
});
