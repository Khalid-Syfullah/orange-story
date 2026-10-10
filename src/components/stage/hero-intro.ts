import * as React from "react";

import { ease, remap } from "@/lib/progress";

/**
 * The hero's short intro, played once per page view: the sky first, then the statue (with its
 * minaret and the orange), then the onlookers, then the text. It is the one time-driven move of the
 * hero (like the finale loop and the idle effects, it does not follow the scroll); once played, it
 * never plays again, so scrolling back up finds the finished frame.
 *
 * The stage canvas starts it when the hero's plates have loaded (so the sky never fades in before
 * its art exists), and the hero text waits for it. If the canvas never starts (no WebGL, a failed
 * load) the text still arrives after `INTRO.fallback` seconds.
 *
 * All times are in seconds from the start of the intro.
 */

export interface IntroSpan {
  /** When the move starts. */
  at: number;
  /** How long it takes. */
  duration: number;
}

export const INTRO = {
  sky: { at: 0, duration: 1.5 },
  minaret: { at: 0.8, duration: 1.3 },
  statue: { at: 1.0, duration: 1.4 },
  orange: { at: 1.7, duration: 0.9 },
  glow: { at: 1.9, duration: 1.6 },
  crowdFar: { at: 2.1, duration: 1 },
  crowdMid: { at: 2.3, duration: 1 },
  crowdNear: { at: 2.5, duration: 1 },
  /** The text starts to arrive: after the statue has appeared. */
  text: 2.2,
  /** The whole intro, for the clock that drives the plates. */
  total: 3.5,
  /** The text arrives anyway this long after load when the canvas has not started the intro. */
  fallback: 4.5,
} as const satisfies Record<string, IntroSpan | number>;

/** How far a move is at intro time `t`, 0 to 1, on the story curve. */
export function introAmount(t: number, span: IntroSpan): number {
  return ease(remap(t, span.at, span.at + span.duration));
}

/* The store: has the intro started, and may the text arrive? */

let startedAt: number | null = null;
let textReady = false;
let done = false;
let fallback: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Starts the intro (once). Returns false when it had already started. */
export function startHeroIntro(): boolean {
  if (startedAt !== null) return false;
  startedAt = performance.now();
  if (fallback) clearTimeout(fallback);
  setTimeout(() => {
    textReady = true;
    notify();
  }, INTRO.text * 1000);
  notify();
  return true;
}

/** Seconds of the intro that have played (0 before it starts, `INTRO.total` when finished). */
export function heroIntroElapsed(): number {
  if (done) return INTRO.total;
  if (startedAt === null) return 0;
  return Math.min(INTRO.total, (performance.now() - startedAt) / 1000);
}

/** The plates have finished their part of the intro. */
export function finishHeroIntro(): void {
  done = true;
}

/** True when the page already played the intro: the plates start in their final state. */
export const heroIntroFinished = () => done;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Armed by the first reader (the hero text, on the client): start the fallback timer once.
  if (startedAt === null && fallback === null && typeof window !== "undefined") {
    fallback = setTimeout(startHeroIntro, INTRO.fallback * 1000);
  }
  return () => listeners.delete(listener);
}

/**
 * True once the hero text may arrive (`INTRO.text` seconds into the intro). False on the server and
 * during hydration, so the server markup matches. A `load` beat that is not playing its intro never
 * needs it.
 */
export function useHeroTextReady(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => textReady,
    () => false,
  );
}
