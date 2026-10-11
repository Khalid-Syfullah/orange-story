// The hero pass: claims the `hero` segment. The shader is in frag.ts; the print-in and the ring
// (the only time-driven events) are in events.ts; the framing in framing.ts. The bridge pass draws
// the same film, so the uniforms the film needs are set by `setHeroUniforms`, shared by both.
import { art } from "@/content/art";
import type { FrameCtx } from "../../frame";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import { HERO_FRAG } from "./frag";
import { stepHero } from "./events";
import { heroFraming, phoneWeight } from "./framing";

const hero = art.hero;

/** Below this viewport aspect (w/h) the third, lower cloud is hidden (tall phones). */
const TALL_ASPECT = 0.8;

/** The scroll push-in about the orange that the hero ends on: 5%. The bridge holds it. */
export const HERO_PUSH_END = 0.05;

/** Accelerating push (rule 4): 5% over the hero segment, reached at its local t = 1. */
export function heroPush(t: number): number {
  return HERO_PUSH_END * t * (0.5 + 0.5 * t * t);
}

/**
 * Every uniform the hero film needs. `push` is the dolly about the orange and `heroT` how far the
 * scroll drift of the clouds has run; the hero passes its local t, the bridge passes the values the
 * hero ended on, so the film does not change at the segment boundary.
 */
export function setHeroUniforms(ctx: FrameCtx, u: UniformSetter, push: number, heroT: number): void {
  const framing = heroFraming(ctx.css);
  const events = stepHero(ctx);
  u.set2f("uPan", framing.pan.x, framing.pan.y);
  u.set1f("uZoom", framing.zoom);
  u.set2f("uAGlint", hero.anchors.glint.x, hero.anchors.glint.y);
  u.set2f("uASpout", hero.anchors.spout.x, hero.anchors.spout.y);
  u.set2f("uAPourEnd", hero.anchors.pourEnd.x, hero.anchors.pourEnd.y);
  u.set2f("uAOrange", hero.anchors.orange.x, hero.anchors.orange.y);
  u.set1f("uPush", push);
  u.set1f("uHeroT", heroT);
  u.set1f("uIntro", events.intro);
  u.set1f("uRingAge", events.ringAge);
  u.set1f("uPhone", phoneWeight(ctx.css));
  u.set1f("uCloud3", ctx.css[0] / ctx.css[1] < TALL_ASPECT ? 0 : 1);
}

export const heroPass: PassDef = {
  id: "hero",
  segments: ["hero"],
  frag: HERO_FRAG,
  textures: [{ uniform: "uHero", asset: "hero" }],
  uniforms(ctx, u) {
    setHeroUniforms(ctx, u, heroPush(ctx.t), ctx.t);
  },
};
