// The hero's two time-driven events: the print-in on load and the signal ring. Everything else on
// the hero is a function of smoothed scroll `p` or breath; these two are the only things that run
// on a clock of their own, and neither loops.
//
// State is advanced from the pass's uniform callback (once per drawn frame, with the frame's own
// time), and read by the DOM copy layer, which runs after the draw in the same frame. Module-level
// on purpose: the pass and the copy layer share it without a store, and a new engine (strict-mode
// remount, context restore) restarts it when its frame counter goes back to zero.
import type { FrameCtx } from "../../frame";

/** The painting prints itself in from the orange over this long (seconds). */
export const INTRO_S = 2.2;
/** A ring decays within this long (seconds) and never loops. */
export const RING_S = 1.7;
/** Past this progress at the first frames, scroll restoration has landed: no intro. */
const SKIP_P = 0.0005;
/** If the hero video has not delivered a frame by now, print in anyway (seconds). */
const READY_TIMEOUT_S = 3;

type Phase = "wait" | "run" | "done";

interface HeroState {
  init: boolean;
  lastFrame: number;
  phase: Phase;
  /** Stage time the stage was first drawn, and when the print-in started. */
  t0: number;
  start: number;
  /** The hero loop has uploaded real pixels. */
  ready: boolean;
  /** 0..1: how far the painting has printed in. */
  intro: number;
  ringRequested: boolean;
  /** Stage time the ring left, or -1. */
  ringStart: number;
}

const state: HeroState = {
  init: false,
  lastFrame: -1,
  phase: "wait",
  t0: 0,
  start: 0,
  ready: false,
  intro: 0,
  ringRequested: false,
  ringStart: -1,
};

function reset(ctx: FrameCtx): void {
  state.init = true;
  state.phase = "wait";
  state.t0 = ctx.time;
  state.start = 0;
  state.ready = false;
  state.intro = 0;
  state.ringRequested = false;
  state.ringStart = -1;
}

export interface HeroTimeUniforms {
  /** 0..1 print-in progress (1 = complete, the pass skips the effect). */
  intro: number;
  /** Seconds since the ring left, or -1 when no ring is alive. */
  ringAge: number;
}

/** Advance the events for this frame and return what the shader needs. */
export function stepHero(ctx: FrameCtx): HeroTimeUniforms {
  if (!state.init || ctx.frame < state.lastFrame) reset(ctx);
  state.lastFrame = ctx.frame;

  if (state.phase === "wait") {
    if (ctx.reduced || ctx.p > SKIP_P || ctx.segment.id !== "hero") {
      state.phase = "done";
      state.intro = 1;
    } else if (state.ready || ctx.time - state.t0 > READY_TIMEOUT_S) {
      state.phase = "run";
      state.start = ctx.time;
    }
  }
  if (state.phase === "run") {
    state.intro = Math.min(1, Math.max(0, (ctx.time - state.start) / INTRO_S));
    if (state.intro >= 1) {
      state.phase = "done";
      // Fired once, when the hero finishes printing in.
      state.ringRequested = true;
    }
  }

  if (state.ringRequested) {
    state.ringRequested = false;
    if (!ctx.reduced) state.ringStart = ctx.time;
  }
  let ringAge = -1;
  if (!ctx.reduced && state.ringStart >= 0) {
    ringAge = ctx.time - state.ringStart;
    if (ringAge > RING_S) {
      ringAge = -1;
      state.ringStart = -1;
    }
  }
  return { intro: state.intro, ringAge };
}

/** Print-in progress for DOM layers (1 when complete or skipped). */
export function heroIntro(): number {
  return state.intro;
}

/** The hero loop has real pixels: the print-in may begin. */
export function markHeroReady(): void {
  state.ready = true;
}

/** Fire the ring from the glint (the hero button and a click on the canvas). */
export function fireRing(): void {
  state.ringRequested = true;
}
