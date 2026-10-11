/**
 * How fully a transition plays (pure):
 * - `full`: every grain, sheet and smear;
 * - `light`: a phone or the lowest quality tier: the same event with fewer particles and layers, and
 *   no stretch or smear;
 * - `calm`: reduced motion: no moving medium, a still painted veil the scenes cross-fade through.
 *
 * `?transitions=full`, `light` or `calm` forces one anywhere (to look at it, or to film it).
 */

export type TransitionMode = "full" | "light" | "calm";

export const TRANSITION_MODES: readonly TransitionMode[] = ["full", "light", "calm"];

/** Share of a medium's particles drawn in each mode. */
export const PARTICLE_SHARE: Readonly<Record<TransitionMode, number>> = { full: 1, light: 0.4, calm: 0 };

/** How many of its depth layers (drift sheets, plumes) a medium draws in each mode, at most. */
export const LAYER_LIMIT: Readonly<Record<TransitionMode, number>> = { full: 8, light: 2, calm: 0 };

/** The mode forced from the page's address, or null. */
export function transitionsOverride(search: string): TransitionMode | null {
  const value = new URLSearchParams(search).get("transitions");
  return value && (TRANSITION_MODES as readonly string[]).includes(value) ? (value as TransitionMode) : null;
}

export interface ModeInputs {
  /** A stacked (phone) layout. */
  stacked: boolean;
  /** The stage's quality tier (0 lowest). */
  tier: number;
  /** The visitor asked for reduced motion. */
  reduced: boolean;
  /** Forced from the address. */
  override?: TransitionMode | null;
}

export function transitionMode({ stacked, tier, reduced, override }: ModeInputs): TransitionMode {
  if (override) return override;
  if (reduced) return "calm";
  if (stacked || tier <= 0) return "light";
  return "full";
}

/** How many of `count` particles to draw in a mode (never fewer than one when any are drawn). */
export function particlesFor(count: number, mode: TransitionMode): number {
  const share = PARTICLE_SHARE[mode];
  return share <= 0 ? 0 : Math.max(1, Math.round(count * share));
}

/**
 * The mode the stage plays right now, for code that runs per plate in the frame loop and has no React
 * state of its own (a plate cut by the ring cross-fades instead in the calm mode). The transition
 * stage writes it every frame; outside a stage it stays `full`.
 */
let stageMode: TransitionMode = "full";

export function setStageTransitionMode(mode: TransitionMode): void {
  stageMode = mode;
}

export function stageTransitionMode(): TransitionMode {
  return stageMode;
}
