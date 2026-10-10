import { describe, expect, it } from "vitest";

import { INTRO, introAmount, type IntroSpan } from "./hero-intro";
import { rippleDrops } from "./glow-ripple";

describe("hero intro", () => {
  const spans = (Object.values(INTRO) as (IntroSpan | number)[]).filter((v): v is IntroSpan => typeof v === "object");

  it("plays the sky first, then the statue, then the onlookers, then the text", () => {
    expect(INTRO.sky.at).toBeLessThan(INTRO.statue.at);
    expect(INTRO.statue.at).toBeLessThan(INTRO.crowdFar.at);
    expect(INTRO.crowdFar.at).toBeLessThan(INTRO.crowdNear.at);
    expect(INTRO.statue.at + INTRO.statue.duration * 0.5).toBeLessThan(INTRO.text);
  });

  it("finishes every move inside the intro and the text lands before it ends", () => {
    for (const span of spans) expect(span.at + span.duration).toBeLessThanOrEqual(INTRO.total);
    expect(INTRO.text).toBeLessThan(INTRO.total);
  });

  it("eases each move from 0 to 1 and holds at both ends", () => {
    for (const span of spans) {
      expect(introAmount(span.at - 1, span)).toBe(0);
      expect(introAmount(span.at + span.duration + 1, span)).toBe(1);
      expect(introAmount(span.at + span.duration / 2, span)).toBeGreaterThan(0.5); // eased out
    }
  });
});

describe("glow ripple droplets", () => {
  it("makes the same droplets on every render", () => {
    expect(rippleDrops("a", 40, 0.14)).toEqual(rippleDrops("a", 40, 0.14));
    expect(rippleDrops("a", 40, 0.14)).not.toEqual(rippleDrops("b", 40, 0.14));
  });

  it("keeps every value in its range, with rings spread over the whole cycle", () => {
    const count = 200;
    const data = rippleDrops("ranges", count, 0.14);
    expect(data.length).toBe(count * 4);
    const rings = new Set<number>();
    for (let i = 0; i < count; i++) {
      const [angle, ring, jitter, size] = data.slice(i * 4, i * 4 + 4);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
      expect(ring).toBeGreaterThanOrEqual(0);
      expect(ring).toBeLessThan(1);
      expect(Math.abs(jitter)).toBeLessThanOrEqual(1);
      expect(size).toBeGreaterThan(0.14 * 0.5);
      expect(size).toBeLessThan(0.14 * 1.7);
      rings.add(Math.floor(ring * 8));
    }
    expect(rings.size).toBe(8);
  });
});
