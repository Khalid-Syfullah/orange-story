import type { SceneDef, SceneId, StoryPart } from "./types";

/**
 * Pure builders for `script.ts`. They turn the authored plan (scene shares, points inside scenes,
 * lengths in screens) into plain numbers, so everything downstream reads ordinary progress values.
 */

/** Rounds to 6 decimals, so sums of shares land exactly on 0.232, 0.4, 0.628 and 1. */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Screens of scrolling from progress 0 to 1 for a stage of `stageVh` (the pinned frame is one screen). */
export const screensFor = (stageVh: number) => (stageVh - 100) / 100;

export interface ScenePlan {
  id: SceneId;
  part: StoryPart;
  share: number;
}

/** Lays the scenes end to end from 0 by their shares. */
export function tileScenes(plan: readonly ScenePlan[]): SceneDef[] {
  const scenes: SceneDef[] = [];
  let start = 0;
  plan.forEach((scene, index) => {
    const end = round6(start + scene.share);
    scenes.push({ ...scene, number: index + 1, start, end });
    start = end;
  });
  return scenes;
}

/** Progress at fraction `t` (0 to 1) of a scene. */
export function pointInScene(scenes: readonly SceneDef[], id: SceneId, t: number): number {
  const scene = scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`Unknown scene "${id}"`);
  return round6(scene.start + (scene.end - scene.start) * t);
}
