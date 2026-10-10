import type { Question } from "@/content/copy";
import { cn } from "@/lib/utils";
import { copyAtUnchecked } from "@/scroll/copy-path";
import { beatOf } from "@/scroll/helpers";
import { FAQ } from "@/scroll/script";
import type { BeatId } from "@/scroll/types";

/**
 * The five questions as real content: a plain list, each question a heading with its answer, in
 * script order. On the stage it is visually hidden and always present, so screen readers get the
 * whole FAQ as one list wherever the scroll is (the animated deck is decorative and hidden from
 * them); on the reduced-motion page it is the normal, visible FAQ. Renders on the server.
 */

/** The question beats, in order (the cards of the deck). */
export const QUESTION_BEATS: readonly BeatId[] = FAQ.cards.map((card) => card.beat);

/** The question and answer of a question beat, from the copy deck. */
export function questionOf(id: BeatId): Question {
  const node = copyAtUnchecked(beatOf(id).copy) as Partial<Question> | undefined;
  return { question: node?.question ?? "", answer: node?.answer ?? "" };
}

export interface QuestionListProps {
  className?: string;
  /** Accessible name of the list, when no heading on screen names it. */
  label?: string;
}

export function QuestionList({ className, label }: QuestionListProps) {
  return (
    <ul data-question-list aria-label={label} className={cn("divide-y border-y", className)}>
      {QUESTION_BEATS.map((id) => {
        const { question, answer } = questionOf(id);
        return (
          <li key={id} className="py-7">
            <h3 className="type-title max-w-[32ch]">{question}</h3>
            <p className="type-body mt-3 max-w-[60ch] text-[color:var(--story-soft,var(--milk))]">{answer}</p>
          </li>
        );
      })}
    </ul>
  );
}
