"use client";

import * as React from "react";
import { motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";

import { ease, remap, type ProgressRange } from "@/lib/progress";

/**
 * Blur, fade and drift for content leaving the stage (the hero copy drifting left, the smoke-out
 * after the questions). Scrubbed by `progress`: fully present before `out[0]`, gone at `out[1]`,
 * and back again when scrolling up. An optional `in` range plays the same move in reverse on arrival.
 */
export type BlurFadeDirection = "left" | "right" | "up" | "down";

export interface BlurFadeProps {
  progress: MotionValue<number>;
  /** `[start, end]` of the leaving move in story progress. */
  out: ProgressRange;
  /** Optional `[start, end]` of an arriving move (the leave played backwards). */
  in?: ProgressRange;
  direction?: BlurFadeDirection;
  /** Drift distance in px (default 32). */
  distance?: number;
  /** Peak blur in px (default 14). */
  blur?: number;
  /** Scale reached when gone (default 1; smoke uses a little growth, e.g. 1.04). */
  scale?: number;
  as?: "div" | "span" | "p";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const VECTORS: Record<BlurFadeDirection, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

const MOTION_TAGS = { div: motion.div, span: motion.span, p: motion.p } as const;

export function BlurFade({
  progress,
  out,
  in: enter,
  direction = "left",
  distance = 32,
  blur = 14,
  scale = 1,
  as = "div",
  className,
  style,
  children,
}: BlurFadeProps) {
  const reduced = useReducedMotion() ?? false;
  /** 0 = present, 1 = gone. Arrivals come from the opposite side of the leave. */
  const gone = useTransform(progress, (p) => {
    const leaving = ease(remap(p, out[0], out[1]));
    if (!enter) return leaving;
    const arriving = 1 - ease(remap(p, enter[0], enter[1]));
    return p < out[0] ? -arriving : leaving;
  });
  const [vx, vy] = VECTORS[direction];
  const opacity = useTransform(gone, (g) => 1 - Math.abs(g));
  const x = useTransform(gone, (g) => (reduced ? 0 : g * vx * distance));
  const y = useTransform(gone, (g) => (reduced ? 0 : g * vy * distance));
  const filter = useTransform(gone, (g) => (reduced ? "none" : `blur(${Math.abs(g) * blur}px)`));
  const s = useTransform(gone, (g) => (reduced ? 1 : 1 + Math.abs(g) * (scale - 1)));
  const visibility = useTransform(gone, (g) => (Math.abs(g) >= 0.999 ? "hidden" : "visible"));
  const Tag = MOTION_TAGS[as] as typeof motion.div;

  return (
    <Tag className={className} style={{ ...style, opacity, x, y, filter, scale: s, visibility }} data-blur-fade>
      {children}
    </Tag>
  );
}
