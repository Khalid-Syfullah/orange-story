import { ease, remap } from "@/lib/progress";
import { PRUNE } from "@/scroll/script";

/**
 * Scene 9, the gardener, as pure functions of progress (no React, no three). Timings live in
 * `PRUNE` (`src/scroll/script.ts`). The shears close and open as he trims (scrubbed, so they
 * reverse exactly), and the left branch comes in a little shorter as the tree is shaped.
 */

/** How closed the shears are, 0 (open) to 1 (closed): `PRUNE.snips` smooth snips over the trim. */
export function shearsClosed(p: number): number {
  if (p <= PRUNE.trim[0] || p >= PRUNE.trim[1]) return 0;
  const t = remap(p, PRUNE.trim[0], PRUNE.trim[1]);
  const wave = Math.sin(t * PRUNE.snips * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 0 at the ends
  return ease(Math.min(1, wave * 1.4));
}

/** Scale of the side branch he trims: 1 before, a little less after. */
export function trimmedScale(p: number): number {
  return 1 - 0.14 * ease(remap(p, PRUNE.trim[0] + (PRUNE.trim[1] - PRUNE.trim[0]) * 0.2, PRUNE.trim[1]));
}

/** A small lean of the arms with each snip, in radians. */
export function armLean(p: number): number {
  return -0.03 * shearsClosed(p);
}
