"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

import { cn } from "@/lib/utils";
import { remap, type ProgressRange } from "@/lib/progress";

/**
 * Types a line letter by letter, scrubbed by `progress`: it types across `range` and un-types when
 * scrolling back. The typed text and caret are motion values, so no React state changes per frame.
 * The full line is rendered invisibly underneath to reserve its final size, so nothing reflows while
 * it types. Screen readers get the whole line from a visually hidden copy.
 */
export interface TypewriterProps {
  text: string;
  progress: MotionValue<number>;
  /** `[start, end]` in story progress: the first letter appears at start, the last at end. */
  range: ProgressRange;
  as?: "p" | "span" | "div";
  className?: string;
  /** Hide the caret once the line is fully typed (default false: it keeps blinking). */
  caretHideOnDone?: boolean;
}

const MOTION_TAGS = { p: motion.p, span: motion.span, div: motion.div } as const;

export function Typewriter({ text, progress, range, as = "p", className, caretHideOnDone = false }: TypewriterProps) {
  const chars = Array.from(text);
  const count = (p: number) => Math.round(remap(p, range[0], range[1]) * chars.length);
  const typed = useTransform(progress, (p) => chars.slice(0, count(p)).join(""));
  const caretOpacity = useTransform(progress, (p) => {
    const n = count(p);
    if (n === 0) return 0;
    if (caretHideOnDone && n >= chars.length) return 0;
    return 1;
  });
  const Tag = MOTION_TAGS[as] as typeof motion.p;

  return (
    <Tag className={cn("relative", className)} data-typewriter>
      <span className="sr-only">{text}</span>
      {/* Reserves the final size of the line. */}
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0">
        <motion.span>{typed}</motion.span>
        {/* Outer span: scrubbed visibility. Inner span: the idle blink (time-based, allowed). */}
        <motion.span className="ml-px inline-block align-baseline" style={{ opacity: caretOpacity }}>
          <span className="caret-blink inline-block h-[1.05em] w-px translate-y-[0.15em] bg-current" />
        </motion.span>
      </span>
    </Tag>
  );
}
