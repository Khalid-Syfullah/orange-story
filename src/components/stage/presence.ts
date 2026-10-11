import { ease, remap } from "@/lib/progress";
import { CROSSFADE_SCREENS } from "@/scroll/boundaries";
import { SCENES, SCREEN, TRANSITIONS } from "@/scroll/script";
import type { SceneDef, SceneId } from "@/scroll/types";

import { stageTransitionMode } from "./transitions/modes";

/**
 * Which scenes are on stage at a progress, and how much (pure, no React). Scene art multiplies its
 * opacity by its scene's presence:
 * - where a covering transition (sand, unfold, dust, fabric) hands one scene to the next, the swap
 *   is a step at the boundary, hidden under the full cover;
 * - at a plain boundary the incoming scene fades in over the outgoing one (it stacks on top), and
 *   the outgoing scene fades out just after, so the stage is never empty.
 *
 * Only scenes within one of the current scene are mounted (`mountedScenes`); presence never asks
 * for a scene outside that window.
 */

/** A plain boundary crossfades over this many screens to each side. */
export { CROSSFADE_SCREENS };

export interface PresenceRange {
  /** Starts to arrive (or -Infinity: present from the start). */
  inStart: number;
  /** Fully present. */
  inEnd: number;
  /** Starts to leave (or Infinity: present to the end). */
  outStart: number;
  /** Gone. */
  outEnd: number;
}

const indexById = new Map<SceneId, number>(SCENES.map((s, i) => [s.id, i]));

/** True when a covering transition hands `from` over to `to` (the swap happens under full cover). */
export function coveredHandover(from: SceneId, to: SceneId): boolean {
  return TRANSITIONS.some((t) => t.layer === "canvas" && t.from === from && t.to === to && t.peak !== undefined);
}

/** A pass that hands `from` to `to` without covering the screen, with its own cross-fade. */
const passOf = (from: SceneId, to: SceneId) => TRANSITIONS.find((t) => t.layer === "canvas" && t.from === from && t.to === to && t.peak === undefined && t.swap !== undefined);

/**
 * How long (progress, to each side) `from` and `to` cross-fade: a pass's own `swap`, or the plain
 * crossfade (also behind a pass in the calm version, which has no leaves to hide a quick swap).
 */
export function crossfadeOf(from: SceneId, to: SceneId, calm = false): number {
  return (calm ? CROSSFADE_SCREENS : (passOf(from, to)?.swap ?? CROSSFADE_SCREENS)) * SCREEN;
}

/** Where `from` and `to` cross-fade: a pass's `swapAt` (its densest moment), or their boundary. */
export function swapPointOf(from: SceneId, to: SceneId): number {
  const next = SCENES[(indexById.get(to) ?? 0)];
  return passOf(from, to)?.swapAt ?? next.start;
}

function computeRange(scene: SceneDef, calm: boolean): PresenceRange {
  const index = indexById.get(scene.id) ?? 0;
  const prev = SCENES[index - 1];
  const next = SCENES[index + 1];
  const range: PresenceRange = { inStart: -Infinity, inEnd: -Infinity, outStart: Infinity, outEnd: Infinity };
  if (prev) {
    const covered = coveredHandover(prev.id, scene.id);
    const fade = crossfadeOf(prev.id, scene.id, calm);
    const at = swapPointOf(prev.id, scene.id);
    range.inStart = covered ? scene.start : at - fade;
    range.inEnd = covered ? scene.start : at + fade;
  }
  if (next) {
    const covered = coveredHandover(scene.id, next.id);
    const at = swapPointOf(scene.id, next.id);
    range.outStart = covered ? scene.end : at;
    range.outEnd = covered ? scene.end : at + crossfadeOf(scene.id, next.id, calm);
  }
  return range;
}

const ranges = new Map<SceneId, PresenceRange>(SCENES.map((s) => [s.id, computeRange(s, false)]));
const calmRanges = new Map<SceneId, PresenceRange>(SCENES.map((s) => [s.id, computeRange(s, true)]));

/** A scene's presence ranges (the calm version's: `calm`). */
export function presenceRange(scene: SceneDef | SceneId, calm = stageTransitionMode() === "calm"): PresenceRange {
  const id = typeof scene === "string" ? scene : scene.id;
  const range = (calm ? calmRanges : ranges).get(id);
  if (!range) throw new Error(`Unknown scene "${id}"`);
  return range;
}

/** How much of the scene is on stage at p, 0 to 1 (eased with the story curve). */
export function scenePresence(scene: SceneDef | SceneId, p: number): number {
  const { inStart, inEnd, outStart, outEnd } = presenceRange(scene);
  if (p < inStart || p >= outEnd) return 0;
  const arrived = p >= inEnd ? 1 : ease(remap(p, inStart, inEnd));
  const left = p < outStart ? 0 : ease(remap(p, outStart, outEnd));
  return Math.min(arrived, 1 - left);
}

/** Scenes whose plates are mounted while scene `index` is current: it and its two neighbours. */
export function mountedScenes(index: number): SceneDef[] {
  return SCENES.filter((_, i) => Math.abs(i - index) <= 1);
}
