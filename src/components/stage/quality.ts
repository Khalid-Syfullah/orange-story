/**
 * Rendering budgets for the stage canvas: device pixel ratio, texture size, depth of field and how
 * long unused textures stay on the GPU. One place to tune them.
 */

/** Device pixel ratio range of the stage canvas: never below 1, never above `MAX_DPR`. */
export const MIN_DPR = 1;
export const MAX_DPR = 1.5;
/** The same on a stacked screen (a phone): a lower ceiling, since the screen is small and the battery is not. */
export const MAX_DPR_STACKED = 1.25;

/** The stage canvas's pixel ratio range for a layout. */
export const stageDpr = (stacked: boolean): [number, number] => [MIN_DPR, stacked ? MAX_DPR_STACKED : MAX_DPR];

/**
 * Highest pixel ratio of the transition canvas. Its effects are soft (fronts, noise, fine grains),
 * so it renders at a lower resolution than the plates: every pixel runs a full-screen shader.
 */
export const TRANSITION_MAX_DPR = 1.25;
/** The same on a stacked screen. */
export const TRANSITION_MAX_DPR_STACKED = 1;

/** The transition canvas's pixel ratio range for a layout. */
export const transitionDpr = (stacked: boolean): [number, number] => [1, stacked ? TRANSITION_MAX_DPR_STACKED : TRANSITION_MAX_DPR];

/** Share of the loose particles (glow droplets, the sand's grains) drawn on a stacked screen. */
export const PARTICLE_SCALE_STACKED = 0.5;

/** How many of `count` particles to draw on a layout. */
export const particleCount = (count: number, stacked: boolean): number => (stacked ? Math.max(1, Math.round(count * PARTICLE_SCALE_STACKED)) : count);

/** Screens of scrolling before a transition when its art (ring mask, cloud) starts to load. */
export const TRANSITION_PRELOAD_SCREENS = 3;

/** Longest side of a plate texture on the GPU, in pixels. Larger images are scaled down on load. */
export const TEXTURE_CAP = 2048;
/** The same on low-memory and small touch devices. */
export const TEXTURE_CAP_LOW = 1024;

/** True on devices that should get the smaller texture budget. Browser only. */
function lowEndDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory <= 4) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse && Math.min(window.screen.width, window.screen.height) < 600;
}

/** The texture size cap for this device, never above what the GPU supports. */
export function textureCap(maxTextureSize: number): number {
  return Math.min(maxTextureSize, lowEndDevice() ? TEXTURE_CAP_LOW : TEXTURE_CAP);
}

/**
 * Depth of field on plates: blur grows with how far a plate is from the camera's focus (the
 * distance to the camera target), as a fraction of the view height.
 */
export const DEPTH_OF_FIELD = {
  /** Blur per unit of relative defocus, |distance - focus| / distance. */
  aperture: 0.012,
  /** The most blur depth of field adds. */
  max: 0.008,
} as const;

/** Blur below this many screen pixels is skipped (one texture read instead of a ring of them). */
export const MIN_BLUR_PX = 0.75;

/** Milliseconds a texture stays on the GPU after the last plate using it unmounts. */
export const TEXTURE_RELEASE_MS = 4000;

/** Longest step of idle time per frame, in seconds, so a pause never makes sway or twinkle jump. */
export const IDLE_MAX_STEP = 1 / 30;

/* ------------------------------------------------------------------ */
/* Adaptive quality                                                    */
/* ------------------------------------------------------------------ */

/**
 * The stage canvas watches its own frame times while it renders continuously (scrolling, or idle
 * effects on screen) and trades resolution for smoothness on a slow device: after `slowFor` seconds
 * of frames slower than `slow` it lowers the pixel ratio a step (down to `floor`), and after
 * `quickFor` seconds of frames quicker than `quick` it raises it again (up to the layout's cap).
 * Gaps longer than `gap` are pauses (the canvas only renders on demand), not slow frames.
 */
export const ADAPTIVE = {
  slow: 1 / 45,
  quick: 1 / 57,
  slowFor: 1.2,
  quickFor: 4,
  stepDown: 0.8,
  stepUp: 1.15,
  floor: 0.75,
  gap: 0.25,
} as const;

/** Running state of the adaptive pixel ratio (one per canvas). */
export interface FrameBudget {
  /** Smoothed seconds per frame. */
  average: number;
  /** Seconds the average has been slow, or quick, without a break. */
  slow: number;
  quick: number;
  /** A pixel ratio that has proved too slow: it never climbs back to it (no see-sawing). */
  ceiling: number;
}

export const newFrameBudget = (): FrameBudget => ({ average: 1 / 60, slow: 0, quick: 0, ceiling: Infinity });

/**
 * Feeds one frame (seconds since the previous one) to the budget and returns the pixel ratio to use
 * next: `dpr` unchanged, one step lower, or one step higher (never above `max`, below the floor, or
 * back up to a ratio that was already too slow). Pure apart from updating `budget`; no allocation.
 */
export function adaptDpr(budget: FrameBudget, delta: number, dpr: number, max: number): number {
  if (!(delta > 0) || delta > ADAPTIVE.gap) return dpr;
  budget.average += (delta - budget.average) * 0.1;
  if (budget.average > ADAPTIVE.slow) {
    budget.slow += delta;
    budget.quick = 0;
  } else if (budget.average < ADAPTIVE.quick) {
    budget.quick += delta;
    budget.slow = 0;
  } else {
    budget.slow = 0;
    budget.quick = 0;
  }
  let next = dpr;
  if (budget.slow >= ADAPTIVE.slowFor && dpr > ADAPTIVE.floor) {
    next = Math.max(ADAPTIVE.floor, dpr * ADAPTIVE.stepDown);
    budget.ceiling = Math.min(budget.ceiling, dpr);
  } else if (budget.quick >= ADAPTIVE.quickFor && dpr < max) {
    const up = Math.min(max, dpr * ADAPTIVE.stepUp);
    if (up < budget.ceiling - 1e-6) next = up;
  }
  if (next !== dpr) {
    // Start over at the new resolution.
    budget.slow = 0;
    budget.quick = 0;
    budget.average = 1 / 60;
  }
  return next;
}
