// The bridge pass: claims the `bridge` segment (p 0.04-0.07). The 121-frame reel is scrubbed by
// local progress through the texture manager's aim()/near(); the static wave hands the hero film to
// the reel over the first part of the segment, and the reel's dolly eases from the hero's 5% push
// to a plain cover fit once the film is gone, so the reel ends framed like the Model's stills.
import { bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { crestAt } from "../static";
import { HERO_END_POSE, setHeroUniforms } from "../hero";
import { BRIDGE_FRAG } from "./frag";
import { reelCamera, reelDolly, SWEEP_FROM, SWEEP_TO } from "./timeline";

export { SWEEP_FROM, SWEEP_TO };

export const bridgePass: PassDef = {
  id: "bridge",
  segments: ["bridge"],
  frag: BRIDGE_FRAG,
  textures: [
    { uniform: "uHero", asset: "hero" },
    { uniform: "uReel", asset: "bridge" },
  ],
  uniforms(ctx, u, textures) {
    // The film is held where the hero ended (push 5%, clouds at the end of their drift, the orbit's end,
    // no answer to the scroll's speed: only the crest answers it here).
    setHeroUniforms(ctx, u, HERO_END_POSE);
    const reel = textures.frames("bridge");
    const frame = reel.current >= 0 ? reel.current : ctx.t * (reel.count - 1);
    const pan = bridgePanAt(frame);
    u.set2f("uReelPan", pan.x, pan.y);
    u.set1f("uReelS", reelDolly(ctx.t));
    // The handheld camera, the film's orbit relaxing with the dolly, and the lean with the scroll's speed.
    const cam = reelCamera(ctx.css, ctx.t);
    u.set1f("uReelHold", cam.hold);
    u.set3f("uReelHand", cam.swayX, cam.swayY, cam.roll);
    u.set1f("uReelWind", cam.windAmp);
    u.set2f("uReelVel", cam.velEnv, cam.lean);
    u.set1f("uCutC", crestAt((ctx.t - SWEEP_FROM) / (SWEEP_TO - SWEEP_FROM)));
  },
};
