// The Model pass: claims the `model` segment (p 0.07-0.19), three beats on a pale ground scrubbed
// by scroll. The pictures come from art.ts (`graft`, `grove`, `share` and its `last` keyframe),
// each with its own pan; the cuts and their timing are in timeline.ts.
//
// `share.last` is the texture manager's `shareLast`: the model ends held on it, and The Split
// (phase 6) opens on the same texture with the same framing (`art.share.lastFraming`).
import { phoned, sizeFromAspect } from "../../framing";
import { art, bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { coverRoom, depthTravelMax } from "../../motion";
import { heroFraming } from "../hero/framing";
import { crestAt, CUT_START } from "../static";
import { MODEL_FRAG } from "./frag";
import { beatPan, beatProgress, BEAT_SPAN, cutAt, groveCamera, modelUnits, shareCamera } from "./timeline";

const GRAFT_TEX = sizeFromAspect(art.graft.aspect);

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
    const graftF = phoned(art.graft.framing, art.graft.phonePan);
    const groveF = phoned(art.grove.framing, art.grove.phonePan);
    const shareF = phoned(art.share.framing, art.share.phonePan);
    const lastF = phoned(art.share.lastFraming, art.share.phonePan);
    const graft = beatPan(graftF.pan, art.graft.drift, beatProgress(x, BEAT_SPAN.graft));
    const gc = groveCamera(x);
    const sc = shareCamera(x);
    u.set3f("uF1", graft.x, graft.y, art.graft.framing.zoom);
    // The graft's depth layers ride the camera's travel off its framing (the beat's drift), bounded by
    // the room the framing leaves at this viewport (its pan and the drift's widest reach taken out).
    u.set2f("uGraftCam", graft.x - graftF.pan.x, graft.y - graftF.pan.y);
    const room = coverRoom(ctx.css, GRAFT_TEX, art.graft.framing.zoom, {
      x: Math.abs(graftF.pan.x) + Math.abs(art.graft.drift.x) / 2,
      y: Math.abs(graftF.pan.y) + Math.abs(art.graft.drift.y) / 2,
    });
    const camMax = depthTravelMax(art.graft.depth, room, art.graft.aspect);
    u.set2f("uGraftCamMax", camMax.x, camMax.y);
    u.set3f("uF2", groveF.pan.x + gc.pan.x, groveF.pan.y + gc.pan.y, art.grove.framing.zoom * gc.zoom);
    // Both share keyframes ride the same camera, so the hands parting does not jump; at the end of
    // the segment it is exactly `lastFraming`, the frame The Split opens on.
    u.set3f("uF3", shareF.pan.x + sc.pan.x, shareF.pan.y + sc.pan.y, shareF.zoom * sc.zoom);
    u.set3f("uF4", lastF.pan.x + sc.pan.x, lastF.pan.y + sc.pan.y, lastF.zoom * sc.zoom);

    const cut = cutAt(x);
    u.set1f("uImgA", cut.a);
    u.set1f("uImgB", cut.b);
    u.set1f("uCutC", cut.a === cut.b ? CUT_START : crestAt(cut.s));
  },
};
