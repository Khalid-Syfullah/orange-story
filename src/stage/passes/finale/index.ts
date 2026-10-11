// The finale pass: claims `finale` (p 0.96-1.00). The finale loop takes the frame on the rise's own
// last frame, through a halftone print-in that starts in the open sky (a colour already on screen),
// the pour runs from the can's spout to the roots, the wordmark prints in letter by letter from a
// canvas texture, and from then on the loop plays at rest to p = 1. Timing is in ./timeline.ts, the
// shader in ./frag.ts, the canvas in ./wordmark.ts; the subtitle and the footer are DOM
// (FinaleCopy.tsx).
import { phoned } from "../../framing";
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { riseFront, riseCloud, scrimRise } from "../application/timeline";
import { setAppUniforms } from "../application";
import { FINALE_FRAG } from "./frag";
import { coverAt, FINALE_TUNE, finaleHudLines, pourGain, wordAt } from "./timeline";
import { wordmark, wordmarkSettled } from "./wordmark";

const fin = art.finale;

/** The texture unit after the pass's three declared textures. */
const WORD_UNIT = 3;
const sapling = art.sapling;

export const finalePass: PassDef = {
  id: "finale",
  segments: ["finale"],
  frag: FINALE_FRAG,
  textures: [
    { uniform: "uFin", asset: "finale" },
    { uniform: "uApp", asset: "application" },
    { uniform: "uSapling", asset: "sapling" },
  ],
  settled: wordmarkSettled,
  uniforms(ctx, u, textures) {
    const t = ctx.t;
    // The rise as it ended, for the frame the loop takes over from.
    setAppUniforms(ctx.css, u, scrimRise(1), 1);
    u.set1f("uFront", riseFront(1));
    u.set1f("uCloudX", riseCloud(1));
    u.set4f("uTree", sapling.rects.tree.x, sapling.rects.tree.y, sapling.rects.tree.w, sapling.rects.tree.h);
    u.set2f("uFoot", sapling.anchors.trunkFoot.x, sapling.anchors.trunkFoot.y);

    const finF = phoned(fin.framing, fin.phonePan);
    u.set2f("uFinPan", finF.pan.x, finF.pan.y);
    u.set1f("uFinZoom", FINALE_TUNE.zoom);
    u.set2f("uASpout", fin.anchors.spout.x, fin.anchors.spout.y);
    u.set2f("uARoots", fin.anchors.roots.x, fin.anchors.roots.y);
    u.set2f("uOrigin", FINALE_TUNE.origin.x, FINALE_TUNE.origin.y);
    u.set1f("uCover", coverAt(t));
    u.set1f("uPourGain", pourGain(t));
    u.set1f("uWordT", wordAt(t));

    const w = wordmark(ctx.css, ctx.dpr);
    const tex = textures.canvas("wordmark");
    if (!tex.ready || tex.version !== w.version) {
      tex.set(w.canvas, w.version);
    }
    tex.bind(WORD_UNIT);
    u.set1i("uWord", WORD_UNIT);
    u.set4f("uWordBox", w.box[0] / ctx.css[0], w.box[1] / ctx.css[1], w.box[2] / ctx.css[0], w.box[3] / ctx.css[1]);
  },
};

/** HUD readout over the finale. */
export function finaleHud(t: number): string[] {
  return finaleHudLines(t);
}
