"use client";

import * as React from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

import { chapterIndexAt, inBeat, sceneIndexAt, toneAt } from "./helpers";
import { SCREEN } from "./script";
import type { ScrollToProgressOptions } from "./stage-scroll";
import type { BeatDef, Tone } from "./types";

/**
 * What the pinned stage shares with everything inside it: the story `progress` (0 to 1) and
 * `velocity` (screens per second, positive when scrolling down) as motion values, a way to scroll
 * to a progress, and the copyright year for the finale.
 *
 * The hooks below turn progress into React state only when something discrete changes (the scene,
 * the chapter, the tone, a beat's mount window), never on every scroll frame.
 */
export interface Story {
  progress: MotionValue<number>;
  velocity: MotionValue<number>;
  scrollTo: (p: number, options?: ScrollToProgressOptions) => void;
  year: number | null;
}

export const StoryContext = React.createContext<Story | null>(null);

/** The story inside the pinned stage, or null outside it (the reduced-motion page). */
export function useOptionalStory(): Story | null {
  return React.useContext(StoryContext);
}

export function useStory(): Story {
  const story = React.useContext(StoryContext);
  if (!story) throw new Error("useStory must be used inside the story stage");
  return story;
}

/** React state derived from progress, updated only when the derived value changes. */
export function useProgressState<T>(progress: MotionValue<number>, derive: (p: number) => T): T {
  const [value, setValue] = React.useState(() => derive(progress.get()));
  const last = React.useRef(value);
  useMotionValueEvent(progress, "change", (p) => {
    const next = derive(p);
    if (Object.is(next, last.current)) return;
    last.current = next;
    setValue(next);
  });
  return value;
}

/** Index of the scene on stage (in `SCENES`). */
export function useSceneIndex(progress: MotionValue<number>): number {
  return useProgressState(progress, sceneIndexAt);
}

/** Index of the ruler chapter (in `CHAPTERS`). */
export function useChapterIndex(progress: MotionValue<number>): number {
  return useProgressState(progress, chapterIndexAt);
}

/** Ground under the chrome: sky or milk. */
export function useTone(progress: MotionValue<number>): Tone {
  return useProgressState(progress, toneAt);
}

/** A beat's content mounts this far (in screens) before it arrives and stays this long after it leaves. */
const MOUNT_MARGIN = 0.75;

/** True while the beat is on stage or about to be, so its content can mount just in time. */
export function useBeatMounted(beat: BeatDef, progress: MotionValue<number>, keepMounted = false): boolean {
  const near = React.useCallback(
    (p: number) => keepMounted || (p >= beat.in - MOUNT_MARGIN * SCREEN && (inBeat(beat, p) || p < beat.out + MOUNT_MARGIN * SCREEN)),
    [beat, keepMounted],
  );
  return useProgressState(progress, near);
}

/** The reduced-motion preference (null until hydrated), shared with the motion components. */
export { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
