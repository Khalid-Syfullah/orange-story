import { describe, expect, it } from "vitest";

import { BEATS, MOBILE, SCENES, STAGE_VH } from "./script";
import { velocityJumps } from "@/components/stage/motion-kit";

import { LINEAR_SCROLL, MOBILE_SCROLL, screensBetween, screensOf } from "./mobile";

describe("the phone's scroll map", () => {
  it("keeps the same story: it starts at 0, ends at 1 and keeps every scene boundary in order", () => {
    expect(MOBILE_SCROLL.toProgress(0)).toBe(0);
    expect(MOBILE_SCROLL.toProgress(1)).toBe(1);
    expect(MOBILE_SCROLL.toScroll(0)).toBe(0);
    expect(MOBILE_SCROLL.toScroll(1)).toBe(1);
    let last = -1;
    for (const scene of SCENES) {
      const u = MOBILE_SCROLL.toScroll(scene.start);
      expect(u).toBeGreaterThan(last);
      expect(MOBILE_SCROLL.toProgress(u)).toBeCloseTo(scene.start, 9);
      last = u;
    }
  });

  it("is its own inverse, and strictly increasing", () => {
    let last = -1;
    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      const u = MOBILE_SCROLL.toScroll(p);
      expect(u).toBeGreaterThanOrEqual(last);
      last = u;
      expect(MOBILE_SCROLL.toProgress(u)).toBeCloseTo(p, 9);
    }
  });

  it("bends smoothly at the scene boundaries: under a steady thumb the story's speed never jumps", () => {
    expect(velocityJumps(MOBILE_SCROLL.toProgress, 0, 1)).toEqual([]);
  });

  it("clamps outside 0 to 1", () => {
    expect(MOBILE_SCROLL.toProgress(-1)).toBe(0);
    expect(MOBILE_SCROLL.toProgress(2)).toBe(1);
    expect(LINEAR_SCROLL.toProgress(0.25)).toBe(0.25);
    expect(LINEAR_SCROLL.toScroll(0.25)).toBe(0.25);
  });

  it("makes the stage about 70% as long", () => {
    expect(MOBILE.stageScale).toBeCloseTo(0.7, 5);
    expect(screensOf(true) / screensOf(false)).toBeGreaterThan(0.68);
    expect(screensOf(true) / screensOf(false)).toBeLessThan(0.72);
    expect(screensOf(false)).toBeCloseTo((STAGE_VH - 100) / 100, 9);
  });

  it("gives the scenes that carry text more of the scroll than the long camera moves", () => {
    const share = (id: string) => {
      const scene = SCENES.find((s) => s.id === id)!;
      return screensBetween(scene.start, scene.end, true) / (scene.end - scene.start) / screensOf(true);
    };
    expect(share("work")).toBeGreaterThan(share("ascent"));
    expect(share("faq")).toBeGreaterThan(share("stars"));
  });

  it("leaves every text beat enough scrolling to read on a phone", () => {
    for (const beat of BEATS) {
      if (beat.leave === "hold") continue;
      const holdScreens = screensBetween(beat.hold[0], beat.hold[1], true);
      const totalScreens = screensBetween(beat.in, beat.out, true);
      // The beat as a whole stays about a screen or more; fully on screen it is never a blink.
      expect(totalScreens, `${beat.id} total`).toBeGreaterThanOrEqual(0.9);
      expect(holdScreens, `${beat.id} hold`).toBeGreaterThanOrEqual(0.2);
    }
  });
});
