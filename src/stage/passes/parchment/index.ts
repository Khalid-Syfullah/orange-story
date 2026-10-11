// The parchment pass: claims the `parchment` segment (p 0.37-0.40), the push into the parchment
// the woman holds while the frame takes the paper's colour (docs/TRANSITIONS.md row Work -> sheet).
// It starts on The Work's last frame (the same plate mapping at t = 1) and lands on the sheet that
// passes/sheet draws: at t = 1 every pixel is paperSheet() at the frame's own CSS px. Geometry and
// timing are in ./timeline.ts (the chrome and the leaving card read the same), the picture in ./frag.ts.
import { art } from "@/content/art";
import type { PassDef } from "../../gl/passes";
import { arrivalOrigin, creep, yTop } from "../work/timeline";
import { PARCHMENT_FRAG } from "./frag";
import { flat, paperAt, pushAt, shadow, soft } from "./timeline";

const rect = art.plate.rects.parchment;

// The previous frame's magnification, for this frame's radial smear (motion blur, zero at rest).
let lastFrame = -2;
let lastS = 1;

export const parchmentPass: PassDef = {
  id: "parchment",
  segments: ["parchment"],
  frag: PARCHMENT_FRAG,
  textures: [{ uniform: "uPlate", asset: "plate" }],
  uniforms(ctx, u) {
    const css = ctx.css;
    const t = ctx.t;
    // The Work's last frame.
    const o = arrivalOrigin(css);
    u.set2f("uOrigin", o.x, o.y);
    u.set1f("uYTop", yTop(1, css));
    u.set1f("uCreep", creep(1));
    // The push, and the sheet riding it to the landing.
    const P = pushAt(t, css);
    const S = paperAt(t, css);
    u.set2f("uPushO", P.o.x, P.o.y);
    u.set1f("uPushW", P.w);
    u.set2f("uPaperO", S.o.x, S.o.y);
    u.set1f("uPaperL", S.l);
    u.set4f("uParch", rect.x, rect.y, rect.w, rect.h);
    // The colour, the shadow and the lens.
    u.set1f("uFlat", flat(t));
    u.set1f("uShadow", shadow(t));
    u.set1f("uSoft", soft(t));
    // This frame's push as a log change of the magnification (signed: + pushing in).
    const smear = ctx.frame === lastFrame + 1 && !ctx.reduced ? Math.log(P.s / lastS) : 0;
    u.set1f("uSmear", Number.isFinite(smear) ? smear : 0);
    lastFrame = ctx.frame;
    lastS = P.s;
  },
};
