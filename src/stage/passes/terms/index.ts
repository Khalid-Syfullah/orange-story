// The terms pass: claims the `drawing` (p 0.42-0.48) and `panel` (p 0.48-0.50) segments from the
// sheet. The drawing soaks into the sheet from the middle holding the whole frame, orbits from eye
// level to the plan, and its window draws back to a brushed-edge panel in the left margin beside the
// terms copy, while a small gilded orange prints in and turns in the right margin. Timing and
// geometry are in ./timeline.ts (TermsCopy.tsx and the HUD read the same), the picture in ./frag.ts.
//
// The first frame of `drawing` is the sheet pass's frame exactly (paperSheet at the frame's own CSS
// px with no ink: the soak's T starts where no pixel is covered). The panel segment is the rest
// state; the close (phase 10) can draw it with TERMS_GLSL's termsPage() and setTermsUniforms() at
// PANEL_END, declaring the same two textures.
import type { FrameCtx } from "../../frame";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import type { TextureManager } from "../../gl/textures";
import { TERMS_FRAG } from "./frag";
import {
  orangeAt,
  orangeInAt,
  orbitAt,
  pictureSide,
  retreatAt,
  sizeEase,
  soakAt,
  TERMS_TUNE,
  termsHudLines,
  windowAt,
} from "./timeline";

// The centre's lag behind the size (an exp follower with a 220 ms time constant: the window shrinks,
// then the panel settles into the margin) and the picture's last mapping, for this frame's smear.
// Both reset when the pass was not drawn on the previous frame, so a jump lands without a glide.
const state = {
  frame: -2,
  kc: 0,
  cx: 0,
  cy: 0,
  side: 1,
  mx: 0,
  my: 0,
  mz: 0,
  /** For the HUD. */
  shown: 0,
  count: 1,
  usePlan: false,
};

/** The drawing's frame for a progress (fractional): the orbit scrubbed by local progress. */
const frameFor = (p: number, count: number) => orbitAt(p) * (count - 1);

/**
 * Set the terms uniforms for the page at progress `p` (the frame's own by default). Passes that draw
 * the panel at rest (the close) call this with `PANEL_END` and declare `uDraw` (drawing) and `uPlan`
 * (plan) like this pass.
 */
export function setTermsUniforms(ctx: FrameCtx, u: UniformSetter, textures: TextureManager, p = ctx.p): void {
  const css = ctx.css;
  const t = retreatAt(p);
  const k = sizeEase(t);

  // The centre follows the size 220 ms behind it (time-based, so it settles at rest whatever the
  // scroll did; under reduced motion it does not lag). A second draw in the same frame (`?repeat`)
  // keeps this frame's state.
  const again = ctx.frame === state.frame;
  const consecutive = ctx.frame === state.frame + 1;
  if (!again) {
    if (!consecutive || ctx.reduced) {
      state.kc = k;
    } else {
      state.kc += (k - state.kc) * (1 - Math.exp(-ctx.dt / TERMS_TUNE.centreLagMs));
      if (Math.abs(k - state.kc) < 1e-5) state.kc = k;
    }
  }
  const W = windowAt(k, state.kc, css);
  const side = pictureSide(t, W, css);

  // This frame's motion of the picture (CSS px and log side), for the smear; zero at rest.
  if (!again) {
    const moving = consecutive && !ctx.reduced;
    state.mx = moving ? W.cx - state.cx : 0;
    state.my = moving ? W.cy - state.cy : 0;
    const mz = moving ? Math.log(side / state.side) : 0;
    state.mz = Number.isFinite(mz) ? mz : 0;
    state.frame = ctx.frame;
    state.cx = W.cx;
    state.cy = W.cy;
    state.side = side;
  }

  u.set1f("uSoak", soakAt(p));
  u.set4f("uWin", W.cx, W.cy, W.hx, W.hy);
  u.set2f("uWinEdge", W.band, W.radius);
  u.set3f("uPic", W.cx, W.cy, side);
  u.set3f("uMove", state.mx, state.my, state.mz);

  // The plan still is the orbit's last frame: once the orbit has arrived it is drawn instead of the
  // sequence (the same picture, loaded once, so the panel never waits on a decode).
  const seq = textures.frames("drawing");
  const plan = textures.still("plan");
  const want = Math.round(frameFor(p, seq.count));
  // Sequences pinned by the e2e hook keep their frame, and the plan still is one of them.
  const usePlan = textures.pinned ? state.usePlan : plan.ready && want >= seq.count - 1;
  u.set1f("uUsePlan", usePlan ? 1 : 0);
  u.set1f("uDrawReady", usePlan || (seq.ready && seq.current >= 0) ? 1 : 0);
  state.shown = usePlan ? seq.count - 1 : seq.current;
  state.count = seq.count;
  state.usePlan = usePlan;

  const o = orangeAt(t, css);
  u.set4f("uFruit", o.x, o.y, o.r, o.on ? 1 : 0);
  u.set1f("uFruitIn", o.on ? orangeInAt(t) : 0);
}

export const termsPass: PassDef = {
  id: "terms",
  segments: ["drawing", "panel"],
  frag: TERMS_FRAG,
  textures: [
    // Scrubbed by the orbit; it decodes ahead both ways, and near() takes the nearest decoded frame,
    // so scrolling back plays the orbit back at the same cadence and never snaps to frame 0.
    { uniform: "uDraw", asset: "drawing", frame: (ctx, count) => frameFor(ctx.p, count) },
    { uniform: "uPlan", asset: "plan" },
  ],
  uniforms(ctx, u, textures) {
    setTermsUniforms(ctx, u, textures);
  },
};

/** HUD readout of the terms (the lagged centre and the frame on screen are this pass's own). */
export function termsHud(p: number, css: readonly [number, number]): string[] {
  return termsHudLines(p, css, state.kc, state.shown, state.count, state.usePlan);
}
