// The hero's camera in local progress t (0..1 over p 0-0.04): the push-in about the orange, the orbit
// (a lateral arc with the depth layers of art.ts hero.depth) and the scroll-speed gate. Each is a pure
// function of t: scrubbing back plays them back. The bridge holds the hero's end pose (HERO_END_POSE),
// so the film it hands over from is exactly the frame the hero ended on.
import { art, type Point } from "@/content/art";
import { coverScale, sizeFromAspect, uncover, type Size } from "../../framing";
import { coverRoom, orbitTravelMax } from "../../motion";
import { heroFraming } from "./framing";

const hero = art.hero;
const HERO_TEX = sizeFromAspect(hero.aspect);

/** The scroll push-in about the orange that the hero ends on: 5%. The bridge holds it. */
export const HERO_PUSH_END = 0.05;

/** Accelerating push (rule 4): 5% over the hero segment, reached at its local t = 1. */
export function heroPush(t: number): number {
  return HERO_PUSH_END * t * (0.5 + 0.5 * t * t);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/**
 * How far the orbit has run, 0..1: eased in from rest (rule 4: zero speed at t = 0, so nothing starts
 * the way a wipe does) and still moving at t = 1, where the bridge takes the camera over.
 */
export function orbitEase(t: number): number {
  const k = clamp01(t);
  return k * k * (1.6 - 0.6 * k);
}

/** The orbit's speed at t as a share of its speed at the end (0 at rest, 1 at t = 1): what the smear follows. */
export function orbitRate(t: number): number {
  const k = clamp01(t);
  return (k * (3.2 - 1.8 * k)) / 1.4;
}

/**
 * The camera's travel off its framing at orbit progress `e`, painting units, before the bound: across
 * by `orbit.x`, and up and back down along an arc (`orbit.y`), so the orbit ends level (y = 0 at e = 1,
 * where the framing has the least room above and below).
 */
export function heroCam(e: number): Point {
  return { x: hero.orbit.x * e, y: hero.orbit.y * Math.sin(Math.PI * clamp01(e)) };
}

/**
 * The room (painting units) the hero's framing leaves its layers at this viewport and this push: the slack
 * of the 2% zoom less the rest state, and the room the dolly about the orange opens (the push shrinks the
 * visible area toward the orange, by the nearer of the two sides). Never negative.
 */
export function heroRoom(css: Size, push: number): Point {
  const f = heroFraming(css);
  const base = coverRoom(css, HERO_TEX, f.zoom, { x: Math.abs(f.pan.x), y: Math.abs(f.pan.y) });
  if (push <= 0) return base;
  const o = uncover(hero.anchors.orange, css, HERO_TEX, f);
  const cs = coverScale(css, HERO_TEX);
  const k = 1 - 1 / (1 + push);
  return {
    x: base.x + (Math.max(0, Math.min(o.x, 1 - o.x)) * k * cs[0]) / f.zoom,
    y: base.y + (Math.max(0, Math.min(o.y, 1 - o.y)) * k * cs[1]) / f.zoom,
  };
}

/** The bound the shader squeezes the orbit's travel inside (softBound): room for the larger layer rate, and the fold. */
export function heroCamMax(css: Size, push: number): Point {
  return orbitTravelMax(hero.depth, heroRoom(css, push), hero.aspect);
}

/**
 * The scroll's speed reaches the film (the pour, the glint, the smear) until the hero's last stretch
 * and not at all in the bridge, where the film is held and only the crest answers the speed: so the
 * frame the hero ends on and the bridge opens on is the same at any speed.
 */
export function heroVelGate(t: number): number {
  return 1 - smooth(0.8, 1, t);
}

/** Everything the film's uniforms need that changes with the camera: the hero's scroll pose. */
export interface HeroPose {
  /** The dolly about the orange (scale - 1). */
  push: number;
  /** How far the clouds' scroll drift has run. */
  heroT: number;
  /** The orbit's progress (orbitEase). */
  orbit: number;
  /** The orbit's speed, 0..1 (orbitRate). */
  rate: number;
  /** How much of the scroll's speed reaches the film. */
  velGate: number;
}

export function heroPose(t: number): HeroPose {
  return { push: heroPush(t), heroT: t, orbit: orbitEase(t), rate: orbitRate(t), velGate: heroVelGate(t) };
}

/** The pose the hero ends on, which the bridge's film holds. */
export const HERO_END_POSE: HeroPose = { push: HERO_PUSH_END, heroT: 1, orbit: 1, rate: 0, velGate: 0 };
