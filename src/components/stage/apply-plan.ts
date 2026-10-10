import { ease, remap } from "@/lib/progress";
import { APPLY } from "@/scroll/script";

/**
 * Scene 13, the application, as pure functions of progress (no React, no three). The constellation
 * stays as it grew; the astronomer and his marble platform step down the sky so the application
 * text at the top left (and the form at the right) have clear air. Timings live in `APPLY`
 * (`src/scroll/script.ts`). The finale takes over from the lowered position and sinks them away.
 */

/** How far (world units) the astronomer and his platform stand lower in the application scene. */
export const SINK_DEPTH = 2.3;

/** Vertical offset of the astronomer and his platform at progress p: 0 before the sink, `-SINK_DEPTH` after. */
export function figureOffset(p: number): number {
  return -SINK_DEPTH * ease(remap(p, APPLY.sink[0], APPLY.sink[1]));
}
