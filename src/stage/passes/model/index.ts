// The Model pass: claims the `model` segment (p 0.07-0.19), three beats on a pale ground scrubbed
// by scroll. The pictures come from art.ts (`graft`, `grove`, `share` and its `last` keyframe),
// each with its own pan; the cuts and their timing are in timeline.ts.
//
// `share.last` is the texture manager's `shareLast`: the model ends held on it, and The Split
// (phase 6) opens on the same texture with the same framing (`art.share.lastFraming`).
import { phoned, sizeFromAspect } from "../../framing";
import { art, bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { coverRoom, depthTravelMax, swayRoom } from "../../motion";
import { heroFraming } from "../hero/framing";
import { crestAt, CUT_START } from "../static";
import { MODEL_FRAG } from "./frag";
import { beatPan, beatProgress, BEAT_SPAN, cutAt, foregroundGain, groveCamera, modelUnits, shareCamera, shareLightGain } from "./timeline";

const GRAFT_TEX = sizeFromAspect(art.graft.aspect);
const GROVE_TEX = sizeFromAspect(art.grove.aspect);

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
    // The leaves' sway takes its share of that room; the layers take the rest.
    const gSway = swayRoom(room, art.graft.sway.cell, art.graft.aspect);
    const camMax = depthTravelMax(art.graft.depth, { x: room.x - gSway.x, y: room.y - gSway.y }, art.graft.aspect);
    u.set2f("uGraftCamMax", camMax.x, camMax.y);
    u.set2f("uGraftSwayRoom", gSway.x, gSway.y);
    u.set3f("uF2", groveF.pan.x + gc.pan.x, groveF.pan.y + gc.pan.y, art.grove.framing.zoom * gc.zoom);
    // The grove's cloudscape is its far layer: the camera's travel (groveCamera's pan) leaves it behind. The
    // room is the one the framing leaves at the beat's smallest zoom, less the camera's widest reach.
    const gcFrom = art.grove.camera.pan.from;
    const gcTo = art.grove.camera.pan.to;
    const groveRoom = coverRoom(ctx.css, GROVE_TEX, art.grove.framing.zoom * art.grove.camera.zoom.from, {
      x: Math.abs(groveF.pan.x) + Math.max(Math.abs(gcFrom.x), Math.abs(gcTo.x)),
      y: Math.abs(groveF.pan.y) + Math.max(Math.abs(gcFrom.y), Math.abs(gcTo.y)),
    });
    const vSway = swayRoom(groveRoom, art.grove.sway.cell, art.grove.aspect);
    const vMax = depthTravelMax(art.grove.depth, { x: groveRoom.x - vSway.x, y: groveRoom.y - vSway.y }, art.grove.aspect);
    u.set2f("uGroveCam", gc.pan.x, gc.pan.y);
    u.set2f("uGroveCamMax", vMax.x, vMax.y);
    u.set2f("uGroveSwayRoom", vSway.x, vSway.y);
    // The foreground's own drift is a function of the scroll units; its gain is exactly 0 where the share lands.
    u.set1f("uFgX", x);
    u.set1f("uFgGain", foregroundGain(x));
    u.set1f("uFgLight", shareLightGain(x));
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
