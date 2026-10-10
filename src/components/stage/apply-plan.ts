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

/**
 * The same on a stacked (phone) screen. The camera shows a much taller picture there (`fitFov`) and
 * the application fills the screen from top to bottom (the text above, the form below), so there is
 * no clear air to step down into: he sinks right out of the bottom of the frame instead, as he does
 * in the finale on a wide screen.
 */
export const SINK_DEPTH_STACKED = 9.6;

/** Vertical offset of the astronomer and his platform at progress p: 0 before the sink, `-depth` after. */
export function figureOffset(p: number, depth: number = SINK_DEPTH): number {
  return -depth * ease(remap(p, APPLY.sink[0], APPLY.sink[1]));
}

/** How far the astronomer sinks in the application scene on a layout. */
export const sinkDepth = (stacked: boolean): number => (stacked ? SINK_DEPTH_STACKED : SINK_DEPTH);
