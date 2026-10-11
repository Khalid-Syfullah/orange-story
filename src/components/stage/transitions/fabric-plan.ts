import { sceneOf, transitionOf } from "@/scroll/helpers";

import { storyTime } from "../motion-kit";
import type { ClothFrames, ClothSpec } from "./cloth";

/**
 * Questions to stars: the fabric sky (pure). As the camera pushes into the blue between the trees, the
 * sky comes loose: a great blue cloth falls into view from above, billowing as the air catches it, its
 * folds catching the sun on their crowns and going cool in their troughs. It falls across the lens and
 * covers it; under it the camera reframes onto the stargazer; it keeps falling and slides out at the
 * bottom, uncovering him from the top down.
 *
 * The cloth is simulated once (`cloth.ts`) in units of the frame's height at the lens distance it hangs
 * at (`FABRIC.distance` frame heights... in practice: placed so the frame there is one unit tall), so
 * it covers a phone's tall frame as it covers a laptop's wide one, in the same time. It is let go a
 * moment before the transition starts (`FABRIC.lead`), so its hem drops into the top of the frame just
 * as the transition begins, already falling.
 */

export const FABRIC_DEF = transitionOf("fabric");
export const [FABRIC_COVERED, FABRIC_CLEARING] = FABRIC_DEF.peak!;
/** Where the scenes swap, under the cloth. */
export const FABRIC_SWAP = sceneOf(FABRIC_DEF.to).start;

/** The cloth, in frame heights (the frame spans y -0.5 to 0.5 where it hangs) and seconds of story time. */
export const FABRIC_CLOTH: ClothSpec = {
  seed: "fabric-sky",
  nx: 26,
  ny: 20,
  width: 2.6,
  // A little taller than the frame: it covers the lens only briefly as it falls through.
  height: 1.7,
  top: [0, 3.0, 0],
  // A frame height is about a metre where the cloth hangs: gravity in frame heights.
  gravity: 9.5,
  drag: 0.9,
  faceDrag: 4,
  wind: [0.2, 0, 0.2],
  gust: 0.7,
  gustRate: 0.7,
  hem: 2.6,
  settle: 0.9,
  pinSpan: 0.72,
  stagger: 0.09,
  duration: 1.9,
  rate: 60,
  substeps: 3,
  iterations: 5,
  bend: 0.3,
};

export const FABRIC = {
  /** Where the cloth hangs in front of the lens, world units, on a laptop's frame (a phone's is placed by its frame height). */
  distance: 1.4,
  /** Half the frame's width in frame heights (a laptop's): the part of the cloth that has to cover. */
  halfWidth: 0.8,
} as const;

/** Seconds of the cloth's own clock at progress p: let go `lead` seconds before the transition starts. */
export const clothClock = (p: number, lead: number) => storyTime(p, FABRIC_DEF.start) + lead;

/** When the cloth's hem and its top edge cross the frame (seconds after it was let go), measured on its frames. */
export interface ClothCrossings {
  /** The hem's lowest point (within the frame's width) reaches the frame's top: it comes into view. */
  enters: number;
  /** The hem has passed the frame's bottom everywhere across it: from here the cloth covers it. */
  covers: number;
  /** The top edge's lowest point reaches the frame's top: from here it uncovers. */
  uncovers: number;
  /** The top edge has passed the frame's bottom everywhere: it has gone. */
  gone: number;
}

/** Measures a simulated cloth falling through a frame `halfWidth` frame heights to each side. */
export function clothCrossings(frames: ClothFrames, halfWidth: number = FABRIC.halfWidth): ClothCrossings {
  const { nx, ny, count, rate, positions } = frames;
  const size = nx * ny * 3;
  const row = (f: number, j: number, pick: (a: number, b: number) => number, start: number) => {
    let v = start;
    for (let i = 0; i < nx; i++) {
      const o = f * size + (j * nx + i) * 3;
      if (Math.abs(positions[o]) <= halfWidth + 0.05) v = pick(v, positions[o + 1]);
    }
    return v;
  };
  const out: ClothCrossings = { enters: Infinity, covers: Infinity, uncovers: Infinity, gone: Infinity };
  for (let f = 0; f < count; f++) {
    const t = f / rate;
    const hemLow = row(f, ny - 1, Math.min, Infinity);
    const hemHigh = row(f, ny - 1, Math.max, -Infinity);
    const topLow = row(f, 0, Math.min, Infinity);
    const topHigh = row(f, 0, Math.max, -Infinity);
    if (out.enters === Infinity && hemLow <= 0.5) out.enters = t;
    if (out.covers === Infinity && hemHigh <= -0.5) out.covers = t;
    if (out.uncovers === Infinity && topLow <= 0.5) out.uncovers = t;
    if (out.gone === Infinity && topHigh <= -0.5) out.gone = t;
  }
  return out;
}
