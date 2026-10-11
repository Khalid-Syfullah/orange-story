// The application and the rise (docs/STORY.md rows 4 -> application, Application, The rise;
// docs/TRANSITIONS.md rows Questions -> Application and Application -> finale): timing and geometry
// shared by the three shaders (./frag.ts through ./index.ts), the DOM layer (ApplicationCopy.tsx:
// the form, the stars, the hairlines) and the HUD. Nothing here is a `p` value: the moire is timed
// in shares of the `moire` segment (p 0.76-0.79), the form in scroll units into the `application`
// segment (p 0.79-0.90; negative while the painting is still printing in) and the rise in shares
// of `rise` (p 0.90-0.96). A scroll unit is 1/10000 of the story (script.ts SCROLL_UNIT).
//
// Geometry is in CSS px of the frame, y down, unless a name says painting units or frame heights.
import { narrowFrame, stackState } from "../../band";
import { art, type Framing, type Point } from "@/content/art";
import { coverScale, phoneAmount, sizeFromAspect, uncover, type Size } from "../../framing";
import { local, SCROLL_UNIT, segment } from "../../script";
import { lineTerm, LINE_MAX, questionsUnits } from "../canopy/timeline";

const appSeg = segment("application");
const moireSeg = segment("moire");

/** Lengths of the segments in scroll units (300, 1100 and 600). */
export const MOIRE_UNITS = Math.round((moireSeg.end - moireSeg.start) / SCROLL_UNIT);
export const APPLICATION_UNITS = Math.round((appSeg.end - appSeg.start) / SCROLL_UNIT);
export const RISE_UNITS = Math.round((segment("rise").end - segment("rise").start) / SCROLL_UNIT);

export const APP_TUNE = {
  // ---- the picture --------------------------------------------------------------------------
  /** A small push-in so the breath, the pointer parallax and the drift never show the painting's edge. */
  zoom: 1.03,
  /** The fingertip stays at this share of the frame's width whatever the frame's shape (the figure is pinned left). */
  fingerX: 0.3,
  /** ...and at this share when the frame is tall and narrow (the visible window under 30% of the painting's width). */
  fingerXNarrow: 0.62,

  // ---- the moire print-in (docs/TRANSITIONS.md, Questions -> Application) ------------------------
  /** The coarse screen: cell in CSS px (times dpr), laid at 15 degrees, so it moires against the pixel grid. */
  cell: 10,
  angle: (15 * Math.PI) / 180,
  /** The sky gap's second screen, a hair finer and turned a few degrees more: the beat between the two is the moire. */
  cell2: 10.7,
  angle2: (24 * Math.PI) / 180,
  /** The accelerating curve of the whole cut's clock: tt = t * (lin + (1 - lin) * t^2) (rule 4). */
  lin: 0.55,
  /** The screen takes the gap over the first `screenTo` of the cut, then gives way to the clouds as they print in. */
  screenTo: 0.75,
  /** Dot radius of the bare screen at its fullest, in cells. */
  screenR: 0.4,
  /** Sky and clouds print in over [gapFrom, gapFrom + gapLen]. */
  gapFrom: 0.02,
  gapLen: 0.5,
  /** Branches: from the gap's inner edge outward over [leafFrom, leafFrom + leafSpread], each taking leafLen. */
  leafFrom: 0.1,
  leafSpread: 0.38,
  leafLen: 0.3,
  /** The figure, the steps and the fruit resolve last: from figFrom, each taking figLen. */
  figFrom: 0.58,
  figLen: 0.38,
  /** The painting arrives pushed in about the gap's centre (a dolly, rule 7) and offset the way the front travels (rule 5). */
  dolly: 1.1,
  lagOffset: 0.045,
  lagSmear: 0.02,
  /** The scrim behind the form comes in over [scrimFrom, 1] of the cut. */
  scrimFrom: 0.5,

  // ---- the form (units into the `application` segment; the pieces are all in by 0) ---------------
  /** Ramp of a piece in or out, units; the rise of each piece, px. */
  copyRamp: 60,
  rise: 10,
  /** Where each piece starts coming in: tag, title, subtitle, three fields, the button. */
  pieceFrom: [-135, -123, -111, -99, -87, -75, -63] as readonly number[],
  /** The hairlines grow out from the fingertip, one after another: where each starts and how long it takes. */
  lineFrom: [-170, -126, -82] as readonly number[],
  lineGrow: 90,
  /** Star `j` arrives with its field (piece 3 + j). */
  starPiece: 3,

  // ---- the rise (shares of the `rise` segment) --------------------------------------------------
  /** The form fades out piece by piece, the last piece first, before any line goes: from `outFrom`, `outStep` apart, each over `outLen`. */
  outFrom: 0.0,
  outStep: 0.022,
  outLen: 0.12,
  /** The lines retract toward the fingertip from here; line k starts at k * 0.62 / (n - 1) of that clock and takes the rest. */
  retractFrom: 0.3,
  retractTo: 0.98,
  stagger: 0.62,
  /** The phone's camera over to the sapling: from and to, shares of the rise. */
  panFrom: 0.04,
  panTo: 0.9,
  /** The sapling's print-in front: R(t) from `frontFrom` to `frontTo` in the front's units (painting heights), accelerating. */
  frontFrom: -0.15,
  frontTo: 0.5,
  frontLin: 0.85,
  /** How much of the front's metric comes from height above the foot and from the sideways distance. */
  upK: 0.85,
  sideK: 0.55,
  /** The bite (rule 1): amplitudes on the front (the doc's 0.30 and 0.10, scaled to a tree 0.3 painting heights tall), and the band the sapling's halftone prints in over. */
  n1Amp: 0.2,
  n2Amp: 0.07,
  band: 0.06,
  /** The sapling's own screen: cell in CSS px. */
  saplingCell: 4.5,
  /** The sapling arrives displaced back down toward its foot and smeared the way it grows (rules 5, 6). */
  saplingLag: 0.014,
  /** The halftone cloud behind it: size (painting heights), the height of its flat base, and where it crosses from and to (painting heights, x). */
  cloudSize: 0.2,
  cloudBase: 0.76,
  cloudFrom: 2.05,
  cloudTo: -0.75,
} as const;

