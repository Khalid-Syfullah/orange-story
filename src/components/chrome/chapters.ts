"use client";

import { useState } from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

import type { Chapter } from "@/content/copy";

/**
 * Shapes the chrome reads from the scroll script. The chrome never owns ranges itself: the stage
 * builds these from `src/scroll/script.ts` and passes them in.
 */

/** A chapter with the story progress where it starts (the ruler label switches exactly there). */
export interface RulerChapter extends Chapter {
  start: number;
}

/** One stretch of the script (between scene starts, beat changes or chapter starts). */
export interface RulerSegment {
  start: number;
  end: number;
}

/** Turns sorted boundary points into contiguous segments covering 0 to 1. */
export function segmentsFromStops(stops: readonly number[]): RulerSegment[] {
  const points = Array.from(new Set([0, ...stops.filter((s) => s > 0 && s < 1), 1])).sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({ start, end: points[i + 1] }));
}

/** Index of the chapter active at progress p (the first chapter also covers anything before it). */
export function activeChapterIndex(p: number, chapters: readonly RulerChapter[]): number {
  let index = 0;
  for (let i = 0; i < chapters.length; i++) if (p >= chapters[i].start) index = i;
  return index;
}

/**
 * Active chapter index. React state changes only when the chapter actually changes, not per frame
 * (setting the same number is a no-op).
 */
export function useActiveChapter(progress: MotionValue<number>, chapters: readonly RulerChapter[]): number {
  const [index, setIndex] = useState(() => activeChapterIndex(progress.get(), chapters));
  useMotionValueEvent(progress, "change", (p) => setIndex(activeChapterIndex(p, chapters)));
  return index;
}
