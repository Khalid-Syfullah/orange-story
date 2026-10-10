import { describe, expect, it } from "vitest";

import { APPLY, SCENES } from "@/scroll/script";

import { figureOffset, SINK_DEPTH } from "./apply-plan";

describe("apply plan", () => {
  const apply = SCENES.find((s) => s.id === "apply")!;

  it("sinks the astronomer inside the apply scene, after the crossfade", () => {
    expect(APPLY.sink[0]).toBeGreaterThanOrEqual(apply.start);
    expect(APPLY.sink[1]).toBeLessThanOrEqual(apply.end);
  });

  it("is still before the sink, settled after it, and pure", () => {
    expect(figureOffset(APPLY.sink[0] - 0.01)).toBeCloseTo(0);
    expect(figureOffset(APPLY.sink[1] + 0.01)).toBeCloseTo(-SINK_DEPTH);
    expect(figureOffset(APPLY.sink[0] + 0.001)).toBe(figureOffset(APPLY.sink[0] + 0.001));
  });
});
