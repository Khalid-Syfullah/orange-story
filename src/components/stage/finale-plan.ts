import { plateEntry, platePoint, WORLD_SCALE } from "@/art/manifest";
import { dragAxis } from "@/lib/flight";
import { remap } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import { FINALE, PHYSICS } from "@/scroll/script";

import { figureOffset, FINALE_SINK, SINK_DEPTH } from "./apply-plan";
import { beat, BLOW_PHASES, blows, dampedKick, glide, smoother, track, type MotionChannel, type SceneMotion, type Track, type TrackKey } from "./motion-kit";
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
 * - scrubbed by `progress`, so scrolling back plays them in reverse, every move from rest to rest
 *   (the motion kit's `glide`): the astronomer and his platform sink away, the stars drift up, the
 *   old cloud slides right, the tree rises, the woman and the man walk in (a step's rise and fall in
 *   time with the ground they cover) and settle;
 * - the orchard keepers' loop, a function of idle time `t` (seconds) only: she tips her jug and the
 *   water runs from its spout in a true parabola that follows the tilt and breaks into drops, as much
 *   of it as the tilt lets out; he squeezes his shears (the closed frame takes over inside the quick
 *   part of each squeeze) and cuts an orange free, which falls, and the tree shakes; oranges drop now
 *   and then. It is faded in by `loopWeight(p)` once they have settled, so scrolling back up fades it
 *   out and everything returns to the start.
 */

/** The unit of the finale's offsets: a keeper's height. */
const KEEPER = WORLD_SCALE.adult;

/* ------------------------------------------------------------------ */
/* Scrubbed by scroll                                                  */
/* ------------------------------------------------------------------ */

/** Vertical offset of the astronomer and his platform: the apply sink (`depth`, see `sinkDepth`), then on out of the bottom. */
export function astronomerOffset(p: number, depth: number = SINK_DEPTH): number {
  return figureOffset(p, depth) - FINALE_SINK * glide(p, FINALE.sink);
}

/** How far (world units) the constellation drifts up: three quarters of the stargazer's view. */
export const STARS_LIFT = 0.73 * STARS_VIEW;

/** Upward drift of the constellation, 0 before the finale. */
export function starsLift(p: number): number {
  return STARS_LIFT * glide(p, FINALE.stars);
}

/** Opacity of the constellation: full, then fading over the last part of the drift. */
export function starsOpacity(p: number): number {
  const [a, b] = FINALE.stars;
  return 1 - glide(p, [a + (b - a) * 0.25, b]);
}

/** How far (world units) the old cloud of the stargazer slides right: its own width and a half, out of the frame. */
export const OLD_CLOUD_SLIDE = (() => {
  const cloud = plateEntry("stars/cloud");
  return 1.5 * ((cloud.height * cloud.size[0]) / cloud.size[1]);
})();

/** Rightward slide of the cloud that kept the bottom right clear. */
export function oldCloudShift(p: number): number {
  return OLD_CLOUD_SLIDE * glide(p, FINALE.cloud);
}

export function oldCloudOpacity(p: number): number {
  const [a, b] = FINALE.cloud;
  return 1 - glide(p, [a + (b - a) * 0.5, b]);
}

/** The finale's clouds stand with the keepers: their drift (`driftX` in `work-sky.ts`) is scaled to a keeper's height. */
export const CLOUD_SCALE = KEEPER / 3.3;

/** Rightward shift of a finale cloud with the scroll. */
export function finaleCloudShift(p: number, depth: number): number {
  return glide(p, FINALE.cloud) * 0.53 * KEEPER * cloudWeight(depth);
}

/** How far (world units) the tree starts below its place: wholly out of the bottom of the frame. */
export const TREE_RISE = 1.88 * KEEPER;

export interface TreePose {
  /** World offset added to the manifest place. */
  y: number;
}

/** The tree rising from the bottom center, from rest, slowing into its place. */
export function treeAt(p: number): TreePose {
  return { y: -TREE_RISE * (1 - glide(p, FINALE.tree)) };
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
  const words = beatOf("finale");
  return glide(p, [words.in, words.hold[0]]);
}

/** How far (world units) the figures start to the side of their place: wholly out of the frame. */
export const ENTER_FROM = 1.82 * KEEPER;

export interface Walker {
  /** World offset added to the manifest place. */
  x: number;
  /** The body's rise and fall with each step while walking in. */
  y: number;
}

/** Steps to cross ENTER_FROM, and how high the body rises at mid-step (keeper heights). */
const STEPS = 5;
const STEP_RISE = 0.012;

/**
 * A walk in from the side: from rest, slowing to a stop on the mark (`glide`); the body rises and
 * falls once a step, in time with the ground covered, so the steps slow as the walk does and stop
 * with it (a smooth rise, never the bounce of a ball).
 */
function walk(p: number, range: readonly [number, number], side: -1 | 1): Walker {
  const covered = glide(p, range);
  return { x: side * ENTER_FROM * (1 - covered), y: STEP_RISE * KEEPER * 0.5 * (1 - Math.cos(2 * Math.PI * STEPS * covered)) };
}

/** The woman with the watering can comes in from the left. */
export const womanAt = (p: number): Walker => walk(p, FINALE.woman, -1);

/** The man with the shears comes in from the right. */
export const manAt = (p: number): Walker => walk(p, FINALE.man, 1);

/** 0 until they have settled, then 1: how much of the idle loop shows (from rest to rest, so it reverses). */
export function loopWeight(p: number): number {
  return glide(p, FINALE.loop);
}

/* ------------------------------------------------------------------ */
/* The loop, on idle time                                              */
/* ------------------------------------------------------------------ */

const wrap = (t: number, length: number) => ((t % length) + length) % length;

/** Gravity on the loop: the world's own (a keeper is life size). */
const G = PHYSICS.gravity;

/* The watering -------------------------------------------------------- */

/** Seconds for the woman to tip the jug, water and lift it again. */
export const WATER_CYCLE = 5.2;
/** How far (radians) the jug tips forward while pouring. */
export const CAN_TIP = 0.14;

/** The jug's tip over one round: up from rest, a touch past and settling into the pour, a long pour, and back. */
const tipTrack: Track = track([
  ...beat([0.5, 1.6], 0, 1, { overshoot: 0.06, settle: 0.4 }),
  ...beat([3.5, 4.5], 1, 0),
]);

export interface Watering {
  /** How far the jug is tipped, 0 to 1. */
  tilt: number;
  /** How much water leaves the spout, 0 to 1: none until the water reaches the lip, all of it once the jug is well over. */
  flow: number;
}

/** How much water runs at a tilt: none below the lip, then more and more. */
export function flowAt(tilt: number): number {
  return smoother(remap(tilt, 0.42, 0.92));
}

/** Her watering at idle time t: the jug's tilt and the water it lets out. Writes into `out` when given (the frame loop reuses one). */
export function wateringAt(t: number, out: Watering = { tilt: 0, flow: 0 }): Watering {
  const tilt = tipTrack(wrap(t, WATER_CYCLE));
  out.tilt = tilt;
  out.flow = flowAt(tilt);
  return out;
}

/**
 * The water leaving the spout: its speed (m/s, faster the more is poured) and its direction (radians
 * from the picture's right, toward the tree; below the level as the jug tips further), and how wide
 * the stream is at the lip when it runs full (keeper heights).
 */
export const POUR = { speed: [0.25, 0.95], angle: [-0.2, -0.75], width: 0.03 } as const;
/** The stream holds together for this long after leaving the spout (seconds), then breaks into drops, which fall until `fall`. */
export const STREAM_BREAKS = { after: 0.2, fall: 0.62 } as const;

/** A parcel of water: where it is, from the spout (world units), how much water it carries (0 to 1), and how wide the stream is there. */
export interface Parcel {
  x: number;
  y: number;
  /** Its direction of travel (radians). */
  angle: number;
  flow: number;
  width: number;
}

const POUR_STATE: Watering = { tilt: 0, flow: 0 };
const AXIS: [number, number] = [0, 0];

/**
 * The parcel of water that left the spout `age` seconds before idle time t, where it is now: it left
 * with the pour of that moment (so the stream bends as the tilt changes, the change running down it)
 * and has flown a true parabola since. No water left before the jug was tipped, so the stream's head
 * falls from the lip as the pour starts and its tail falls away as it stops. Writes into `out`.
 */
export function parcelAt(t: number, age: number, out: Parcel): Parcel {
  wateringAt(t - age, POUR_STATE);
  const flow = POUR_STATE.flow;
  const speed = POUR.speed[0] + (POUR.speed[1] - POUR.speed[0]) * flow;
  const angle = POUR.angle[0] + (POUR.angle[1] - POUR.angle[0]) * POUR_STATE.tilt;
  const vx = speed * Math.cos(angle);
  const vy = speed * Math.sin(angle);
  out.x = vx * age;
  dragAxis(0, vy, -G, 0, age, AXIS);
  out.y = AXIS[0];
  out.angle = Math.atan2(AXIS[1], vx);
  out.flow = flow;
  // As it speeds up the stream thins (the same water through a smaller section).
  out.width = POUR.width * KEEPER * Math.sqrt(flow) * Math.sqrt(speed / Math.max(speed, Math.hypot(vx, AXIS[1])));
  return out;
}

/** A drop of the broken stream: one every DROP_EVERY seconds of pouring, each with its own small scatter (so no two fall alike). */
export const DROP_EVERY = 1 / 36;

/** A seeded number in 0..1 for drop k. */
const hash = (k: number) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The scatter of drop k: a small extra speed across and along (m/s), and its size against the stream's width. */
export function dropScatter(k: number): { across: number; along: number; size: number } {
  return { across: (hash(k) - 0.5) * 0.18, along: (hash(k + 17) - 0.5) * 0.12, size: 0.55 + 0.7 * hash(k + 41) };
}

/* The trimming -------------------------------------------------------- */

/** Seconds of one round of the man's trimming: a few snips, then the cut that frees an orange. */
export const TRIM_CYCLE = 6.4;
/** Each snip of the round: when it starts and how long it takes (seconds); the last frees the orange. */
const SNIPS: readonly (readonly [number, number])[] = [
  [0.6, 0.42],
  [1.05, 0.42],
  [1.5, 0.42],
  [2.15, 0.62], // the cut that frees the orange
];
/** The squeeze: how far his arms turn on the shoulder as the shears open and as they shut (radians). */
export const SQUEEZE = { open: 0.035, shut: -0.06, recoil: 0.25 } as const;
/** Shares of a snip where the shears shut, and where they open fastest. */
const SHUT_AT = BLOW_PHASES.windUp + BLOW_PHASES.swing;
const OPEN_AT = (1 + BLOW_PHASES.windUp + BLOW_PHASES.swing + BLOW_PHASES.recoil) / 2;
/** How long the frames take to swap, as a share of a snip. */
const SWAP = 0.07;

const trimKeys: TrackKey[] = [];
for (const [start, length] of SNIPS) trimKeys.push(...blows([start, start + length], 1, { windUp: SQUEEZE.open, hit: SQUEEZE.shut, recoil: SQUEEZE.recoil }).keys);
const trimTrack: Track = track(trimKeys);

/** When in the round the orange comes free: as the last snip shuts. */
export const CUT_AT = SNIPS[SNIPS.length - 1][0] + SHUT_AT * SNIPS[SNIPS.length - 1][1];

/** How far his arms are turned on the shoulder at idle time t (radians). */
export function trimTurnAt(t: number): number {
  return trimTrack(wrap(t, TRIM_CYCLE));
}

/** How far the closed-shears frame has replaced the open one at idle time t, 0 to 1: in the quick part of each squeeze, and back as they open. */
export function shearsAt(t: number): number {
  const s = wrap(t, TRIM_CYCLE);
  let closed = 0;
  for (const [start, length] of SNIPS) {
    const shut = start + SHUT_AT * length;
    const open = start + OPEN_AT * length;
    const swap = SWAP * length;
    closed = Math.max(closed, glide(s, [shut - swap, shut]) * (1 - glide(s, [open - swap / 2, open + swap / 2])));
  }
  return closed;
}

/** A small lift and lower of his arms as he works, in world units. */
export function armBobAt(t: number): number {
  return 0.012 * KEEPER * Math.sin((wrap(t, TRIM_CYCLE) / TRIM_CYCLE) * Math.PI * 4);
}

/** The tree shakes as he cuts the orange free (a turn about its foot, radians), and rings out. */
export const CUT_SHAKE = { amount: 0.006, frequency: 2.4, decay: 3.5 } as const;
export function treeShakeAt(t: number): number {
  const since = wrap(t, TRIM_CYCLE) - CUT_AT;
  return CUT_SHAKE.amount * dampedKick(1, since < 0 ? since + TRIM_CYCLE : since, { frequency: CUT_SHAKE.frequency, decay: CUT_SHAKE.decay });
}

/* Falling fruit ------------------------------------------------------- */

/** A falling orange: where it is (world units), how it turns, how visible. */
export interface FruitFrame {
  x: number;
  y: number;
  rotate: number;
  opacity: number;
  scale: number;
}

/** Light air drag on a falling orange, per second. */
const FRUIT_DRAG = 0.3;
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

/** Where the water leaves her jug (the `spout` point of her arm plate). */
const spoutPoint = platePoint("finale/woman-arm", "spout");
export const SPOUT: readonly [number, number] = [spoutPoint[0], spoutPoint[1]];

/** A turn taken up from rest over about `tau` seconds (a stem's snap), its speed never jumping. */
const spunUp = (spin: number, tau: number, t: number) => (t <= 0 ? 0 : spin * (t + tau * Math.expm1(-t / tau)));

/** The fall of a fruit let go from rest at `y0`, `t` seconds later: [y, its turn]. */
function fallFrom(y0: number, t: number, spin: number): [number, number] {
  dragAxis(y0, 0, -G, FRUIT_DRAG, t, AXIS);
  return [AXIS[0], spunUp(spin, 0.18, t)];
}

/**
 * The orange he cuts free: it hangs from its stem while he snips (swinging a little), then, as the
 * last snip shuts, falls from rest under gravity, taking up a turn. The next one is already there
 * when the round comes back (it fades in while his hands are at it). Writes into `out` when given.
 */
export function cutFruitAt(t: number, out?: FruitFrame): FruitFrame {
  const s = wrap(t, TRIM_CYCLE);
  const hangFrom = 0.25;
  if (s < hangFrom) return hidden(out);
  const homeX = CUT_POINT[0];
  const homeY = CUT_POINT[1] - 0.036 * KEEPER;
  if (s < CUT_AT) {
    const shown = glide(s, [hangFrom, hangFrom + 0.3]);
    // A small pendulum swing on its stem, set going by the snips.
    const swing = 0.08 * Math.sin(s * 5.2) * smoother(remap(s, hangFrom, CUT_AT));
    return fruit(out, homeX, homeY, swing, shown, 1);
  }
  const [y, turn] = fallFrom(homeY, s - CUT_AT, -2.2);
  if (y < FLOOR) return hidden(out);
  return fruit(out, homeX, y, turn, 1, 1);
}

interface Drop {
  /** Starting place in the tree: fractions of its plate, from the left and the top. */
  u: number;
  v: number;
  /** Seconds between drops, and where in that round this one starts. */
  period: number;
  offset: number;
  /** Spin it takes up (radians per second), so no two fall alike. */
  spin: number;
}

/** Oranges that drop out of the tree now and then, each on its own slow round. */
const DROPS: readonly Drop[] = [
  { u: 0.333, v: 0.315, period: 9.3, offset: 3.1, spin: 1.8 },
  { u: 0.602, v: 0.204, period: 13.7, offset: 8.4, spin: -2.4 },
  { u: 0.463, v: 0.426, period: 17.9, offset: 12.5, spin: 1.2 },
];

/** A point of the tree's plate in the world (where a drop starts). */
function treePoint(u: number, v: number): [number, number] {
  const tree = plateEntry("finale/tree");
  const w = (tree.height * tree.size[0]) / tree.size[1];
  return [tree.position[0] + (u - tree.anchor[0]) * w, tree.position[1] + (tree.anchor[1] - v) * tree.height];
}

const DROP_START = DROPS.map((d) => treePoint(d.u, d.v));

export const DROP_COUNT = DROPS.length;

/** Where the nth drop is at idle time t (hidden between drops): it lets go of its branch from rest and falls out of the frame. Writes into `out` when given. */
export function dropAt(n: number, t: number, out?: FruitFrame): FruitFrame {
  const drop = DROPS[n];
  const [x, y0] = DROP_START[n];
  const since = wrap(t + drop.offset, drop.period);
  const [y, turn] = fallFrom(y0, since, drop.spin);
  if (y < FLOOR) return hidden(out);
  return fruit(out, x, y, turn, glide(since, [0, 0.12]), 1);
}

/* ------------------------------------------------------------------ */
/* For the velocity check and the motion lab                           */
/* ------------------------------------------------------------------ */

/** What the finale scrubs (its loop runs on idle time and is checked by its own tests). */
const channels: MotionChannel[] = [
  { name: "astronomer · sink", at: (p) => astronomerOffset(p) },
  { name: "stars · lift", at: starsLift },
  { name: "stars · opacity", at: starsOpacity },
  { name: "old cloud · slide", at: oldCloudShift },
  { name: "old cloud · opacity", at: oldCloudOpacity },
  { name: "tree · rise", at: (p) => treeAt(p).y },
  { name: "tree · haze", at: treeHazeAt },
  { name: "woman · walk", at: (p) => womanAt(p).x },
  { name: "woman · step", at: (p) => womanAt(p).y },
  { name: "man · walk", at: (p) => manAt(p).x },
  { name: "man · step", at: (p) => manAt(p).y },
  { name: "loop · fade in", at: loopWeight },
];

export const FINALE_MOTION: SceneMotion = { channels };
