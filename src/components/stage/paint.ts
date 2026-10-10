import type { ScenePaint } from "@/scroll/script";

/**
 * The painted canvas the stage draws on, as numbers and pure functions (no React, no three). The
 * plate and halftone shaders in `materials.ts` do the same math on the GPU; the functions here are
 * its reference, unit-tested in `paint.test.ts`.
 *
 * - **Grain**: a fine canvas weave and paint tooth (`hero/canvas-grain`, one small tileable texture)
 *   over backdrops and stand-in plates, laid in the plate's own UV space so it moves with the art
 *   and never crawls while the camera moves. Painted plates carry their own and get none.
 * - **Craquelure**: an extremely faint crack network (`hero/craquelure`) over everything but the
 *   finished paintings, strongest on the paper-cream scenes (`SCENE_PAINT` in the script).
 * - **Grade**: a tiny per-scene colour grade on figure plates: warm highlights, cool shadows, a small
 *   saturation trim, so paintings made at different times match each other and the sky.
 * - **Figure light**: a soft sky-blue rim on the shadow edge (from the alpha gradient), a faint warm
 *   bounce from the ground, so the figures sit in the painted air.
 * - **Halftone**: the graphic layer over the painting (clouds, water, ripple rings): a dot grid at 45
 *   degrees in plate space, dot area following a soft tone through a smooth threshold.
 */

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export const CANVAS = {
  /** World units one tile of the grain texture covers on a plate (the weave's threads are a 64th of it). */
  grainTile: 1.6,
  /** Tiles of grain over the height of the screen, on a backdrop (the sky stays put on the screen). */
  grainTilesPerScreen: 5.5,
  /** How strongly the grain modulates the paint: a backdrop, a stand-in plate. */
  grainAmount: { backdrop: 0.075, plate: 0.06 },
  /** World units one tile of the craquelure covers (about ten cells across). */
  crackTile: 2.6,
  /** Tiles of craquelure over the height of the screen, on a backdrop. */
  crackTilesPerScreen: 3.2,
  /** How dark a crack gets at full scene strength (very low: it is felt, not seen). */
  crackAmount: 0.06,
} as const;

/** Grain and craquelure repeats over a plate `width` x `height` world units: [grain x, grain y, crack x, crack y]. */
export function canvasRepeat(width: number, height: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  out[0] = Math.abs(width) / CANVAS.grainTile;
  out[1] = Math.abs(height) / CANVAS.grainTile;
  out[2] = Math.abs(width) / CANVAS.crackTile;
  out[3] = Math.abs(height) / CANVAS.crackTile;
  return out;
}

/** The same on a backdrop that fills a screen of `aspect` (width over height): the tiles stay square on screen. */
export function backdropRepeat(aspect: number, out: [number, number, number, number] = [0, 0, 0, 0]): [number, number, number, number] {
  out[0] = CANVAS.grainTilesPerScreen * aspect;
  out[1] = CANVAS.grainTilesPerScreen;
  out[2] = CANVAS.crackTilesPerScreen * aspect;
  out[3] = CANVAS.crackTilesPerScreen;
  return out;
}

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/** The figure treatment: subtle on finished paintings, a little stronger on the stand-ins. */
export const FIGURE_LIGHT = {
  /** How far the sky-blue rim lifts the shadow edge. */
  rim: { painted: 0.2, standIn: 0.34 },
  /** The rim's reach inward from the edge, as a fraction of the plate's height. */
  rimReach: 0.006,
  /** Around a part's joint (where a head or an arm is cut to meet its body), no rim: a fraction of the plate's height. */
  jointClear: 0.14,
  /** The warm bounce from the ground on the lower part of a standing figure. */
  bounce: { painted: 0.06, standIn: 0.1 },
  /** How high above the feet the bounce reaches, as a fraction of the plate's height. */
  bounceReach: 0.28,
  /** The contact shadow under a standing figure: its opacity (painted, stand-in). */
  contact: { painted: 0.32, standIn: 0.42 },
} as const;

/** Toward the shadow side of every form: away from the sun at the upper left (image x right, y up). */
export const SHADOW_SIDE: readonly [number, number] = [0.66, -0.75];

