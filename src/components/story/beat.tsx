"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, type MotionStyle, type MotionValue } from "motion/react";

import { cn } from "@/lib/utils";
import { ease, remap } from "@/lib/progress";
import { useSmokeMask } from "@/components/motion/smoke-out";
import { beatEnterAmount, beatLeaveAmount, beatLineRanges, beatOf, inBeat, smokeRange } from "@/scroll/helpers";
import { useBeatMounted, useStory } from "@/scroll/story-scroll";
import type { BeatDef, BeatEnter, BeatId, BeatLeave } from "@/scroll/types";
import { EASE } from "@/styles/tokens";

import { useHeroTextReady } from "@/components/stage/hero-intro";

import { BeatContent } from "./beat-content";
import { SLOTS } from "./slots";

/**
 * One text beat from the script, in its slot, only inside its range.
 *
 * - The content mounts shortly before the beat arrives and unmounts after it leaves (state changes
 *   only at those two points). `keepMounted` keeps stateful content (the form) alive instead.
 * - Outside `[in, out)` the box is hidden; inside it the arrival and the leave are scrubbed by
 *   progress, so scrolling up plays them backwards exactly.
 * - The box itself does the whole-block moves (zoom, dock, swing, sink, smoke rise). Lines inside
 *   use `useBeatLine` for their staggered fade, blur and drift, so custom content from the scene
 *   phases gets the same timing by rendering `<BeatLine>` rows.
 * - A beat that leaves as smoke also dissolves through the smoke noise mask (`useSmokeMask`), over
 *   the range of its smoke transition, so a group of beats dissolves together.
 *
 * Children replace the default content (`BeatContent`, which renders the beat's copy key).
 */

interface BeatContextValue {
  beat: BeatDef;
  progress: MotionValue<number>;
  /** A `load` beat plays its timed intro (once per page load). */
  intro: boolean;
}

const BeatContext = React.createContext<BeatContextValue | null>(null);

/** The beat around this component, or null when rendered statically (the reduced-motion page). */
export function useBeatContext(): BeatContextValue | null {
  return React.useContext(BeatContext);
}

/** `load` beats whose timed intro has already played in this page view. */
const introsPlayed = new Set<BeatId>();

/**
 * Beats hidden from assistive technology: the stage draws every beat as scrubbed, short-lived
 * decoration, and the same words are always on the page in reading order (`StoryOutline`). The
 * form is the one beat that is the real thing, so it is not hidden.
 */
export const decorativeBeat = (id: BeatId) => id !== "apply-form";

/**
 * Whether links and buttons inside can be reached with the Tab key. Controls inside decorative
 * beats are not: they sit in a hidden subtree, and their keyboard equivalents (the Apply pill, the
 * skip link, the outline's links for screen readers) go to the same places. The reduced-motion
 * page leaves everything tabbable.
 */
export const TabbableContext = React.createContext(true);

export interface BeatProps {
  id: BeatId;
  children?: React.ReactNode;
  keepMounted?: boolean;
  className?: string;
}

export function Beat({ id, children, keepMounted = false, className }: BeatProps) {
  const { progress } = useStory();
  const beat = beatOf(id);
  const mounted = useBeatMounted(beat, progress, keepMounted);
  const style = useBlockStyle(beat, progress);
  const smoke = smokeRange(beat);
  const slot = SLOTS[beat.slot];

  const block = (
    <motion.div className={cn(slot.box, className)} style={{ ...style, transformOrigin: slot.origin }}>
      {mounted ? (
        <BeatBody beat={beat} progress={progress}>
          {children ?? <BeatContent />}
        </BeatBody>
      ) : null}
    </motion.div>
  );

  return smoke ? (
    <SmokeFrame beat={beat} range={smoke} progress={progress}>
      {block}
    </SmokeFrame>
  ) : (
    <div data-beat={id} data-slot={beat.slot} aria-hidden={decorativeBeat(id) || undefined} className="pointer-events-none absolute inset-0">
      {block}
    </div>
  );
}

/** The full-stage frame of a beat that leaves as smoke: it carries the smoke mask, so the rising, blurring text never leaves it. */
function SmokeFrame({ beat, range, progress, children }: { beat: BeatDef; range: readonly [number, number]; progress: MotionValue<number>; children: React.ReactNode }) {
  const mask = useSmokeMask(progress, range);
  return (
    <motion.div data-beat={beat.id} data-slot={beat.slot} aria-hidden={decorativeBeat(beat.id) || undefined} className="pointer-events-none absolute inset-0" style={mask}>
      {children}
    </motion.div>
  );
}

