"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useMotionValue } from "motion/react";

// Lenis's recommended base styles (html height, stopped state, nested scroll areas).
import "lenis/dist/lenis.css";

import { chrome, questions } from "@/content/copy";
import { cn } from "@/lib/utils";
import { segmentsFromStops, type RulerChapter } from "@/components/chrome/chapters";
import { Hairlines } from "@/components/chrome/hairlines";
import { ServiceThread } from "@/components/chrome/service-thread";
import { ProgressLine } from "@/components/chrome/progress-line";
import { StoryChrome } from "@/components/chrome/story-chrome";
import { ANCHORS, BEATS, CHAPTERS, HAIRLINES, PROGRESS_LINES, RULER_STOPS, STAGE_VH } from "@/scroll/script";
import { createStageScroll, type ScrollToProgressOptions, type StageScroll } from "@/scroll/stage-scroll";
import { StoryContext, usePrefersReducedMotion, useTone, type Story } from "@/scroll/story-scroll";
import type { BeatId } from "@/scroll/types";
import { validateScript } from "@/scroll/validate";

import { Beat } from "./beat";
import { QUESTION_BEATS, QuestionList } from "./question-list";
import { SitePanel } from "./site-panel";
import { TransitionLayer } from "./transition-layer";

/**
 * The pinned stage: one section `STAGE_VH` tall, scrolled natively, with a sticky full-viewport
 * frame holding the layers, bottom to top:
 * 1. the WebGL canvas with the scene plates;
 * 2. the transition canvas;
 * 3. the hairlines (and the progress lines that run along them);
 * 4. the DOM text layer: every beat of the script, each in its slot (the five question cards as
 *    one pinned deck with its connector line, `QuestionDeck`);
 * 5. the chrome (mark, menu, Apply, ruler, percent counter).
 *
 * Everything reads the one `progress` motion value, written by the scroll engine
 * (`src/scroll/stage-scroll.ts`). With reduced motion the stage is not shown at all and the engine
 * never starts; the stacked page (`ReducedStory`) takes its place.
 */

if (process.env.NODE_ENV === "development") validateScript();

const StageCanvas = dynamic(() => import("@/components/stage/stage-canvas"), { ssr: false });

const DevTimeline =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./dev-timeline").then((m) => m.DevTimeline), { ssr: false }) : null;

/** The question deck (scene 11): client only, with the camera path and the orchard's anchor points. */
const QuestionDeck = dynamic(() => import("./question-deck"), { ssr: false });

/** Custom content per beat, registered by the scene phases. Unlisted beats render their copy key. */
const BEAT_CONTENT: Partial<Record<BeatId, React.ComponentType>> = {};

/** Beats drawn as one group instead of one `Beat` each: the five question cards. */
const QUESTION_SET = new Set<BeatId>(QUESTION_BEATS);

const RULER_CHAPTERS: RulerChapter[] = CHAPTERS.map((chapter) => {
  const copy = chrome.chapters.find((c) => c.id === chapter.id);
  if (!copy) throw new Error(`No ruler copy for chapter "${chapter.id}"`);
  return { ...copy, start: chapter.start };
});

const RULER_SEGMENTS = segmentsFromStops(RULER_STOPS);

/** The progress line runs along the top hairline, between the left and right hairlines. */
const ALONG_TOP: React.CSSProperties = {
  left: "var(--grid-left)",
  width: "calc(var(--grid-right) - var(--grid-left))",
  top: "var(--grid-top)",
};

export function StoryStage({ year }: { year: number }) {
  const progress = useMotionValue(0);
  const velocity = useMotionValue(0);
  const section = React.useRef<HTMLElement>(null);
  const frame = React.useRef<HTMLDivElement>(null);
  const engine = React.useRef<StageScroll | null>(null);
  const live = usePrefersReducedMotion() === false;
  const tone = useTone(progress);

  React.useEffect(() => {
    if (!live || !section.current || !frame.current) return;
    const scroll = createStageScroll({ section: section.current, frame: frame.current, progress, velocity });
    engine.current = scroll;
    return () => {
      scroll.destroy();
      engine.current = null;
    };
  }, [live, progress, velocity]);

  const scrollTo = React.useCallback((p: number, options?: ScrollToProgressOptions) => engine.current?.scrollTo(p, options), []);
  const story = React.useMemo<Story>(() => ({ progress, velocity, scrollTo, year }), [progress, velocity, scrollTo, year]);
  const onChapterSelect = React.useCallback((chapter: RulerChapter) => scrollTo(ANCHORS[chapter.id]), [scrollTo]);
  const onApply = React.useCallback(() => scrollTo(ANCHORS.apply), [scrollTo]);
  const onMilk = tone === "milk";

  return (
    <StoryContext value={story}>
      {/* The frame is one small viewport tall (stable while a mobile URL bar shows and hides); the
          section's sky ground fills the strip below it when the bar is hidden. */}
      <section ref={section} data-stage className="relative bg-sky motion-reduce:hidden" style={{ height: `${STAGE_VH}vh` }}>
        <div ref={frame} className="sticky top-0 h-svh w-full overflow-hidden bg-sky">
          <div aria-hidden data-layer="scene" className="pointer-events-none absolute inset-0">
            {live ? <StageCanvas progress={progress} /> : null}
          </div>

          {live ? <SitePanel progress={progress} /> : null}

          <TransitionLayer progress={progress} live={live} />

          <div data-layer="hairlines" className={cn("pointer-events-none absolute inset-0 transition-colors duration-300", onMilk ? "text-ink" : "text-white")}>
            <Hairlines progress={progress} cues={HAIRLINES} position="absolute" />
            {PROGRESS_LINES.map((line) => (
              <ProgressLine key={line.id} progress={progress} range={line.draw} erase={line.erase} className="absolute" style={ALONG_TOP} />
            ))}
            <ServiceThread progress={progress} />
          </div>

          <div
            data-layer="text"
            className={cn(
              "absolute inset-0 transition-colors duration-300",
              onMilk ? "text-ink [--story-soft:color-mix(in_oklab,var(--ink)_74%,transparent)]" : "text-white [--story-soft:var(--milk)]",
            )}
          >
            {BEATS.map((beat) => {
              if (QUESTION_SET.has(beat.id)) {
                // The question cards are one group: the pinned deck with its connector, and the same
                // questions as a list for screen readers (always present, wherever the scroll is).
                return beat.id === QUESTION_BEATS[0] ? (
                  <React.Fragment key="questions">
                    <QuestionList className="sr-only" label={questions.title} />
                    {live ? <QuestionDeck /> : null}
                  </React.Fragment>
                ) : null;
              }
              const Content = BEAT_CONTENT[beat.id];
              return (
                <Beat key={beat.id} id={beat.id}>
                  {Content ? <Content /> : undefined}
                </Beat>
              );
            })}
          </div>

          <StoryChrome
            progress={progress}
            chapters={RULER_CHAPTERS}
            segments={RULER_SEGMENTS}
            onChapterSelect={onChapterSelect}
            onApply={onApply}
            tone={tone}
            position="absolute"
          />
        </div>
      </section>
      {DevTimeline && live ? <DevTimeline /> : null}
    </StoryContext>
  );
}
