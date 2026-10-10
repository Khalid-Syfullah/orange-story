import { plateEntry, platePoint, plateWorldSize } from "@/art/manifest";
import { BLUEPRINT, PLAN_DEPTH, PLAN_HELD } from "@/scroll/script";

import { beat, glide, noMarks, track, type MotionChannel, type MotionMarks, type SceneMotion, type Track, type Vec3 } from "./motion-kit";

/**
 * Scene 7, the blueprint, as pure functions (no React, no three). Timings live in `BLUEPRINT`
 * (`src/scroll/script.ts`); places come from the art manifest.
 *
 * The drawing is four panels hinged edge to edge and folded like an accordion. The architect holds
 * the last one (its grip points on hers, `PLAN_HELD`), at her depth. Folded, the other three lie
 * behind it, each turned not quite flat onto the one it hangs from, alternately one way and the
 * other. They swing open one after another, each on the hinge it shares with the panel before:
 * the third off the one in her hands (carrying the other two folded on it), then the second (toward
 * the camera, the accordion's other way), then the first. Turns about vertical hinges, seen in
 * perspective, never a stretch; each goes a touch past flat and settles, as stiff paper does. A
 * panel darkens as it turns from the light, and shows the paper's plain back when it is turned away.
 * Everything is a function of progress alone, so it plays backwards exactly.
 */

export const PANELS = 4;
export const PANEL_IDS = ["blueprint/plan-1", "blueprint/plan-2", "blueprint/plan-3", "blueprint/plan-4"] as const;
/** World width of one panel. */
export const PANEL_WIDTH = plateWorldSize(plateEntry("blueprint/plan-1"))[0];
/** A folded panel's turn onto the one it hangs from: not quite flat (paper never folds to nothing). */
export const FOLDED_TURN = 0.97 * Math.PI;
/** How far past flat a swinging panel goes before it settles, as a share of its swing. */
export const SWING_PAST = 0.025;
/** Where a hanging panel is held: its hinge, the middle of its right edge (it hangs from the panel to its right). */
export const HINGE_ANCHOR = [1, 0.5] as const;
/** The panel in her hands. */
export const HELD_PANEL = PANELS - 1;

/** The held panel's anchor (its middle) in her hands, at the plan's depth. */
const HELD_AT: readonly [number, number] = [plateEntry("blueprint/plan-4").position[0] + PLAN_HELD[0], plateEntry("blueprint/plan-4").position[1] + PLAN_HELD[1]];

/**
 * Each fold's turn (radians) through its swing, from FOLDED_TURN to flat: `folds[0]` hinges the
 * third panel on the one in her hands, `folds[1]` the second on the third, `folds[2]` the first on
 * the second.
 */
const folds: readonly Track[] = BLUEPRINT.folds.map((range) => track(beat(range, FOLDED_TURN, 0, { overshoot: SWING_PAST, settle: 0.4 })));

/** How far fold k (0 to 2) is still closed at progress p, in radians (FOLDED_TURN shut, 0 flat). */
export function foldAt(k: number, p: number): number {
  return folds[k](p);
}

/**
 * The turn of each panel about its vertical hinge (`turnY`, positive brings its left edge toward the
 * camera): the held panel faces the camera; each fold turns its panel against the one before, the
 * accordion's alternate ways (the third panel folds back behind the held one, the second forward
 * over the third, the first back again). Written into `out`, by panel index.
 */
export function panelTurns(p: number, out: number[] = [0, 0, 0, 0]): number[] {
  out[HELD_PANEL] = 0;
  let turn = 0;
  for (let k = 0; k < PANELS - 1; k++) {
    turn += (k % 2 === 0 ? -1 : 1) * folds[k](p);
    out[HELD_PANEL - 1 - k] = turn;
  }
  return out;
}

export interface PanelPose {
  /** World x and y of the panel's anchor: the held panel's middle, a hanging panel's hinge (`HINGE_ANCHOR`). */
  x: number;
  y: number;
  /** In front of (+) or behind (-) the plan's depth, world units. */
  z: number;
  /** Its turn about the vertical through its anchor (radians, `turnY`). */
  turn: number;
  /** How far toward shade, 0 (lit, flat) to 1. */
  shade: number;
}

