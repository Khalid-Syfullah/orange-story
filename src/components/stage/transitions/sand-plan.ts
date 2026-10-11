import { sceneOf, transitionOf } from "@/scroll/helpers";
import { SCREEN } from "@/scroll/script";

import { glide, storyTime } from "../motion-kit";
import { HAND_DEPTH } from "../pluck-harvest";
import { halvesAt } from "../share-cut";
import { poseAt } from "./match-cut";
import { FOREVER, particleField, type ParticleField } from "./particles";

/**
 * Share to work: the sand (pure). The camera pushes into the two halves held together; their cut
 * flesh crumbles into grains that spill over the rims and pour down under gravity, bending right as
 * the wind picks up; they pile up from the bottom of the frame into a dune whose crest smokes with
 * spindrift, and the wind streams sheets of grains across the frame at several depths until the camera
 * is inside the drift. Under it the camera reframes onto The Work's clouds; the wind then thins the
 * drift in patches and carries it off to the right, and the last of it falls away below as the camera
 * rises.
 *
 * Space is the medium's: the camera's own space as it was when the sand began (x right, y up, -z
 * ahead). Until the cover the medium moves with the world (`sandTravel` is the camera's real push, so
 * grains poured from the halves stay with the halves); after it, the travel carries the push on and
 * slows it to rest, then rises with The Work's dolly up, so the remaining sand falls away below.
 * Seconds are story time since the sand began (`sandClock`).
 */

export const SAND_DEF = transitionOf("sand");
const [COVERED, CLEARING] = SAND_DEF.peak!;
/** Where the scenes swap, under the drift. */
export const SAND_SWAP = sceneOf(SAND_DEF.to).start;

/** Seconds of story time since the sand began at progress p (negative before). */
export const sandClock = (p: number) => storyTime(p, SAND_DEF.start);

export const SAND = {
  /** Grains poured from the halves (the light mode draws a share of them). */
  pourCount: 4200,
  /** Grains the wind lifts off the pour and the pile and carries across. */
  driftCount: 9000,
  /** Grains streaming close past the lens. */
  nearCount: 140,
  /** The pour runs over these seconds of the sand's clock, slowly at first. */
  pour: [0, 0.6] as const,
  /** Radius of the cut face a grain leaves from (world units), and where in the face (share of the radius) it most often comes loose: the rim. */
  face: 0.034,
  /** The wind: its speed by the cover (world units per second, to the right and a little up) and when it picks up (seconds of the sand's clock). */
  wind: [1.6, 0.12, 0] as const,
  gust: [0.15, 0.55] as const,
  /** After the cover: the push carried on (it slows to rest over `coast` seconds), then the rise with The Work's dolly (world units per second). */
  coast: 0.35,
  rise: 1.6,
  /**
   * The pile: the dune's top edge, as a share of the frame from its bottom, at the start and at the
   * cover, where its ragged edge has just passed the top of the frame (not long before: the frame is
   * full only at the cover).
   */
  pile: [-0.35, 1.13] as const,
  /** Grain sizes (world units across): poured, near the lens. */
  grain: [0.0018, 0.0052] as const,
  near: [0.004, 0.018] as const,
} as const;

/** How far the noise in a drift sheet moves the dune's top edge up or down (frame heights), and its soft edge: the pile's coverage bounds rely on them. */
export const PILE_RAGGED = 0.09;
export const PILE_SOFT = 0.03;

/** The halves' cut faces (world), held together by the time the sand begins: the middles of the two discs. */
export function sandFaces(): [readonly [number, number, number], readonly [number, number, number]] {
  const h = halvesAt(SAND_DEF.start);
  const z = -HAND_DEPTH;
  // Each cut face is a disc beside its cut edge: the left half's to the left of its edge, the right's to the right.
  return [
    [h.leftEdge[0] - SAND.face * 0.8, h.leftEdge[1], z],
    [h.rightEdge[0] + SAND.face * 0.8, h.rightEdge[1], z],
  ];
}

/** The halves in the medium: between their two cut faces. */
export function sandSource(): [number, number, number] {
  const [a, b] = sandFaces();
  const o = origin();
  return [(a[0] + b[0]) / 2 - o.x, (a[1] + b[1]) / 2 - o.y, (a[2] + b[2]) / 2 - o.z];
}

