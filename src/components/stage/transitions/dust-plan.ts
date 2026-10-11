import { sceneOf, transitionOf } from "@/scroll/helpers";
import { SCREEN, SITE } from "@/scroll/script";

import { glide, storyTime } from "../motion-kit";
import { FOREVER, particleField, type ParticleField } from "./particles";

/**
 * Site to prune: the wind lifts the dust (pure). Looking straight down on the building site, a wind
 * gets up: the milk page beside the site lifts at its upwind edge, curls and flies off, and dust lifts
 * off the sand and the tiles in plumes that rise toward the camera, growing and billowing, their sunlit
 * tops warm and their undersides blue, white grit glinting in them. They close over the lens; under
 * them the camera reframes onto the gardener. The dust keeps rising: it lifts off the top of the frame
 * and uncovers him from the bottom up, the last motes drifting up past him.
 *
 * The plumes are lens layers. Up to the cover they come toward the lens (`dustApproach`: their pattern
 * grows about the site's place on the screen); from the cover they climb the frame (`dustClimb`), and
 * after the swap they lift off it from the bottom up (`dustLift`). Seconds are story time since the dust
 * began (`dustClock`).
 */

export const DUST_DEF = transitionOf("dust");
export const [DUST_COVERED, DUST_CLEARING] = DUST_DEF.peak!;
/** Where the scenes swap, inside the dust. */
export const DUST_SWAP = sceneOf(DUST_DEF.to).start;

export const dustClock = (p: number) => storyTime(p, DUST_DEF.start);

export const DUST = {
  /** Grit and motes (the light mode draws a share of them). */
  gritCount: 800,
  /** The page flies off over this share of the way to the cover, from its start. */
  page: [0, 0.62] as const,
  /** How far the plumes' pattern grows as they come up to the lens (times, by the cover). */
  approach: 2.6,
  /** How far the dust climbs the frame after the swap (frame heights, by the end). */
  climb: 1.25,
  /**
   * The bottom edge of the dust as it lifts off: from just below the frame (its ragged edge clear of the
   * bottom by a hair, so the frame is full right up to the clearing) to above it (share of the frame from the bottom).
   */
  lift: [-0.29, 1.34] as const,
} as const;

/** How far the billows move the dust's lifting edge up or down (frame heights), and its soft edge: `DUST.lift` relies on them. */
export const LIFT_RAGGED = 0.22;
export const LIFT_SOFT = 0.06;

/** Where the plumes come from on the screen (0 to 1, y up): the site in the middle of the left half (a phone: of the upper half). */
export function dustOrigin(stacked: boolean): [number, number] {
  return stacked ? [0.5, 0.75] : [0.25, 0.5];
}

/** How thick the dust is at p, 0 to 1 (about the share of the frame it covers): it builds from the site out until it fills the lens at the cover. */
export function dustDensity(p: number): number {
  const t = Math.min(1, Math.max(0, (p - DUST_DEF.start) / (DUST_COVERED - DUST_DEF.start)));
  // Slow to start (a few plumes off the site), still thickening as it closes over the lens: full at the cover, not before.
  return Math.pow(t, 1.4);
}

/** How far the plumes have come toward the lens at p: their pattern's scale (1 at the start). */
export function dustApproach(p: number): number {
  return 1 + (DUST.approach - 1) * glide(p, [DUST_DEF.start, DUST_CLEARING]);
}

/**
 * How far the dust has cooled at p, 0 to 1: lifting off the site it is the sand's warm colour; as it
 * rises into the light and closes over the lens it is the blue of the sky it is lit by (the
 * storyboard's blue dust), and it stays blue as it lifts off over the gardener.
 */
export function dustCool(p: number): number {
  return glide(p, [DUST_DEF.start + 0.25 * (DUST_COVERED - DUST_DEF.start), DUST_COVERED]);
}

/** How far the dust has climbed the frame at p (frame heights): it sets off as it closes over the lens and is at speed by the time it lifts off. */
export function dustClimb(p: number): number {
  return DUST.climb * glide(p, [DUST_COVERED, DUST_DEF.end]);
}

/**
 * The dust's bottom edge as it lifts off at p (share of the frame from the bottom). The dust is already
 * rising when the scenes swap under it, so its edge sets off at speed and slows as it leaves the frame.
 */
export function dustLift(p: number): number {
  const t = Math.min(1, Math.max(0, (p - DUST_CLEARING) / (DUST_DEF.end - DUST_CLEARING)));
  return DUST.lift[0] + (DUST.lift[1] - DUST.lift[0]) * (1 - Math.pow(1 - t, 2.2));
}

/** How far the page has gone (0 lying on the ground, 1 gone out of the frame), as the wind gets under it. */
export function pageFlight(p: number): number {
  const [a, b] = DUST.page;
  const from = DUST_DEF.start + a * (DUST_COVERED - DUST_DEF.start);
  const to = DUST_DEF.start + b * (DUST_COVERED - DUST_DEF.start);
  return glide(p, [from, to]);
}

/** The page is the site's own until the dust has covered it: shown from the panel's arrival to the cover. */
export function pageShown(p: number): boolean {
  return p >= SITE.panel[0] - 0.2 * SCREEN && p < DUST_COVERED;
}

/**
 * The grit and the motes: lifted off the ground with the plumes, they rise toward the lens in eddies
 * (before the swap), then up the frame past the gardener as the dust lifts off (after it). Lens space:
 * they are born ahead of the lens, spread over the view, and rise (+z before the swap is toward the lens,
 * which the shader turns into the climb after it).
 */
export function gritField(): ParticleField {
  const span = storyTime(DUST_DEF.end, DUST_DEF.start);
  return particleField("dust-grit", DUST.gritCount, (rand) => {
    const depth = 0.25 + 2.2 * rand() * rand();
    const halfH = depth * Math.tan((38 * Math.PI) / 360);
    const halfW = halfH * 2;
    return {
      start: [(rand() * 2 - 1) * halfW, (rand() * 2 - 1.3) * halfH, -depth],
      born: span * 0.05 + span * 0.8 * rand(),
      velocity: [(rand() - 0.5) * 0.2, 0.15 + rand() * 0.4, 0.2 + rand() * 0.5],
      drag: 1.2 + rand(),
      size: (0.0012 + 0.0035 * rand()) * (0.6 + depth),
      seed: rand(),
      tone: rand(),
      life: FOREVER,
      swirl: 0.01 + 0.04 * rand() * depth,
      swirlRate: 0.35 + 0.6 * rand(),
      phase: rand() * Math.PI * 2,
      fall: 0.05,
    };
  });
}
