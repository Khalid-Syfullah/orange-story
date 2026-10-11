import { transitionOf } from "@/scroll/helpers";
import { PLAN_MIDDLE, UNFOLD_PAGES } from "@/scroll/script";

import { track } from "../motion-kit";
import type { Hinge } from "./hinge";
import { lensRect, poseAt, screenRect } from "./match-cut";

/**
 * Blueprint to site: the paper unfolds (pure). The camera dives into the plan in the architect's
 * hands until its paper fills the frame: the two middle panels side by side, the crease between them
 * in the middle (`PLAN_MIDDLE`, the reframe key's shot). At that moment (`UNFOLD_COVERED`) a sheet in
 * front of the lens takes over, the same paper and drawings exactly where the plan was on the screen
 * (`sheetPlacement`), and the camera reframes to the building site under it. Then the sheet opens on
 * its creases (`UNFOLD_PAGES`): the right page turns toward the camera over the middle crease and
 * lands on the left one with a small flop; then the doubled left half turns away over the left crease,
 * out past the lens. Each page bends as stiff paper does, its free edge lagging behind its hinge
 * (`hinge.ts`).
 */

export const UNFOLD_DEF = transitionOf("unfold");
export const [UNFOLD_COVERED, UNFOLD_CLEARING] = UNFOLD_DEF.peak!;

/** A page lands flat on the other: as it comes down it springs back up a little and settles. */
const LANDING = { bounce: 0.06, settle: 0.2 } as const;
/** A page first lifts a little at its free edge (a share of its time, and radians). */
const LIFT = { share: 0.1, turn: 0.04 } as const;
/** How far (progress) a page's free edge lags its hinge, as a share of its turn. */
const LAG = 0.14;

/** A page's turn over a range: lifting from rest, over half a turn, a small flop as it lands, settling. */
function pageTurn([a, b]: readonly [number, number]): Hinge {
  const span = b - a;
  const land = b - LANDING.settle * span;
  return {
    turn: track([
      [a, 0],
      [a + LIFT.share * span, LIFT.turn],
      [land, Math.PI],
      [land + 0.45 * (b - land), Math.PI - LANDING.bounce],
      [b, Math.PI],
    ]),
    lag: LAG * span,
  };
}

/** The right page (the third panel), over the middle crease. */
export const RIGHT_PAGE = pageTurn(UNFOLD_PAGES.first);
/** The left page (the second panel, the right one lying on it), over the left crease. */
export const LEFT_PAGE = pageTurn(UNFOLD_PAGES.second);

/** Where the sheet stands in front of the lens: as far as the plan was from the camera when it took over. */
export function sheetDepth(): number {
  const pose = poseAt(UNFOLD_COVERED);
  return Math.abs(pose.pz - PLAN_MIDDLE.z);
}

/**
 * The sheet's place in front of the lens, matching the plan's two middle panels on a stage of this
 * size at the moment it takes over: the crease's x (lens units), the sheet's middle height, a panel's
 * width and height, at `sheetDepth()`.
 */
export function sheetPlacement(width: number, height: number): { crease: number; y: number; panel: number; tall: number; depth: number } {
  const depth = sheetDepth();
  const rect = screenRect(PLAN_MIDDLE, UNFOLD_COVERED, width, height);
  const fov = poseAt(UNFOLD_COVERED).fov;
  const r = lensRect(rect, depth, width, height, fov);
  return { crease: r.x, y: r.y, panel: r.width / 2, tall: r.height, depth };
}

/** True once the sheet has taken over from the plan (it shows until the transition ends). */
export function sheetShows(p: number): boolean {
  return p >= UNFOLD_COVERED && p < UNFOLD_DEF.end;
}
