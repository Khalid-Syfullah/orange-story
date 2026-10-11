// The hero pass: claims the `hero` segment. The shader is in frag.ts; the print-in and the ring
// (the only time-driven events) are in events.ts; the framing in framing.ts.
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { HERO_FRAG } from "./frag";
import { stepHero } from "./events";
import { heroFraming, phoneWeight } from "./framing";

const hero = art.hero;

/** Below this viewport aspect (w/h) the third, lower cloud is hidden (tall phones). */
const TALL_ASPECT = 0.8;

export const heroPass: PassDef = {
  id: "hero",
  segments: ["hero"],
  frag: HERO_FRAG,
  textures: [{ uniform: "uHero", asset: "hero" }],
  uniforms(ctx, u) {
    const framing = heroFraming(ctx.css);
    const events = stepHero(ctx);
    u.set2f("uPan", framing.pan.x, framing.pan.y);
    u.set1f("uZoom", framing.zoom);
    u.set2f("uAGlint", hero.anchors.glint.x, hero.anchors.glint.y);
    u.set2f("uASpout", hero.anchors.spout.x, hero.anchors.spout.y);
    u.set2f("uAPourEnd", hero.anchors.pourEnd.x, hero.anchors.pourEnd.y);
    u.set2f("uAOrange", hero.anchors.orange.x, hero.anchors.orange.y);
    // The scroll push-in about the orange: accelerating (rule 4), 5% over the hero segment.
    const t = ctx.t;
    u.set1f("uPush", 0.05 * t * (0.5 + 0.5 * t * t));
    u.set1f("uIntro", events.intro);
    u.set1f("uRingAge", events.ringAge);
    u.set1f("uPhone", phoneWeight(ctx.css));
    u.set1f("uCloud3", ctx.css[0] / ctx.css[1] < TALL_ASPECT ? 0 : 1);
  },
};
