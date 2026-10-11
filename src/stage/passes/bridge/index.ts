// The bridge pass: claims the `bridge` segment (p 0.04-0.07). The 121-frame reel is scrubbed by
// local progress through the texture manager's aim()/near(); the static wave hands the hero film to
// the reel over the first part of the segment, and the reel's dolly eases from the hero's 5% push
// to a plain cover fit once the film is gone, so the reel ends framed like the Model's stills.
import { bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { crestAt } from "../static";
import { HERO_PUSH_END, setHeroUniforms } from "../hero";
import { BRIDGE_FRAG } from "./frag";

/** The wave runs over this stretch of the segment's local progress; the film is gone after it. */
export const SWEEP_FROM = 0.02;
export const SWEEP_TO = 0.58;
/** The reel's dolly eases to 1 over this stretch, after the film has left the frame. */
const DOLLY_FROM = 0.6;
const DOLLY_TO = 1.0;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export const bridgePass: PassDef = {
  id: "bridge",
  segments: ["bridge"],
  frag: BRIDGE_FRAG,
  textures: [
    { uniform: "uHero", asset: "hero" },
    { uniform: "uReel", asset: "bridge" },
  ],
  uniforms(ctx, u, textures) {
    // The film is held where the hero ended (push 5%, clouds at the end of their drift).
    setHeroUniforms(ctx, u, HERO_PUSH_END, 1);
    const reel = textures.frames("bridge");
    const frame = reel.current >= 0 ? reel.current : ctx.t * (reel.count - 1);
    const pan = bridgePanAt(frame);
    u.set2f("uReelPan", pan.x, pan.y);
    u.set1f("uReelS", 1 + HERO_PUSH_END * (1 - smooth(DOLLY_FROM, DOLLY_TO, ctx.t)));
    u.set1f("uCutC", crestAt((ctx.t - SWEEP_FROM) / (SWEEP_TO - SWEEP_FROM)));
  },
};
