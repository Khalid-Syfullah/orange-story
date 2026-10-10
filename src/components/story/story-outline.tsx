"use client";

import { chrome, finale, questions } from "@/content/copy";
import { BEATS, SCENES } from "@/scroll/script";
import type { StoryPart } from "@/scroll/types";

import { ApplyLink } from "./apply-link";
import { TabbableContext } from "./beat";
import { BeatContent } from "./beat-content";
import { QUESTION_BEATS, QuestionList } from "./question-list";

/**
 * The story for assistive technology, always on the page and in reading order: the four chapters
 * as landmarks with headings, and inside each one every text beat of the script, in the order the
 * story tells them (the five questions as one list, the form as a link that takes you to it).
 *
 * The stage draws the same beats as scrubbed, short-lived decoration, so it is hidden from
 * assistive technology (`aria-hidden`, the art and the canvases too): this outline is the page for
 * a screen reader. It is visually hidden, and its links are reached by the screen reader's own
 * navigation, not the Tab key (the visible controls do that). With reduced motion the visible
 * stacked page takes over and this is not rendered at all.
 */

const PARTS: readonly StoryPart[] = ["model", "work", "terms", "questions", "end"];
const QUESTION_SET = new Set<string>(QUESTION_BEATS);

export function StoryOutline({ year }: { year: number }) {
  return (
    <TabbableContext value={false}>
      <div data-story-outline role="region" aria-label={chrome.outline.label} className="sr-only motion-reduce:hidden">
        {PARTS.map((part) => {
          const chapter = chrome.chapters.find((c) => c.id === part);
          const headingId = `outline-${part}`;
          const beats = BEATS.filter((beat) => SCENES.find((scene) => scene.id === beat.scene)?.part === part);
          return (
            <section key={part} aria-labelledby={chapter ? headingId : undefined} aria-label={chapter ? undefined : finale.wordmark}>
              {chapter ? <h2 id={headingId}>{chapter.name}</h2> : null}
              {beats.map((beat) => {
                if (QUESTION_SET.has(beat.id)) {
                  return beat.id === QUESTION_BEATS[0] ? <QuestionList key="questions" label={questions.title} /> : null;
                }
                if (beat.id === "apply-form") {
                  return (
                    <p key={beat.id}>
                      <ApplyLink tabIndex={-1}>{chrome.formLink.label}</ApplyLink>
                    </p>
                  );
                }
                return (
                  <div key={beat.id}>
                    <BeatContent beat={beat} year={year} />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </TabbableContext>
  );
}
