/**
 * How the camera fits the stage's shape (pure, no GSAP, no three): the same keys film every stage,
 * from a wide laptop to a tall phone. The camera path (`src/components/stage/camera-path.ts`) applies
 * this frame by frame; the framing table (`framing.ts`) uses it to work out where the camera has to
 * stand on a phone. Kept apart from both so the script can import it without a cycle.
 */

/** The shape of a stage the camera was authored for: any laptop, desktop or landscape tablet. The keys are exact here. */
export const REFERENCE_ASPECT = 16 / 9;

/**
 * Below this shape (width over height) the stage is tall and narrow: a portrait tablet or a phone.
 * There the same vertical field of view would cut the picture's sides off, so the field widens by
 * `(FIT_BELOW / aspect) ^ FIT_STRENGTH`: with a strength of 1 the picture keeps the width it has at
 * `FIT_BELOW`, and the extra height shows more sky and ground above and below (where the text goes).
 * At and above `FIT_BELOW` nothing changes.
 */
export const FIT_BELOW = 1.3;
export const FIT_STRENGTH = 1;

/** Aspect ratios between which the keys' `pan` fades in: none at `FIT_BELOW` and wider, all of it at `PAN_TO` and narrower. */
export const PAN_FROM = FIT_BELOW;
export const PAN_TO = 0.6;

/** How much wider the vertical field of view (its tangent) is on a stage of this aspect. 1 on any wide stage. */
export function fovScale(aspect: number): number {
  if (!(aspect > 0) || aspect >= FIT_BELOW) return 1;
  return (FIT_BELOW / aspect) ** FIT_STRENGTH;
}

/** A vertical field of view (degrees) fitted to a stage of this aspect. */
export function fitFov(fov: number, aspect: number): number {
  const scale = fovScale(aspect);
  return scale === 1 ? fov : (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * scale) * 180) / Math.PI;
}

/** How much of the keys' `pan` applies on a stage of this aspect, 0 (wide) to 1 (tall and narrow). */
export function panAmount(aspect: number): number {
  if (!(aspect > 0)) return 0;
  return Math.min(1, Math.max(0, (PAN_FROM - aspect) / (PAN_FROM - PAN_TO)));
}
