import { beat, track, type BeatShape, type Track } from "../motion-kit";

import { SUN } from "./media";

/**
 * Paper on its creases (pure): a page that turns about a hinge with the stiffness of paper. It lifts
 * from rest, swings over, lands a touch past where it rests and settles back (`hingeTurn`); and it is
 * not a rigid board: its free edge lags behind the hinge as it swings and catches up as it lands, so
 * the page bends (`pageBend`, the angle at each station along it). The light on a turned page and the
 * shade a page throws into the fold under it come from the story's one sun.
 *
 * Angles are radians about a vertical hinge, 0 flat, positive turning the page's free edge toward the
 * camera. Everything is a function of progress, so a page plays backwards exactly.
 */

export interface HingeShape extends BeatShape {
  /** How far (progress) the free edge lags behind the hinge at the most. */
  lag?: number;
}

export interface Hinge {
  /** The turn at the hinge at progress p. */
  turn: Track;
  /** How far the free edge lags (progress). */
  lag: number;
}

/** A page's turn from `from` to `to` over a range of progress, shaped like paper: a slight lift, the swing, a landing past the rest, the settle. */
export function hingeTurn(range: readonly [number, number], from: number, to: number, { lag = 0, ...shape }: HingeShape = {}): Hinge {
  return { turn: track(beat(range, from, to, { anticipate: 0.015, lead: 0.2, overshoot: 0.05, settle: 0.32, ...shape })), lag };
}

/** Stations along a page where its bend is sampled (the shader joins them). */
export const PAGE_STATIONS = 8;

/**
 * The angle of a page at each of `PAGE_STATIONS` stations from its hinge (0) to its free edge (last), at
 * progress p: each station lags the hinge by `lag * s^1.5` (s from 0 to 1), so the page curls most at
 * its free edge while it swings and lies flat again once it has settled. Writes into `out`.
 */
export function pageBend(hinge: Hinge, p: number, out: number[] = new Array(PAGE_STATIONS).fill(0)): number[] {
  for (let j = 0; j < PAGE_STATIONS; j++) {
    const s = j / (PAGE_STATIONS - 1);
    out[j] = hinge.turn(p - hinge.lag * s ** 1.5);
  }
  return out;
}

/**
 * The shape of a bent page: the (x, z) of each station along it, for a page `width` long whose angle
 * at the stations is `angles` (x from the hinge along the flat page, z toward the camera). The shader
 * does the same walk for every vertex. Writes `2 * PAGE_STATIONS` numbers into `out`.
 */
export function pageShape(angles: readonly number[], width: number, out: number[] = new Array(2 * PAGE_STATIONS).fill(0)): number[] {
  const step = width / (PAGE_STATIONS - 1);
  let x = 0;
  let z = 0;
  out[0] = 0;
  out[1] = 0;
  for (let j = 1; j < PAGE_STATIONS; j++) {
    const a = 0.5 * (angles[j - 1] + angles[j]);
    x += step * Math.cos(a);
    z += step * Math.sin(a);
    out[2 * j] = x;
    out[2 * j + 1] = z;
  }
  return out;
}

/**
 * How much of the sun falls on the side of a page the camera sees, turned `angle` about a vertical
 * hinge on its left (`side` 1) or right (-1): the page's normal turns with it; past a quarter turn the
 * camera sees its back, whose normal is the other way. 0 in its own shade, 1 square to the sun.
 */
export function pageLight(angle: number, side: 1 | -1): number {
  // A page hinged on its left turns its face toward +x as its free edge comes forward; one hinged on its right, toward -x.
  const nx = -side * Math.sin(angle);
  const nz = Math.cos(angle);
  const facing = nz >= 0 ? 1 : -1;
  const lit = facing * (nx * SUN[0] + nz * SUN[2]);
  return Math.max(0, Math.min(1, lit / Math.hypot(SUN[0], SUN[2])));
}

/** The deepest shade in a closing fold. */
export const FOLD_SHADE = 0.32;

/** The shade in the fold under a page that is coming down onto the half beside it: none while it stands up, deepest as it lands. */
export function foldShade(angle: number): number {
  const over = (Math.abs(angle) - Math.PI / 2) / (Math.PI / 2);
  if (over <= 0) return 0;
  const t = Math.min(1, over);
  return FOLD_SHADE * t * t * (3 - 2 * t);
}