/**
 * The mounted content of a beat. A `load` beat's timed intro is decided when the content mounts:
 * only its first mount in a page view plays it. Content that unmounted (scrolled far away) and
 * mounts again on the way back returns scrubbed only, so scrolling up never replays the intro.
 *
 * Groups that place their beats themselves (the question deck) wrap each beat's content in it, so
 * `BeatLine` rows inside keep that beat's timing.
 */
export function BeatBody({ beat, progress, children }: { beat: BeatDef; progress: MotionValue<number>; children: React.ReactNode }) {
  const [intro] = React.useState(() => beat.enter === "load" && !introsPlayed.has(beat.id));

  React.useEffect(() => {
    if (beat.enter === "load") introsPlayed.add(beat.id);
  }, [beat]);

  const context = React.useMemo(() => ({ beat, progress, intro }), [beat, progress, intro]);
  return (
    <BeatContext value={context}>
      <TabbableContext value={!decorativeBeat(beat.id)}>{children}</TabbableContext>
    </BeatContext>
  );
}

/* ------------------------------------------------------------------ */
/* Whole-block moves                                                   */
/* ------------------------------------------------------------------ */

/**
 * Where the block is in its life at p, as one number: -1 not arrived, 0 on screen, 1 gone (eased).
 * The arrival plays before the hold ends, the leave after; both are scrubbed.
 */
function blockPhase(beat: BeatDef, p: number): number {
  if (p < beat.hold[1]) return -(1 - ease(beatEnterAmount(beat, p)));
  return ease(beatLeaveAmount(beat, p));
}

/** Block transforms per kind. x in vw, y in vh, rotate in degrees. */
const blockX = (beat: BeatDef, s: number) => (s > 0 && beat.leave === "swing-left" ? -34 * s : 0);

function blockY(beat: BeatDef, s: number): number {
  if (s < 0) return beat.enter === "dock" ? -s * 62 : beat.enter === "zoom" ? -s * 4 : 0;
  if (beat.leave === "swing-left") return -Math.sin(s * Math.PI) * 5 + s * 2;
  if (beat.leave === "sink") return s * 3;
  if (beat.leave === "smoke") return -s * 3;
  return 0;
}

function blockScale(beat: BeatDef, s: number): number {
  if (s < 0) return beat.enter === "dock" ? 1 - s * 1.7 : beat.enter === "zoom" ? 1 + s * 0.45 : 1;
  if (beat.leave === "swing-left") return 1 - 0.38 * s;
  if (beat.leave === "sink") return 1 - 0.08 * s;
  if (beat.leave === "smoke") return 1 + 0.04 * s;
  return 1;
}

const blockRotate = (beat: BeatDef, s: number) => (s > 0 && beat.leave === "swing-left" ? -4 * s : 0);

function useBlockStyle(beat: BeatDef, progress: MotionValue<number>): MotionStyle {
  const phase = useTransform(progress, (p) => blockPhase(beat, p));
  const x = useTransform(phase, (s) => `${blockX(beat, s)}vw`);
  const y = useTransform(phase, (s) => `${blockY(beat, s)}vh`);
  const scale = useTransform(phase, (s) => blockScale(beat, s));
  const rotate = useTransform(phase, (s) => blockRotate(beat, s));
  const visibility = useTransform(progress, (p) => (inBeat(beat, p) ? "visible" : "hidden"));
  // Clickable while fully on screen (buttons, links, the form).
  const pointerEvents = useTransform(progress, (p) => (inBeat(beat, p) && p >= beat.hold[0] && p <= beat.hold[1] ? "auto" : "none"));
  return { x, y, scale, rotate, visibility, pointerEvents };
}

/* ------------------------------------------------------------------ */
/* Lines                                                               */
/* ------------------------------------------------------------------ */

/** Peak blur (px) and drift (px) of a line, per arrival and leave kind. */
const ARRIVE: Record<BeatEnter, { blur: number; x: number; y: number }> = {
  load: { blur: 0, x: 0, y: 0 },
  reveal: { blur: 10, x: 0, y: 18 },
  fade: { blur: 10, x: 0, y: 10 },
  zoom: { blur: 8, x: 0, y: 0 },
  dock: { blur: 6, x: 0, y: 0 },
};

