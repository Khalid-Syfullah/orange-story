import { plateEntry, type PlateId } from "@/art/manifest";
import { PRUNE } from "@/scroll/script";

import { BLOW_PHASES, blows, dampedKick, glide, storyTime, type MotionChannel, type Ring, type SceneMotion, type Track } from "./motion-kit";

/**
 * Scene 9, the gardener, as pure functions of progress (no React, no three). Timings live in
 * `PRUNE` (`src/scroll/script.ts`).
 *
 * He trims the young tree with his shears: `PRUNE.snips` snips over the trim, each a small opening
 * of the arms (the wind-up), a quick squeeze that shuts the shears (his arms turning on the shoulder;
 * the closed-shears frame takes over from the open one inside the quick part, in a short cross-fade,
 * so the swap is hidden in the motion) and a small give, then the shears opening again in the quick
 * part of the lift back. Each snip shakes the tree a little, the branch he works on most. His body
 * leans in with each squeeze, a beat behind his arms (`gardenerSwayAt`, `acting.ts`). Everything is a
 * function of progress, so it plays backwards exactly.
 */

/** The shears' squeeze: how far the arms turn on the shoulder (radians, + counter-clockwise: the blades dip) as they open and as they shut. */
export const SNIP = { open: 0.035, shut: -0.05, recoil: 0.3 } as const;
/** How long the frames take to swap, as a share of a snip, centred on the fastest part of the squeeze and of the opening. */
export const SWAP = 0.06;

/** The snips' arm turn over the trim. */
const snipTurn: Track = blows(PRUNE.trim, PRUNE.snips, { windUp: SNIP.open, hit: SNIP.shut, recoil: SNIP.recoil });

/** Shares of a snip where the shears shut (at the contact, the end of the squeeze) and where they are fastest opening again (the middle of the lift back). */
const SHUT_AT = BLOW_PHASES.windUp + BLOW_PHASES.swing;
const OPEN_AT = (1 + BLOW_PHASES.windUp + BLOW_PHASES.swing + BLOW_PHASES.recoil) / 2;

/** How far the arms are turned on the shoulder by the snips at progress p (radians). */
export function armTurnAt(p: number): number {
  return snipTurn(p);
}

/** The moments (progress) the shears shut on the twig, snip by snip. */
export const SNIP_CONTACTS: readonly number[] = Array.from({ length: PRUNE.snips }, (_, i) => {
  const length = (PRUNE.trim[1] - PRUNE.trim[0]) / PRUNE.snips;
  return PRUNE.trim[0] + (i + SHUT_AT) * length;
});

/**
 * How far the closed-shears frame has replaced the open one, 0 to 1: a short cross-fade that ends as
 * the shears shut, and another in the quickest part of the opening.
 */
export function shearsClosed(p: number): number {
  const [a, b] = PRUNE.trim;
  if (p <= a || p >= b) return 0;
  const length = (b - a) / PRUNE.snips;
  const i = Math.min(PRUNE.snips - 1, Math.floor((p - a) / length));
  const c = a + i * length;
  const swap = SWAP * length;
  const shut = c + SHUT_AT * length;
  const open = c + OPEN_AT * length;
  return glide(p, [shut - swap, shut]) * (1 - glide(p, [open - swap / 2, open + swap / 2]));
}

/** How a snip shakes the tree: a quick, light ring that dies within half a second. */
export const TREE_RING: Ring = { frequency: 3.5, decay: 7 };
/** How far each snip turns the branch he works on, and the whole tree about its foot (radians). */
export const SNIP_KICK = { branch: 0.03, tree: 0.006 } as const;

/** The tree's shake from the snips at progress p, a share of SNIP_KICK (each snip a damped kick from the moment the blades shut). */
export function snipShake(p: number): number {
  let shake = 0;
  for (const contact of SNIP_CONTACTS) {
    const t = storyTime(p, contact);
    if (t > 0 && t < 2) shake += dampedKick(1, t, TREE_RING);
  }
  return shake;
}

/** The tree's foot (its plate's anchor), which it turns about. */
const TREE_FOOT = plateEntry("prune/tree").position;

/**
 * Where a branch's foot goes when the tree turns by `turn` about its own foot (the branch stays on
 * the trunk): offsets to add to the branch's place. Its own turn adds to the tree's.
 */
export function onTree(id: PlateId, turn: number): { x: number; y: number } {
  const [px, py] = plateEntry(id).position;
  const dx = px - TREE_FOOT[0];
  const dy = py - TREE_FOOT[1];
  const c = Math.cos(turn) - 1;
  const sn = Math.sin(turn);
  return { x: dx * c - dy * sn, y: dx * sn + dy * c };
}

/** For the velocity check: what the prune drives (the gardener's lean is acting, `acting.ts`). */
const channels: MotionChannel[] = [
  { name: "arms · turn on the shoulder", at: armTurnAt },
  { name: "shears · closed frame", at: shearsClosed },
  { name: "tree · shake", at: snipShake },
];

export const PRUNE_MOTION: SceneMotion = { channels };
