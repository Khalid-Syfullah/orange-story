import { clamp01 } from "@/lib/progress";

import { MOBILE, SCENES, STAGE_VH } from "./script";
import type { SceneDef, SceneId } from "./types";

/**
 * How scroll distance maps to story progress. On desktop it is a straight line: the stage is
 * `STAGE_VH` tall and progress is the share of it scrolled. On a phone the stage is shorter
 * (`MOBILE.stageScale`) and each scene keeps `MOBILE.weights[scene]` of its desktop length, so the
 * line bends at every scene boundary. The script itself never changes: a progress value means the
 * same moment everywhere, and only the scroll distance to it differs.
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

  const through = (x: number, from: readonly number[], to: readonly number[]) => {
    const v = clamp01(x);
    let i = 0;
    while (i < from.length - 2 && v >= from[i + 1]) i++;
    const span = from[i + 1] - from[i];
    return span > 0 ? to[i] + ((v - from[i]) / span) * (to[i + 1] - to[i]) : to[i];
  };

  return {
    toProgress: (x) => through(x, u, p),
    toScroll: (x) => through(x, p, u),
  };
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
