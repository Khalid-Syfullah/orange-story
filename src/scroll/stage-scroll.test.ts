import { gsap } from "gsap";
import { describe, expect, it } from "vitest";

import { ease } from "@/lib/progress";
import { EASE_GSAP_NAME } from "@/styles/tokens";

import { registerGsap } from "./stage-scroll";

describe("the scroll engine", () => {
  it("registers the story easing curve as a GSAP ease that matches motion and CSS", () => {
    registerGsap();
    registerGsap(); // idempotent
    const story = gsap.parseEase(EASE_GSAP_NAME);
    expect(typeof story).toBe("function");
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      expect(story(t)).toBeCloseTo(ease(t), 2);
    }
  });
});
