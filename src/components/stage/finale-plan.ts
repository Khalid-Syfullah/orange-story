import { plateEntry, platePoint, WORLD_SCALE } from "@/art/manifest";
import { clamp01, ease, remap } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import { FINALE } from "@/scroll/script";

import { figureOffset, FINALE_SINK, SINK_DEPTH } from "./apply-plan";
import { VIEW as STARS_VIEW } from "./stars-plan";
import { cloudWeight } from "./work-sky";

export { FINALE_SINK };

/**
 * Scene 14, the finale, as pure functions (no React, no three). Timings live in `FINALE`
 * (`src/scroll/script.ts`); places come from the art manifest, and every offset here is world units
 * added to a plate's manifest place, sized in keeper heights (`KEEPER`, the world scale's adult) so
 * the loop keeps its proportions with the keepers.
 *
 * Two kinds of motion, kept apart:
 * - scrubbed by `progress`, so scrolling back plays them in reverse: the astronomer and his platform
 *   sink away, the stars drift up, the old cloud slides right, the tree rises, the woman and the man
 *   walk in and settle;
 * - the orchard keepers' loop, a function of idle time `t` (seconds) only: she waters, he snips and
 *   cuts an orange free, oranges drop now and then. It is faded in by `loopWeight(p)` once they have
 *   settled, so scrolling back up fades it out and everything returns to the start.
 */

/** The unit of the finale's offsets: a keeper's height. */
const KEEPER = WORLD_SCALE.adult;

/* ------------------------------------------------------------------ */
/* Scrubbed by scroll                                                  */
/* ------------------------------------------------------------------ */

/** Vertical offset of the astronomer and his platform: the apply sink (`depth`, see `sinkDepth`), then on out of the bottom. */
export function astronomerOffset(p: number, depth: number = SINK_DEPTH): number {
  return figureOffset(p, depth) - FINALE_SINK * ease(remap(p, FINALE.sink[0], FINALE.sink[1]));
}

/** How far (world units) the constellation drifts up: three quarters of the stargazer's view. */
export const STARS_LIFT = 0.73 * STARS_VIEW;

/** Upward drift of the constellation, 0 before the finale. */
export function starsLift(p: number): number {
  return STARS_LIFT * ease(remap(p, FINALE.stars[0], FINALE.stars[1]));
}

/** Opacity of the constellation: full, then fading over the last part of the drift. */
export function starsOpacity(p: number): number {
  const [a, b] = FINALE.stars;
  return 1 - ease(remap(p, a + (b - a) * 0.25, b));
}

/** How far (world units) the old cloud of the stargazer slides right: its own width and a half, out of the frame. */
export const OLD_CLOUD_SLIDE = (() => {
  const cloud = plateEntry("stars/cloud");
  return 1.5 * ((cloud.height * cloud.size[0]) / cloud.size[1]);
})();

/** Rightward slide of the cloud that kept the bottom right clear. */
export function oldCloudShift(p: number): number {
  return OLD_CLOUD_SLIDE * ease(remap(p, FINALE.cloud[0], FINALE.cloud[1]));
}

export function oldCloudOpacity(p: number): number {
  const [a, b] = FINALE.cloud;
  return 1 - ease(remap(p, a + (b - a) * 0.5, b));
}

/** The finale's clouds stand with the keepers: their drift (`driftX` in `work-sky.ts`) is scaled to a keeper's height. */
export const CLOUD_SCALE = KEEPER / 3.3;

/** Rightward shift of a finale cloud with the scroll. */
export function finaleCloudShift(p: number, depth: number): number {
  return ease(remap(p, FINALE.cloud[0], FINALE.cloud[1])) * 0.53 * KEEPER * cloudWeight(depth);
}

/** How far (world units) the tree starts below its place: wholly out of the bottom of the frame. */
export const TREE_RISE = 1.88 * KEEPER;

export interface TreePose {
  /** World offset added to the manifest place. */
  y: number;
  /** Scale about the foot of the tree. */
  scale: number;
}

/** The tree rising from the bottom center, its branches filling out as it comes. */
export function treeAt(p: number): TreePose {
  const t = ease(remap(p, FINALE.tree[0], FINALE.tree[1]));
  return { y: -TREE_RISE * (1 - t), scale: 0.88 + 0.12 * t };
}

/** How far the tree recedes into the sky's haze behind the wordmark (inside the frame), at most. */
export const TREE_HAZE = 0.75;
/** And blurred this much at most (a fraction of the view height), as the focus moves to the wordmark. */
export const TREE_SOFT_BLUR = 0.004;

