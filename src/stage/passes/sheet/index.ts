// The sheet pass: the bare paper the push lands on (docs/STORY.md row 3 · The Terms), built in the
// pixels by passes/paper.ts: pulp, laid fibre, tooth, a few inclusions and the slow raking light.
// The parchment pass ends on exactly this frame (paperSheet at the frame's own CSS px), so the cut at
// p 0.40 is invisible; the only motion at rest is the light (and the kick), stopped under reduced
// motion.
//
// It claims `sheet` and, until the drawing and its panel are drawn on this paper (phase 9: they
// multiply the drawing into paperSheet() and take those two segments from this pass), the
// `drawing` and `panel` segments too, so everything on paper after the push is paper.
import type { PassDef } from "../../gl/passes";
import { PAPER_GLSL } from "../paper";

const SHEET_FRAG = /* glsl */ `
${PAPER_GLSL}

void main() {
  float tm = uTime * (1.0 - uStill);
  vec2 uv = screenUV();
  vec2 pc = uv * uRes / uDpr;                 // CSS px, the same sheet the push lands on
  gl_FragColor = vec4(clamp(paperSheet(pc, uv, tm), 0.0, 1.0), 1.0);
}
`;

export const sheetPass: PassDef = {
  id: "sheet",
  segments: ["sheet", "drawing", "panel"],
  frag: SHEET_FRAG,
};
