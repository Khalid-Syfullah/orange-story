import { clamp01, remap, type ProgressRange } from "@/lib/progress";

import { BEATS, CHAPTERS, SCENES, SCREEN, SCREENS, TONES, TRANSITIONS } from "./script";
import type { BeatDef, BeatId, ChapterDef, SceneDef, SceneId, Tone, TransitionDef, TransitionId } from "./types";

/**
 * Pure questions about the script at a given progress. They read `script.ts` and hold no state, so
 * they are safe on the server, in tests and inside scroll callbacks (no allocation in the hot ones).
 */

const sceneIndexById = new Map(SCENES.map((s, i) => [s.id, i]));
const beatById = new Map(BEATS.map((b) => [b.id, b]));
const transitionById = new Map(TRANSITIONS.map((t) => [t.id, t]));

/* Scenes */

export function sceneOf(id: SceneId): SceneDef {
  const index = sceneIndexById.get(id);
  if (index === undefined) throw new Error(`Unknown scene "${id}"`);
  return SCENES[index];
}

/** Index in `SCENES` of the scene on stage at progress p. Scenes own `[start, end)`; the finale owns 1. */
export function sceneIndexAt(p: number): number {
  let index = 0;
  for (let i = 1; i < SCENES.length; i++) if (p >= SCENES[i].start) index = i;
  return index;
}

export function currentScene(p: number): SceneDef {
  return SCENES[sceneIndexAt(p)];
}

/** How far through a scene p is, 0 to 1 (clamped). Art inside a scene choreographs on this. */
export function sceneProgress(id: SceneId, p: number): number {
  const scene = sceneOf(id);
  return remap(p, scene.start, scene.end);
}

/** Progress at fraction t of a scene (the inverse of `sceneProgress`). */
export function sceneAt(id: SceneId, t: number): number {
  const scene = sceneOf(id);
  return scene.start + (scene.end - scene.start) * t;
}

/* Chapters */

/** Index in `CHAPTERS` of the ruler chapter at p. The first chapter also covers anything before it. */
export function chapterIndexAt(p: number): number {
  let index = 0;
  for (let i = 1; i < CHAPTERS.length; i++) if (p >= CHAPTERS[i].start) index = i;
  return index;
}

/** The ruler chapter at p (the finale sits under "Questions" on the ruler). */
export function currentChapter(p: number): ChapterDef {
  return CHAPTERS[chapterIndexAt(p)];
}

/* Beats */

export function beatOf(id: BeatId): BeatDef {
  const beat = beatById.get(id);
  if (!beat) throw new Error(`Unknown beat "${id}"`);
  return beat;
}

/** True while p is inside the beat's range `[in, out)`. A beat that never leaves stays to the end. */
export function inBeat(beat: BeatDef, p: number): boolean {
  if (p < beat.in) return false;
  return beat.leave === "hold" || beat.out >= 1 ? true : p < beat.out;
}

/** True while the beat is on stage at progress p (arriving, holding or leaving). */
export function beatVisible(id: BeatId, p: number): boolean {
  return inBeat(beatOf(id), p);
}

/** Every beat on stage at p, in script order. */
export function visibleBeats(p: number): BeatDef[] {
  return BEATS.filter((b) => inBeat(b, p));
}

/** The three phases of a beat: arriving, fully on screen, leaving. */
export function beatPhases(beat: BeatDef): { enter: ProgressRange; hold: ProgressRange; leave: ProgressRange } {
  return {
    enter: [beat.in, beat.hold[0]],
    hold: beat.hold,
    leave: [beat.hold[1], beat.out],
  };
}

/** Amount the beat has arrived (0 to 1), linear. `load` beats are already there. */
export function beatEnterAmount(beat: BeatDef, p: number): number {
  if (beat.enter === "load") return p >= beat.in ? 1 : 0;
  return remap(p, beat.in, beat.hold[0]);
}

/** Amount the beat has left (0 to 1), linear. `hold` beats never leave. */
export function beatLeaveAmount(beat: BeatDef, p: number): number {
  if (beat.leave === "hold") return 0;
  return remap(p, beat.hold[1], beat.out);
}

/**
 * Staggered ranges for line `index` of `count` inside a beat: when it arrives and when it leaves.
 * Arrivals spread across the arrival ramp and a little of the hold; leaves spread across the leave
 * ramp, first line first. Both stay inside the beat's range, so the stagger reverses exactly.
 */
export function beatLineRanges(beat: BeatDef, index: number, count: number): { arrive: ProgressRange; leave: ProgressRange } {
  const span = (start: number, end: number, share: number): ProgressRange => {
    const length = Math.max(0, end - start);
    if (count <= 1) return [start, start + length];
    const each = length * share;
    const offset = ((length - each) * index) / (count - 1);
    return [start + offset, start + offset + each];
  };
  const holdLength = Math.max(0, beat.hold[1] - beat.hold[0]);
  const arriveEnd = beat.hold[0] + Math.min(holdLength * 0.35, 0.3 * SCREEN);
  return {
    arrive: span(beat.in, arriveEnd, 0.55),
    leave: span(beat.hold[1], beat.out, 0.6),
  };
}

/* Transitions */

export function transitionOf(id: TransitionId): TransitionDef {
  const transition = transitionById.get(id);
  if (!transition) throw new Error(`Unknown transition "${id}"`);
  return transition;
}

/** How far through a transition p is, 0 to 1 (clamped). */
export function transitionProgress(id: TransitionId, p: number): number {
  const t = transitionOf(id);
  return remap(p, t.start, t.end);
}

/** Every transition running at p. */
export function activeTransitions(p: number): TransitionDef[] {
  return TRANSITIONS.filter((t) => p >= t.start && (p < t.end || (t.end >= 1 && p <= 1)));
}

/**
 * Where a beat that leaves as smoke dissolves: across the text transition that lists it (so a group
 * dissolves together), otherwise across its own leave. Null for beats that leave another way.
 */
export function smokeRange(beat: BeatDef): ProgressRange | null {
  if (beat.leave !== "smoke") return null;
  const group = TRANSITIONS.find((t) => t.kind === "smoke" && t.beats?.includes(beat.id));
  return group ? [group.start, group.end] : [beat.hold[1], beat.out];
}

/* Tone, units */

/** Ground under the chrome at p: milk inside a milk cue, sky everywhere else. */
export function toneAt(p: number): Tone {
  for (const cue of TONES) if (p >= cue.start && p < cue.end) return cue.tone;
  return "sky";
}

/** Progress expressed in screens of scrolling from the top of the stage. */
export const progressToScreens = (p: number) => clamp01(p) * SCREENS;

/** A length in screens expressed in progress. */
export const screensToProgress = (n: number) => n * SCREEN;