/**
 * How much the tree has receded behind the wordmark, 0 to 1: it follows the wordmark's arrival (the
 * `finale` beat), so the wordmark, the subtitle and the footer always read on a calm ground.
 */
export function treeHazeAt(p: number): number {
  const beat = beatOf("finale");
  return ease(remap(p, beat.in, beat.hold[0]));
}

/** How far (world units) the figures start to the side of their place: wholly out of the frame. */
export const ENTER_FROM = 1.82 * KEEPER;

export interface Walker {
  /** World offset added to the manifest place. */
  x: number;
  /** A small bounce with each step while walking in. */
  y: number;
}

const STEPS = 5;

function walk(p: number, range: readonly [number, number], side: -1 | 1): Walker {
  const t = remap(p, range[0], range[1]);
  const x = side * ENTER_FROM * (1 - ease(t));
  const y = t > 0 && t < 1 ? Math.abs(Math.sin(t * Math.PI * STEPS)) * 0.018 * KEEPER * Math.sin(t * Math.PI) : 0;
  return { x, y };
}

/** The woman with the watering can comes in from the left. */
export const womanAt = (p: number): Walker => walk(p, FINALE.woman, -1);

/** The man with the shears comes in from the right. */
export const manAt = (p: number): Walker => walk(p, FINALE.man, 1);

/** 0 until they have settled, then 1: how much of the idle loop shows (eased, so it reverses). */
export function loopWeight(p: number): number {
  return ease(remap(p, FINALE.loop[0], FINALE.loop[1]));
}

/* ------------------------------------------------------------------ */
/* The loop, on idle time                                              */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const smooth = (x: number) => x * x * (3 - 2 * x);
const wrap = (t: number, length: number) => ((t % length) + length) % length;

/** Seconds for the woman to tip the can and water. */
export const WATER_CYCLE = 5.2;
/** The water stream swaps frames this many times a second. */
export const STREAM_FPS = 8;
/** How far (radians) the can tips forward while pouring. */
export const CAN_TIP = 0.14;

export interface Watering {
  /** How far the can is tipped, 0 to 1. */
  tilt: number;
  /** How much water shows, 0 to 1 (only once the can is tipped). */
  stream: number;
  /** Which of the three stream frames shows, 0 to 2. */
  frame: number;
}

/** Her watering at idle time t: she tips the can, water runs from its spout, she lifts it again. Writes into `out` when given (the frame loop reuses one). */
export function wateringAt(t: number, out: Watering = { tilt: 0, stream: 0, frame: 0 }): Watering {
  const u = wrap(t, WATER_CYCLE) / WATER_CYCLE;
  const tilt = clamp01((0.5 - 0.5 * Math.cos(TAU * u)) * 1.7);
  out.tilt = tilt;
  out.stream = smooth(remap(tilt, 0.6, 0.9));
  out.frame = Math.floor(t * STREAM_FPS) % 3;
  return out;
}

/** Seconds of one round of the man's trimming: a few snips, then the cut that frees an orange. */
export const TRIM_CYCLE = 6.4;
/** Where in the round each snip of the shears starts, and how long the shears stay shut. */
const SNIPS: readonly (readonly [number, number])[] = [
  [0.7, 0.2],
  [1.1, 0.2],
  [1.5, 0.2],
  [2.3, 0.34], // the cut that frees the orange
];
/** When in the round the orange comes free (the last snip). */
export const CUT_AT = SNIPS[SNIPS.length - 1][0] + 0.12;

/** How shut the shears are at idle time t, 0 (open) to 1 (closed). */
export function shearsAt(t: number): number {
  const s = wrap(t, TRIM_CYCLE);
  let closed = 0;
  for (const [start, length] of SNIPS) {
    const u = (s - start) / length;
    if (u > 0 && u < 1) closed = Math.max(closed, Math.sin(u * Math.PI) ** 0.6);
  }
  return closed;
}

/** A small lift and lower of his arms as he works, in world units. */
export function armBobAt(t: number): number {
  return 0.012 * KEEPER * Math.sin((wrap(t, TRIM_CYCLE) / TRIM_CYCLE) * TAU * 2);
}

/** A falling orange: where it is (world units), how it turns, how visible. */
export interface FruitFrame {
  x: number;
  y: number;
  rotate: number;
  opacity: number;
  scale: number;
}

