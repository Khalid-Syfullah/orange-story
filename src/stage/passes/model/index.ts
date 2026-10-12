// The Model pass: claims the `model` segment (p 0.07-0.19), three beats on a pale ground scrubbed
// by scroll. The pictures come from art.ts (`graft`, `grove`, `share` and its `last` keyframe),
// each with its own pan; the cuts and their timing are in timeline.ts.
//
// `share.last` is the texture manager's `shareLast`: the model ends held on it, and The Split
// (phase 6) opens on the same texture with the same framing (`art.share.lastFraming`).
import { phoned, sizeFromAspect, type Size } from "../../framing";
import { art, bridgePanAt } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { coverRoom, depthTravelMax, swayRoom, velAmount, windAt } from "../../motion";
import { heroFraming } from "../hero/framing";
import { crestAt, CUT_START } from "../static";
import { MODEL_FRAG } from "./frag";
import { leafInstances, lightPools, pushInstances } from "./instances";
import { fruitView, shareMatch } from "./match";
import { SLICE_TUNE_KEYS, sliceDirection, sliceTune, sliceTuneLines, sliceUniform } from "./slice";
import { beatPan, beatProgress, BEAT_SPAN, cutAt, fitDrift, foregroundGain, groveCamera, IMG, MATCH_AT, MODEL_UNITS, pushGain, modelUnits, shareLightGain, SLICE, sliceEase } from "./timeline";

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
    // The drift is fitted to the frame (an ultrawide has no room sideways for all of it).
    const drift = fitDrift(ctx.css, GRAFT_TEX, graftF, art.graft.drift);
    const graft = beatPan(graftF.pan, drift, beatProgress(x, BEAT_SPAN.graft));
    const gc = groveCamera(x);
    // The share's camera: its own pull-back to rest blended with the framing that holds its fruit where the grove's is (match.ts).
    const match = shareMatch(x, ctx.css);
    const sc = match.camera;
    u.set3f("uF1", graft.x, graft.y, art.graft.framing.zoom);
    // The graft's depth layers ride the camera's travel off its framing (the beat's drift), bounded by
    // the room the framing leaves at this viewport (its pan and the drift's widest reach taken out).
    u.set2f("uGraftCam", graft.x - graftF.pan.x, graft.y - graftF.pan.y);
    const room = coverRoom(ctx.css, GRAFT_TEX, art.graft.framing.zoom, {
      x: Math.abs(graftF.pan.x) + Math.abs(drift.x) / 2,
      y: Math.abs(graftF.pan.y) + Math.abs(drift.y) / 2,
    });
    // The leaves' sway takes its share of that room; the layers take the rest.
    const gSway = swayRoom(room, art.graft.sway.cell, art.graft.aspect);
    const camMax = depthTravelMax(art.graft.depth, { x: room.x - gSway.x, y: room.y - gSway.y }, art.graft.aspect);
    u.set2f("uGraftCamMax", camMax.x, camMax.y);
    u.set2f("uGraftSwayRoom", gSway.x, gSway.y);
    u.set3f("uF2", groveF.pan.x + gc.pan.x, groveF.pan.y + gc.pan.y, art.grove.framing.zoom * gc.zoom);
    // The grove's cloudscape is its far layer: the camera's travel (groveCamera's pan) leaves it behind. A
    // layer that moves at most as fast as the camera (rates 0.3 and 1) never travels past what the camera's
    // own move already uses, so the layers need no room of their own, only the fold's limit; the leaves'
    // sway takes its share of the room the framing leaves at this frame (the zoom and the pan as they are now).
    const groveRoom = coverRoom(ctx.css, GROVE_TEX, art.grove.framing.zoom * gc.zoom, {
      x: Math.abs(groveF.pan.x + gc.pan.x),
      y: Math.abs(groveF.pan.y + gc.pan.y),
    });
    const vSway = swayRoom(groveRoom, art.grove.sway.cell, art.grove.aspect);
    const vMax = depthTravelMax(art.grove.depth, { x: 1, y: 1 }, art.grove.aspect);
    u.set2f("uGroveCam", gc.pan.x, gc.pan.y);
    u.set2f("uGroveCamMax", vMax.x, vMax.y);
    u.set2f("uGroveSwayRoom", vSway.x, vSway.y);
    // The wind over the graft and the grove, three samples across each, from the TS twin of the shader's field at the pass clock.
    const tm = ctx.still ? 0 : ctx.time;
    for (const [id, sway, aspect] of [
      ["Graft", art.graft.sway, art.graft.aspect],
      ["Grove", art.grove.sway, art.grove.aspect],
    ] as const) {
      [0.25, 0.5, 0.75].forEach((k, i) => {
        const w = windAt({ x: k * aspect, y: 0.5 }, tm, sway.wind, ctx.still === 1);
        u.set2f(`u${id}Wind${i}`, w.x, w.y);
      });
    }
    // Both share keyframes ride the same camera, so the hands parting does not jump; at the end of
    // the segment it is exactly `lastFraming`, the frame The Split opens on.
    u.set3f("uF3", shareF.pan.x + sc.pan.x, shareF.pan.y + sc.pan.y, shareF.zoom * sc.zoom);
    u.set3f("uF4", lastF.pan.x + sc.pan.x, lastF.pan.y + sc.pan.y, lastF.zoom * sc.zoom);

    // The foreground's own drift is a function of the scroll units; its gain is exactly 0 where the share lands.
    // Gains under 0.4% (a leaf of a tenth of a pixel) are 0: nothing to draw, and the pixels skip it all.
    const q = (g: number) => (g < 0.004 ? 0 : g);
    const asp = ctx.res[0] / ctx.res[1];
    const fgGain = q(foregroundGain(x));
    const lightGain = q(shareLightGain(x));
    const pushOn = q(pushGain(x));
    u.set1f("uFgX", x);
    u.set1f("uFgGain", fgGain);
    u.set1f("uFgLight", lightGain);
    u.set1f("uFgPushOn", pushOn > 0 ? 1 : 0);
    if (fgGain > 0) {
      leafInstances(x, tm, asp, fgGain).forEach((l, i) => {
        u.set4f(`uFgLeaf${i}`, l.x, l.y, l.ang, l.size);
        u.set4f(`uFgLeafSoft${i}`, l.blur, 0, 0, 0);
      });
    }
    if (pushOn > 0) {
      pushInstances(x, asp, pushOn, velAmount(ctx.vel, 30, ctx.still === 1)).forEach((l, i) => {
        u.set4f(`uFgPush${i}`, l.x, l.y, l.ang, l.size);
        u.set4f(`uFgPushDir${i}`, l.dirX, l.dirY, l.len, l.blur);
      });
    }
    if (lightGain > 0) {
      lightPools(tm, asp).forEach((p, i) => u.set4f(`uFgPool${i}`, p.x, p.y, p.r, p.s));
    }

    u.set1f("uShareOffK", match.offScale);

    const cut = cutAt(x);
    u.set1f("uImgA", cut.a);
    u.set1f("uImgB", cut.b);
    u.set1f("uCutC", cut.a === cut.b ? CUT_START : crestAt(cut.s));

    // The match cut's disc (grove -> share): the fruit's place on the grove's side, out to the art.ts radius in fruit radii.
    const matchCutOn = cut.a === IMG.grove && cut.b === IMG.share;
    if (matchCutOn) {
      const fruit = fruitView(art.grove.gilded, ctx.css, GROVE_TEX, match.grove);
      u.set3f("uDisc", fruit.x, fruit.y, art.grove.matchDisc.radius * fruit.r * asp);
    } else {
      u.set3f("uDisc", 0, 0, 0);
    }
    u.set1f("uDiscSoft", art.grove.matchDisc.soft);

    // The slice (share -> keyframe 2): the knife's line, the front's travel along it, how far it has run, every tune entry.
    const slicing = cut.kind === "slice";
    u.set1f("uSliceOn", slicing ? 1 : 0);
    if (slicing) {
      const dir = sliceDirection();
      u.set2f("uKnife", art.share.knife.at.x, art.share.knife.at.y);
      u.set2f("uKnifeDir", dir.x, dir.y);
      u.set2f("uSlice", sliceEase(cut.s), cut.s);
      const tune = sliceTune();
      for (const key of SLICE_TUNE_KEYS) u.set1f(sliceUniform(key), tune[key]);
    }
  },
};

/**
 * The HUD over the model (`?hud`): the segment's scroll unit (p = start + unit / 10000; `?p=` with `?clock=5` holds any
 * point, `?model=<t>` takes t = unit / 1200), the match cut's weight and the share's camera, and from the match cut on the
 * slice's progress and its tune (`?tune=key:value,...` retunes it live, starred entries are overridden).
 */
export function modelHud(p: number, css: Size): string[] {
  const x = modelUnits(p);
  const m = shareMatch(x, css);
  const cut = cutAt(x);
  const lines = [`model unit ${x.toFixed(1)} of ${MODEL_UNITS}  match weight ${m.weight.toFixed(2)}  share zoom ${m.framing.zoom.toFixed(3)}  offScale ${m.offScale.toFixed(3)}`];
  if (x >= MATCH_AT - 40) {
    lines.push(`slice units ${SLICE.from}-${SLICE.to}  ${cut.kind === "slice" ? `s ${cut.s.toFixed(3)}  front ${sliceEase(cut.s).toFixed(3)}` : "not running"}`);
    lines.push("tune (?tune=key:value,...)", ...sliceTuneLines());
  }
  return lines;
}
