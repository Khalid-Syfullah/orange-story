/**
 * Rendering budgets for the stage canvas: device pixel ratio, texture size, depth of field and how
 * long unused textures stay on the GPU. One place to tune them.
 */

/** Device pixel ratio range of the stage canvas: never below 1, never above `MAX_DPR`. */
export const MIN_DPR = 1;
export const MAX_DPR = 1.5;

/**
 * Highest pixel ratio of the transition canvas. Its effects are soft (fronts, noise, fine grains),
 * so it renders at a lower resolution than the plates: every pixel runs a full-screen shader.
 */
export const TRANSITION_MAX_DPR = 1.25;

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
