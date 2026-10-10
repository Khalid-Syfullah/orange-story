"use client";

import * as React from "react";
import { motion, useMotionTemplate, useTransform, type MotionValue } from "motion/react";

import { cn } from "@/lib/utils";
import { ease, remap, type ProgressRange } from "@/lib/progress";

/**
 * A thin line that draws itself left to right along a hairline, scrubbed by `progress` (it undraws
 * when scrolling back). Optionally it leaves again over `erase`, retracting from the left so it reads
 * as one stroke passing through. Place it with `className` / `style` on a hairline (for example the
 * top hairline between the left and right grid lines).
 */
export interface ProgressLineProps {
  progress: MotionValue<number>;
  /** `[start, end]` of the draw in story progress. */
  range: ProgressRange;
  /** Optional `[start, end]` over which the drawn line retracts toward the right. */
  erase?: ProgressRange;
  className?: string;
  style?: React.CSSProperties;
}

export function ProgressLine({ progress, range, erase, className, style }: ProgressLineProps) {
  const drawn = useTransform(progress, (p) => 100 - ease(remap(p, range[0], range[1])) * 100);
  const erased = useTransform(progress, (p) => (erase ? ease(remap(p, erase[0], erase[1])) * 100 : 0));
  const clipPath = useMotionTemplate`inset(-1px ${drawn}% -1px ${erased}%)`;

  return (
    <motion.span
      aria-hidden
      data-progress-line
      className={cn("pointer-events-none block h-px bg-current opacity-80", className)}
      style={{ ...style, clipPath }}
    />
  );
}
