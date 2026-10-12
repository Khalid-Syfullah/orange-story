// The match cut and Chapter 4, Questions (docs/STORY.md rows 3 -> 4 and 4 · Questions,
// docs/TRANSITIONS.md row Halo -> canopy): timing and geometry shared by the two shaders
// (./frag.ts through ./index.ts), the DOM layer (QuestionsCopy.tsx: the title, the five cards, the
// constellation) and the HUD. Nothing here is a `p` value: the cut is timed in shares of the
// `matchcut` segment (p 0.58-0.59, 100 scroll units), the chapter in scroll units into the
// `questions` segment (p 0.59-0.76, 1700 units). A scroll unit is 1/10000 of the story, about 5 px
// of scroll on a 900 px frame (script.ts SCROLL_UNIT): the 60-unit ramps below are about 320 px of
// scroll and the 190-unit reach of a constellation line about 1000 px.
//
// Geometry is in CSS px of the frame, y down, unless a name says frame heights (the unit the cuts'
// bands and lags are measured in: x scaled by the aspect).
import { narrowFrame, stackState } from "../../band";
import { art, type Framing, type Point, type Rect } from "@/content/art";
import { coverScale, phoned, sizeFromAspect, uncover, type Size } from "../../framing";
import { coverRoom, FOLD_SHARE } from "../../motion";
import { local, SCROLL_UNIT, segment } from "../../script";
import { codaOrange, haloAt } from "../coda/timeline";
import { profile } from "../terms/timeline";

const matchSeg = segment("matchcut");
const questionsSeg = segment("questions");

/** Lengths of the two segments in scroll units (100 and 1700). */
export const MATCH_UNITS = Math.round((matchSeg.end - matchSeg.start) / SCROLL_UNIT);
export const QUESTIONS_UNITS = Math.round((questionsSeg.end - questionsSeg.start) / SCROLL_UNIT);

/**
 * Viewport heights of scroll in the stage: the track is `heights` (60, Stage.tsx) viewports tall
 * and the pin holds one of them, so p = 1 is 59 viewports down.
 */
export const STAGE_TRACK = 59;
/** Frame heights of page scroll per scroll unit (0.0059): one unit is 0.59% of the frame. */
export const FRAME_PER_UNIT = STAGE_TRACK * SCROLL_UNIT;

