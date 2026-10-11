// The close and the coda (docs/STORY.md row 3 · The Terms, second half; docs/TRANSITIONS.md row
// Sheet -> blue): timing and geometry shared by the burn (./burn.ts through ./index.ts), the coda
// (./frag.ts through ./index.ts), the copy (CodaCopy.tsx, and TermsCopy.tsx for the copy the burn
// takes with the paper) and the HUD. Nothing here is a `p` value: the burn is timed in shares of the
// `close` segment (p 0.50-0.53) and the coda in shares of `coda` (p 0.53-0.58); copy ramps are in
// scroll units (SCROLL_UNIT).
//
// Burn geometry is in frame heights (screen uv with x scaled by the aspect, y down), the unit every
// cut's bands and lags are measured in (docs/TRANSITIONS.md). The front is the distance from an
// origin just off the bottom-left corner less a radius R(t) that travels from behind the corner to
// past the far corner: at t = 0 no pixel is within reach of the char band (the frame is the panel at
// rest, the terms pass's last frame) and at t = 1 every pixel is past the lag (the frame is the
// coda's first).
import { narrowFrame } from "../../band";
import { art } from "@/content/art";
import { coverScale, phoned, sizeFromAspect, uncover, type Size } from "../../framing";
import { local, SCROLL_UNIT, segment } from "../../script";
import { profile } from "../terms/timeline";

const closeSeg = segment("close");
const codaSeg = segment("coda");

/** Lengths of the two segments in scroll units (300 and 500). */
export const CLOSE_UNITS = (closeSeg.end - closeSeg.start) / SCROLL_UNIT;
export const CODA_UNITS = (codaSeg.end - codaSeg.start) / SCROLL_UNIT;

export interface Point2 {
  x: number;
  y: number;
}

// Tuning order (docs/TRANSITIONS.md, The Split): front speed, bite, char width, lag distance.
export const CLOSE_TUNE = {
  /** The burn's origin: this far left of and below the bottom-left corner, frame heights (far enough out that the front is a broad arc, not a corner). */
  originX: 0.5,
  originY: 0.4,
  /** The front travels over [travelFrom, travelTo] of the close; its speed ramps in over `travelRamp` of that (rule 4). */
  travelFrom: 0,
  travelTo: 1,
  travelRamp: 0.1,
  /** The travel accelerates a little, like a fire taking: a = x * (lin + (1 - lin) * x^2). */
  frontLin: 0.9,
  /** The bite: two decorrelated fbm fields, frequency in frame heights and amplitude on the front (rule 1). */
  n1Freq: 2.4,
  n1Amp: 0.3,
  n2Freq: 6.3,
  n2Amp: 0.1,
  /** The print at the boundary: Bayer and hash stipple amplitudes, and the printed edge's half-width (rule 2). */
  bayer: 0.03,
  stipple: 0.02,
  edgeSoft: 0.004,
  /** The scorch band ahead of the cut (rule 8): saturated within `charSat`, released by `charWidth`; the singe beyond it. */
  charSat: 0.012,
  charWidth: 0.08,
  singeWidth: 0.06,
  /** Frequency of the char's mottle (a texture field), frame heights. */
  charMottle: 7,
  /** The ember on the cut: its half-width and amount; the firelight's reach and amount. */
  emberWidth: 0.012,
  emberAmt: 1.2,
  glowWidth: 0.025,
  glowAmt: 0.3,
  /** Soot in the air just behind the cut. */
  sootWidth: 0.12,
  sootAmt: 0.22,
  /** Sparks: hash threshold, band half-width about the cut, the scroll speed (px per frame) at which they are densest. */
  sparkThreshold: 0.982,
  sparkWidth: 0.03,
  sparkVel: 40,
  /** The blue arrives offset the way the front travels: lag = exp(-distBehind / lagDist), offset and smear per unit lag (rules 5, 6). */
  lagDist: 0.12,
  lagOffset: 0.05,
  lagSmear: 0.02,
  /** The lag, the ember and the soot die over [lagFadeFrom, 1] of the close. */
  lagFadeFrom: 0.85,
  /** The DOM copy on the paper leaves as the mean front comes within `copyFadeFrom` ahead of it, gone at `copyGoneAt`. */
  copyFadeFrom: 0.3,
  copyGoneAt: 0.1,
} as const;

