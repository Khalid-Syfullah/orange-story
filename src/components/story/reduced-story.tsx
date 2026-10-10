import { chrome, storyScenes } from "@/content/copy";
import { cn } from "@/lib/utils";
import { OrangeMark } from "@/components/chrome/orange-mark";
import { PlaceholderStill } from "@/components/stage/placeholder-still";
import { Button } from "@/components/ui/button";
import { BEATS, SCENES } from "@/scroll/script";
import type { StoryPart } from "@/scroll/types";

import { BeatContent } from "./beat-content";
import { QUESTION_BEATS, QuestionList } from "./question-list";

const QUESTION_SET = new Set<string>(QUESTION_BEATS);

/**
 * The story for visitors who prefer reduced motion: no pinned stage, no smooth scrolling, no canvas.
 * The chapters are a normal stacked page with one still per scene and all the copy in reading
 * order (the question cards as a plain FAQ list). CSS decides which version shows
 * (`motion-reduce:`), so the right one appears before any script runs; this page renders on the
 * server.
 */

const PARTS: readonly StoryPart[] = ["model", "work", "terms", "questions", "end"];

export function ReducedStory({ year }: { year: number }) {
  return (
    <div data-reduced-story className="theme-sky hidden bg-background pb-24 motion-reduce:block [--story-soft:var(--milk)]">
      <header className="flex items-center justify-between px-col-a pt-8">
        <OrangeMark label={chrome.mark.label} />
        <Button asChild variant="ghost-pill">
          <a href={`#${chrome.apply.target}`}>{chrome.apply.label}</a>
        </Button>
      </header>

      {PARTS.map((part) => {
        const chapter = chrome.chapters.find((c) => c.id === part);
        const headingId = `reduced-${part}`;
        return (
          <section key={part} id={part} aria-labelledby={chapter ? headingId : undefined} className="pt-16">
            {chapter ? (
              <h2 id={headingId} className="flex items-baseline gap-4 px-col-a">
                <span className="type-meta text-milk/70">{chapter.short}</span>
                <span className="type-label">{chapter.name}</span>
              </h2>
            ) : null}

            {SCENES.filter((scene) => scene.part === part).map((scene) => (
              <article key={scene.id} aria-label={storyScenes[scene.id].name} className="mt-12">
                <figure className="ml-col-a mr-[calc(100%_-_var(--grid-right))]">
                  <PlaceholderStill scene={scene.id} className="aspect-video rounded-sm object-cover" />
                  <figcaption className="type-meta mt-3 text-milk/70">{storyScenes[scene.id].name}</figcaption>
                </figure>
                {BEATS.filter((beat) => beat.scene === scene.id).map((beat) => {
                  // The question cards read as a normal FAQ here: one list, in place of the first card.
                  if (QUESTION_SET.has(beat.id)) {
                    return beat.id === QUESTION_BEATS[0] ? (
                      <QuestionList key="questions" className="mt-10 ml-col-a mr-[calc(100%_-_var(--grid-right))] max-w-3xl" />
                    ) : null;
                  }
                  return (
                    <div
                      key={beat.id}
                      id={beat.id === "apply-form" ? chrome.apply.target : undefined}
                      className={cn("mt-12", beat.slot === "center" && "grid place-items-center")}
                    >
                      <BeatContent beat={beat} year={year} />
                    </div>
                  );
                })}
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
