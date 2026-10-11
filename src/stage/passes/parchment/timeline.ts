// The push into the parchment (docs/TRANSITIONS.md row Work -> sheet, docs/STORY.md row 2 -> 3).
// The picture (./frag.ts through ./index.ts), the chrome (Chrome.tsx) and the leaving Work card
// (WorkCopy.tsx) all read these numbers, so the chrome turns to ink on the same ramp that turns the
// frame to paper. Nothing here is a `p` value: positions come from the `parchment` segment.
//
// Geometry. "The Work's last frame" is the plate exactly as The Work leaves it at t = 1 (width-fit,
// scrolled to its bottom, crept in): screen uv there is called work uv. The landing is the parchment
// rect of art.plate cover-fitted to the frame with its own zoom and centre (art.plate.framings),
// expressed as a window of work uv: a square of side `w1` (in uv, so it has the frame's aspect).
//
// The push is a dolly: at local t the frame shows the window `o + (frame - o) * w` of the Work's last
// frame, with w = mix(1, w1, push) (the window shrinks linearly with the camera's travel, so the
// magnification 1/w accelerates like a real dolly) and push = t * (0.45 + 0.55 * t^2). The origin
// `o` starts on the parchment's centre where The Work leaves it and drifts, as the push
// accelerates, to the one point that lands the window exactly on the cover-fit, which sits 2% of the
// landed frame off the parchment's centre (rule 7). So the parchment grows about its own centre at
// first and slides to the middle of the frame only late, while the frame is already paper.
//
// The sheet's texture is anchored to the landed frame and rides the push with the plate, so the
// parchment becomes the sheet; in the last stretch it settles onto the landed frame (`paperAt`), so
// the accelerating push does not stop dead on the static sheet at the segment's end.
import { art, type Point } from "@/content/art";
import type { Size } from "../../framing";
import { local, SCROLL_UNIT, segment } from "../../script";
import { creep, plateFit, WORK_TUNE, yTop } from "../work/timeline";

const seg = segment("parchment");

