import { transitionOf } from "@/scroll/helpers";

import { storyTime } from "../motion-kit";
import { poseAt } from "./match-cut";
import { particleField, type ParticleField } from "./particles";

/**
 * The leaves (pure). Two passes through the young orange tree:
 *
 * - Ascent to graft, through the leaves: the camera rises to the first branch through the leaves on its
 *   twigs, unfurling as it comes. They stand in the world between the camera's path and the branch, so
 *   its own push carries them past the lens, the nearest huge and soft, turning a little in the air the
 *   camera stirs; two of them stand right on its path and fill the lens as it reaches them
 *   (`LEAVES_SWAP`): the trunk's branch gives way to the graft's close-up behind them. Every one is
 *   behind the camera by the time it settles on the branch.
 * - Graft to pluck, back out of the tree: as the camera pulls back from the knot and the tree fills with
 *   fruit, leaves shaken loose by the filling branches drift down past the lens, fluttering, at every
 *   depth, and fall out of the frame.
 *
 * Both are particle fields of the ascent's painted leaf, flying in the world on story time since the
 * pass began (`leafClock`).
 */

export const LEAVES_DEF = transitionOf("leaves");
export const FOLIAGE_DEF = transitionOf("foliage");

/** Seconds of story time since a pass began. */
export const leafClock = (p: number, def: { start: number }) => storyTime(p, def.start);

/** Where the two leaves on the camera's path fill the lens (the scenes swap behind them). */
export const LEAVES_SWAP = LEAVES_DEF.swapAt ?? LEAVES_DEF.start;

export const LEAVES = {
  /** Leaves on the twigs around the camera's path (the light mode draws a share of them). */
  count: 46,
  /** Leaves loosened as the tree fills, on the way back out. */
  falling: 30,
  /** A leaf's size (world units, tip to stalk). */
  size: [0.07, 0.12] as const,
  /** The two on the path: how far in front of the lens they are at the swap (beyond the camera's near plane, 0.1). */
  onPath: [0.13, 0.19] as const,
  /** Seconds a leaf on the twigs takes to unfurl, and how long before the camera reaches it it starts (least, most). */
  unfurl: 0.16,
  unfurlLead: [0.22, 0.42] as const,
} as const;

/** The camera's position at a progress (world). */
const cameraAt = (p: number) => {
  const q = poseAt(p);
  return [q.px, q.py, q.pz] as const;
};

/** Seconds of the pass's clock when the camera, rising to the branch, reaches depth z (world). */
function reachedAt(z: number): number {
  const steps = 96;
  for (let k = 0; k <= steps; k++) {
    const p = LEAVES_DEF.start + ((LEAVES_DEF.end - LEAVES_DEF.start) * k) / steps;
    if (poseAt(p).pz <= z) return leafClock(p, LEAVES_DEF);
  }
  return leafClock(LEAVES_DEF.end, LEAVES_DEF);
}

/**
 * The leaves around the camera's path to the branch: in the world, between where the camera is as the
 * pass begins and where it settles (all of them behind it by then), beside its line of sight at their
 * depth, nearer to the line the nearer they are to the lens when the camera reaches them. They unfurl on
 * their twigs as the camera comes up (the storyboard's leaves unfurling), each a little before the
 * camera reaches it (`LEAVES.unfurl`): nothing fades in.
 */
export function canopyField(): ParticleField {
  const start = cameraAt(LEAVES_DEF.start);
  const end = cameraAt(LEAVES_DEF.end);
  return particleField("leaves-canopy", LEAVES.count, (rand) => {
    // Depth along the path: from a little ahead of the camera at the start to just before where it settles.
    const z = start[2] - 0.15 - (start[2] - end[2] - 0.25) * rand();
    // Beside the line of sight: a leaf the camera passes close by sweeps past the lens huge.
    const angle = rand() * Math.PI * 2;
    const r = 0.035 + 0.22 * Math.sqrt(rand());
    return {
      start: [start[0] + Math.cos(angle) * r, start[1] + Math.sin(angle) * r * 0.8, z],
      born: reachedAt(z) - LEAVES.unfurlLead[0] - (LEAVES.unfurlLead[1] - LEAVES.unfurlLead[0]) * rand(),
      velocity: [0, 0, 0],
      drag: 1,
      size: LEAVES.size[0] + (LEAVES.size[1] - LEAVES.size[0]) * rand(),
      seed: rand(),
      tone: rand(),
      life: 1e6,
      swirl: 0.004 + 0.008 * rand(),
      swirlRate: 0.4 + 0.6 * rand(),
      phase: rand() * Math.PI * 2,
      fall: 0,
    };
  });
}

/** The two leaves right on the camera's path, filling the lens as it reaches them at the swap. */
export function pathField(): ParticleField {
  const at = cameraAt(LEAVES_SWAP);
  return particleField("leaves-path", 2, (rand, i) => {
    const d = LEAVES.onPath[i];
    return {
      start: [at[0] + (i === 0 ? -0.006 : 0.008), at[1] + (i === 0 ? 0.004 : -0.006), at[2] - d],
      born: -1,
      velocity: [0, 0, 0],
      drag: 1,
      // Large enough to fill a phone's tall, wide-angle frame too, this close to the lens.
      size: LEAVES.size[1] * (3.2 + 0.5 * rand()),
      seed: 0.2 + 0.5 * rand(),
      tone: rand(),
      life: 1e6,
      swirl: 0.002,
      swirlRate: 0.5,
      phase: rand() * Math.PI * 2,
      fall: 0,
    };
  });
}

/**
 * The leaves that drift down past the lens on the way back out of the tree: each comes loose above the
 * frame at its own moment and depth and flutters down under gravity against a strong drag (a leaf falls
 * slowly, swinging from side to side), out of the bottom of the frame before the pass ends.
 */
export function fallingField(): ParticleField {
  const span = storyTime(FOLIAGE_DEF.end, FOLIAGE_DEF.start);
  return particleField("leaves-falling", LEAVES.falling, (rand) => {
    const born = span * 0.62 * rand();
    const at = cameraAt(FOLIAGE_DEF.start + (born / span) * (FOLIAGE_DEF.end - FOLIAGE_DEF.start));
    const depth = 0.25 + 1.6 * rand() * rand();
    const halfH = depth * Math.tan((32 * Math.PI) / 360);
    return {
      start: [at[0] + (rand() * 2 - 1) * halfH * 1.5, at[1] + halfH * (1.05 + 0.3 * rand()), at[2] - depth],
      born,
      velocity: [(rand() - 0.5) * 0.2, -0.1, 0],
      drag: 5 + 3 * rand(),
      size: LEAVES.size[0] + (LEAVES.size[1] - LEAVES.size[0]) * rand(),
      seed: rand(),
      tone: rand(),
      life: span - born,
      swirl: 0.04 + 0.08 * rand() * depth,
      swirlRate: 0.5 + 0.5 * rand(),
      phase: rand() * Math.PI * 2,
      fall: 1,
    };
  });
}
