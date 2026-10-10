"use client";

import * as React from "react";
import { useTransform, type MotionStyle, type MotionValue } from "motion/react";

import { cn } from "@/lib/utils";
import { useElementSize } from "@/lib/use-element-size";
import { useSmokeMask } from "@/components/motion/smoke-out";
import { smokeRange } from "@/scroll/helpers";
import { useProgressState, useStory } from "@/scroll/story-scroll";

import { BeatBody } from "./beat";
import { Connector } from "./connector";
import { QuestionCard } from "./question-card";
import { questionOf } from "./question-list";
import { CARD_REST, cardPose, cardTransform, connectorFrame, DECK, deckNear, type DeckCard, type Size } from "./question-plan";
import { SLOTS } from "./slots";

/**
 * Scene 11, the questions: all five question cards in one pinned container, with one shared
 * connector. Each card follows its pose along the arc (`question-plan.ts`): the first zooms up in
 * the center, the others arrive from the right, each swings left, blurs and shrinks as it leaves,
 * and the last rises and dissolves as smoke with the section title. The connector is re-pointed at
 * the card on stage: its line is fixed on that card's orange in the orchard (projected through the
 * stage camera every frame) and its square stays locked to the card's corner as the card moves.
 *
 * Everything is a function of progress (motion values, no React state per frame), so scrolling
 * back brings earlier cards back the way they left. React state changes only when the deck mounts
 * (shortly before the first card, until shortly after the last) and when the stage or a card is
 * resized (their sizes place the corners). The deck is decorative to assistive technology: the
 * same questions are on the stage as a visually hidden list (`QuestionList`). Client only, loaded
 * when the stage is live.
 */

const LAST = DECK[DECK.length - 1];

/**
 * On a stacked (phone) screen the cards are two thirds of the screen wide, which leaves a strip at each
 * side. The near orchard rows fill those strips (the camera widens to show them, `fitFov`), so each
 * card's orange sits just outside the card and the connector runs from it to the card's corner on
 * the near side: a short line at a slant, drawn out as the card arrives like on a wide screen.
 */
const STACKED_CARD = "max-md:w-[66%] max-md:p-5";

/** Laid-out sizes (before transforms) of a set of elements, measured on resize only. */
function useLayoutSizes(count: number) {
  const nodes = React.useRef<(HTMLElement | null)[]>([]);
  const observer = React.useRef<ResizeObserver | null>(null);
  const [sizes, setSizes] = React.useState<readonly Size[]>(() => Array.from({ length: count }, () => ({ width: 0, height: 0 })));

  const measure = React.useCallback(() => {
    setSizes((prev) => {
      const next = Array.from({ length: count }, (_, i) => {
        const el = nodes.current[i];
        return el ? { width: el.offsetWidth, height: el.offsetHeight } : { width: 0, height: 0 };
      });
      return next.every((s, i) => s.width === prev[i]?.width && s.height === prev[i]?.height) ? prev : next;
    });
  }, [count]);

  React.useEffect(() => {
    const resize = new ResizeObserver(measure);
    observer.current = resize;
    for (const el of nodes.current) if (el) resize.observe(el);
    return () => {
      resize.disconnect();
      observer.current = null;
    };
  }, [measure]);

  const refs = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => (el: HTMLElement | null) => {
        const prev = nodes.current[i];
        if (prev && prev !== el) observer.current?.unobserve(prev);
        nodes.current[i] = el;
        if (el) observer.current?.observe(el);
      }),
    [count],
  );

  return [refs, sizes] as const;
}

interface DeckCardViewProps {
  card: DeckCard;
  progress: MotionValue<number>;
  stage: Size;
  measure: (el: HTMLElement | null) => void;
  textStyle?: MotionStyle;
}

function DeckCardView({ card, progress, stage, measure, textStyle }: DeckCardViewProps) {
  const pose = useTransform(progress, (p) => cardPose(card.index, p, stage));
  const transform = useTransform(pose, cardTransform);
  const opacity = useTransform(pose, (s) => s.opacity);
  const filter = useTransform(pose, (s) => (s.blur > 0.05 ? `blur(${s.blur.toFixed(2)}px)` : "none"));
  const visibility = useTransform(pose, (s) => (s.shown ? "visible" : "hidden"));
  const { question, answer } = questionOf(card.beat);

  return (
    <BeatBody beat={card.rows} progress={progress}>
      <QuestionCard
        ref={measure}
        beat={card.beat}
        question={question}
        answer={answer}
        sparkles={card.sparkles}
        className={cn("absolute", SLOTS.center.column, STACKED_CARD)}
        style={{ left: `${CARD_REST.x * 100}%`, top: `${CARD_REST.y * 100}%`, transform, opacity, filter, visibility }}
        textStyle={textStyle}
      />
    </BeatBody>
  );
}

function Deck({ progress }: { progress: MotionValue<number> }) {
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [cardRefs, sizes] = useLayoutSizes(DECK.length);
  const frame = useTransform(progress, (p) => connectorFrame(p, stage, sizes));
  // The last card and the line dissolve as smoke with the section title (the smoke transition).
  const smoke = useSmokeMask(progress, smokeRange(LAST.def));

  return (
    <div ref={stageRef} aria-hidden data-question-deck className="pointer-events-none absolute inset-0">
      {DECK.map((card) => (
        <DeckCardView
          key={card.beat}
          card={card}
          progress={progress}
          stage={stage}
          measure={cardRefs[card.index]}
          textStyle={card === LAST ? smoke : undefined}
        />
      ))}
      <Connector frame={frame} style={smoke} />
    </div>
  );
}

export default function QuestionDeck() {
  const { progress } = useStory();
  const near = useProgressState(progress, deckNear);
  return near ? <Deck progress={progress} /> : null;
}