export const CANOPY_TUNE = {
  // ---- the match cut (docs/TRANSITIONS.md, tuning order: front speed, bite, band, lag) -----------
  /** The orange travels on a speed that ramps in over `moveRamp` of the cut (rule 4) and settles over `moveSettle`. */
  moveRamp: 0.14,
  moveSettle: 0.4,
  /** Its path bows sideways by this much (frame heights) at the middle, so it is thrown, not slid. */
  arc: 0.03,
  /** The ring front: speed ramps in over `ringRamp` (smoothstep), then `x * (ringLin + (1 - ringLin) * x^2)`. */
  ringRamp: 0.14,
  ringLin: 0.55,
  /** The bite (rule 1): two decorrelated fbm fields, frequencies in frame heights and amplitudes on the front. */
  n1Freq: 2.2,
  n1Amp: 0.3,
  n2Freq: 5.1,
  n2Amp: 0.1,
  /** The bite is zero at t = 0 (the halo is a clean ring) and grows over this share of the cut. */
  biteRamp: 0.3,
  /** The print at the boundary (rule 2): Bayer and hash stipple amplitudes, and the printed edge's half-width. */
  bayer: 0.03,
  stipple: 0.02,
  edgeSoft: 0.004,
  /** The ring's crest: band exp(-x^2 / bandSigma2) in frame heights, chroma split between channels, amount. */
  bandSigma2: 0.0011,
  split: 0.006,
  crestAmt: 0.62,
  /** The halo's light ahead of the ring: reach (frame heights) and amount. */
  lightReach: 0.07,
  lightAmt: 0.16,
  /** The canopy is printed in behind the ring over the first `reveal` of the cut (so t = 0 is the coda's last frame exactly). */
  reveal: 0.1,
  /** The floating orange gives way to the canopy's own over the last share of the cut (printed through a Bayer threshold). */
  discFrom: 0.8,
  /** The coda's halo round the orange fades out over [haloFadeFrom, 1] (the canopy's orange has its own glow). */
  haloFadeFrom: 0.55,
  /** The canopy arrives offset the way the ring travels: lag = exp(-distBehind / lagDist), offset and smear per unit lag (rules 5, 6). */
  lagDist: 0.12,
  lagOffset: 0.05,
  lagSmear: 0.02,
  /** The lag dies, and the canopy settles from its push, over [settleFrom, 1] (rule 5). */
  settleFrom: 0.7,
  /** The canopy arrives pushed in this much about the orange (a dolly, rule 7) and settles to 1 over [dollyFrom, 1]. */
  dolly: 1.14,
  dollyFrom: 0.15,
  /** How far past the farthest corner the ring has to reach: the bite, the print, the band and its softness. */
  ringMargin: 0.3,

  // ---- the canopy ---------------------------------------------------------------------------------
  /** The canopy's speed as a multiple of the chapter's travel (1.0x) and the DOM's (0.6x of the page's scroll). */
  canopyParallax: 1.0,
  domParallax: 0.6,
  /** The camera tilts up through the branches: pan.y walks this far (painting units) over the chapter. */
  travel: 0.22,
  /** The halftone cloud: it crosses at this many widths a second and its fbm edge advances at this many lattice units a second. */
  cloudDrift: 0.022,
  cloudEdge: 0.09,

  // ---- the title ------------------------------------------------------------------------------------
  /** The title sits at this frame height from the top while it is written, and holds until `titleHold` units, then rises away. */
  titleY: 0.43,
  titleHold: 300,
  /** The title ramps in over the chapter's first `copyRamp` units; its last word is written over [writeFrom, writeTo]. */
  writeFrom: 40,
  writeTo: 230,

  // ---- the cards and the constellation -----------------------------------------------------------
  /** Ramp of a card's headline in; the body follows `cardLead` units behind; the rise of each piece, px. */
  copyRamp: 60,
  cardLead: 12,
  rise: 10,
  /**
   * A card comes in as its centre crosses `enterLine` of the frame's height and is gone as it
   * crosses `exitLine`; a card in the left column goes sooner (`exitLineLeft`), before the canopy's
   * nearest orange, which hangs into the top left of the gap.
   */
  enterLine: 0.88,
  exitLine: 0.12,
  exitLineLeft: 0.3,
  /** The units at which the first card crosses the enter line, the spacing between cards, and each card's own offset (loose, not metered). */
  cardFirst: 380,
  cardSpacing: 250,
  cardJitter: [0, 12, -8, 14, -6] as readonly number[],
  /** Each card's centre sits this much off its slot, frame heights, so the grid is loose. */
  cardDrop: [0, 0.035, -0.02, 0.04, -0.015] as readonly number[],
  /** The constellation's line length: base * (a + b * (0.5 + 0.5 * sin(p * k + i * phase)) + c * exp(-|p - y_i| / reach)). */
  lineA: 0.55,
  lineB: 0.75,
  lineC: 0.9,
  lineK: 0.011,
  linePhase: 1.7,
  lineReach: 190,
} as const;

const T = CANOPY_TUNE;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

const CANOPY_TEX = sizeFromAspect(art.canopy.aspect);

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

/** Local progress of the match cut at p (0 before it, 1 from the chapter on). */
export function matchT(p: number): number {
  return local("matchcut", p);
}

/** Scroll units into the chapter at p (negative before it, past QUESTIONS_UNITS after it). */
export function questionsUnits(p: number): number {
  return (p - questionsSeg.start) / SCROLL_UNIT;
}

// ---------------------------------------------------------------------------------------------
// The canopy in the frame
// ---------------------------------------------------------------------------------------------

/**
 * The canopy's framing at p: the loop's own framing (art.ts) with its pan walked up through the
 * branches over the chapter at the canopy's own speed, 1.0x. Before the chapter it is the first
 * frame's framing (the one the match cut lands on); after it, the last.
 */
export function canopyFraming(p: number): Framing {
  const f = phoned(art.canopy.framing, art.canopy.phonePan);
  const k = clamp01(questionsUnits(p) / QUESTIONS_UNITS);
  return { pan: { x: f.pan.x, y: f.pan.y + T.canopyParallax * T.travel * k }, zoom: f.zoom };
}

/**
 * The room (painting units) the canopy's framing leaves the leaves' sway at this frame size: the
 * slack of its cover fit less the pan's widest reach over the whole chapter (its tilt up through the
 * branches) and the rest state, and never more than FOLD_SHARE of the foliage mask's lattice cell
 * (so the warp never folds). One value for the chapter, so a leaf sways the same wherever the camera
 * is, and the match cut's landing and the moire's first frame sway exactly as the chapter does.
 */