const T = APP_TUNE;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export const APP_TEX = sizeFromAspect(art.application.aspect);

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

/** Local progress of the moire at p. */
export function moireT(p: number): number {
  return local("moire", p);
}

/** Local progress of the rise at p. */
export function riseT(p: number): number {
  return local("rise", p);
}

/** Scroll units into the application segment at p (negative before it: the print-in). */
export function appUnits(p: number): number {
  return (p - appSeg.start) / SCROLL_UNIT;
}

// ---------------------------------------------------------------------------------------------
// The painting in the frame
// ---------------------------------------------------------------------------------------------

/**
 * The application's own framing for this frame: a plain cover fit with the figure pinned left, so
 * the fingertip sits at `fingerX` of the frame's width at every viewport (the window slides over
 * the painting, never past its edges). Vertically the painting is centred.
 */
export function applicationFraming(css: Size, rise = 0): Framing {
  const vis = coverScale(css, APP_TEX)[0] / T.zoom;
  const finger = art.application.anchors.fingertip.x;
  // On a frame so tall that the window is narrower than her reach, the fingertip moves right so the
  // whole figure stays in it (a phone shows her at the left, not cut off by its edge).
  const fx = T.fingerX + (T.fingerXNarrow - T.fingerX) * clamp01((0.6 - vis) / 0.3);
  const left = Math.min(Math.max(finger - fx * vis, 0), 1 - vis);
  const x = left - 0.5 + 0.5 * vis;
  // On a tall phone the window cannot hold both her and the sapling, so the rise carries it over:
  // the pan walks from the figure to the finale's own pan (art.finale.phonePan), where the tree
  // stands in the middle and the finale loop takes over on the same alignment.
  const k = phoneAmount() * risePan(rise);
  return { pan: { x: x + (art.finale.phonePan.x - x) * k, y: 0 }, zoom: T.zoom };
}

/** How far the rise's camera has travelled, 0..1: it starts as the sapling begins to print and settles before the front ends. */
export function risePan(t: number): number {
  const k = clamp01((t - T.panFrom) / (T.panTo - T.panFrom));
  return k * k * (3 - 2 * k) * 0.7 + k * 0.3;
}

const sine = (x: number) => Math.sin(x * Math.PI * 2);

/** The rest state's breath in -1..1 (passes/rest.ts restBreath): three incommensurate sines. */
function restBreath(tm: number): number {
  return 0.5 * sine(tm / 5.3) + 0.3 * sine(tm / 7.9 + 1.3 / (Math.PI * 2)) + 0.2 * sine(tm / 11.4 + 2.1 / (Math.PI * 2));
}

export interface RestInput {
  /** Seconds, the pass's clock: time * (1 - still). */
  tm: number;
  mouse: readonly [number, number];
  kick: number;
}

/**
 * Where a painting point lands on screen (uv) with the rest state of passes/rest.ts applied, the
 * same arithmetic as the shader's `cover(uv) + restOffset` inverted, so a DOM mark on an anchor
 * holds on it through the breath, the pointer parallax and the drift. `css` is the frame.
 */
