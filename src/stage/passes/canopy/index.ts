// The canopy passes. The match cut claims `matchcut` (p 0.58-0.59): the coda's last frame (the
// picked orange hanging in blue with its halo) and the canopy loop, the orange thrown onto the
// canopy's nearest orange while the halo opens outward as the ring that brings the canopy in
// (./frag.ts MATCH_FRAG). The chapter claims `questions` (p 0.59-0.76): the canopy loop with the
// halftone cloud drifting across the sky gap, its camera tilting up through the branches
// (./frag.ts QUESTIONS_FRAG). Timing and geometry are in ./timeline.ts, which the DOM layer
// (QuestionsCopy.tsx) and the HUD read too; the title, the cards and the constellation are DOM.
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import type { UniformSetter } from "../../gl/program";
import { setCodaUniforms } from "../coda";
import { MATCH_FRAG, QUESTIONS_FRAG } from "./frag";
import {
  biteAt,
  canopyFraming,
  canopyHudLines,
  canopySwayRoom,
  crestAt,
  discAt,
  dollyAt,
  haloGainAt,
  orangeTravel,
  revealAt,
  ringEnd,
  ringProgress,
  settleAt,
} from "./timeline";

const near = art.canopy.anchors.nearestOrange;
const nearR = art.canopy.radii.nearestOrange;

/** The canopy's framing, the nearest orange's anchor and the room its leaves sway in, for both passes. */
function setCanopyUniforms(p: number, css: readonly [number, number], u: UniformSetter): void {
  const framing = canopyFraming(p);
  u.set2f("uCanPan", framing.pan.x, framing.pan.y);
  u.set1f("uCanZoom", framing.zoom);
  u.set2f("uNear", near.x, near.y);
  u.set1f("uNearR", nearR);
  const room = canopySwayRoom(css);
  u.set2f("uCanRoom", room.x, room.y);
}

export const matchcutPass: PassDef = {
  id: "matchcut",
  segments: ["matchcut"],
  frag: MATCH_FRAG,
  textures: [
    // The coda's last frame: the match cut starts from exactly the coda pass's last frame.
    { uniform: "uCoda", asset: "coda", frame: (_ctx, count) => count - 1, warm: "last" },
    { uniform: "uCanopy", asset: "canopy" },
  ],
  uniforms(ctx, u) {
    const t = ctx.t;
    setCanopyUniforms(ctx.p, ctx.css, u);
    setCodaUniforms(u, haloGainAt(t));
    u.set1f("uMove", orangeTravel(t));
    u.set1f("uRingP", ringProgress(t));
    u.set1f("uRingEnd", ringEnd(ctx.css));
    u.set1f("uBite", biteAt(t));
    u.set1f("uReveal", revealAt(t));
    u.set1f("uDisc", discAt(t));
    u.set1f("uCrest", crestAt(t));
    u.set1f("uSettle", settleAt(t));
    u.set1f("uDolly", dollyAt(t));
  },
};

export const questionsPass: PassDef = {
  id: "questions",
  segments: ["questions"],
  frag: QUESTIONS_FRAG,
  textures: [{ uniform: "uCanopy", asset: "canopy" }],
  uniforms(ctx, u) {
    setCanopyUniforms(ctx.p, ctx.css, u);
  },
};

/** HUD readout over the match cut and the chapter. */
export function canopyHud(p: number, css: readonly [number, number]): string[] {
  return canopyHudLines(p, css);
}