export function canopySwayRoom(css: Size): Point {
  const f = phoned(art.canopy.framing, art.canopy.phonePan);
  const reachY = Math.max(Math.abs(f.pan.y), Math.abs(f.pan.y + T.canopyParallax * T.travel));
  const room = coverRoom(css, CANOPY_TEX, f.zoom, { x: f.pan.x, y: reachY });
  const cell = art.canopy.sway.cell;
  return { x: Math.min(room.x, (FOLD_SHARE * cell) / art.canopy.aspect), y: Math.min(room.y, FOLD_SHARE * cell) };
}

/** The nearest canopy orange on screen on the chapter's first frame (CSS px: centre and radius), breath and parallax aside. */
export function canopyOrange(css: Size): { x: number; y: number; r: number } {
  const a = art.canopy.anchors.nearestOrange;
  const framing = phoned(art.canopy.framing, art.canopy.phonePan);
  const s = uncover(a, css, CANOPY_TEX, framing);
  const cs = coverScale(css, CANOPY_TEX);
  return { x: s.x * css[0], y: s.y * css[1], r: (art.canopy.radii.nearestOrange * css[0] * framing.zoom) / cs[0] };
}

/** The canopy's sky gap on screen at the chapter's first frame (CSS px), through the same cover fit. */
export function canopyGap(css: Size): { left: number; right: number; top: number; bottom: number } {
  const g: Rect = art.canopy.rects.gap;
  const framing = phoned(art.canopy.framing, art.canopy.phonePan);
  const a = uncover({ x: g.x, y: g.y }, css, CANOPY_TEX, framing);
  const b = uncover({ x: g.x + g.w, y: g.y + g.h }, css, CANOPY_TEX, framing);
  return { left: a.x * css[0], right: b.x * css[0], top: a.y * css[1], bottom: b.y * css[1] };
}

// ---------------------------------------------------------------------------------------------
// The match cut
// ---------------------------------------------------------------------------------------------

/**
 * The orange's travel 0..1 over the cut: its speed ramps in (rule 4), cruises and settles, the
 * normalised integral of that profile, so the fruit is thrown and lands, with no kink anywhere.
 */
export function orangeTravel(t: number): number {
  return profile(t, T.moveRamp, T.moveSettle);
}

/** The ring's travel 0..1: it accelerates (rule 4's accelerating curve) behind a smoothstep ramp, so it has no edge to start with. */
export function ringProgress(t: number): number {
  const x = clamp01(t);
  return x * (T.ringLin + (1 - T.ringLin) * x * x) * smooth(0, T.ringRamp, x);
}

/** The bite's amplitude factor 0..1: the halo is a clean ring at t = 0 and bites as it travels. */
export function biteAt(t: number): number {
  return smooth(0, T.biteRamp, t);
}

/** The canopy's printing-in 0..1 (so t = 0 is the coda's last frame exactly). */
export function revealAt(t: number): number {
  return smooth(0, T.reveal, t);
}

/** 1..0: the floating orange's share of the fruit; the canopy's own orange takes over from `discFrom`. */
export function discAt(t: number): number {
  return 1 - smooth(T.discFrom, 1, t);
}

/** The ring's crest amplitude 0..1: it comes up with the ring's first travel and is gone as the ring clears the frame. */
export function crestAt(t: number): number {
  return smooth(0, T.reveal, t) * (1 - smooth(T.settleFrom + 0.02, 1, t));
}

/** The coda's halo round the orange as the cut travels: 1 at the start, gone by the end. */
export function haloGainAt(t: number): number {
  return 1 - smooth(T.haloFadeFrom, 1, t);
}

/** The canopy's lag and push amount 1..0: full while the ring is near, gone as it settles. */
export function settleAt(t: number): number {
  return 1 - smooth(T.settleFrom, 1, t);
}

/** The canopy's dolly about the orange at t: pushed in at the ring, settling to 1. */
export function dollyAt(t: number): number {
  return mix(T.dolly, 1, smooth(T.dollyFrom, 1, t));
}

export interface Fruit {
  /** Centre in CSS px and radius in CSS px. */
  x: number;
  y: number;
  r: number;
}