/** Rim and bounce amounts for a figure plate. */
export function figureLight(painted: boolean): { rim: number; bounce: number; contact: number } {
  const key = painted ? "painted" : "standIn";
  return { rim: FIGURE_LIGHT.rim[key], bounce: FIGURE_LIGHT.bounce[key], contact: FIGURE_LIGHT.contact[key] };
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The scene grade on one linear RGB colour (0 to 1 channels): highlights lean toward `warm`, shadows
 * toward `cool` (both linear RGB, scaled to their own brightness so the grade shifts hue, not value),
 * then the saturation is trimmed. Mirrors `gradeColor` in the plate shader.
 */
export function gradeColor(rgb: readonly [number, number, number], grade: Pick<ScenePaint, "warm" | "cool" | "saturation">, warm: readonly [number, number, number], cool: readonly [number, number, number]): [number, number, number] {
  const l = luma(rgb[0], rgb[1], rgb[2]);
  const hi = smoothstep(0.3, 0.85, l);
  const lo = 1 - smoothstep(0.05, 0.45, l);
  const lw = luma(warm[0], warm[1], warm[2]) || 1;
  const lc = luma(cool[0], cool[1], cool[2]) || 1;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = rgb[i];
    c = c + (c * (warm[i] / lw) - c) * grade.warm * hi;
    c = c + (c * (cool[i] / lc) - c) * grade.cool * lo;
    out[i] = c;
  }
  const l2 = luma(out[0], out[1], out[2]);
  for (let i = 0; i < 3; i++) out[i] = l2 + (out[i] - l2) * (1 + grade.saturation);
  return out;
}

/* ------------------------------------------------------------------ */
/* Halftone                                                            */
/* ------------------------------------------------------------------ */

export const HALFTONE = {
  /** World size of one dot cell on a cloud. */
  cloudCell: 0.12,
  /** World size of one dot cell on the water. */
  waterCell: 0.03,
  /** World size of one dot cell in the hero's ripple rings. */
  ringCell: 0.11,
  /** Below this many screen pixels per cell the dots would alias: they give way to the plain soft version. */
  minCellPx: 2.5,
  /** And are fully there from this many. */
  fullCellPx: 4,
  /** The soft tone's threshold: tones below `low` give no dot, tones above `high` a full cell. */
  low: 0.04,
  high: 0.96,
} as const;

/** The smooth threshold: the soft tone (0 to 1) to the share of the cell a dot covers (0 to 1). */
export function halftoneTone(tone: number): number {
  return smoothstep(HALFTONE.low, HALFTONE.high, tone);
}

/**
 * Radius of the dot for a soft tone, in cell units: the dot's area follows the threshold curve, and a
 * full tone reaches the corners (0.71) so neighbouring dots merge into solid paint. Zero at tone 0
 * and continuous everywhere, so dots grow and shrink without popping.
 */
export function halftoneRadius(tone: number): number {
  return Math.SQRT1_2 * Math.sqrt(halftoneTone(tone));
}

/**
 * Coverage of the cell at `[x, y]` (cell units, already rotated) for a tone, anti-aliased over `aa`
 * cell units: 1 inside the dot, 0 outside.
 */
export function halftoneCoverage(x: number, y: number, tone: number, aa: number): number {
  const fx = x - Math.floor(x) - 0.5;
  const fy = y - Math.floor(y) - 0.5;
  const d = Math.hypot(fx, fy);
  const r = halftoneRadius(tone);
  if (r <= 0) return 0;
  return 1 - smoothstep(r - aa, r + aa, d);
}

/** Rotates plate coordinates into the 45-degree dot grid. */
export function halftoneGrid(u: number, v: number): [number, number] {
  return [Math.SQRT1_2 * (u - v), Math.SQRT1_2 * (u + v)];
}

/**
 * The hero's ripple rings: how strong the ring wave is at distance `r` (world units) from the orange
 * at ripple time `time`, 0 to 1. Eight fronts spread from the source in step with the glow's
 * droplets (the same timing as the ripple shader), each a soft band that is born, travels out and
 * fades before the edge.
 */
export const RINGS = { count: 8, speed: 0.045, start: 0.45, width: 0.24 } as const;

export function ringTone(r: number, time: number, reach: number): number {
  let tone = 0;
  for (let k = 0; k < RINGS.count; k++) {
    const life = (((k / RINGS.count + time * RINGS.speed) % 1) + 1) % 1;
    const radius = RINGS.start + reach * Math.pow(life, 0.62);
    const born = smoothstep(0, 0.12, life) * (1 - smoothstep(0.35, 1, life));
    const d = (r - radius) / (RINGS.width * (0.6 + life));
    tone = Math.max(tone, Math.exp(-d * d) * born);
  }
  return tone;
}
