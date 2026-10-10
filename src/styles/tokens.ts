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

/** A mix of two palette colors as hex: `t` = 0 is `a`, 1 is `b` (for tints derived from the palette, never new colors). */
export function mixColors(a: ColorToken, b: ColorToken, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(colors[a], i) + (channel(colors[b], i) - channel(colors[a], i)) * t))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The one easing curve, as a cubic-bezier tuple (motion) and as CSS / GSAP strings. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Name of the same curve as a GSAP ease (`ease: "story"`), registered by `registerGsap()` in `src/scroll/stage-scroll.ts`. */
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

/**
 * The same grid on a stacked (phone) screen: the right line mirrors the left, and the top line sits
 * a fixed distance down (`top` in px), clear of the mark and the Apply pill in the top row. Keep in
 * sync with the stacked values of `--grid-right` and `--grid-top` in `src/app/globals.css`.
 */
export const stackedGrid = {
  left: 0.053,
  right: 0.947,
  topPx: 56,
} as const;

/** A hairline grid in pixels for a stage `width` px wide: where the left, right and top lines sit. */
export interface GridLines {
  left: (width: number) => number;
  right: (width: number) => number;
  top: (width: number) => number;
}

export const DESKTOP_GRID_LINES: GridLines = {
  left: (w) => grid.left * w,
  right: (w) => grid.right * w,
  top: (w) => grid.top * w,
};

export const STACKED_GRID_LINES: GridLines = {
  left: (w) => stackedGrid.left * w,
  right: (w) => stackedGrid.right * w,
  top: () => stackedGrid.topPx,
};

/** Hairline opacity relative to the foreground color. */
export const HAIRLINE_ALPHA = 0.2;