const LEAVE: Record<BeatLeave, { blur: number; x: number; y: number }> = {
  "drift-left": { blur: 14, x: -48, y: 0 },
  fade: { blur: 10, x: 0, y: -6 },
  smoke: { blur: 16, x: 0, y: -28 },
  sink: { blur: 10, x: 0, y: 0 },
  "swing-left": { blur: 8, x: 0, y: 0 },
  hold: { blur: 0, x: 0, y: 0 },
};

export interface BeatLineOptions {
  /** Let the line fade in with the stagger (default true). Off for lines that reveal themselves. */
  arrive?: boolean;
}

/**
 * Scrubbed style for line `index` of `count` in the surrounding beat: a staggered arrival and leave
 * (opacity, blur, drift). Returns null outside a beat, so static pages render plain text.
 */
export function useBeatLine(index: number, count: number, { arrive = true }: BeatLineOptions = {}): MotionStyle | null {
  const context = useBeatContext();
  const fallback = useMotionValue(0);
  const progress = context?.progress ?? fallback;
  const beat = context?.beat;
  const ranges = React.useMemo(() => (beat ? beatLineRanges(beat, index, count) : null), [beat, index, count]);

  /** -1 not arrived, 0 on screen, 1 gone. */
  const state = useTransform(progress, (p) => {
    if (!beat || !ranges) return 0;
    if (p >= ranges.leave[0] && beat.leave !== "hold") return ease(remap(p, ranges.leave[0], ranges.leave[1]));
    if (!arrive || beat.enter === "load") return 0;
    return -(1 - ease(remap(p, ranges.arrive[0], ranges.arrive[1])));
  });

  const enterKind = context?.beat.enter ?? "load";
  const leaveKind = context?.beat.leave ?? "hold";
  const opacity = useTransform(state, (s) => 1 - Math.abs(s));
  const filter = useTransform(state, (s) => {
    const blur = s < 0 ? -s * ARRIVE[enterKind].blur : s * LEAVE[leaveKind].blur;
    return blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : "none";
  });
  const x = useTransform(state, (s) => (s < 0 ? -s * ARRIVE[enterKind].x : s * LEAVE[leaveKind].x));
  const y = useTransform(state, (s) => (s < 0 ? -s * ARRIVE[enterKind].y : s * LEAVE[leaveKind].y));

  return context ? { opacity, filter, x, y } : null;
}

/** The arrival amount of the whole beat (0 to 1, eased) times what is left of it: for panels. */
export function useBeatPresence(): MotionValue<number> | null {
  const context = useBeatContext();
  const fallback = useMotionValue(1);
  const presence = useTransform(context?.progress ?? fallback, (p) => {
    if (!context) return 1;
    const { beat } = context;
    const arrived = beat.enter === "load" ? 1 : ease(beatEnterAmount(beat, p));
    return arrived * (1 - ease(beatLeaveAmount(beat, p)));
  });
  return context ? presence : null;
}

export interface BeatLineProps extends BeatLineOptions {
  index: number;
  count: number;
  as?: "div" | "p" | "span";
  className?: string;
  children: React.ReactNode;
}

const LINE_TAGS = { div: motion.div, p: motion.p, span: motion.span } as const;

/**
 * A row of a beat with the staggered arrival and leave. Inside a `load` beat on first page load it
 * also plays the short timed intro (rise and un-blur), in order. Rows that reveal themselves (a
 * per-letter headline) pass `arrive={false}` and skip both.
 */
export function BeatLine({ index, count, arrive = true, as = "div", className, children }: BeatLineProps) {
  const style = useBeatLine(index, count, { arrive });
  const context = useBeatContext();
  // The hero text waits for the sky and the statue (see `hero-intro.ts`).
  const ready = useHeroTextReady();
  const Tag = LINE_TAGS[as] as typeof motion.div;

  if (!style) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  if (!(context?.intro && arrive)) {
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }

  // The timed intro plays on an inner element, so it never fights the scrubbed style of the row.
  // The inner element takes the row's classes, so a row laid out as a grid (tag in column A, text
  // in column B) keeps its cells as direct children; inside a paragraph it is a block span.
  const Intro = as === "div" ? motion.div : motion.span;
  return (
    <Tag style={style}>
      <Intro
        className={cn(as === "div" ? undefined : "block", className)}
        initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
        animate={ready ? { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } } : { opacity: 0, y: 14, filter: "blur(8px)" }}
        transition={{ duration: 0.9, delay: 0.25 + index * 0.14, ease: EASE }}
      >
        {children}
      </Intro>
    </Tag>
  );
}
