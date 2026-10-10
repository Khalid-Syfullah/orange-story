"use client";

import * as React from "react";
import { motion, useTransform, type MotionValue, type Variants } from "motion/react";

import { cn } from "@/lib/utils";
import { ease, remap, type ProgressRange } from "@/lib/progress";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { EASE } from "@/styles/tokens";

/**
 * Per-character headline reveal. Each letter is its own span that rises and un-blurs in a short stagger.
 *
 * Two drivers:
 * - time: `trigger="inView"` (default) or `trigger="mount"` plays once the line is on screen or on load.
 * - scroll: pass `progress` and `range={[in, out]}`. Letters reveal over the start of the range and
 *   hide again (rising away) over its end, so the line plays the same both ways when scrubbed.
 *
 * Accessibility: the visible letters are `aria-hidden`; the full string is read from a visually
 * hidden copy, and headings also carry it as `aria-label`.
 */

type Tag = "h1" | "h2" | "h3" | "p" | "span" | "div";

const MOTION_TAGS = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  p: motion.p,
  span: motion.span,
  div: motion.div,
} as const;

interface BaseProps {
  text: string;
  as?: Tag;
  className?: string;
  /** Classes for every letter span. */
  charClassName?: string;
  /** Rise distance in em (default 0.45). */
  rise?: number;
  /** Peak blur in px (default 8). */
  blur?: number;
}

interface ScrubProps extends BaseProps {
  progress: MotionValue<number>;
  /** `[in, out]` in story progress. Use `out >= 1` (or `hide={false}`) to keep the line once revealed. */
  range: ProgressRange;
  /** Share of the range spent revealing, and again hiding (default 0.25). */
  revealShare?: number;
  hide?: boolean;
  trigger?: never;
}

interface TimeProps extends BaseProps {
  progress?: undefined;
  trigger?: "inView" | "mount";
  /** Play only the first time it enters the viewport (default true). */
  once?: boolean;
  delay?: number;
  /** Seconds between letters (default 0.022). */
  stagger?: number;
}

export type SplitRevealProps = ScrubProps | TimeProps;

interface Word {
  chars: { char: string; index: number }[];
}

function splitWords(text: string): { words: Word[]; count: number } {
  let index = 0;
  const words = text.split(" ").map((w) => ({ chars: Array.from(w).map((char) => ({ char, index: index++ })) }));
  return { words, count: index };
}

/** Letter state for the scrub driver: 0 hidden below, 1 shown, 2 hidden above. */
function letterState(
  p: number,
  i: number,
  n: number,
  [start, end]: ProgressRange,
  share: number,
  hide: boolean,
): number {
  const span = Math.max(0, end - start) * share;
  const charSpan = n > 1 ? span * 0.45 : span;
  const offset = n > 1 ? ((span - charSpan) * i) / (n - 1) : 0;
  const inS = start + offset;
  const shown = ease(remap(p, inS, inS + charSpan));
  if (!hide || end >= 1) return shown;
  const outS = end - span + offset;
  return shown + ease(remap(p, outS, outS + charSpan));
}

function ScrubChar({
  char,
  index,
  count,
  progress,
  range,
  share,
  hide,
  rise,
  blur,
  reduced,
  className,
}: {
  char: string;
  index: number;
  count: number;
  progress: MotionValue<number>;
  range: ProgressRange;
  share: number;
  hide: boolean;
  rise: number;
  blur: number;
  reduced: boolean;
  className?: string;
}) {
  const state = useTransform(progress, (p) => letterState(p, index, count, range, share, hide));
  const opacity = useTransform(state, (s) => (s <= 1 ? s : 2 - s));
  const y = useTransform(state, (s) => (reduced ? "0em" : `${(1 - s) * rise}em`));
  // At rest the letter has no filter at all (not `blur(0px)`), so settled text is not a filter surface.
  const filter = useTransform(state, (s) => {
    const amount = reduced ? 0 : Math.abs(1 - s) * blur;
    return amount > 0.01 ? `blur(${amount}px)` : "none";
  });
  return (
    <motion.span className={cn("inline-block will-change-transform", className)} style={{ opacity, y, filter }}>
      {char}
    </motion.span>
  );
}

export function SplitReveal(props: SplitRevealProps) {
  const { text, as = "span", className, charClassName, rise = 0.45, blur = 8 } = props;
  // Hydration-safe: false on the server and during hydration, so server markup always matches.
  const reduced = usePrefersReducedMotion() === true;
  const { words, count } = React.useMemo(() => splitWords(text), [text]);
  const MotionTag = MOTION_TAGS[as] as typeof motion.span;
  const isHeading = as === "h1" || as === "h2" || as === "h3";

  const letters = (render: (char: string, index: number) => React.ReactNode) => (
    <span aria-hidden>
      {words.map((word, w) => (
        <React.Fragment key={w}>
          {w > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap">{word.chars.map((c) => render(c.char, c.index))}</span>
        </React.Fragment>
      ))}
    </span>
  );
  const srText = <span className="sr-only">{text}</span>;

  if (props.progress) {
    const { progress, range, revealShare = 0.25, hide = true } = props;
    return (
      <MotionTag className={className} aria-label={isHeading ? text : undefined} data-split-reveal="scrub">
        {srText}
        {letters((char, index) => (
          <ScrubChar
            key={index}
            char={char}
            index={index}
            count={count}
            progress={progress}
            range={range}
            share={Math.min(0.5, Math.max(0.01, revealShare))}
            hide={hide}
            rise={rise}
            blur={blur}
            reduced={reduced}
            className={charClassName}
          />
        ))}
      </MotionTag>
    );
  }

  const { trigger = "inView", once = true, delay = 0, stagger = 0.022 } = props;
  const parent: Variants = {
    hidden: {},
    shown: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const child: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        // Rise and blur snap to rest: markup rendered before hydration carries the full hidden state.
        shown: {
          opacity: 1,
          y: "0em",
          filter: "blur(0px)",
          transition: { duration: 0.6, ease: EASE, y: { duration: 0 }, filter: { duration: 0 } },
          transitionEnd: { filter: "none" },
        },
      }
    : {
        hidden: { opacity: 0, y: `${rise}em`, filter: `blur(${blur}px)` },
        // Settled letters drop the filter entirely (see ScrubChar).
        shown: { opacity: 1, y: "0em", filter: "blur(0px)", transition: { duration: 0.9, ease: EASE }, transitionEnd: { filter: "none" } },
      };
  const driver =
    trigger === "mount"
      ? { initial: "hidden", animate: "shown" }
      : { initial: "hidden", whileInView: "shown", viewport: { once, amount: 0.6 } };

  return (
    <MotionTag
      className={className}
      aria-label={isHeading ? text : undefined}
      data-split-reveal={trigger}
      variants={parent}
      {...driver}
    >
      {srText}
      {letters((char, index) => (
        <motion.span key={index} className={cn("inline-block will-change-transform", charClassName)} variants={child}>
          {char}
        </motion.span>
      ))}
    </MotionTag>
  );
}
