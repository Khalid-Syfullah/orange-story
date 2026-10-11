// The Model pass: claims the `model` segment (p 0.07-0.19), three beats on a pale ground scrubbed
// by scroll. The pictures come from art.ts (`graft`, `grove`, `share` and its `last` keyframe),
// each with its own pan; the cuts and their timing are in timeline.ts.
//
// `share.last` is the texture manager's `shareLast`: the model ends held on it, and The Split
// (phase 6) opens on the same texture with the same framing (`art.share.lastFraming`).
import { art, bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { heroFraming } from "../hero/framing";
import { crestAt, CUT_START } from "../static";
import { MODEL_FRAG } from "./frag";
import { beatPan, beatProgress, BEAT_SPAN, cutAt, modelUnits } from "./timeline";

export const modelPass: PassDef = {
  id: "model",
  segments: ["model"],
  frag: MODEL_FRAG,
  textures: [
    // The bridge's last frame, held: the cut from it into the graft starts the segment.
    { uniform: "uReel", asset: "bridge", frame: (_ctx, count) => count - 1, warm: "last" },
    { uniform: "uGraft", asset: "graft" },
    { uniform: "uGrove", asset: "grove" },
    { uniform: "uShare", asset: "share" },
    { uniform: "uShareLast", asset: "share", variant: "last" },
  ],
  uniforms(ctx, u, textures) {
    const hero = heroFraming(ctx.css);
    u.set2f("uPan", hero.pan.x, hero.pan.y);
    u.set1f("uZoom", hero.zoom);
    const reel = textures.frames("bridge");
    const pan = bridgePanAt(reel.current >= 0 ? reel.current : reel.count - 1);
    u.set2f("uReelPan", pan.x, pan.y);

    const x = modelUnits(ctx.p);
    const graft = beatPan(art.graft.framing.pan, art.graft.drift, beatProgress(x, BEAT_SPAN.graft));
    const grove = beatPan(art.grove.framing.pan, art.grove.drift, beatProgress(x, BEAT_SPAN.grove));
    u.set3f("uF1", graft.x, graft.y, art.graft.framing.zoom);
    u.set3f("uF2", grove.x, grove.y, art.grove.framing.zoom);
    u.set3f("uF3", art.share.framing.pan.x, art.share.framing.pan.y, art.share.framing.zoom);
    u.set3f("uF4", art.share.lastFraming.pan.x, art.share.lastFraming.pan.y, art.share.lastFraming.zoom);

    const cut = cutAt(x);
    u.set1f("uImgA", cut.a);
    u.set1f("uImgB", cut.b);
    u.set1f("uCutC", cut.a === cut.b ? CUT_START : crestAt(cut.s));
  },
};