/** The camera's position at the sand's start: the origin of the medium. */
const origin = (() => {
  let cached: { x: number; y: number; z: number } | null = null;
  return () => {
    if (!cached) {
      const pose = poseAt(SAND_DEF.start);
      cached = { x: pose.px, y: pose.py, z: pose.pz };
    }
    return cached;
  };
})();

/**
 * How far the camera has travelled through the medium by progress p (medium units: + right, + up,
 * + toward the viewer's back, i.e. -z ahead): the real push until the cover, then the push carried on
 * and slowing to rest, and the rise after the clearing. Writes into `out`.
 */
export function sandTravel(p: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const o = origin();
  if (p <= COVERED) {
    const pose = poseAt(Math.max(SAND_DEF.start, p));
    out[0] = pose.px - o.x;
    out[1] = pose.py - o.y;
    out[2] = pose.pz - o.z;
    return out;
  }
  // The push's speed as it reached the cover (per second), carried on and slowing to rest.
  const h = 0.02 * SCREEN;
  const a = poseAt(COVERED - h);
  const b = poseAt(COVERED);
  const perSecond = 1 / storyTime(COVERED, COVERED - h);
  const t = storyTime(p, COVERED);
  const coast = SAND.coast * -Math.expm1(-t / SAND.coast);
  out[0] = b.px - o.x + (b.px - a.px) * perSecond * coast;
  out[1] = b.py - o.y + (b.py - a.py) * perSecond * coast;
  out[2] = b.pz - o.z + (b.pz - a.pz) * perSecond * coast;
  // The Work's dolly up: from the clearing on, eased in from rest.
  const rise = Math.max(0, storyTime(p, CLEARING));
  out[1] += SAND.rise * (rise - 0.25 * -Math.expm1(-rise / 0.25));
  return out;
}

/** The wind's speed at p (it picks up over the gust and holds). */
export function sandWind(p: number): [number, number, number] {
  const g = glide(sandClock(p), SAND.gust);
  return [SAND.wind[0] * g, SAND.wind[1] * g, SAND.wind[2] * g];
}

/**
 * The dune's top edge at p, as a share of the frame from its bottom: it rises from a quarter of the way to
 * the cover, faster and faster as the camera dives into it, past the top of the frame at the cover, and stays.
 */
export function pileLevel(p: number): number {
  const from = SAND_DEF.start + 0.25 * (COVERED - SAND_DEF.start);
  const t = Math.min(1, Math.max(0, (p - from) / (COVERED - from)));
  return SAND.pile[0] + (SAND.pile[1] - SAND.pile[0]) * Math.pow(t, 1.6);
}

/**
 * How far the drift has thinned at p, 0 (whole) to 1 (gone): about the share of the frame it has
 * uncovered. The wind is already blowing hard as the scenes swap under it, so the first holes open at
 * once and the last of it goes more slowly.
 */
export function sandThin(p: number): number {
  const t = Math.min(1, Math.max(0, (p - CLEARING) / (SAND_DEF.end - CLEARING)));
  return 1 - Math.pow(1 - t, 2);
}

/**
 * How dense the streams of grains across the frame are at p, about the share of the frame they cover:
 * they build up with the wind from a third of the way to the cover, still thickening as the camera
 * dives in (full at the cover, not before), and hold.
 */
export function streamDensity(p: number): number {
  const a = SAND_DEF.start + 0.32 * (COVERED - SAND_DEF.start);
  const t = Math.min(1, Math.max(0, (p - a) / (COVERED - a)));
  return Math.pow(t, 1.5);
}

/**
 * The grains poured from the halves: each comes loose from a cut face at its own moment (more and
 * more as the flesh gives way), drops off the rim with a little speed of its own, and flies under
 * gravity with a light drag toward the wind (`sandWind` is picked up in the shader as the field's
 * wind). Born in the medium's space, where the faces were when it came loose.
 */
