"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

import { chrome } from "@/content/copy";
import { cn } from "@/lib/utils";
import { clamp01 } from "@/lib/progress";

/**
 * Bottom-right mono readout of overall scroll progress, "0%" to "100%", in tabular figures.
 * The text is a motion value, so it updates without React re-renders. Decorative for screen readers
 * (the ruler already exposes the current chapter).
 */
export function PercentCounter({ progress, className }: { progress: MotionValue<number>; className?: string }) {
  const text = useTransform(progress, (p) => chrome.percent(clamp01(p) * 100));
  return (
    <motion.span aria-hidden data-percent className={cn("type-meta inline-block min-w-[4ch] text-right tabular-nums", className)}>
      {text}
    </motion.span>
  );
}