/** Bound on |front - (d - R)| from the bite and the print. */
const BITE = (CLOSE_TUNE.n1Amp + CLOSE_TUNE.n2Amp + CLOSE_TUNE.bayer + CLOSE_TUNE.stipple) / 2;
/** The lag counts as settled once its offset is under this share of itself (sub-pixel). */
const LAG_SETTLED = 0.015;
/** Ahead of the cut by more than this a pixel is provably untouched (fast path, rule 14). */
export const FAST_AHEAD = BITE + CLOSE_TUNE.charWidth + CLOSE_TUNE.singeWidth + CLOSE_TUNE.edgeSoft;
/** Behind the cut by more than this a pixel is provably the settled coda once the lag has died (the soot is the last band). */
export const FAST_BEHIND_END = BITE + CLOSE_TUNE.sootWidth + CLOSE_TUNE.edgeSoft;

/**
 * Behind the cut by more than this a pixel is provably the settled coda at close t: while the lag is
 * alive its reach (where exp(-x / lagDist) * envelope drops under LAG_SETTLED) sets the bound; as the
 * envelope dies the bound shrinks to the soot's, so the end radius need not clear a dead lag.
 */
export function fastBehindAt(t: number): number {
  const k = lagEnvelope(t);
  const reach = k > LAG_SETTLED ? CLOSE_TUNE.lagDist * Math.log(k / LAG_SETTLED) : 0;
  return BITE + Math.max(reach, CLOSE_TUNE.sootWidth) + CLOSE_TUNE.edgeSoft;
}

