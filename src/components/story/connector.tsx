"use client";

import { motion, useTransform, type MotionStyle, type MotionValue } from "motion/react";

import type { ConnectorFrame } from "./question-plan";

/**
 * The one connector of the question deck, re-pointed at whichever card is on stage: a thin line
 * whose end is fixed on the card's anchor orange (with a small dot on the fruit), and a small square
 * locked to the card's chosen corner, turning with the card. The line draws out from the orange as
 * the card arrives, the square snaps onto the corner as the line reaches it, and both follow the
 * card's corner while it moves. Everything comes from `frame` (`connectorFrame` in
 * `question-plan.ts`), a function of progress, so it plays backwards exactly. Decorative.
 */

/** Side of the square, and radius of the dot on the orange, in px. */
const SQUARE = 7;
const DOT = 2.5;

const NOTHING = "M0 0";
const n = (v: number) => v.toFixed(1);

/** A square of side `side` centered on `[x, y]`, turned `rotate` degrees clockwise. */
function squarePath([x, y]: readonly [number, number], rotate: number, side: number): string {
  const r = (rotate * Math.PI) / 180;
  const h = side / 2;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const corner = (sx: number, sy: number) => `${n(x + sx * h * cos - sy * h * sin)} ${n(y + sx * h * sin + sy * h * cos)}`;
  return `M${corner(-1, -1)}L${corner(1, -1)}L${corner(1, 1)}L${corner(-1, 1)}Z`;
}

export function Connector({ frame, style }: { frame: MotionValue<ConnectorFrame | null>; style?: MotionStyle }) {
  const line = useTransform(frame, (f) => (f && f.draw > 0 ? `M${n(f.anchor[0])} ${n(f.anchor[1])}L${n(f.end[0])} ${n(f.end[1])}` : NOTHING));
  const square = useTransform(frame, (f) => (f && f.lock > 0 ? squarePath(f.corner, f.rotate, SQUARE * f.lock) : NOTHING));
  const dotX = useTransform(frame, (f) => (f ? f.anchor[0] : -100));
  const dotY = useTransform(frame, (f) => (f ? f.anchor[1] : -100));
  const dot = useTransform(frame, (f) => (f ? Math.min(1, f.draw * 6) : 0));
  const opacity = useTransform(frame, (f) => f?.opacity ?? 0);

  return (
    <motion.div data-connector className="pointer-events-none absolute inset-0" style={style}>
      <motion.svg aria-hidden className="absolute inset-0 size-full overflow-visible" style={{ opacity }}>
        <motion.path d={line} fill="none" stroke="currentColor" strokeWidth={1} strokeOpacity={0.85} strokeLinecap="round" />
        <motion.circle cx={dotX} cy={dotY} r={DOT} fill="currentColor" style={{ opacity: dot }} />
        <motion.path d={square} fill="currentColor" />
      </motion.svg>
    </motion.div>
  );
}
