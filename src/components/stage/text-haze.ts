import { envelope } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import type { BeatId, SlotId } from "@/scroll/types";

/**
 * Where the words of each text slot sit on the stage, so painted art that runs behind them can
 * recede for as long as they are up: foliage and fruit fade back into the sky's haze behind a
 * headline, clouds part around a card (see `PlateClearing` in `plate.tsx`, and `useTextHaze`).
 * Pure: no React, no three.
 *
 * Areas are fractions of the stage, from its left and its top, generous around the text's box in
 * `src/components/story/slots.ts` (wide layout) and in its stacked (phone) form.
 */

export interface StageArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const SLOT_AREAS: Readonly<Record<SlotId, { wide: StageArea; stacked: StageArea }>> = {
  "center-left": { wide: { left: 0.04, right: 0.58, top: 0.34, bottom: 0.74 }, stacked: { left: 0, right: 1, top: 0.04, bottom: 0.42 } },
  "bottom-left": { wide: { left: 0.04, right: 0.64, top: 0.6, bottom: 0.97 }, stacked: { left: 0, right: 1, top: 0.55, bottom: 1 } },
  right: { wide: { left: 0.49, right: 0.88, top: 0.25, bottom: 0.75 }, stacked: { left: 0, right: 1, top: 0.5, bottom: 1 } },
  "top-left": { wide: { left: 0.04, right: 0.64, top: 0.08, bottom: 0.42 }, stacked: { left: 0, right: 1, top: 0.04, bottom: 0.45 } },
  "top-center": { wide: { left: 0.27, right: 0.73, top: 0.06, bottom: 0.3 }, stacked: { left: 0, right: 1, top: 0.04, bottom: 0.26 } },
  center: { wide: { left: 0.27, right: 0.73, top: 0.18, bottom: 0.8 }, stacked: { left: 0.04, right: 0.96, top: 0.24, bottom: 0.76 } },
};

/** Width of the soft edge the art recedes across, as a fraction of the stage width. */
export const HAZE_SOFT = 0.08;

/**
 * How far the art behind a beat has receded at progress p, 0 to 1: it follows the beat's arrival
 * and leave (fully back while the beat holds), so it is gone exactly when the text is.
 */
export function beatHaze(id: BeatId, p: number): number {
  const beat = beatOf(id);
  if (beat.leave === "hold" && p >= beat.hold[0]) return 1;
  return envelope(p, [beat.in, beat.hold[0], beat.hold[1], beat.out]);
}

/** Index (in `ids`, beats that take turns) of the beat most on stage at p; the first one when none is. */
export function strongestBeat(ids: readonly BeatId[], p: number): number {
  let best = 0;
  let amount = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = beatHaze(ids[i], p);
    if (a > amount) {
      amount = a;
      best = i;
    }
  }
  return best;
}

/** How far the art has receded behind whichever of `ids` is most on stage at p, 0 to 1. */
export function hazeAmount(ids: readonly BeatId[], p: number): number {
  let amount = 0;
  for (const id of ids) amount = Math.max(amount, beatHaze(id, p));
  return amount;
}

/** The area of a beat's slot on a layout. */
export function beatArea(id: BeatId, stacked: boolean): StageArea {
  const area = SLOT_AREAS[beatOf(id).slot];
  return stacked ? area.stacked : area.wide;
}
