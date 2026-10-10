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

describe("the astronomer on a phone", () => {
  it("sinks right out of a phone's taller frame (the text and the form fill it), and less on a wide screen", async () => {
    const { plateEntry } = await import("@/art/manifest");
    const { CAMERA } = await import("@/scroll/script");
    const { createCameraPath, projectPoint, setStageAspect } = await import("./camera-path");
    const { sinkDepth, SINK_DEPTH_STACKED } = await import("./apply-plan");
    expect(sinkDepth(true)).toBe(SINK_DEPTH_STACKED);
    expect(sinkDepth(false)).toBe(SINK_DEPTH);
    expect(SINK_DEPTH_STACKED).toBeGreaterThan(SINK_DEPTH);

    const astronomer = plateEntry("stars/astronomer");
    const platform = plateEntry("stars/platform");
    const p = APPLY.sink[1];
    // The highest points of the figure (his raised hand) and of the platform, after the sink.
    const top = astronomer.position[1] + astronomer.height + figureOffset(p, SINK_DEPTH_STACKED);
    const platformTop = platform.position[1] + platform.anchor[1] * platform.height + figureOffset(p, SINK_DEPTH_STACKED);
    for (const [width, height] of [
      [390, 844],
      [360, 780],
      [430, 932],
      [700, 1000],
    ]) {
      setStageAspect(width / height);
      const path = createCameraPath(CAMERA);
      const pose = path.seek(p);
      expect(projectPoint(pose, [astronomer.position[0], top, -astronomer.depth], width, height).y).toBeGreaterThan(height);
      expect(projectPoint(pose, [platform.position[0], platformTop, -platform.depth], width, height).y).toBeGreaterThan(height);
      path.kill();
    }
    setStageAspect(0);
  });
});