/** The picked orange on screen at t: from the coda's floating orange to the canopy's nearest, thrown on a bowed path. */
export function orangeAt(t: number, css: Size): Fruit {
  const a = codaOrange(css);
  const b = canopyOrange(css);
  const m = orangeTravel(t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // The bow leans to one side of the path (screen left of the travel direction, up for a rightward throw).
  const bow = T.arc * css[1] * Math.sin(Math.PI * m);
  return {
    x: mix(a.x, b.x, m) + (dy / len) * bow,
    y: mix(a.y, b.y, m) - (dx / len) * bow,
    r: a.r * Math.exp(m * Math.log(b.r / a.r)),
  };
}

/** The ring's radius at the end of the cut, frame heights: it clears the farthest corner from the landed orange, bite and band included. */
export function ringEnd(css: Size): number {
  const b = canopyOrange(css);
  const w = css[0] / css[1];
  const cx = b.x / css[1];
  const cy = b.y / css[1];
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, 1 - cy), Math.hypot(w - cx, 1 - cy));
  return far + T.ringMargin;
}

/** The ring's radius at the start of the cut, frame heights: the halo's ring as the coda's last frame has it. */
export function ringStart(css: Size): number {
  return haloAt(questionsSeg.start, css).ring / css[1];
}

/** The ring's radius at t, frame heights: it grows from the halo's ring (carried by the shrinking fruit) to past the farthest corner. */
export function ringAt(t: number, css: Size): number {
  const fruit = orangeAt(t, css);
  const a = codaOrange(css);
  const carried = ringStart(css) * (fruit.r / a.r);
  return mix(carried, ringEnd(css), ringProgress(t));
}

// ---------------------------------------------------------------------------------------------
// The title, the cards, the constellation (the DOM layer)
// ---------------------------------------------------------------------------------------------

/** Frame heights the DOM layer has travelled by `units` into the chapter, at 0.6x the page's scroll. */
export function domOffset(units: number): number {
  return T.domParallax * FRAME_PER_UNIT * units;
}

const smoothU = (units: number, from: number, len: number) => smooth(0, 1, (units - from) / len);

/** 0..1: a piece that starts coming in at `from` units and takes `copyRamp`. */
export function rampIn(units: number, from: number): number {
  return smoothU(units, from, T.copyRamp);
}

/** 1..0: a piece that is gone at `to` units, taking `copyRamp` to leave. */
export function rampOut(units: number, to: number): number {
  return 1 - smoothU(units, to - T.copyRamp, T.copyRamp);
}

export interface Item {
  /** Centre y as a share of the frame's height, at `units` into the chapter. */
  y(units: number): number;
  /** Units at which its headline starts to come in, and at which it has gone. */
  inAt: number;
  outAt: number;
}

/** A card: it crosses the frame at the DOM's 0.6x, in at the enter line, out at the exit line. */
function cardItem(i: number): Item {
  const inAt = T.cardFirst + T.cardSpacing * i + T.cardJitter[i];
  const drop = T.cardDrop[i];
  // Even cards sit in the right column, odd ones in the left (layoutAt).
  const exit = i % 2 === 0 ? T.exitLine : T.exitLineLeft;
  const span = (T.enterLine - exit) / (T.domParallax * FRAME_PER_UNIT);
  return {
    y: (u) => T.enterLine + drop - T.domParallax * FRAME_PER_UNIT * (u - inAt),
    inAt,
    outAt: inAt + span,
  };
}

/** The title: in place at the chapter's start, held while the last word is written, then it rises away at the DOM's 0.6x. */
function titleItem(): Item {
  return {
    y: (u) => T.titleY - T.domParallax * FRAME_PER_UNIT * Math.max(0, u - T.titleHold),
    inAt: 0,
    outAt: T.titleHold + T.copyRamp,
  };
}

export const CARD_COUNT = 5;
/** The title (0) and the cards (1..5), in reading order. */
export const ITEMS: readonly Item[] = [titleItem(), ...Array.from({ length: CARD_COUNT }, (_, i) => cardItem(i))];

/** The handwriting's own clock 0..1: the last word is written over [writeFrom, writeTo] units, one stroke after another. */
export function writeProgress(units: number): number {
  return clamp01((units - T.writeFrom) / (T.writeTo - T.writeFrom));
}

export interface Layout {
  /** Phones: one column between the gutters. */
  narrow: boolean;
  /** The title's left edge and width, px. */
  titleLeft: number;
  titleWidth: number;
  /** Each card's left edge, px, and the one width they share. */
  cardLeft: readonly number[];
  cardWidth: number;
}

/** `--col-a: max(32px, 8%)` from src/app/globals.css. */
const colA = (w: number) => Math.max(32, 0.08 * w);

