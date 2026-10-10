import { chrome } from "@/content/copy";
import { segmentsFromStops, type RulerChapter } from "@/components/chrome/chapters";
import type { FrameRect } from "@/components/chrome/hairlines";
import type { ProgressRange } from "@/lib/progress";
import { ANCHORS, CHAPTERS, HAIRLINES, RULER_STOPS, TRANSITIONS } from "@/scroll/script";
import type { TransitionId } from "@/scroll/types";

/**
 * Values for the dev-only /design playground. The chrome on its stage runs on the real story
 * script (`src/scroll/script.ts`): chapters, ruler segments, hairline cues, viewfinder targets and
 * the Apply anchor. The text-effect demos (`demoRanges`) use their own ranges, spread across the
 * slider so each effect is easy to see; they are not part of the story.
 */

export const demoChapters: RulerChapter[] = CHAPTERS.map((chapter) => {
  const copy = chrome.chapters.find((c) => c.id === chapter.id);
  if (!copy) throw new Error(`No ruler copy for chapter "${chapter.id}"`);
  return { ...copy, start: chapter.start };
});

export const demoSegments = segmentsFromStops(RULER_STOPS);

export const demoApplyAt = ANCHORS.apply;

export const demoHairlineCues = HAIRLINES;

function viewfinderTarget(id: TransitionId): FrameRect {
  const target = TRANSITIONS.find((t) => t.id === id)?.target;
  if (!target) throw new Error(`Viewfinder "${id}" has no target`);
  return target;
}

export const demoTargets = {
  share: viewfinderTarget("viewfinder-share"),
  finale: viewfinderTarget("viewfinder-finale"),
} as const;

export const demoRanges = {
  splitReveal: [0.04, 0.36] as ProgressRange,
  typewriter: [0.1, 0.3] as ProgressRange,
  blurFadeIn: [0.0, 0.08] as ProgressRange,
  blurFadeOut: [0.4, 0.55] as ProgressRange,
  progressLine: [0.15, 0.3] as ProgressRange,
  progressLineErase: [0.5, 0.62] as ProgressRange,
} as const;
