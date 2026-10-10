"use client";

import type { MotionValue } from "motion/react";

import { chrome } from "@/content/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { ChapterMenu } from "./chapter-menu";
import { useActiveChapter, type RulerChapter, type RulerSegment } from "./chapters";
import { OrangeMark } from "./orange-mark";
import { PercentCounter } from "./percent-counter";
import { Ruler } from "./ruler";

/**
 * Everything that stays on screen for the whole story: the Orange mark with the chapter-menu grid
 * button under it (top left), the "Apply" pill (top right), the ruler on the left hairline, and the
 * percent counter (bottom right). Below `md` the ruler collapses into the chapter menu.
 *
 * Ranges and navigation come from the stage (`chapters`, `segments`, `onChapterSelect`, `onApply`),
 * which builds them from the scroll script.
 */
export interface StoryChromeProps {
  progress: MotionValue<number>;
  chapters: readonly RulerChapter[];
  segments: readonly RulerSegment[];
  onChapterSelect: (chapter: RulerChapter) => void;
  /** Scrolls to the application form. */
  onApply: () => void;
  /** Ground under the chrome: sky (white text, ghost pill) or milk (ink text, dark pill). */
  tone?: "sky" | "milk";
  /** `fixed` on the story stage; `absolute` inside a positioned container (e.g. on /design). */
  position?: "fixed" | "absolute";
  className?: string;
}

export function StoryChrome({
  progress,
  chapters,
  segments,
  onChapterSelect,
  onApply,
  tone = "sky",
  position = "fixed",
  className,
}: StoryChromeProps) {
  const active = useActiveChapter(progress, chapters);
  const corner = "max(1.5rem, calc(var(--grid-top) / 2))";

  return (
    <div
      data-chrome
      data-tone={tone}
      className={cn(
        position === "fixed" ? "fixed" : "absolute",
        "pointer-events-none inset-0 z-40 transition-colors duration-300",
        tone === "sky" ? "text-white" : "text-ink",
        className,
      )}
    >
      {/* Top left: the mark, and the grid button under it. */}
      <div
        className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-3.5 flex-col items-center gap-3"
        style={{ left: "max(1.375rem, calc(var(--grid-left) / 2))", top: corner }}
      >
        <OrangeMark label={chrome.mark.label} />
        <ChapterMenu chapters={chapters} active={active} onSelect={onChapterSelect} />
      </div>

      {/* Top right: Apply. Centered in the right margin on wide screens. */}
      <div
        className="pointer-events-auto absolute right-4 -translate-y-1/2 md:right-[calc((100%-var(--grid-right))/2)] md:translate-x-1/2"
        style={{ top: corner }}
      >
        <Button variant={tone === "sky" ? "ghost-pill" : "pill"} onClick={onApply}>
          {chrome.apply.label}
        </Button>
      </div>

      {/* Left hairline: the ruler (md and up; the chapter menu replaces it on small screens). */}
      <Ruler
        progress={progress}
        chapters={chapters}
        segments={segments}
        onSelect={onChapterSelect}
        className="absolute top-[30%] bottom-[30%] left-grid-left hidden md:block"
      />

      {/* Bottom right: overall progress. */}
      <div
        className="absolute right-4 translate-y-1/2 md:right-[calc((100%-var(--grid-right))/2)] md:translate-x-1/2"
        style={{ bottom: corner }}
      >
        <PercentCounter progress={progress} />
      </div>
    </div>
  );
}