/** Gravity of the falling fruit, in world units per second squared (keeper heights, so the fall keeps its pace on screen). */
const GRAVITY = 1.82 * KEEPER;
/** Fruit that has fallen this far (world y) is gone: the keepers' feet, below the bottom of the frame. */
const FLOOR = plateEntry("finale/woman-body").position[1];

/** Writes a fruit frame into `out` (a new one when not given), so the frame loop can reuse one object per fruit. */
function fruit(out: FruitFrame | undefined, x: number, y: number, rotate: number, opacity: number, scale: number): FruitFrame {
  const frame = out ?? { x: 0, y: 0, rotate: 0, opacity: 0, scale: 1 };
  frame.x = x;
  frame.y = y;
  frame.rotate = rotate;
  frame.opacity = opacity;
  frame.scale = scale;
  return frame;
}

/** A fruit that is not there. */
const hidden = (out?: FruitFrame): FruitFrame => fruit(out, 0, 0, 0, 0, 1);

/** Where he cuts: the tips of the open shears (the `shears-tip` point of his arms plate). */
const shearsTip = platePoint("finale/man-arms-1", "shears-tip");
export const CUT_POINT: readonly [number, number] = [shearsTip[0], shearsTip[1]];

/** Where the water leaves her jug (the `spout` point of her arm plate): the stream frames hang from here. */
const spoutPoint = platePoint("finale/woman-arm", "spout");
export const SPOUT: readonly [number, number] = [spoutPoint[0], spoutPoint[1]];

/** The orange he cuts free: it hangs from its stem while he snips, then drops when the last snip shuts. Writes into `out` when given. */
export function cutFruitAt(t: number, out?: FruitFrame): FruitFrame {
  const s = wrap(t, TRIM_CYCLE);
  const hangFrom = 0.4;
  if (s < hangFrom || s >= TRIM_CYCLE) return hidden(out);
  const homeX = CUT_POINT[0];
  const homeY = CUT_POINT[1] - 0.036 * KEEPER;
  if (s < CUT_AT) {
    const grow = smooth(remap(s, hangFrom, hangFrom + 0.35));
    return fruit(out, homeX, homeY, 0.12 * Math.sin(s * 5) * (s / CUT_AT), grow, 0.6 + 0.4 * grow);
  }
  const tau = s - CUT_AT;
  const drop = 0.5 * GRAVITY * tau * tau;
  const y = homeY - drop;
  if (y < FLOOR) return hidden(out);
  return fruit(out, homeX - 0.055 * KEEPER * tau, y, -2.2 * tau, 1, 1);
}

interface Drop {
  /** Starting place in the tree: fractions of its plate, from the left and the top. */
  u: number;
  v: number;
  /** Seconds between drops, and where in that round this one starts. */
  period: number;
  offset: number;
  /** Sideways drift per second (keeper heights) and spin, so no two fall alike. */
  drift: number;
  spin: number;
}

/** Oranges that drop out of the tree now and then, each on its own slow round. */
const DROPS: readonly Drop[] = [
  { u: 0.333, v: 0.315, period: 9.3, offset: 3.1, drift: 0.036, spin: 1.8 },
  { u: 0.602, v: 0.204, period: 13.7, offset: 8.4, drift: -0.046, spin: -2.4 },
  { u: 0.463, v: 0.426, period: 17.9, offset: 12.5, drift: 0.024, spin: 1.2 },
];

/** A point of the tree's plate in the world (where a drop starts). */
function treePoint(u: number, v: number): [number, number] {
  const tree = plateEntry("finale/tree");
  const w = (tree.height * tree.size[0]) / tree.size[1];
  return [tree.position[0] + (u - tree.anchor[0]) * w, tree.position[1] + (tree.anchor[1] - v) * tree.height];
}

const DROP_START = DROPS.map((d) => treePoint(d.u, d.v));

export const DROP_COUNT = DROPS.length;

/** Where the nth drop is at idle time t (hidden between drops). Writes into `out` when given. */
export function dropAt(n: number, t: number, out?: FruitFrame): FruitFrame {
  const drop = DROPS[n];
  const [x, y] = DROP_START[n];
  const tau = wrap(t + drop.offset, drop.period);
  const fallen = 0.5 * GRAVITY * tau * tau;
  const lifetime = Math.sqrt((2 * (y - FLOOR)) / GRAVITY);
  if (tau >= lifetime) return hidden(out);
  const fade = smooth(remap(tau, 0, 0.12));
  return fruit(out, x + drop.drift * KEEPER * tau, y - fallen, drop.spin * tau, fade, 1);
}
