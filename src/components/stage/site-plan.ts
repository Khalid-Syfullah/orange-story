import { CAMERA, SITE } from "@/scroll/script";

import { cameraTravel } from "./camera-path";
import { glide, type MotionChannel, type SceneMotion } from "./motion-kit";

/**
 * Scene 8, the building site by the sea, as pure functions (no React, no three). Timings live in
 * `SITE` (`src/scroll/script.ts`); places come from the art manifest. Every value is a function of
 * progress alone, so it plays backwards exactly.
 *
 * - The builders work with their mallets while the camera is still near the ground (`acting.ts`).
 * - As the camera rises, the side-view plates cross-fade into the matching top-down set; the sea and
 *   its sky leave last, so the top-down view has no sky.
 * - The top-down view zooms out (camera pull) and shrinks into the left half of the screen
 *   (`shrinkAt`, a shift of the whole site), while the tiled ground grows into a large field around it
 *   (`tileField`).
 */

/** Where the shrunken site is centered, as a fraction of the half view width left of center: the middle of the left half. */
export const LEFT_HALF_CENTER = 0.5;

/** Side length of the tiled field when it is first uncovered, in world units: just the top-down plate's own size. */
export const FIELD_FROM = 9;
/** Side length of the full field, in world units: far larger than the view at the farthest camera. */
export const FIELD_TO = 64;
/** World size of one tile (the field grows by adding tiles, not by stretching them). */
export const TILE_SIZE = 2;

/** Every fade and growth here starts and ends at rest (the motion kit's `glide`). */
const fade = glide;

/** Opacity of the side-view figures, stage, platform and orange: 1 at ground level, 0 once looking down. */
export function sideOpacity(p: number): number {
  return 1 - fade(p, SITE.sideOut);
}

/** Opacity of the seaside backdrop: it outlasts the figures and is gone before the camera is straight above. */
export function seaOpacity(p: number): number {
  return 1 - fade(p, SITE.seaOut);
}

/** Opacity of the matching top-down set. */
export function topDownOpacity(p: number): number {
  return fade(p, SITE.topDownIn);
}

/**
 * How far the top-down view has shrunk into the left half, 0 to 1: in step with the camera pulling
 * out (the move between its keys at the ends of `SITE.shrink`), so the zoom and the slide read as
 * one move.
 */
const travel = cameraTravel(CAMERA, SITE.shrink[0], SITE.shrink[1]);
/** The camera passes its top-down key moving, so the slide eases in over the first part of the pull (it starts from rest). */
const EASE_IN = 0.3;
export function shrinkAt(p: number): number {
  const [a, b] = SITE.shrink;
  return travel(p) * glide(p, [a, a + EASE_IN * (b - a)]);
}

/** Horizontal shift of the site, in world units, for the half-width of the view at the ground. */
export function siteShift(p: number, halfWidth: number): number {
  return -LEFT_HALF_CENTER * halfWidth * shrinkAt(p);
}

/**
 * On a stacked (phone) screen the top-down view shrinks into the upper half instead, and the milk
 * panel is the lower half. Looking straight down, up on the screen is world -z, so this is the
 * shift of the site along z (negative, toward the top of the screen), for the half-height of the
 * view at the ground.
 */
export function siteShiftStacked(p: number, halfHeight: number): number {
  return -LEFT_HALF_CENTER * halfHeight * shrinkAt(p);
}

/** The tiled ground: its side length (world units) and how many tiles it repeats across and down. */
export function tileField(p: number): { size: number; tiles: number } {
  const size = FIELD_FROM + (FIELD_TO - FIELD_FROM) * fade(p, SITE.tiles);
  return { size, tiles: size / TILE_SIZE };
}

/** Opacity of the tiled ground: it appears with the top-down set. */
export function tilesOpacity(p: number): number {
  return topDownOpacity(p);
}

/** Opacity of the milk-white panel in the right half: it fades in with the shrink and is gone once the dust has covered it. */
export function panelOpacity(p: number): number {
  return p >= SITE.end ? 0 : fade(p, SITE.panel);
}

/** The panel's leaf shadows arrive a little after the milk, so the panel is calm first. */
export function leavesOpacity(p: number): number {
  return p >= SITE.end ? 0 : glide(p, [SITE.panel[0] + (SITE.panel[1] - SITE.panel[0]) * 0.5, SITE.panel[1] + (SITE.shrink[1] - SITE.panel[1]) * 0.4]);
}

/** True while the panel (and its time-based leaf drift) should be mounted: a little before and after its life. */
export function panelMounted(p: number, margin = 0.004): boolean {
  return p >= SITE.panel[0] - margin && p < SITE.end + margin;
}

/** What the site drives from progress (its builders' mallets are acting, `acting.ts`). */
const channels: MotionChannel[] = [
  { name: "side view · opacity", at: sideOpacity },
  { name: "sea · opacity", at: seaOpacity },
  { name: "top-down · opacity", at: topDownOpacity },
  { name: "site · shrink", at: shrinkAt },
  { name: "tiles · field", at: (p) => tileField(p).size },
  { name: "panel · opacity", at: (p) => (p >= SITE.end ? 1 : panelOpacity(p)) },
  { name: "leaves · opacity", at: (p) => (p >= SITE.end ? 1 : leavesOpacity(p)) },
];

export const SITE_MOTION: SceneMotion = { channels };
