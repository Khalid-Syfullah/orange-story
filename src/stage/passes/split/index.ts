// The Split pass: claims the `split` segment (p 0.19-0.22), the cut from The Model into The Work
// specified in docs/TRANSITIONS.md. A is the texture manager's `shareLast` (the model's last frame)
// through `art.share.lastFraming`; B is the `plate` fitted to the frame's width with its top at the
// top of the frame. The seam point is `uncover(art.share.anchors.seam)`, computed in the shader with
// the picture's own breath and parallax so the cut stays on the fruit.
//
// The end state (t = 1: the plate at scale 1 about the drifted seam point, no lag, no pith) is what
// The Work (phase 7) continues from; `splitOrigin` and `splitPlateScale` give it those numbers.
import { art, type Point } from "@/content/art";
import { sizeFromAspect, uncover, type Size } from "../../framing";
import type { PassDef } from "../../gl/passes";
import { SPLIT_FRAG } from "./frag";
import { SPLIT_TUNE_KEYS, splitTune, tuneUniform } from "./tune";

const share = art.share;

export const splitPass: PassDef = {
  id: "split",
  segments: ["split"],
  frag: SPLIT_FRAG,
  textures: [
    { uniform: "uShareLast", asset: "share", variant: "last" },
    { uniform: "uPlate", asset: "plate" },
  ],
  uniforms(_ctx, u) {
    const f = share.lastFraming;
    u.set3f("uFrameA", f.pan.x, f.pan.y, f.zoom);
    u.set2f("uSeam", share.anchors.seam.x, share.anchors.seam.y);
    // Every number of the table, as uniforms (the registry skips values that did not change).
    const tune = splitTune();
    for (const key of SPLIT_TUNE_KEYS) u.set1f(tuneUniform(key), tune[key]);
  },
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** The push of the halves and the drift of the seam point at local t: accelerating (rule 4). */
export function splitPush(t: number): number {
  const { pushLin } = splitTune();
  const k = clamp01(t);
  return k * (pushLin + (1 - pushLin) * k * k);
}

/** The plate's scale about the seam point at local t: 1.18, easing to the plain width fit by t = 1. */
export function splitPlateScale(t: number): number {
  const { plateScale, scaleFrom } = splitTune();
  return plateScale + (1 - plateScale) * smooth(scaleFrom, 1, t);
}

/**
 * The seam point on screen (uv, y down, breath and parallax aside) at local t, with its drift: the
 * centre both pictures are pushed in about, and the point the plate is still scaled about at t = 1.
 */
export function splitOrigin(css: Size, t: number): Point {
  const { driftX, driftY } = splitTune();
  const o = uncover(share.anchors.seam, css, sizeFromAspect(share.aspect), share.lastFraming);
  const push = splitPush(t);
  return { x: o.x + driftX * push, y: o.y + driftY * push };
}
