// The match cut on the gilded orange (docs/TRANSITIONS.md, Graft -> grove -> share): the picking hand closes
// round the fruit in the grove, the picture around it changes to the share's paper-white and the young man,
// and the fruit stays exactly where it is on screen, same place and same size, so the eye rides it across.
//
// Both sides are driven with uncover(): the grove runs its own camera (timeline.ts groveCamera), and where it
// puts the gilded orange on screen (art.grove.gilded) is where the share must put its own orange
// (art.share.fruit). That is solved, not nudged: the zoom that gives the share's fruit the grove fruit's
// screen radius, then the pan that lands its centre on the grove fruit's screen centre. It is blended with the
// share's own camera (the pull-back that rests on `lastFraming`) by a weight that is 1 until the cut's middle
// and falls to 0 at the segment's end with no speed at either end, so there is no jump and no velocity kink; and
// while the weight is 1 the target is the grove's own camera carried on at its own speed (settling, so it
// stays bounded), so the share inherits the push-in the grove was making at the cut and never starts from rest.
//
// The rest state (breath, parallax, drift) is the shared chunk and its offset is in painting units, so the
// same offset moves the share's fruit zoom-ratio times more on screen than the grove's: `offScale` is the
// factor on the share's offset (1 off the match) that makes it move the fruit the same on both sides. The
// breath is a factor on every zoom, which the solve is invariant under. Everything is a function of the scroll
// units, so scrubbing back replays it exactly.
import { art, type Framing, type Fruit, type Point } from "@/content/art";
import { coverScale, phoned, sizeFromAspect, uncover, type Size } from "../../framing";
import { BEAT_SPAN, CUT_UNITS, groveCameraAtK, groveK, MATCH_AT, MODEL_UNITS, shareCamera, type Camera } from "./timeline";

export const GROVE_TEX: Size = sizeFromAspect(art.grove.aspect);
export const SHARE_TEX: Size = sizeFromAspect(art.share.aspect);

/** How long the grove's camera speed is carried on past the middle of the cut, units (it settles with this time constant). */
const CARRY_UNITS = 150;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth01 = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** A fruit as it sits on screen: its centre in screen uv (y down) and its radius as a share of the frame's width. */
export interface FruitView {
  x: number;
  y: number;
  r: number;
}

/** Where a fruit of a painting lands on screen under a framing, and how large. */
export function fruitView(fruit: Fruit, css: Size, tex: Size, framing: Framing): FruitView {
  const p = uncover(fruit, css, tex, framing);
  return { x: p.x, y: p.y, r: (fruit.r * framing.zoom) / coverScale(css, tex)[0] };
}

/** The grove's framing at raw camera progress `k`: its art.ts framing (with the phone pan) plus its camera. */
export function groveFramingAtK(k: number): Framing {
  const base = phoned(art.grove.framing, art.grove.phonePan);
  const c = groveCameraAtK(k);
  return { pan: { x: base.pan.x + c.pan.x, y: base.pan.y + c.pan.y }, zoom: art.grove.framing.zoom * c.zoom };
}

/**
 * The grove camera's progress the match follows at `x` units: the camera's own up to the cut's middle, then
 * the same speed carried on, settling (so the share's target keeps moving the way the grove was, without
 * running away).
 */
export function matchK(x: number): number {
  const [a, b] = BEAT_SPAN.grove;
  if (x <= MATCH_AT) return clamp01(groveK(x));
  const speed = 1 / (b - a + CUT_UNITS);
  return clamp01(groveK(MATCH_AT)) + speed * CARRY_UNITS * (1 - Math.exp(-(x - MATCH_AT) / CARRY_UNITS));
}

/**
 * The share's framing that puts its fruit where the grove's gilded orange is, at the grove's size: zoom so the
 * screen radii agree, then the pan that lands the centres together (the exact inverse of uncover()).
 */
export function matchedShareFraming(css: Size, grove: Framing): Framing {
  const g = fruitView(art.grove.gilded, css, GROVE_TEX, grove);
  const fruit = art.share.fruit;
  const cs = coverScale(css, SHARE_TEX);
  const zoom = (g.r * cs[0]) / fruit.r;
  return {
    pan: { x: fruit.x - 0.5 - ((g.x - 0.5) * cs[0]) / zoom, y: fruit.y - 0.5 - ((g.y - 0.5) * cs[1]) / zoom },
    zoom,
  };
}

/** The match's weight at `x` units: 1 through the cut, falling smoothly to exactly 0 at the segment's end. */
export function matchWeight(x: number): number {
  return x <= MATCH_AT ? 1 : 1 - smooth01((x - MATCH_AT) / (MODEL_UNITS - MATCH_AT));
}

export interface ShareMatch {
  /** The share's camera as the pass applies it: added to the share's framing pan and multiplying its zoom (exactly shareCamera's where the weight is 0). */
  camera: Camera;
  /** The match's weight. */
  weight: number;
  /** The factor on the share's rest offset (breath's parallax and drift, painting units) that keeps its fruit moving as the grove's does. */
  offScale: number;
  /** The share's absolute framing (the share keyframe's). */
  framing: Framing;
  /** The grove's, whose fruit the share's is matched to. */
  grove: Framing;
}

/**
 * The share's camera at `x` units on a frame of size `css`: its own pull-back to rest, blended with the framing
 * that holds its fruit where the grove's is by `matchWeight` (pan linearly, zoom geometrically).
 */
export function shareMatch(x: number, css: Size): ShareMatch {
  const base = phoned(art.share.framing, art.share.phonePan);
  const own = shareCamera(x);
  const grove = groveFramingAtK(matchK(x));
  const w = matchWeight(x);
  const rest = { x: base.pan.x + own.pan.x, y: base.pan.y + own.pan.y, zoom: base.zoom * own.zoom };
  if (w <= 0) {
    return { camera: own, weight: 0, offScale: 1, grove, framing: { pan: { x: rest.x, y: rest.y }, zoom: rest.zoom } };
  }
  const m = matchedShareFraming(css, grove);
  const framing: Framing = {
    pan: { x: lerp(rest.x, m.pan.x, w), y: lerp(rest.y, m.pan.y, w) },
    zoom: Math.exp(lerp(Math.log(rest.zoom), Math.log(m.zoom), w)),
  };
  return {
    camera: { pan: { x: framing.pan.x - base.pan.x, y: framing.pan.y - base.pan.y }, zoom: framing.zoom / base.zoom },
    weight: w,
    offScale: lerp(1, grove.zoom / m.zoom, w),
    framing,
    grove,
  };
}

/**
 * Both sides' gilded orange on screen at `x` units, as the pass draws them (the grove through its own camera,
 * the share through the matched camera), for the match test and the disc: `rest` is a rest offset in
 * painting units (breath's parallax and drift; the share's is scaled by `offScale`).
 */
export function matchViews(x: number, css: Size, rest: Point = { x: 0, y: 0 }): { grove: FruitView; share: FruitView; weight: number } {
  const s = shareMatch(x, css);
  const sOff = { x: rest.x * s.offScale, y: rest.y * s.offScale };
  const at = (f: Fruit, off: Point): Fruit => ({ x: f.x - off.x, y: f.y - off.y, r: f.r });
  return {
    grove: fruitView(at(art.grove.gilded, rest), css, GROVE_TEX, s.grove),
    share: fruitView(at(art.share.fruit, sOff), css, SHARE_TEX, s.framing),
    weight: s.weight,
  };
}