export function pinned(point: Point, css: Size, rest: RestInput, rise = 0): Point {
  const base = applicationFraming(css, rise);
  const zoom = base.zoom * (1 + 0.004 * restBreath(rest.tm) + 0.015 * rest.kick);
  const off = {
    x: -rest.mouse[0] * 0.0045 + 0.0022 * sine(rest.tm * 0.17),
    y: -rest.mouse[1] * 0.0032 + 0.0022 * sine(rest.tm * 0.13 + 1.1 / (Math.PI * 2)),
  };
  return uncover({ x: point.x - off.x, y: point.y - off.y }, css, APP_TEX, { pan: base.pan, zoom });
}

/** The fingertip on screen (CSS px), `uncover(art.application.fingertip)`. */
export function fingertip(css: Size, rest: RestInput, rise = 0): { x: number; y: number } {
  const s = pinned(art.application.anchors.fingertip, css, rest, rise);
  return { x: s.x * css[0], y: s.y * css[1] };
}

// ---------------------------------------------------------------------------------------------
// The form's place, and the scrim behind it
// ---------------------------------------------------------------------------------------------

export interface FormLayout {
  /** Phones: the form is one column between the gutters. */
  narrow: boolean;
  left: number;
  width: number;
}

/** `--col-a: max(32px, 8%)` from src/app/globals.css. */
const colA = (w: number) => Math.max(32, 0.08 * w);

/** The form's column in the sky on the right (right-aligned to the gutter), or the phone's one column. */
export function formLayout(css: Size): FormLayout {
  const [w] = css;
  const a = colA(w);
  if (narrowFrame(css)) {
    // On a tall phone the form is a column on the 16px gutter, under the picture's band.
    const g = stackState.stacked ? 16 : a;
    return { narrow: true, left: g, width: w - 2 * g };
  }
  const width = Math.min(440, Math.max(340, w * 0.3));
  return { narrow: false, left: w - a - width, width };
}

/** The scrim behind the form as a box in screen uv: left, top, right, bottom (feathered by the shader). */
export function scrimBox(css: Size): readonly [number, number, number, number] {
  const [w] = css;
  const l = formLayout(css);
  // On a tall phone the form is under the picture's band, not over it: no scrim.
  if (l.narrow) return stackState.stacked ? [0, 3, 1, 4] : [0, 0.16, 1, 1];
  return [(l.left - 70) / w, 0.1, (l.left + l.width + 70) / w, 0.92];
}

/** The scrim's amount over the moire: it comes in with the form, over the cut's second half. */
export function scrimMoire(t: number): number {
  return smooth(T.scrimFrom, 1, t);
}

/** The scrim's amount over the rise: it leaves with the form, so the painting is the painting again as the lines go. */
export function scrimRise(t: number): number {
  return 1 - formOutAll(t);
}

// ---------------------------------------------------------------------------------------------
// The moire's clock
// ---------------------------------------------------------------------------------------------

/** The moire's clock 0..1: it accelerates behind a smoothstep, no edge to start with (rule 4). */
export function moireClock(t: number): number {
  const x = clamp01(t);
  return x * (T.lin + (1 - T.lin) * x * x);
}

/** The painting's dolly about the gap's centre: pushed in as it arrives, settling to 1 (rule 7). */
export function moireDolly(t: number): number {
  return mix(T.dolly, 1, smooth(0.1, 1, moireClock(t)));
}

/** The bare screen's strength 0..1: it takes the gap, then the clouds take its place. */
export function screenAt(t: number): number {
  return Math.sin(Math.PI * smooth(0, T.screenTo, moireClock(t)));
}

// ---------------------------------------------------------------------------------------------
// The form, the stars and the hairlines
// ---------------------------------------------------------------------------------------------

export const PIECE_COUNT = 7;
export const FIELD_COUNT = 3;
/** The hairlines: fingertip to the first field, then field to field. */
export const LINE_COUNT = FIELD_COUNT;

const smoothU = (units: number, from: number, len: number) => smooth(0, 1, (units - from) / len);

/** 0..1: piece `i` coming in over its ramp (units into the application). */
export function pieceIn(u: number, i: number): number {
  return smoothU(u, T.pieceFrom[i], T.copyRamp);
}

/** 1..0: piece `i` leaving as the rise begins, the last piece first, all gone before any line goes. */
export function pieceOut(t: number, i: number): number {
  const from = T.outFrom + T.outStep * (PIECE_COUNT - 1 - i);
  return 1 - smooth(from, from + T.outLen, t);
}

