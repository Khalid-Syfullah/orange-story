// The sheet pass: the bare paper the push lands on (docs/STORY.md row 3 · The Terms), built in the
// pixels by passes/paper.ts: pulp, laid fibre, tooth, a few inclusions and the slow raking light.
// The parchment pass ends on exactly this frame (paperSheet at the frame's own CSS px), so the cut at
// p 0.40 is invisible; the only motion at rest is the light (and the kick), stopped under reduced
// motion.
//
// It claims `sheet`. The drawing and its panel (`drawing`, `panel`) are passes/terms, which draws
// this same paperSheet() with the drawing multiplied into it, so the cut at p 0.42 is invisible too.
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
  segments: ["sheet"],
  frag: SHEET_FRAG,
};
