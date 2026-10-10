"use client";

import * as React from "react";
import { motion, useMotionTemplate, useTransform, type MotionValue } from "motion/react";

import { ease, remap } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import type { BeatId } from "@/scroll/types";

/**
 * The thin line graphic that joins the service cards: a vertical hairline beside the right column
 * with one small square per card. The line draws down as the first card arrives and reaches the
 * next square as each following card arrives; a square fills while its card is on screen. All of it
 * is scrubbed by `progress` using the beats' own ranges, so it plays backwards exactly.
 */
const CARDS = ["card-1", "card-2", "card-3"] as const satisfies readonly BeatId[];

/** Height of the line, as a fraction of the stage, centered on the cards (the right slot is centered). */
const SPAN = { top: 28, bottom: 72 };

const nodeAt = (i: number) => SPAN.top + ((SPAN.bottom - SPAN.top) * i) / (CARDS.length - 1);

function Node({ progress, index }: { progress: MotionValue<number>; index: number }) {
  const beat = beatOf(CARDS[index]);
  const fill = useTransform(progress, (p) => {
    const arrive = ease(remap(p, beat.in, beat.hold[0]));
    const leave = index === CARDS.length - 1 ? 0 : ease(remap(p, beat.hold[1], beat.out));
    return Math.max(0, arrive - leave);
  });
  const opacity = useTransform(fill, (f) => 0.35 + 0.65 * f);
  const scale = useTransform(fill, (f) => 0.8 + 0.4 * f);
  return (
    <motion.span
      aria-hidden
      className="absolute size-2 -translate-x-1/2 -translate-y-1/2 border border-current bg-current"
      style={{ top: `${nodeAt(index)}%`, left: "50%", opacity, scale }}
    />
  );
}

export function ServiceThread({ progress, className }: { progress: MotionValue<number>; className?: string }) {
  const first = beatOf(CARDS[0]);
  const last = beatOf(CARDS[CARDS.length - 1]);
  // 0 to 100: how far down the line is drawn; each card's arrival carries it on to that card's square.
  const drawn = useTransform(progress, (p) => {
    let amount = 0;
    for (let i = 1; i < CARDS.length; i++) {
      const b = beatOf(CARDS[i]);
      amount += ease(remap(p, b.in, b.hold[0]));
    }
    return (amount / (CARDS.length - 1)) * 100;
  });
  const gone = useTransform(progress, (p) => ease(remap(p, last.hold[1], last.out)) * 100);
  const hidden = useTransform(drawn, (d) => 100 - d);
  const clipPath = useMotionTemplate`inset(${hidden}% 0 ${gone}% 0)`;
  const wrap = useTransform(progress, (p) => ease(remap(p, first.in, first.hold[0])) * (1 - ease(remap(p, last.hold[1], last.out))));

  return (
    <motion.div
      aria-hidden
      data-service-thread
      className={className}
      style={{ position: "absolute", top: 0, bottom: 0, left: "calc(52% - 2rem)", width: 0, opacity: wrap }}
    >
      <motion.span
        className="absolute w-px bg-current opacity-70"
        style={{ top: `${SPAN.top}%`, height: `${SPAN.bottom - SPAN.top}%`, left: 0, clipPath }}
      />
      {CARDS.map((_, i) => (
        <Node key={i} progress={progress} index={i} />
      ))}
    </motion.div>
  );
}
