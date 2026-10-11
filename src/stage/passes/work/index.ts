// The Work pass: claims the `work` segment (p 0.22-0.37). The `plate` (9:16) fitted to the frame's
// width and scrolled through its own height, picking up where The Split's plate leaves off; the
// painting prints in as halftone below the sky; the shared clouds drift in the sky band; a scrim
// keeps the copy readable. Geometry and timing are in ./timeline.ts (the cards read the same), the
// picture in ./frag.ts.
import type { PassDef } from "../../gl/passes";
import { WORK_FRAG } from "./frag";
import { arrivalOrigin, arrivalScale, creep, drift, front, scrim, yTop } from "./timeline";

export const workPass: PassDef = {
  id: "work",
  segments: ["work"],
  frag: WORK_FRAG,
  textures: [{ uniform: "uPlate", asset: "plate" }],
  uniforms(ctx, u) {
    const t = ctx.t;
    const css = ctx.css;
    const o = arrivalOrigin(css);
    u.set2f("uOrigin", o.x, o.y);
    u.set1f("uYTop", yTop(t, css));
    u.set1f("uCreep", creep(t));
    u.set1f("uArrive", arrivalScale(t));
    u.set1f("uFront", front(t, css));
    u.set1f("uDrift", drift(t));
    u.set1f("uScrim", scrim(t));
  },
};