export function pourField(): ParticleField {
  const faces = sandFaces();
  const o = origin();
  return particleField("sand-pour", SAND.pourCount, (rand) => {
    const u = rand();
    const born = SAND.pour[0] + (SAND.pour[1] - SAND.pour[0]) * Math.pow(u, 0.62);
    const face = faces[rand() < 0.5 ? 0 : 1];
    const angle = rand() * Math.PI * 2;
    const r = SAND.face * Math.sqrt(0.35 + 0.65 * rand());
    // In the medium a point of the world keeps its place (the travel carries the camera's push), so a
    // grain comes loose where the face is, whenever that is.
    const x = face[0] + Math.cos(angle) * r - o.x;
    const y = face[1] + Math.sin(angle) * r * 0.6 - o.y;
    const z = face[2] - o.z;
    // A grain loose at the rim tumbles off it: out from the face and down.
    const out = Math.cos(angle);
    return {
      start: [x, y, z],
      born,
      velocity: [out * 0.12 + (rand() - 0.5) * 0.06, -0.08 - rand() * 0.22, 0.05 + rand() * 0.12],
      drag: 1.4 + rand() * 1.4,
      size: SAND.grain[0] + (SAND.grain[1] - SAND.grain[0]) * rand() * rand(),
      seed: rand(),
      // The flesh is orange where it is lit; the shadowed grains are the sky's blue.
      tone: Math.min(1, 0.25 + 0.75 * rand() + 0.4 * u),
      life: FOREVER,
      swirl: 0.004 + 0.01 * rand(),
      swirlRate: 0.6 + rand() * 0.9,
      phase: rand() * Math.PI * 2,
      fall: 1,
    };
  });
}

/**
 * The drift: grains the wind lifts off the pour and off the pile below the hands and carries across
 * the frame, more and more of them as it builds toward the cover. Born in the medium, around the
 * halves and below them down to the foot of the frame, nearer the lens as well as at the hands.
 */
export function driftField(): ParticleField {
  const o = origin();
  const [sx, sy, sz] = sandSource();
  const build = storyTime(COVERED, SAND_DEF.start);
  return particleField("sand-drift", SAND.driftCount, (rand) => {
    // More and more of them as the wind builds: born from a fifth of the way to the cover, crowding toward it.
    const born = build * (0.2 + 0.8 * Math.sqrt(rand())) + 0.15 * rand();
    const fromPile = rand() < 0.45;
    // Nearer the lens than the hands, some of them: the camera is pushing into the drift.
    const z = sz * (0.35 + 0.65 * rand());
    const reach = -z * 0.55;
    const x = fromPile ? sx + (rand() * 2 - 1.2) * reach * 1.6 : sx + (rand() - 0.5) * 0.06;
    const y = fromPile ? sy - reach * (0.25 + 0.75 * rand()) : sy - 0.02 - 0.08 * rand();
    void o;
    return {
      start: [x, y, z],
      born,
      velocity: [0.3 + rand() * 0.8, 0.05 + rand() * 0.25, (rand() - 0.5) * 0.08],
      drag: 1.6 + rand() * 1.6,
      size: (SAND.grain[0] + (SAND.grain[1] - SAND.grain[0]) * rand()) * (0.8 + 0.6 * (z / sz)),
      seed: rand(),
      tone: 0.35 + 0.65 * rand(),
      life: 0.5 + rand() * 0.7,
      swirl: 0.006 + 0.02 * rand(),
      swirlRate: 0.5 + rand(),
      phase: rand() * Math.PI * 2,
      fall: 0.35,
    };
  });
}

/**
 * The grains that stream close past the lens once the drift has built up: born upwind (left of the
 * view) at a depth near the lens and carried right across it by the wind, through the cover and the
 * clearing. Space is the lens's own (camera space, no travel): they are the air the camera is in.
 */
export function nearField(): ParticleField {
  const start = storyTime(SAND_DEF.start + 0.45 * (COVERED - SAND_DEF.start), SAND_DEF.start);
  const stop = storyTime(SAND_DEF.end - 0.25 * (SAND_DEF.end - CLEARING), SAND_DEF.start);
  return particleField("sand-near", SAND.nearCount, (rand) => {
    const depth = 0.12 + 0.5 * rand() * rand();
    // The view's half width at that depth, at the widest field of view the sand sees (40 degrees, The Work's).
    const half = depth * Math.tan((40 * Math.PI) / 360) * 2.4;
    return {
      start: [-half * (1.05 + 0.3 * rand()), (rand() * 2 - 1) * half * 0.6, -depth],
      born: start + (stop - start) * rand(),
      velocity: [2.2 + rand() * 1.4, (rand() - 0.5) * 0.3, 0],
      drag: 0.3,
      size: (SAND.near[0] + (SAND.near[1] - SAND.near[0]) * rand()) * (0.4 + depth),
      seed: rand(),
      tone: 0.55 + 0.45 * rand(),
      life: 1.2,
      swirl: 0.01 * rand(),
      swirlRate: 0.8,
      phase: rand() * Math.PI * 2,
      fall: 0.15,
    };
  });
}
