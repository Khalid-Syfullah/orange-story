import { chrome } from "@/content/copy";
import { segmentsFromStops, type RulerChapter } from "@/components/chrome/chapters";
import type { HairlineCue } from "@/components/chrome/hairlines";
import type { ProgressRange } from "@/lib/progress";

/**
 * Demo ranges for the dev-only /design playground. They follow the proportions in docs/REFERENCE.md
 * and the scene shares planned for the scroll script, but they are NOT the story: the stage reads
 * the real values from `src/scroll/script.ts`.
 */

const CHAPTER_STARTS = [0.012, 0.232, 0.4, 0.628] as const;

export const demoChapters: RulerChapter[] = chrome.chapters.map((c, i) => ({ ...c, start: CHAPTER_STARTS[i] }));

/** Scene ends (hero, ascent, graft, pluck, share, work, blueprint, site, prune, fall, faq, stars, apply). */
const SCENE_ENDS = [0.03, 0.08, 0.13, 0.19, 0.232, 0.332, 0.4, 0.48, 0.555, 0.628, 0.768, 0.818, 0.898];

export const demoSegments = segmentsFromStops([...CHAPTER_STARTS, ...SCENE_ENDS]);

export const demoApplyAt = 0.818;

const exitAround = (c: number): HairlineCue => ({ kind: "exit", at: [c - 0.006, c + 0.004, c + 0.01, c + 0.022] });

export const demoTargets = {
  share: { x: 0.42, y: 0.3, width: 0.16, height: 0.3 },
  finale: { x: 0.32, y: 0.2, width: 0.36, height: 0.55 },
} as const;

export const demoHairlineCues: HairlineCue[] = [
  { kind: "viewfinder", at: [0.19, 0.21, 0.222, 0.232], target: demoTargets.share, padding: 16 },
  exitAround(0.232),
  exitAround(0.4),
  exitAround(0.628),
  { kind: "exit", at: [0.9, 0.93, 2, 2] },
  { kind: "viewfinder", at: [0.93, 0.98, 2, 2], target: demoTargets.finale, padding: 12 },
];

export const demoRanges = {
  splitReveal: [0.04, 0.36] as ProgressRange,
  typewriter: [0.1, 0.3] as ProgressRange,
  blurFadeIn: [0.0, 0.08] as ProgressRange,
  blurFadeOut: [0.4, 0.55] as ProgressRange,
  progressLine: [0.15, 0.3] as ProgressRange,
  progressLineErase: [0.5, 0.62] as ProgressRange,
} as const;
