/**
 * Design tokens for code that cannot read CSS variables cheaply: canvas, three.js materials,
 * GSAP and motion easing. Keep in sync with the raw tokens in `src/app/globals.css`.
 */

export const colors = {
  sky: "#1F4E9C",
  skySoft: "#6F9BD6",
  milk: "#F6F3EC",
  ink: "#15130F",
  press: "#0E0C0A",
  orange: "#FF7A00",
  leaf: "#476B35",
  marble: "#ECE7DD",
  white: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/** The one easing curve, as a cubic-bezier tuple (motion) and as CSS / GSAP strings. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Name registered with GSAP CustomEase by the scroll engine (phase 3). */
export const EASE_GSAP_NAME = "story";

/** Standard durations in seconds for time-driven (non-scroll) UI transitions. */
export const duration = {
  fast: 0.3,
  base: 0.6,
  slow: 1.2,
} as const;

/**
 * Layout grid as fractions of the stage width (top is a fraction of the viewport width too).
 * The ruler sits on `left`; text column A starts at `colA`, column B at `colB`.
 */
export const grid = {
  left: 0.053,
  right: 0.856,
  top: 0.053,
  colA: 0.08,
  colB: 0.24,
} as const;

/** Hairline opacity relative to the foreground color. */
export const HAIRLINE_ALPHA = 0.2;
