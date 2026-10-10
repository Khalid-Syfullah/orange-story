import { plateEntry, type PlateId } from "@/art/manifest";
import { clamp01, remap, seeded } from "@/lib/progress";
import { ASCENT, ascentRiseShare } from "@/scroll/script";

import { beat, glide, track, type MotionChannel, type SceneMotion } from "./motion-kit";

/**
 * The ascent as pure functions of story progress (no React, no three), so every part of the scene
 * is a function of `progress` alone and plays backwards exactly. The timings live in `ASCENT`
 * (`src/scroll/script.ts`); the places come from the art manifest, so repainted plates need no code.
 *
 * - The statue, its orange and the top of the minaret rise together (`riseAt`). The shaft is one
 *   tiling plate whose top follows the statue: it grows taller while its bottom stays put, and it
 *   adds tiles instead of stretching them, so it can climb as far as the story needs.
 * - The stone becomes bark along a front (`morphAt`): the plate's stone/bark mask is stretched over
 *   the whole shaft, so the front is its height as a fraction of the shaft.
 * - Three branches split off the trunk (`branchAt`), each scaling out from where it joins, and their
 *   leaves unfurl along them (`leafAt`).
 */

export const MINARET: PlateId = "hero/minaret";
export const BRANCHES = ["ascent/branch-1", "ascent/branch-2", "ascent/branch-3"] as const;
export type BranchId = (typeof BRANCHES)[number];

const SHAFT = plateEntry(MINARET);

/** World height the statue has risen by the end of the scene (`ASCENT.riseTotal`: the camera keys follow the same rise). */
export const RISE_TOTAL = ASCENT.riseTotal;
/**
 * How far the statue and the shaft top have risen at progress p (world units): from rest, faster and
 * faster (the trunk "keeps growing"), slowing to a stop at the end of the scene (`ascentRiseShare`).
 */
export function riseAt(p: number): number {
  return RISE_TOTAL * ascentRiseShare(remap(p, ASCENT.rise[0], ASCENT.rise[1]));
}

export interface ShaftState {
  /** World height of the top of the shaft (the statue's feet). */
  top: number;
  /** World height of the bottom, which never moves. */
  bottom: number;
  /** Total height of the shaft plate. */
  height: number;
  /** Tiles down the shaft: grows with the height, so tiles keep their size. */
  repeatY: number;
}

const SHAFT_BOTTOM = SHAFT.position[1] - SHAFT.height;
const SHAFT_TILES = SHAFT.repeat?.[1] ?? 1;

export function shaftAt(p: number): ShaftState {
  const rise = riseAt(p);
  const height = SHAFT.height + rise;
  return { top: SHAFT.position[1] + rise, bottom: SHAFT_BOTTOM, height, repeatY: (SHAFT_TILES * height) / SHAFT.height };
}

/** The front's climb: one smooth curve through its keys and on to the top of the trunk by `barked`. */
const frontTrack = track([...ASCENT.front.map(([p, y]) => [p, y] as const), [ASCENT.barked, shaftAt(ASCENT.barked).top] as const]);

/** World height of the stone-to-bark front at progress p: bark below it, stone above (once it reaches the top of the trunk it rides it). */
export function frontAt(p: number): number {
  const top = shaftAt(p).top;
  return p >= ASCENT.barked ? top : Math.min(frontTrack(p), top);
}

/** Morph progress (0 stone, 1 bark) for the shaft's mask at progress p. */
export function morphAt(p: number): number {
  if (p >= ASCENT.barked) return 1;
  const { bottom, height } = shaftAt(p);
  return clamp01((frontAt(p) - bottom) / height);
}

/** How much of a branch has grown, 0 to 1, from rest to rest. */
export function branchAt(id: BranchId, p: number): number {
  return glide(p, ASCENT.branches[id]);
}

/** How much of the statue and its glow is left, 1 to 0, as they leave the picture. */
export function statueAt(p: number): number {
  return 1 - glide(p, ASCENT.statueFade);
}

/* Leaves */