/** The light on the plan: from the front left (x, z), as on the rest of the stage. */
const LIGHT: readonly [number, number] = [-0.45 / Math.hypot(0.45, 1), 1 / Math.hypot(0.45, 1)];
/** How dark a panel goes turned edge-on to the light; how much darker while it is folded into the packet (in the others' shadow). */
export const SHADE = { turned: 0.55, folded: 0.4 } as const;

/** How much of the light reaches the side of a panel the camera sees, at a turn: 1 flat. */
function lightOn(turn: number): number {
  const nx = Math.sin(turn);
  const nz = Math.cos(turn);
  const side = nz >= 0 ? 1 : -1;
  return Math.max(0, Math.min(1, (side * (nx * LIGHT[0] + nz * LIGHT[1])) / LIGHT[1]));
}

const turns = [0, 0, 0, 0];

/** Pose of panel i (0 to 3) at progress p: the held one in her hands, the others hung each from the one to its right. */
export function panelAt(i: number, p: number): PanelPose {
  panelTurns(p, turns);
  // Walk the chain from her hands out to panel i: each hinge is the left edge of the panel before.
  let x = HELD_AT[0] - PANEL_WIDTH / 2;
  let z = 0;
  if (i === HELD_PANEL) return { x: HELD_AT[0], y: HELD_AT[1], z: 0, turn: 0, shade: 0 };
  for (let k = HELD_PANEL - 1; k > i; k--) {
    x -= PANEL_WIDTH * Math.cos(turns[k]);
    z += PANEL_WIDTH * Math.sin(turns[k]);
  }
  const folded = Math.max(0, Math.min(1, foldAt(HELD_PANEL - 1 - i, p) / FOLDED_TURN));
  const shade = Math.min(1, SHADE.turned * (1 - lightOn(turns[i])) + SHADE.folded * folded);
  return { x, y: HELD_AT[1], z, turn: turns[i], shade };
}

/** The architect's slight lean toward the plan as it opens (radians about her feet). */
export function architectLean(p: number): number {
  return glide(p, [BLUEPRINT.toArchitect[0], BLUEPRINT.panels[1]]) * 0.03;
}

/* ------------------------------------------------------------------ */
/* For the velocity check and the motion lab                           */
/* ------------------------------------------------------------------ */

const ARCHITECT_GRIPS = ["grip-left", "grip-right"].map((name) => platePoint("blueprint/architect", name));

/** A hanging panel's free edge (its left edge, halfway up), world. */
function freeEdge(i: number, p: number): Vec3 {
  const pose = panelAt(i, p);
  return [pose.x - PANEL_WIDTH * Math.cos(pose.turn), pose.y, -PLAN_DEPTH + pose.z + PANEL_WIDTH * Math.sin(pose.turn)];
}

function blueprintMarks(p: number): MotionMarks {
  const marks = noMarks();
  for (let i = 0; i < HELD_PANEL; i++) {
    const pose = panelAt(i, p);
    const hinge: Vec3 = [pose.x, pose.y, -PLAN_DEPTH + pose.z];
    marks.pivots.push(hinge);
    marks.bones.push([hinge, freeEdge(i, p)]);
  }
  for (const g of ARCHITECT_GRIPS) marks.grips.push([g[0], g[1], g[2]]);
  return marks;
}

const channels: MotionChannel[] = [];
for (let k = 0; k < PANELS - 1; k++) channels.push({ name: `plan · fold ${k + 1}`, at: (p) => foldAt(k, p) });
for (let i = 0; i < HELD_PANEL; i++) {
  channels.push({ name: `plan · panel ${i + 1} hinge x`, at: (p) => panelAt(i, p).x });
  channels.push({ name: `plan · panel ${i + 1} hinge z`, at: (p) => panelAt(i, p).z });
}
channels.push({ name: "architect · lean", at: architectLean });

/** What the blueprint's plan drives (the builder's mallet is acting, `acting.ts`). */
export const BLUEPRINT_MOTION: SceneMotion = {
  channels,
  marks: blueprintMarks,
  arcs: () =>
    [0, 1, 2].map((i) => ({
      name: `panel ${i + 1} free edge`,
      points: Array.from({ length: 41 }, (_, n) => freeEdge(i, BLUEPRINT.panels[0] + ((BLUEPRINT.panels[1] - BLUEPRINT.panels[0]) * n) / 40)),
    })),
};