export const PARCHMENT_TUNE = {
  /** The push: t * (lin + (1 - lin) * t^2). */
  pushLin: 0.45,
  /** The landing sits this far (fractions of the landed frame) off the parchment's centre. */
  driftX: 0.02,
  driftY: 0.006,
  /** uFlat: a smoothstep over this span of local t. */
  flatFrom: 0,
  flatTo: 1,
  /** The orange's shadow in the sheet: the plate's luminance at this opacity, fading with (1 - uFlat)^2. */
  shadow: 0.08,
  /** The latest a pixel's fill may start, in uFlat: around the parchment first, the parchment last. */
  delayMax: 0.4,
  /** How long (in uFlat) a pixel away from the parchment takes to fill; on the parchment it runs to 1. */
  farSpan: 0.55,
  /** How far round the parchment (plate heights) the fill is held back. */
  nearRadius: 0.22,
  /** Radial smear: the cap on the per-frame displacement (screen uv). */
  smearMax: 0.025,
  /** Softening near the lens in the last stretch: from this t, radius per unit of distance from the origin. */
  softFrom: 0.65,
  soft: 0.006,
  /**
   * The sheet rides the push (locked to the plate) until this t, then settles onto the landed frame
   * by t = 1 with no speed left, so the push does not stop dead on the sheet at p 0.40 (the plate's
   * ghost is under 1% by the time the two part).
   */
  paperSettleFrom: 0.65,
  /** Work card 3 leaves over this many scroll units from the start of the push. */
  cardLeave: 60,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** The push's progress at local t: accelerating (rule 4: things that push in). */
export function push(t: number): number {
  const k = clamp01(t);
  const { pushLin } = PARCHMENT_TUNE;
  return k * (pushLin + (1 - pushLin) * k * k);
}

/** uFlat at local t: 0 = the painting, 1 = the whole frame is the sheet. */
export function flat(t: number): number {
  return smooth(PARCHMENT_TUNE.flatFrom, PARCHMENT_TUNE.flatTo, t);
}

/** Opacity of the orange's shadow in the sheet at local t: 8% fading with (1 - uFlat)^2. */
export function shadow(t: number): number {
  const k = 1 - flat(t);
  return PARCHMENT_TUNE.shadow * k * k;
}

/** Softening near the lens at local t (radius per unit of screen distance from the origin). */
export function soft(t: number): number {
  return smooth(PARCHMENT_TUNE.softFrom, 1, t) * PARCHMENT_TUNE.soft;
}

// ---------------------------------------------------------------------------------------------
// The Work's last frame and the landing
// ---------------------------------------------------------------------------------------------

/** The Work's last frame: plate point -> work uv (breath and parallax aside). */
export function workUV(pt: Point, css: Size): Point {
  const fit = plateFit(css);
  const c = creep(1);
  return {
    x: 0.5 + (pt.x - fit.cx) * c * fit.zoom,
    y: 0.5 + ((pt.y - yTop(1, css)) / fit.fh - 0.5) * c,
  };
}

export interface Landing {
  /** The landed window's side in work uv (1/S: S is the push's total magnification). */
  w: number;
  /** The landing's fixed point in work uv (the dolly's origin at t = 1). */
  o: Point;
  /** The parchment's centre in work uv: the dolly's origin at t = 0. */
  c0: Point;
}

let landingKey = "";
let landingCache: Landing = { w: 1, o: { x: 0.5, y: 0.5 }, c0: { x: 0.5, y: 0.5 } };

/** Where the push lands at this frame size (cached per size). */
export function landing(css: Size): Landing {
  const key = `${css[0]}x${css[1]}`;
  if (key === landingKey) return landingCache;
  const rect = art.plate.rects.parchment;
  const framing = art.plate.framings.parchment;
  const fit = plateFit(css);
  const c = creep(1);
  // The rect in work uv: its centre and its size on each axis.
  const c0 = workUV({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, css);
  const centre = workUV({ x: rect.x + rect.w / 2 + framing.pan.x, y: rect.y + rect.h / 2 + framing.pan.y }, css);
  const rw = rect.w * c * fit.zoom;
  const rh = (rect.h * c) / fit.fh;
  // Cover: the window (frame aspect) fits inside the rect on both axes, then the framing's zoom.
  const w = Math.min(rw, rh, 0.999) / Math.max(framing.zoom, 1e-3);
  // The landed window's centre, drifted, and the fixed point that puts the window there.
  const m = { x: centre.x + PARCHMENT_TUNE.driftX * w, y: centre.y + PARCHMENT_TUNE.driftY * w };
  const o = { x: (m.x - 0.5 * w) / (1 - w), y: (m.y - 0.5 * w) / (1 - w) };
  landingKey = key;
  landingCache = { w, o, c0 };
  return landingCache;
}

export interface PushState {
  /** Local t (clamped). */
  t: number;
  /** push(t). */
  push: number;
  /** The window's side in work uv now (1 at t = 0, landing.w at t = 1). */
  w: number;
  /** The dolly's origin now, in work uv (and screen uv: it is the point that stays put). */
  o: Point;
  /** The magnification now, 1/w. */
  s: number;
}

/** The dolly at local t at this frame size. */
export function pushAt(t: number, css: Size): PushState {
  const L = landing(css);
  const k = push(t);
  const w = mix(1, L.w, k);
  return { t: clamp01(t), push: k, w, o: { x: mix(L.c0.x, L.o.x, k), y: mix(L.c0.y, L.o.y, k) }, s: 1 / w };
}

export interface PaperState {
  /** The screen point the sheet is magnified about (uv). */
  o: Point;
  /** Sheet px per screen px (the sheet's lod): 1 when it has landed. */
  l: number;
}

/**
 * How the sheet sits on screen at local t: screen uv -> landed uv is `o + (uv - o) * l`. Locked to
 * the plate (l = w / landing.w about the point that keeps them together, which moves from the
 * landing's fixed point to the parchment's centre with the push) until `paperSettleFrom`, then its
 * log magnification eases to 0 (smoothstep), so it lands on the sheet with no speed left.
 */
export function paperAt(t: number, css: Size): PaperState {
  const L = landing(css);
  const P = pushAt(t, css);
  const settle = smooth(PARCHMENT_TUNE.paperSettleFrom, 1, t);
  return {
    o: { x: mix(L.o.x, L.c0.x, P.push), y: mix(L.o.y, L.c0.y, P.push) },
    l: Math.exp(Math.log(P.w / L.w) * (1 - settle)),
  };
}

/** Where a point of the Work's last frame (work uv) is on screen at local t. */
export function pushedPoint(pt: Point, t: number, css: Size): Point {
  const P = pushAt(t, css);
  return { x: P.o.x + (pt.x - P.o.x) / P.w, y: P.o.y + (pt.y - P.o.y) / P.w };
}

// ---------------------------------------------------------------------------------------------
// The DOM layers
// ---------------------------------------------------------------------------------------------

/** Local t of the push at progress p (0 before it, 1 after it). */
export function parchmentT(p: number): number {
  return local("parchment", p);
}

/**
 * How far the chrome has turned to ink on paper at p: the uFlat ramp inside the push, null outside
 * it (where the ground classes of src/stage/script.ts decide: milk on sky before, ink on paper after).
 */
export function chromeInkAt(p: number): number | null {
  if (p < seg.start || p >= seg.end) return null;
  return flat(local("parchment", p));
}

/** 1..0: Work card 3 leaving over the first `cardLeave` units of the push (1 before the push). */
export function cardLeaveAt(p: number): number {
  const units = (p - seg.start) / SCROLL_UNIT;
  return 1 - smooth(0, PARCHMENT_TUNE.cardLeave, units);
}

/** Cards drift with the push at the same parallax as they cross the plate. */
export const CARD_PUSH_PARALLAX = WORK_TUNE.cardParallax;

/** HUD readout of the push at p. */
export function parchmentHudLines(p: number, css: Size): string[] {
  const t = parchmentT(p);
  const P = pushAt(t, css);
  const L = landing(css);
  return [
    `push ${P.push.toFixed(3)}  s ${P.s.toFixed(2)} of ${(1 / L.w).toFixed(2)}  o ${P.o.x.toFixed(3)},${P.o.y.toFixed(3)}`,
    `uFlat ${flat(t).toFixed(3)}  shadow ${shadow(t).toFixed(4)}  soft ${soft(t).toFixed(4)}  sheet lod ${paperAt(t, css).l.toFixed(2)}`,
  ];
}
