import { hermiteAt, monotoneSlopes } from "@/lib/monotone";
import { clamp01 } from "@/lib/progress";

import { MOBILE, SCENES, STAGE_VH } from "./script";
import type { SceneDef, SceneId } from "./types";

/**
 * How scroll distance maps to story progress. On desktop it is a straight line: the stage is
 * `STAGE_VH` tall and progress is the share of it scrolled. On a phone the stage is shorter
 * (`MOBILE.stageScale`) and each scene keeps `MOBILE.weights[scene]` of its desktop length, so the
 * map bends at every scene boundary: a monotone cubic through the boundaries, so the story's speed
 * changes smoothly there under a steady thumb instead of jumping (a move that runs across a
 * boundary keeps its speed). The script itself never changes: a progress value means the same
 * moment everywhere, and only the scroll distance to it differs.
 *
 * `toProgress(u)` takes the scrolled share of the stage (0 to 1) and returns story progress;
 * `toScroll(p)` is its inverse. Both are strictly increasing and agree at 0 and 1 and at every
 * scene boundary, so a scene starts and ends at the same moment on both layouts.
 */
export interface ScrollMap {
  toProgress(u: number): number;
  toScroll(p: number): number;
}

/** Desktop: scroll and progress are the same number. */
export const LINEAR_SCROLL: ScrollMap = {
  toProgress: (u) => clamp01(u),
  toScroll: (p) => clamp01(p),
};

/** A scroll map that gives scene `i` the share `scenes[i].share * weights[scene.id]` of the stage, normalized. */
export function createScrollMap(scenes: readonly SceneDef[], weights: Readonly<Record<SceneId, number>>): ScrollMap {
  const shares = scenes.map((scene) => (scene.end - scene.start) * weights[scene.id]);
  const total = shares.reduce((sum, share) => sum + share, 0);
  // Boundaries of the scenes in scroll (u) and in progress (p), both 0 to 1.
  const u: number[] = [0];
  const p: number[] = [scenes[0].start];
  scenes.forEach((scene, i) => {
    u.push(u[i] + shares[i] / total);
    p.push(scene.end);
  });
  u[u.length - 1] = 1;
  p[p.length - 1] = 1;

  // dp/du at each boundary: the monotone rule inside, the end segments' own slopes at the ends.
  const slopes = monotoneSlopes(u, p, [], "secant");
  const segment = (x: number, knots: readonly number[]) => {
    let i = 0;
    while (i < knots.length - 2 && x >= knots[i + 1]) i++;
    return i;
  };
  const toProgress = (x: number) => {
    const v = clamp01(x);
    const i = segment(v, u);
    return u[i + 1] > u[i] ? hermiteAt(v, u[i], p[i], slopes[i], u[i + 1], p[i + 1], slopes[i + 1]) : p[i];
  };
  // Its inverse, by bisection inside the segment (the cubic is increasing there).
  const toScroll = (x: number) => {
    const v = clamp01(x);
    const i = segment(v, p);
    let lo = u[i];
    let hi = u[i + 1];
    for (let k = 0; k < 48; k++) {
      const mid = (lo + hi) / 2;
      if (toProgress(mid) < v) lo = mid;
      else hi = mid;
    }
    return v <= p[i] ? u[i] : v >= p[i + 1] ? u[i + 1] : (lo + hi) / 2;
  };

  return { toProgress, toScroll };
}

/** The phone's scroll map, built from the script. */
export const MOBILE_SCROLL: ScrollMap = createScrollMap(SCENES, MOBILE.weights);

/** The scroll map for a layout. */
export const scrollMapFor = (stacked: boolean): ScrollMap => (stacked ? MOBILE_SCROLL : LINEAR_SCROLL);

/** Screens of scrolling from progress 0 to 1 on a layout (the pinned frame is one screen tall). */
export const screensOf = (stacked: boolean): number => (STAGE_VH * (stacked ? MOBILE.stageScale : 1) - 100) / 100;

/** How many screens of scrolling the progress range `[a, b]` takes on a layout. */
export function screensBetween(a: number, b: number, stacked: boolean): number {
  const map = scrollMapFor(stacked);
  return (map.toScroll(b) - map.toScroll(a)) * screensOf(stacked);
}
