// The application passes. The moire claims `moire` (p 0.76-0.79): the canopy chapter's last frame
// dissolves through a coarse halftone screen into the application painting (./frag.ts MOIRE_FRAG).
// The application claims `application` (p 0.79-0.90): the painting at rest, the figure pinned left,
// with the scrim under the form. The rise claims `rise` (p 0.90-0.96): the sapling prints in from
// its trunk foot while the halftone cloud crosses behind it (RISE_FRAG). Timing and geometry are in
// ./timeline.ts, which the DOM layer (ApplicationCopy.tsx: the form, the stars, the hairlines) and
// the HUD read too.
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import { canopyFraming } from "../canopy/timeline";
import { APPLICATION_FRAG, MOIRE_FRAG, RISE_FRAG } from "./frag";
import {
  applicationFraming,
  applicationHudLines,
  moireClock,
  moireDolly,
  moireT,
  riseCloud,
  riseFront,
  scrimBox,
  scrimMoire,
  scrimRise,
  screenAt,
} from "./timeline";

const rect = (u: UniformSetter, name: string, r: { x: number; y: number; w: number; h: number }) =>
  u.set4f(name, r.x, r.y, r.w, r.h);

/** The application painting's framing and the scrim box, for all three passes. */
function setAppUniforms(css: readonly [number, number], u: UniformSetter, scrim: number): void {
  const framing = applicationFraming(css);
  u.set2f("uAppPan", framing.pan.x, framing.pan.y);
  u.set1f("uAppZoom", framing.zoom);
  const box = scrimBox(css);
  u.set4f("uScrimBox", box[0], box[1], box[2], box[3]);
  u.set1f("uScrim", scrim);
}

export const moirePass: PassDef = {
  id: "moire",
  segments: ["moire"],
  frag: MOIRE_FRAG,
  textures: [
    { uniform: "uCanopy", asset: "canopy" },
    { uniform: "uApp", asset: "application" },
  ],
  uniforms(ctx, u) {
    const t = moireT(ctx.p);
    // The canopy as the chapter left it (its framing is clamped at the chapter's end).
    const canopy = canopyFraming(ctx.p);
    u.set2f("uCanPan", canopy.pan.x, canopy.pan.y);
    u.set1f("uCanZoom", canopy.zoom);
    setAppUniforms(ctx.css, u, scrimMoire(t));
    u.set1f("uClock", moireClock(t));
    u.set1f("uScreen", screenAt(t));
    u.set1f("uDolly", moireDolly(t));
    rect(u, "uFigure", art.application.rects.figure);
    rect(u, "uSteps", art.application.rects.steps);
  },
};

export const applicationPass: PassDef = {
  id: "application",
  segments: ["application"],
  frag: APPLICATION_FRAG,
  textures: [{ uniform: "uApp", asset: "application" }],
  uniforms(ctx, u) {
    setAppUniforms(ctx.css, u, 1);
  },
};

export const risePass: PassDef = {
  id: "rise",
  segments: ["rise"],
  frag: RISE_FRAG,
  textures: [
    { uniform: "uApp", asset: "application" },
    { uniform: "uSapling", asset: "sapling" },
  ],
  uniforms(ctx, u) {
    const t = ctx.t;
    setAppUniforms(ctx.css, u, scrimRise(t));
    u.set1f("uFront", riseFront(t));
    u.set1f("uCloudX", riseCloud(t));
    rect(u, "uTree", art.sapling.rects.tree);
    u.set2f("uFoot", art.sapling.anchors.trunkFoot.x, art.sapling.anchors.trunkFoot.y);
  },
};

/** HUD readout over the moire, the application and the rise. */
export function applicationHud(p: number, css: readonly [number, number]): string[] {
  return applicationHudLines(p, css);
}