/** 1..0: the whole form's departure (the slowest piece's), for the scrim and the interactive state. */
function formOutAll(t: number): number {
  return smooth(T.outFrom, T.outFrom + T.outStep * (PIECE_COUNT - 1) + T.outLen, t);
}

/** A piece's alpha at p: its arrival times its departure. */
export function pieceAlpha(p: number, i: number): number {
  return pieceIn(appUnits(p), i) * pieceOut(riseT(p), i);
}

/** How much of hairline `j` is drawn, 0..1, growing from its near end (the fingertip, or the previous star). */
export function lineGrow(u: number, j: number): number {
  return smoothU(u, T.lineFrom[j], T.lineGrow);
}

/** The retraction clock 0..1 over the rise. */
export function retractClock(t: number): number {
  return clamp01((t - T.retractFrom) / (T.retractTo - T.retractFrom));
}

/** Where hairline `j` retracts in the retraction clock: the far one first, then back toward the fingertip, `0.62 / (n - 1)` apart. */
export function retractStart(j: number): number {
  const order = LINE_COUNT - 1 - j;
  return (order * T.stagger) / (LINE_COUNT - 1);
}

/** 0..1: how far hairline `j` has pulled back toward its near end. */
export function lineRetract(t: number, j: number): number {
  const s = retractStart(j);
  return smooth(s, s + (1 - T.stagger), retractClock(t));
}

/** 1..0: star `j` (at the line's far end) stays until the line pulls away from it, then goes with it. */
export function starKeep(t: number, j: number): number {
  const s = retractStart(j);
  return 1 - smooth(s, s + 0.12, retractClock(t));
}

/**
 * The constellation's breath, the Questions term: the same function of the same clock, carried on
 * from the chapter (its `u` keeps counting through the moire and the application), so the stars and
 * lines go on breathing as they did over the canopy. `0.2..1`, 1 as the reader arrives at a line.
 */
export function breath(p: number, j: number): number {
  const u = questionsUnits(p);
  const arrived = questionsUnits(appSeg.start) + T.lineFrom[j] + T.lineGrow;
  const term = lineTerm(u, j + 5, arrived);
  return Math.min(1, Math.max(0.2, (term - 0.4) / (LINE_MAX * 0.8 - 0.4)));
}

// ---------------------------------------------------------------------------------------------
// The rise
// ---------------------------------------------------------------------------------------------

/** The sapling's print-in front R(t): accelerating, a smoothstep ramp in front of it so it has no edge to start with (rule 4). */
export function riseFront(t: number): number {
  const x = clamp01(t);
  const e = x * (T.frontLin + (1 - T.frontLin) * x * x) * smooth(0, 0.14, x);
  return mix(T.frontFrom, T.frontTo, e);
}

/** The halftone cloud's centre x in painting heights as it crosses behind the sapling. */
export function riseCloud(t: number): number {
  const x = clamp01(t);
  return mix(T.cloudFrom, T.cloudTo, x * (0.6 + 0.4 * x * x));
}

// ---------------------------------------------------------------------------------------------
// The HUD
// ---------------------------------------------------------------------------------------------

/** HUD readout over the moire, the application and the rise. */
export function applicationHudLines(p: number, css: Size): string[] {
  if (p < appSeg.start) {
    const t = moireT(p);
    return [
      `moire t ${t.toFixed(3)}  clock ${moireClock(t).toFixed(3)}  screen ${screenAt(t).toFixed(2)}  dolly ${moireDolly(t).toFixed(3)}  scrim ${scrimMoire(t).toFixed(2)}`,
      `form ${Array.from({ length: PIECE_COUNT }, (_, i) => pieceAlpha(p, i).toFixed(2)).join(" ")}`,
    ];
  }
  const u = appUnits(p);
  const f = applicationFraming(css);
  const t = riseT(p);
  const lines = [
    `application ${u.toFixed(0)} / ${APPLICATION_UNITS} units  pan ${f.pan.x.toFixed(3)}  form ${Array.from({ length: PIECE_COUNT }, (_, i) => pieceAlpha(p, i).toFixed(2)).join(" ")}`,
    `lines ${Array.from({ length: LINE_COUNT }, (_, j) => (lineGrow(u, j) * (1 - lineRetract(t, j))).toFixed(2)).join(" ")}  breath ${Array.from({ length: FIELD_COUNT }, (_, j) => breath(p, j).toFixed(2)).join(" ")}`,
  ];
  if (t > 0) {
    lines.push(`rise t ${t.toFixed(3)}  front ${riseFront(t).toFixed(3)}  cloud x ${riseCloud(t).toFixed(2)}  retract ${retractClock(t).toFixed(3)}  scrim ${scrimRise(t).toFixed(2)}`);
  }
  return lines;
}
