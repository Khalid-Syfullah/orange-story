// The hero pass: claims the `hero` segment. The shader is in frag.ts; the print-in and the ring
// (the only time-driven events) are in events.ts; the framing in framing.ts. The bridge pass draws
// the same film, so the uniforms the film needs are set by `setHeroUniforms`, shared by both.
import { narrowFrame } from "../../band";
import { art } from "@/content/art";
import type { FrameCtx } from "../../frame";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import { HERO_FRAG } from "./frag";
import { stepHero } from "./events";
import { heroFraming, phoneWeight } from "./framing";
import { heroCam, heroCamMax, heroPose, HERO_END_POSE, HERO_PUSH_END, heroPush, type HeroPose } from "./timeline";

export { HERO_END_POSE, HERO_PUSH_END, heroPose, heroPush };

const hero = art.hero;

/**
 * Every uniform the hero film needs. The pose is the camera: the dolly about the orange (`push`), how
 * far the clouds' scroll drift has run (`heroT`), the orbit's progress and speed and how much of the
 * scroll's speed reaches the film. The hero passes its local t's pose, the bridge passes the pose the
 * hero ended on, so the film does not change at the segment boundary.
 */
export function setHeroUniforms(ctx: FrameCtx, u: UniformSetter, pose: HeroPose): void {
  const framing = heroFraming(ctx.css);
  const cam = heroCam(pose.orbit);
  const camMax = heroCamMax(ctx.css, pose.push);
  u.set2f("uHeroCam", cam.x, cam.y);
  u.set2f("uHeroCamMax", camMax.x, camMax.y);
  u.set1f("uHeroRate", pose.rate);
  u.set1f("uVelGate", pose.velGate);
  const events = stepHero(ctx);
  u.set2f("uPan", framing.pan.x, framing.pan.y);
  u.set1f("uZoom", framing.zoom);
  u.set2f("uAGlint", hero.anchors.glint.x, hero.anchors.glint.y);
  u.set2f("uASpout", hero.anchors.spout.x, hero.anchors.spout.y);
  u.set2f("uAPourEnd", hero.anchors.pourEnd.x, hero.anchors.pourEnd.y);
  u.set2f("uAOrange", hero.anchors.orange.x, hero.anchors.orange.y);
  u.set1f("uPush", pose.push);
  u.set1f("uHeroT", pose.heroT);
  u.set1f("uIntro", events.intro);
  u.set1f("uRingAge", events.ringAge);
  u.set1f("uPhone", phoneWeight(ctx.css));
  u.set1f("uCloud3", narrowFrame(ctx.css) ? 0 : 1);
}

export const heroPass: PassDef = {
  id: "hero",
  segments: ["hero"],
  frag: HERO_FRAG,
  textures: [{ uniform: "uHero", asset: "hero" }],
  uniforms(ctx, u) {
    setHeroUniforms(ctx, u, heroPose(ctx.t));
  },
};