/**
 * Where the title and the cards sit horizontally at this frame size: on desktop two columns that
 * follow the sky gap (the cards alternate, right column first, a little off true so the grid is
 * loose), on a tall phone one column between the gutters.
 */
export function layoutAt(css: Size): Layout {
  const [w] = css;
  const a = colA(w);
  if (narrowFrame(css)) {
    // On a tall phone the cards are panels on a 16px gutter; the title keeps the text margin.
    const g = stackState.stacked ? 16 : a;
    return {
      narrow: true,
      titleLeft: a,
      titleWidth: w - 2 * a,
      cardLeft: Array.from({ length: CARD_COUNT }, () => g),
      cardWidth: w - 2 * g,
    };
  }
  const gap = canopyGap(css);
  const left = Math.max(a, gap.left);
  const right = Math.min(w - a, gap.right);
  const room = right - left;
  const cardWidth = Math.min(416, Math.max(272, room * 0.44), (room - 40) / 2);
  const jitter = [0.012, -0.01, 0.02, -0.004, 0.008].map((j) => j * w);
  const cardLeft = Array.from({ length: CARD_COUNT }, (_, i) => (i % 2 === 0 ? right - cardWidth + jitter[i] : left + jitter[i]));
  return { narrow: false, titleLeft: left, titleWidth: Math.min(room * 0.72, 760), cardLeft, cardWidth };
}

/**
 * The constellation line's length as a share of its base, at scroll units `u` into the chapter, for
 * line `i` whose own scroll position is `yi` (the units at which the reader arrives at it):
 * `0.55 + 0.75 * (0.5 + 0.5 * sin(u * 0.011 + i * 1.7)) + 0.9 * exp(-|u - yi| / 190)`. A slow
 * breath plus a swell as the reader arrives, easing away after; the star opacity shares it.
 */
export function lineTerm(u: number, i: number, yi: number): number {
  return (
    T.lineA +
    T.lineB * (0.5 + 0.5 * Math.sin(u * T.lineK + i * T.linePhase)) +
    T.lineC * Math.exp(-Math.abs(u - yi) / T.lineReach)
  );
}

/** The largest value of `lineTerm`: a line is as long as its span at about this much of it. */
export const LINE_MAX = T.lineA + T.lineB + T.lineC;
/** A line's base: its span over this, so the span is reached only as the reader arrives and the breath is high. */
export const LINE_SPAN_DIV = 1.8;

/** Line `i` joins item `i` to item `i + 1`; its own scroll position is where the later item crosses the middle of the frame. */
export function lineAt(i: number): number {
  const next = ITEMS[i + 1];
  return next.inAt + (T.enterLine - 0.5) / (T.domParallax * FRAME_PER_UNIT);
}

// ---------------------------------------------------------------------------------------------
// The HUD
// ---------------------------------------------------------------------------------------------

/** HUD readout over the match cut and the chapter. */
export function canopyHudLines(p: number, css: Size): string[] {
  if (p < questionsSeg.start) {
    const t = matchT(p);
    const f = orangeAt(t, css);
    return [
      `matchcut t ${t.toFixed(3)}  orange ${orangeTravel(t).toFixed(3)} at ${f.x.toFixed(0)},${f.y.toFixed(0)} r ${f.r.toFixed(0)} px  ring ${ringAt(t, css).toFixed(3)} of ${ringEnd(css).toFixed(2)} (${ringProgress(t).toFixed(3)})`,
      `reveal ${revealAt(t).toFixed(2)}  bite ${biteAt(t).toFixed(2)}  disc ${discAt(t).toFixed(2)}  halo ${haloGainAt(t).toFixed(2)}  settle ${settleAt(t).toFixed(2)}  dolly ${dollyAt(t).toFixed(3)}`,
    ];
  }
  const u = questionsUnits(p);
  const pan = canopyFraming(p).pan;
  return [
    `questions ${u.toFixed(0)} / ${QUESTIONS_UNITS} units  canopy pan ${pan.y.toFixed(4)}  dom ${domOffset(Math.max(u, 0)).toFixed(3)} frame heights`,
    `write ${writeProgress(u).toFixed(3)}  title y ${ITEMS[0].y(u).toFixed(2)}  cards ${ITEMS.slice(1)
      .map((it) => `${it.y(u).toFixed(2)}`)
      .join(" ")}`,
    `lines ${Array.from({ length: CARD_COUNT }, (_, i) => lineTerm(u, i, lineAt(i)).toFixed(2)).join(" ")}`,
  ];
}