export const CODA_TUNE = {
  /** The frames are scrubbed by local progress, ramping in and settling on the last frame (the orange holds still under the halo). */
  scrubRamp: 0.1,
  scrubSettle: 0.15,
  /** The halo grows over [haloFrom, haloTo] of the coda: the last 20%, once the orange hangs alone. */
  haloFrom: 0.8,
  haloTo: 0.96,
  /** The ring's inner edge at rest, as a share of the orange's radius beyond the peel; its width and softness, frame heights; the chroma split on its outer edge. */
  haloGap: 0.3,
  haloWidth: 0.012,
  haloSoft: 0.004,
  haloSplit: 0.0012,
  /** Copy ramps (scroll units): the chapter title comes in `titleFrom` units in and is gone by the coda's half; the fit copy follows, its text `fitLead` ahead of the tag and side. */
  copyRamp: 60,
  titleFrom: 12,
  fitFrom: 262,
  fitLead: 12,
  /** The fit copy leaves as the halo grows, over this span of the coda. */
  fitLeaveFrom: 0.8,
  fitLeaveTo: 0.92,
  /** The fit column: column B where that leaves at least `copyMin` px before the orange's edge, else column A; at most `copyMax` px wide. */
  copyMin: 256,
  copyMax: 368,
  copyGap: 24,
  /** The glass over the fit copy: its blur (px), the pad around the column it covers (px) and the mask's feather past the ring (px). */
  glassBlur: 7,
  glassPad: 16,
  glassFeather: 200,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// ---------------------------------------------------------------------------------------------
// The close: the burn
// ---------------------------------------------------------------------------------------------

/** Local progress of the close at p (0 before it, 1 from the coda on). */
export function closeT(p: number): number {
  return local("close", p);
}

export interface BurnGeometry {
  /** The origin, frame heights (x scaled by the aspect, y down). */
  ox: number;
  oy: number;
  /** Distance from the origin to the nearest (bottom-left) and farthest (top-right) corners. */
  dmin: number;
  dmax: number;
  /** The front's radius at the travel's ends: nothing in reach, everything settled. */
  r0: number;
  r1: number;
}

let geomKey = "";
let geomCache: BurnGeometry | null = null;

/** The burn's geometry at this frame size (cached per size). */
export function burnGeometry(css: Size): BurnGeometry {
  const key = `${css[0]}x${css[1]}`;
  if (geomCache && key === geomKey) return geomCache;
  const ar = css[0] / css[1];
  const ox = -CLOSE_TUNE.originX;
  const oy = 1 + CLOSE_TUNE.originY;
  const dmin = Math.hypot(0 - ox, 1 - oy);
  const dmax = Math.hypot(ar - ox, 0 - oy);
  geomKey = key;
  geomCache = { ox, oy, dmin, dmax, r0: dmin - FAST_AHEAD - 0.02, r1: dmax + FAST_BEHIND_END + 0.04 };
  return geomCache;
}

/** The travel 0..1 at close t: its speed ramps in (rule 4), then it accelerates. */
export function burnTravel(t: number): number {
  const T = CLOSE_TUNE;
  const tt = clamp01((t - T.travelFrom) / (T.travelTo - T.travelFrom));
  const x = profile(tt, T.travelRamp, 0);
  return x * (T.frontLin + (1 - T.frontLin) * x * x);
}

/** The front's radius at close t, frame heights. */
export function burnR(t: number, css: Size): number {
  const g = burnGeometry(css);
  return g.r0 + (g.r1 - g.r0) * burnTravel(t);
}

/** Distance of a screen point (uv, y down) from the burn's origin, frame heights. */
export function burnDistance(uv: Point2, css: Size): number {
  const g = burnGeometry(css);
  return Math.hypot((uv.x * css[0]) / css[1] - g.ox, uv.y - g.oy);
}

/** The mean front (bite aside) at a screen point at close t: positive ahead of the cut (still paper), negative behind it. */
export function burnFront(uv: Point2, t: number, css: Size): number {
  return burnDistance(uv, css) - burnR(t, css);
}

/** The lag's, the ember's and the soot's envelope at close t: 1, dying over the last stretch. */
export function lagEnvelope(t: number): number {
  return 1 - smooth(CLOSE_TUNE.lagFadeFrom, 1, t);
}

/**
 * 0..1: how much of a DOM piece sitting at a screen point is still on the paper at p. 1 before the
 * close; inside it the piece leaves as the char band reaches it (it goes with the paper, under the
 * burn); 0 from the coda on.
 */
export function burnSurvival(uv: Point2, p: number, css: Size): number {
  if (p < closeSeg.start) return 1;
  if (p >= closeSeg.end) return 0;
  return smooth(CLOSE_TUNE.copyGoneAt, CLOSE_TUNE.copyFadeFrom, burnFront(uv, closeT(p), css));
}

// ---------------------------------------------------------------------------------------------
// The coda: the frames, the orange, the halo
// ---------------------------------------------------------------------------------------------

/** Local progress of the coda at p (0 before it, 1 from the match cut on). */
export function codaT(p: number): number {
  return local("coda", p);
}

/** Scroll units into the coda at p (negative before it). */
export function codaUnits(p: number): number {
  return (p - codaSeg.start) / SCROLL_UNIT;
}

/** The scrub 0..1 at coda t (frame = scrub * (count - 1)): ramps in and settles on the last frame. */
export function codaProgress(t: number): number {
  return profile(t, CODA_TUNE.scrubRamp, CODA_TUNE.scrubSettle);
}

/** The halo's growth 0..1 at coda t. */
export function haloGrowth(t: number): number {
  return smooth(CODA_TUNE.haloFrom, CODA_TUNE.haloTo, t);
}

const CODA_TEX = sizeFromAspect(art.coda.aspect);

/**
 * The floating orange in the coda's own frame: the `share-orange` anchor as coda uv, and its radius
 * as a share of the coda's width. The coda's last frame is the square still cover-fitted to 16:9
 * (its centre band at the full width, as docs/PAINTINGS.md and the import's placeholder have it), so
 * x and the radius carry over and y is stretched by the frame's aspect about the centre.
 */
export function codaAnchor(): { x: number; y: number; r: number } {
  const so = art["share-orange"];
  const a = so.anchors.orange;
  return { x: a.x, y: 0.5 + (a.y - 0.5) * art.coda.aspect, r: so.radii.orange };
}

/** The floating orange on screen (CSS px, centre and radius), breath and parallax aside. */
export function codaOrange(css: Size): { x: number; y: number; r: number } {
  const a = codaAnchor();
  const framing = phoned(art.coda.framing, art.coda.phonePan);
  const s = uncover({ x: a.x, y: a.y }, css, CODA_TEX, framing);
  const cs = coverScale(css, CODA_TEX);
  return { x: s.x * css[0], y: s.y * css[1], r: (a.r * css[0] * framing.zoom) / cs[0] };
}

export interface Halo {
  /** The orange's centre and radius, CSS px. */
  x: number;
  y: number;
  r: number;
  /** The ring's inner and outer radius, CSS px. */
  ring: number;
  outer: number;
  /** The halo's growth 0..1 (0: none). */
  g: number;
}

/** The halo at p and this frame size (for the DOM glass; the shader computes the same with breath). */
export function haloAt(p: number, css: Size): Halo {
  const g = haloGrowth(codaT(p));
  const o = codaOrange(css);
  const ring = o.r * (1 + CODA_TUNE.haloGap * g);
  return { ...o, ring, outer: ring + CODA_TUNE.haloWidth * css[1], g };
}

// ---------------------------------------------------------------------------------------------
// The coda's copy
// ---------------------------------------------------------------------------------------------

/** `--col-a: max(32px, 8%)` and `--col-b: max(32px, 24%)` from src/app/globals.css. */
const colA = (w: number) => Math.max(32, 0.08 * w);
const colB = (w: number) => Math.max(32, 0.24 * w);

/**
 * The fit column at this frame size (CSS px): column B where that leaves at least `copyMin` before
 * the orange's left edge (the copy must never cross the fruit it sits beside; the halo's ring may
 * overlap its line ends, where the glass blurs them), else column A; at most `copyMax` wide. Tall
 * phones take one column between the gutters.
 */
export function codaCopyColumn(css: Size): { left: number; width: number } {
  const [w] = css;
  const T = CODA_TUNE;
  if (narrowFrame(css)) {
    const a = colA(w);
    return { left: a, width: w - 2 * a };
  }
  const o = codaOrange(css);
  const edge = o.x - o.r - T.copyGap;
  const b = colB(w);
  const left = edge - b >= T.copyMin ? b : colA(w);
  return { left, width: Math.max(T.copyMin, Math.min(T.copyMax, edge - left)) };
}

/** 0..1: the large chapter title at p, in over the coda's first units and gone by its half. */
export function codaTitleAlpha(p: number): number {
  const T = CODA_TUNE;
  const x = codaUnits(p);
  const up = smooth(0, 1, (x - T.titleFrom) / T.copyRamp);
  const down = 1 - smooth(0, 1, (x - (CODA_UNITS / 2 - T.copyRamp)) / T.copyRamp);
  return up * down;
}

/** 0..1: a piece of the fit copy at p (pass `fitLead` for the text, 0 for the tag and side); it leaves as the halo grows. */
export function codaFitAlpha(p: number, lead: number): number {
  const T = CODA_TUNE;
  const x = codaUnits(p);
  const up = smooth(0, 1, (x - (T.fitFrom + T.fitLead - lead)) / T.copyRamp);
  const out = 1 - smooth(T.fitLeaveFrom, T.fitLeaveTo, codaT(p));
  return up * out;
}

/** True while the coda's copy can be on screen at p. */
export function codaCopyNear(p: number): boolean {
  return p >= codaSeg.start && p < codaSeg.end;
}

// ---------------------------------------------------------------------------------------------
// The HUD
// ---------------------------------------------------------------------------------------------

/** HUD readout over the close and the coda. `frame`/`count` are the coda frame on screen. */
export function codaHudLines(p: number, css: Size, frame: number, count: number): string[] {
  if (p < codaSeg.start) {
    const t = closeT(p);
    const g = burnGeometry(css);
    const R = burnR(t, css);
    return [
      `close t ${t.toFixed(3)}  travel ${burnTravel(t).toFixed(3)}  R ${R.toFixed(3)} of ${g.r0.toFixed(2)}..${g.r1.toFixed(2)}  lag env ${lagEnvelope(t).toFixed(2)}`,
      `front at corner ${(g.dmin - R).toFixed(3)}  centre ${burnFront({ x: 0.5, y: 0.5 }, t, css).toFixed(3)}  far corner ${(g.dmax - R).toFixed(3)}  (ahead > ${FAST_AHEAD.toFixed(2)}, behind > ${fastBehindAt(t).toFixed(2)} are fast paths)`,
    ];
  }
  const t = codaT(p);
  const h = haloAt(p, css);
  return [
    `coda t ${t.toFixed(3)}  scrub ${codaProgress(t).toFixed(3)}  frame ${frame}/${count - 1}`,
    `halo g ${h.g.toFixed(3)}  orange ${h.x.toFixed(0)},${h.y.toFixed(0)} r ${h.r.toFixed(0)} px  ring ${h.ring.toFixed(0)}..${h.outer.toFixed(0)} px`,
    `copy title ${codaTitleAlpha(p).toFixed(2)}  fit text ${codaFitAlpha(p, CODA_TUNE.fitLead).toFixed(2)} rest ${codaFitAlpha(p, 0).toFixed(2)}`,
  ];
}
