import { describe, expect, it } from "vitest";

import { SCENES } from "@/scroll/script";

import { channelSpan, MOTION_CHANNELS, SCENE_MOTION } from "./motion-channels";
import { velocityJumps } from "./motion-kit";

/**
 * Walks the whole script: every value every scene drives (`motion-channels.ts`), over its scene and
 * the crossfades either side, must move without a jump in speed (C1). A move that starts at full
 * speed, a kink where two beats meet, a bounce off a floor drawn as a crease: each fails here, with
 * where it is and its speed either side.
 */
describe("natural motion", () => {
  it("drives every scene's figures and things through the motion kit's channels", () => {
    const figureScenes = ["graft", "pluck", "share", "blueprint", "site", "prune", "fall", "finale"] as const;
    for (const id of figureScenes) expect(SCENE_MOTION[id]?.channels.length ?? 0, `${id} has no channels`).toBeGreaterThan(0);
  });

  for (const scene of SCENES) {
    const channels = MOTION_CHANNELS.filter((c) => c.scene === scene.id);
    if (!channels.length) continue;
    it(`never jumps in speed in the ${scene.id} scene (${channels.length} driven values)`, () => {
      const [from, to] = channelSpan(scene.id);
      const problems: string[] = [];
      for (const channel of channels) {
        const jumps = velocityJumps(channel.at, from, to);
        for (const j of jumps.slice(0, 3)) problems.push(`${channel.name}: at ${j.at.toFixed(5)} its speed jumps from ${j.before.toFixed(2)} to ${j.after.toFixed(2)} (per unit of progress)`);
      }
      expect(problems).toEqual([]);
    });
  }

  it("plays backwards exactly: every driven value is a function of progress alone", () => {
    for (const scene of SCENES) {
      const channels = MOTION_CHANNELS.filter((c) => c.scene === scene.id);
      if (!channels.length) continue;
      const [from, to] = channelSpan(scene.id);
      const points = Array.from({ length: 241 }, (_, i) => from + ((to - from) * i) / 240);
      for (const channel of channels) {
        const down = points.map(channel.at);
        const up = [...points].reverse().map(channel.at).reverse();
        expect(up, channel.name).toEqual(down);
      }
    }
  });
});
