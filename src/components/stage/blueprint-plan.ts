import { clamp01, ease, remap } from "@/lib/progress";
import { BLUEPRINT } from "@/scroll/script";

/**
 * Scene 7, the blueprint, as pure functions (no React, no three). Timings live in `BLUEPRINT`
 * (`src/scroll/script.ts`); places come from the art manifest.
 *
 * The drawing is four fold panels side by side. Folded, each is a thin sliver and the four sit as a
 * packet in the architect's hands; the packet is brought forward, then the panels open one after
 * another, each hinged on the edge of the one before, while the whole sheet stays centered.
 * Everything is a function of progress alone, so it plays backwards exactly.
 */

export const PANELS = 4;
/** World width of one open panel (the plates are 512x768 at 0.75 high). */
export const PANEL_WIDTH = 0.5;
/** Width of a folded panel, as a share of the open width. */
export const FOLDED = 0.1;
/**
 * Where the packet is held, relative to the open plan's place: in the architect's hands (the
 * `blueprint/architect` placeholder holds them in front of his chest; the packet's lower half sits in
 * them). Measured on the scaffold shot (the blueprint's first camera key).
 */
export const HELD: readonly [number, number] = [1.25, -0.28];

/** How open panel i (0 to 3) is at progress p: FOLDED when shut, 1 when flat. */
export function panelOpen(i: number, p: number): number {
  const [a, b] = BLUEPRINT.panels;
  const slice = (b - a) / PANELS;
  const t = ease(remap(p, a + slice * i, a + slice * (i + 1)));
  return FOLDED + (1 - FOLDED) * t;
}

/** Offset of the whole plan from its open place: from the architect's hands to the center. */
export function planOffset(p: number): { x: number; y: number } {
  const t = 1 - ease(remap(p, BLUEPRINT.bring[0], BLUEPRINT.bring[1]));
  return { x: HELD[0] * t, y: HELD[1] * t };
}

export interface PanelPose {
  /** World x offset from the manifest place. */
  x: number;
  /** World y offset from the manifest place (the packet is held low, in the architect's hands). */
  y: number;
  /** Horizontal scale, the panel opening. */
  scaleX: number;
  /** How far toward shade, 0 (lit, flat) to 1: shut panels are darker, alternate panels slightly. */
  shade: number;
}

/** Pose of panel i at progress p: hinged to its neighbour, the sheet centered on its open place. */
export function panelAt(i: number, p: number): PanelPose {
  // Sum the panels' open widths, and the ones before panel i (plain loops: this runs every frame).
  let total = 0;
  let before = 0;
  for (let k = 0; k < PANELS; k++) {
    const w = panelOpen(k, p);
    total += w;
    if (k < i) before += w;
  }
  const width = panelOpen(i, p);
  const left = -(total * PANEL_WIDTH) / 2 + before * PANEL_WIDTH;
  const center = left + (width * PANEL_WIDTH) / 2;
  const openCenter = (i - (PANELS - 1) / 2) * PANEL_WIDTH;
  const { x, y } = planOffset(p);
  const shade = clamp01((1 - width) * 0.5 + (i % 2 ? 0.07 : 0));
  return { x: center - openCenter + x, y, scaleX: width, shade };
}

/** The builder's small to-and-fro while he works, in radians. */
export function builderSwing(p: number): number {
  const t = remap(p, BLUEPRINT.work[0], BLUEPRINT.work[1]);
  return Math.sin(t * Math.PI * 12) * 0.04;
}

/** The architect's slight lean as he opens the drawing, in radians. */
export function architectLean(p: number): number {
  return ease(remap(p, BLUEPRINT.bring[0], BLUEPRINT.panels[1])) * 0.03;
}
