// The close and the coda passes. The close claims `close` (p 0.50-0.53): the terms page at rest
// (passes/terms setTermsUniforms() at PANEL_END, with the same two textures) burns from the bottom
// left into the coda's first frame (./burn.ts). The coda claims `coda` (p 0.53-0.58): the `coda`
// sequence scrubbed by local progress with the halo once the orange hangs alone (./frag.ts). Timing
// and geometry are in ./timeline.ts (CodaCopy.tsx, TermsCopy.tsx and the HUD read the same).
//
// The match cut (passes/canopy) continues from the coda's last frame: the orange at codaOrange()
// with the halo at haloAt(), both from ./timeline.ts, drawn with setCodaUniforms() below.
import { phoned } from "../../framing";
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import { setTermsUniforms } from "../terms";
import { PANEL_END } from "../terms/timeline";
import { BURN_FRAG } from "./burn";
import { CODA_FRAG } from "./frag";
import { burnR, codaAnchor, codaHudLines, codaProgress, fastBehindAt, haloGrowth, lagEnvelope } from "./timeline";

/** For the HUD: the coda frame on screen. */
const state = { shown: -1, count: 1 };

const anchor = codaAnchor();

/** The coda picture's uniforms: its framing, the orange's anchor and the halo's growth. */
export function setCodaUniforms(u: UniformSetter, halo: number): void {
  const framing = phoned(art.coda.framing, art.coda.phonePan);
  u.set2f("uCodaPan", framing.pan.x, framing.pan.y);
  u.set1f("uCodaZoom", framing.zoom);
  u.set2f("uAnchor", anchor.x, anchor.y);
  u.set1f("uOrangeR", anchor.r);
  u.set1f("uHaloG", halo);
}

export const closePass: PassDef = {
  id: "close",
  segments: ["close"],
  frag: BURN_FRAG,
  textures: [
    // The panel at rest shows the orbit's last frame (the plan still takes over once it is loaded).
    { uniform: "uDraw", asset: "drawing", frame: (_ctx, count) => count - 1, warm: "last" },
    { uniform: "uPlan", asset: "plan" },
    // The blue under the burn is the coda's first frame.
    { uniform: "uCoda", asset: "coda", frame: () => 0, warm: "first" },
  ],
  uniforms(ctx, u, textures) {
    setTermsUniforms(ctx, u, textures, PANEL_END);
    setCodaUniforms(u, 0);
    u.set1f("uBurnR", burnR(ctx.t, ctx.css));
    u.set1f("uLagK", lagEnvelope(ctx.t));
    u.set1f("uFastBehind", fastBehindAt(ctx.t));
    const seq = textures.frames("coda");
    state.shown = seq.current;
    state.count = seq.count;
  },
};

export const codaPass: PassDef = {
  id: "coda",
  segments: ["coda"],
  frag: CODA_FRAG,
  textures: [
    // Scrubbed by local progress (ramping in, settling on the last frame); near() takes the nearest
    // decoded frame and the decode runs ahead both ways, so scrolling back plays it back.
    { uniform: "uCoda", asset: "coda", frame: (ctx, count) => codaProgress(ctx.t) * (count - 1) },
  ],
  uniforms(ctx, u, textures) {
    setCodaUniforms(u, haloGrowth(ctx.t));
    const seq = textures.frames("coda");
    state.shown = seq.current;
    state.count = seq.count;
  },
};

/** HUD readout over the close and the coda. */
export function codaHud(p: number, css: readonly [number, number]): string[] {
  return codaHudLines(p, css, state.shown, state.count);
}