export interface LeafSpec {
  id: string;
  branch: BranchId;
  /** World position of the stem. */
  position: readonly [number, number];
  /** Resting rotation in the plate's plane (radians, counterclockwise, 0 is up). */
  angle: number;
  /** Which way the leaf folds from (-1 or 1). */
  fold: -1 | 1;
  /** Size relative to the sprite's own height. */
  size: number;
  /** Depth just in front of its branch. */
  depth: number;
  /** Progress range in which the leaf unfurls. */
  range: readonly [number, number];
}

const LEAVES_PER_BRANCH: Record<BranchId, number> = { "ascent/branch-1": 6, "ascent/branch-2": 6, "ascent/branch-3": 8 };

/** Where a branch plate's tip is, in the world (the branch runs from its anchor out to one side). */
export function branchTip(id: BranchId): { base: readonly [number, number]; tip: readonly [number, number] } {
  const entry = plateEntry(id);
  const w = (entry.height * entry.size[0]) / entry.size[1];
  const dir = entry.anchor[0] >= 0.5 ? -1 : 1;
  const [x, y] = entry.position;
  return { base: [x, y], tip: [x + dir * w * 0.9, y + entry.height * 0.3] };
}

function buildLeaves(): LeafSpec[] {
  const leaves: LeafSpec[] = [];
  for (const branch of BRANCHES) {
    const { base, tip } = branchTip(branch);
    const rand = seeded(`leaves-${branch}`);
    const count = LEAVES_PER_BRANCH[branch];
    const [start, end] = ASCENT.branches[branch];
    const dx = tip[0] - base[0];
    const dy = tip[1] - base[1];
    const length = Math.hypot(dx, dy);
    const outward = Math.atan2(-dx, dy);
    const depth = plateEntry(branch).depth - 0.02;
    for (let i = 0; i < count; i++) {
      const t = 0.3 + (0.7 * (i + 0.5)) / count;
      const side = i % 2 === 0 ? 1 : -1;
      const offset = side * (0.05 + rand() * 0.08);
      // Leaves appear as the growing branch reaches them, and finish with it.
      const a = start + (end - start) * 0.55 * t;
      leaves.push({
        id: `${branch}-leaf-${i}`,
        branch,
        position: [base[0] + dx * t - (dy / length) * offset, base[1] + dy * t + (dx / length) * offset],
        angle: outward + side * (0.5 + rand() * 0.45),
        fold: side === 1 ? -1 : 1,
        size: 0.8 + rand() * 0.5,
        depth,
        range: [a, a + (end - start) * 0.45],
      });
    }
  }
  return leaves;
}

export const LEAVES: readonly LeafSpec[] = buildLeaves();

/** Radians a leaf is folded in before it unfurls. */
const FOLD = 1.1;

export interface LeafPose {
  scaleX: number;
  scaleY: number;
  rotate: number;
}

/** A leaf's unfurling: it opens from rest, swings a touch past its rest and settles (the turn); it fills out from rest to rest (the scale). */
const UNFURL = track(beat([0, 1], 0, 1, { overshoot: 0.08, settle: 0.35 }));

/** How a leaf looks at progress p: a small closed bud turned toward its branch, opening to rest. */
export function leafAt(leaf: LeafSpec, p: number): LeafPose {
  const t = remap(p, leaf.range[0], leaf.range[1]);
  const open = glide(t, [0, 1]);
  return {
    scaleX: 0.05 + 0.95 * open,
    scaleY: open,
    rotate: leaf.angle + leaf.fold * FOLD * (1 - UNFURL(t)),
  };
}

/** What the ascent drives (the camera's rise is the camera's own; the leaves follow `leafAt`). */
const channels: MotionChannel[] = [
  { name: "statue · rise", at: riseAt },
  { name: "bark · front", at: frontAt },
  ...BRANCHES.map((id): MotionChannel => ({ name: `${id.slice(7)} · growth`, at: (p) => branchAt(id, p) })),
  { name: "statue · fade", at: statueAt },
  ...LEAVES.slice(0, 4).map((leaf): MotionChannel => ({ name: `leaf ${leaf.id} · turn`, at: (p) => leafAt(leaf, p).rotate })),
];

export const ASCENT_MOTION: SceneMotion = { channels };
