"use client";

import * as React from "react";
import { motion, type MotionStyle } from "motion/react";

import { cn } from "@/lib/utils";
import type { CardCorner } from "@/scroll/types";

import { BeatLine } from "./beat";
import { SOFT_TEXT } from "./beat-content";

/**
 * A question card: the question as its title, the answer inside, on a clear glass panel (a hairline
 * border, a faint white fill and a blur of what lies behind; no shadow), with a pair of small
 * sparkles twinkling in one corner. Inside a beat the two rows arrive in order (title first, then
 * the answer) and leave with the beat's stagger; outside one they are plain text.
 *
 * The question deck (`question-deck.tsx`) moves the panel through `style` (its pose along the arc:
 * transform, opacity, blur, all on the panel itself so its glass keeps blurring the orchard behind
 * it) and dissolves the text through `textStyle` (the smoke mask on the last card).
 */

/** The sparkle sprite (`faq/sparkle` in the art manifest): final art replaces the file in place. */
const SPARKLE = "url(/art/faq/sparkle.webp)";

/** The two sparkles, from the corner inward (px along the card's edges): a larger one and a smaller one beside it. */
const SPARKLES = [
  { along: 18, down: 18, size: "size-5", duration: "2.8s", delay: "0s" },
  { along: 40, down: 9, size: "size-3", duration: "3.6s", delay: "-1.3s" },
] as const;

function Sparkles({ corner }: { corner: CardCorner }) {
  const top = corner.startsWith("top");
  const left = corner.endsWith("left");
  return (
    <span aria-hidden data-sparkles={corner} className="pointer-events-none absolute inset-0">
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className={cn("sparkle-twinkle absolute -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat", s.size)}
          style={{
            backgroundImage: SPARKLE,
            left: left ? `${s.along}px` : `calc(100% - ${s.along}px)`,
            top: top ? `${s.down}px` : `calc(100% - ${s.down}px)`,
            animationDuration: s.duration,
            animationDelay: s.delay,
          }}
        />
      ))}
    </span>
  );
}

export interface QuestionCardProps {
  question: string;
  answer: string;
  /** The corner holding the pair of sparkles. */
  sparkles?: CardCorner;
  className?: string;
  /** Styles for the panel (the deck's pose). */
  style?: MotionStyle;
  /** Styles for the text inside the panel (the smoke mask). */
  textStyle?: MotionStyle;
  ref?: React.Ref<HTMLDivElement>;
}

export function QuestionCard({ question, answer, sparkles = "top-right", className, style, textStyle, ref }: QuestionCardProps) {
  return (
    <motion.div
      ref={ref}
      data-question-card
      className={cn("rounded-lg border border-white/20 bg-white/[0.07] p-7 backdrop-blur-md sm:p-9", className)}
      style={style}
    >
      <Sparkles corner={sparkles} />
      {/* The masked box reaches past the text (without moving it), so the rising smoke is not cut off at the text's edges. */}
      <motion.div className={textStyle ? "-m-10 p-10" : undefined} style={textStyle}>
        <BeatLine index={0} count={2}>
          <h3 className="type-title">{question}</h3>
        </BeatLine>
        <BeatLine index={1} count={2} as="p" className={cn("type-body mt-5", SOFT_TEXT)}>
          {answer}
        </BeatLine>
      </motion.div>
    </motion.div>
  );
}
