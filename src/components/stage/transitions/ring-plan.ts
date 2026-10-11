import { transitionOf } from "@/scroll/helpers";
import { FALL, fallingOrangeAt } from "@/scroll/script";

import { glide, storyTime } from "../motion-kit";
import { poseAt, screenPoint } from "./match-cut";
import { particleField, type ParticleField } from "./particles";

/**
 * The ring, inside the fall (pure). The falling orange, followed by the camera, strikes the sky as if
 * it were water (`FALL.release` ends there): a ripple runs out from it, a real wave, a crest and a train
 * of smaller rings behind it dying away, in the halftone layer: dots swell on the crests and part on
 * the slopes, and the leading crest carries a thin, soft spectral sheen. Drops of light jump from the
 * impact and fall back. The old picture is carried away at the leading crest; behind it, the orchard.
 *
 * The ripple spreads from the orange (which the water stops within a few centimetres) on a plane just
 * behind it. Its leading crest is scheduled on the screen, in half-heights of the frame where the
 * orange is (`crestRatio`): steadily outward, slowing as a ripple does, past every corner by the end,
 * whatever the camera does meanwhile (it pulls back and climbs); in the world that is `crestRadius`.
 * The reveal is the same circle, projected (`ringReveal`).
 */

export const RING_DEF = transitionOf("ring");
/** The moment of the strike: where the ring starts. */
export const STRIKE = FALL.release[1];

export const RING = {
  /** The leading crest at the strike (frame half-heights): the size of the orange, just pressed flat. */
  from: 0.22,
  /** And at the end: past the farthest corner from the orange (it ends low in the frame). */
  to: 2.95,
  /** How the crest slows as it spreads (1: steady; more: faster at first). */
  slowing: 1.7,
  /** The ripple's wavelength behind the crest, as a share of the crest's radius (it lengthens as it spreads), and its least. */
  wavelength: 0.16,
  minWavelength: 0.018,
  /** How fast the train dies away behind the crest (per wavelength), and over time (per second). */
  falloff: 0.55,
  decay: 0.9,
  /** Soft edge of the reveal, as a share of the crest's radius (and at least a few pixels). */
  soft: 0.05,
  /** Drops thrown up by the strike. */
  drops: 140,
} as const;

/** The leading crest at progress p, in half-heights of the frame where the orange is. */
export function crestRatio(p: number): number {
  if (p <= RING_DEF.start) return 0;
  const u = Math.min(1, (p - RING_DEF.start) / (RING_DEF.end - RING_DEF.start));
  return RING.from + (RING.to - RING.from) * (1 - Math.pow(1 - u, RING.slowing));
}

/** The orange in the world at progress p: the ripple's centre. */
export function ringCentre(p: number): [number, number, number] {
  const o = fallingOrangeAt(Math.max(p, STRIKE));
  return [o.x, o.y, 0];
}

/** Half the frame's height (world) at the orange's distance from the camera, at progress p. */
function halfHeightAt(p: number): number {
  const pose = poseAt(p);
  const c = ringCentre(p);
  const depth = Math.hypot(c[0] - pose.px, c[1] - pose.py, c[2] - pose.pz);
  return depth * Math.tan((pose.fov * Math.PI) / 360);
}

/** The leading crest's radius in the world at progress p. */
export function crestRadius(p: number): number {
  return crestRatio(p) * halfHeightAt(p);
}

/** Seconds of story time since the strike (negative before). */
export const ringClock = (p: number) => storyTime(p, STRIKE);

/** How strongly the ripple shows at p: it rises with the strike and dies away by the end. */
export function ringStrength(p: number): number {
  if (p < RING_DEF.start || p >= RING_DEF.end) return 0;
  const [a, b] = [RING_DEF.start, RING_DEF.end];
  return glide(p, [a, a + 0.06 * (b - a)]) * (1 - glide(p, [a + 0.7 * (b - a), b]));
}

/** A circle on the stage (CSS px from its top left). */
export interface RingCircle {
  x: number;
  y: number;
  radius: number;
  softness: number;
}

/**
 * The circle the ring reveals at progress p on a `width` by `height` stage: nothing before the strike,
 * everything after the ring, and between them the leading crest round the orange.
 */
export function ringReveal(p: number, width: number, height: number): RingCircle {
  const c = screenPoint(ringCentre(Math.max(p, RING_DEF.start)), Math.max(p, RING_DEF.start), width, height);
  if (p < RING_DEF.start) return { x: c.x, y: c.y, radius: -2, softness: 1 };
  if (p >= RING_DEF.end) return { x: c.x, y: c.y, radius: 1e6, softness: 1 };
  const radius = crestRatio(p) * (height / 2);
  return { x: c.x, y: c.y, radius, softness: Math.max(2, radius * RING.soft) };
}

/**
 * The drops the strike throws up: from the orange, out and up in every direction (a crown), each
 * falling back under gravity; small, lit, gone as they fall back in. In the world, at the orange.
 */
export function splashField(): ParticleField {
  const c = ringCentre(STRIKE);
  return particleField("ring-splash", RING.drops, (rand) => {
    const angle = rand() * Math.PI * 2;
    const speed = 0.35 + 1.1 * rand() * rand();
    const up = 0.6 + 1.4 * rand();
    return {
      start: [c[0] + Math.cos(angle) * 0.03, c[1] + Math.sin(angle) * 0.02, 0.02],
      born: 0.01 * rand(),
      velocity: [Math.cos(angle) * speed, up, Math.sin(angle) * speed * 0.4],
      drag: 0.6,
      size: 0.004 + 0.01 * rand() * rand(),
      seed: rand(),
      tone: rand(),
      life: 0.35 + 0.5 * rand(),
      swirl: 0,
      swirlRate: 0,
      phase: 0,
      fall: 1,
    };
  });
}

