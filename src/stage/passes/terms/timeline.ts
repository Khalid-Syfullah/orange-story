// The Terms on paper (docs/STORY.md row 3, docs/TRANSITIONS.md rows Sheet -> drawing and
// Drawing -> panel): the construction drawing soaks into the sheet holding the whole frame, orbits
// from eye level to a top-down plan, and its window draws back to a brushed-edge square panel in the
// left margin beside the terms copy, while a small gilded orange arrives in the right margin.
//
// The picture (./frag.ts through ./index.ts), the copy (TermsCopy.tsx) and the HUD read these
// numbers, so the copy ramps in with the window it sits beside. Nothing here is a `p` value: the
// timing is in shares of the `drawing` segment (p 0.42-0.48), which carries the soak, the orbit and
// the retreat; the `panel` segment (p 0.48-0.50) holds the panel at rest beside the copy, and the
// close (phase 10) burns it. Lengths of copy ramps are in scroll units (SCROLL_UNIT).
//
// Geometry is in CSS px of the frame, y down. "The window" is one rect interpolated from the full
// frame to the panel; "the picture" is the drawing's square, centred on the window (the sampling
// follows it, so there is never a second copy) with its own side, which eases on a later curve than
// the window's size: the picture zooms inside the cutout, not with it.
import { narrowFrame, stackState } from "../../band";
import type { Size } from "../../framing";
import { local, SCROLL_UNIT, segment } from "../../script";

const drawingSeg = segment("drawing");
const panelSeg = segment("panel");
const closeSeg = segment("close");

/** The `drawing` segment's length in scroll units (600 for p 0.42-0.48). */
export const DRAWING_UNITS = (drawingSeg.end - drawingSeg.start) / SCROLL_UNIT;

export const TERMS_TUNE = {
  /** The soak runs over [0, soakTo] of the drawing; its T goes from soakT0 (nothing) to 1. */
  soakTo: 0.3,
  /** T starts below 0 so no pixel's coverage (with its bite) is above 0 on the first frame. */
  soakT0: -0.1,
  /** The soak's speed ramps in over this share of it (rule 4). */
  soakRamp: 0.15,
  /** The orbit: frames 0..last over [0, orbitTo] of the drawing, ramping in and settling on the plan. */
  orbitTo: 0.85,
  orbitRamp: 0.12,
  orbitSettle: 0.3,
  /** The window draws back over [retreatFrom, retreatTo] of the drawing, as the orbit turns to plan. */
  retreatFrom: 0.4,
  retreatTo: 0.85,
  /** Size eases with t * (lin + (1 - lin) * t^2). */
  sizeLin: 0.6,
  /** The centre follows the size with this lag (ms), so the panel settles after it shrinks. */
  centreLagMs: 220,
  /** The picture zooms out inside the cutout on a smoothstep from this share of the retreat. */
  zoomFrom: 0.15,
  /** At the full frame the picture is a cover fit pushed in this much (its paper's edge stays off screen). */
  coverZoom: 1.06,
  /** At rest the picture is this much larger than the panel (the brushed edge eats its paper margin). */
  pictureFit: 1.26,
  /** How far (in bands) past the window's rect the brushed fringe can still carry ink. */
  fringeBands: 1.6,
  /** The brushed band: its width at the full frame (frame heights) and at the panel (panel sides). */
  bandFull: 0.06,
  bandPanel: 0.075,
  /** How far beyond the frame the full-frame window reaches, in bands (its edge is never on screen). */
  fullReach: 2.6,
  /** Corner radius of the window, in bands. */
  cornerBands: 0.8,
  /** Layout, desktop: column A ends at this share of the width; the copy starts a gap after the panel. */
  colAEnd: 0.36,
  copyGap: 0.045,
  copyEnd: 0.72,
  copyMaxWidth: 480,
  /** The margin orange: x as a share of the width, y as a share of the panel below its top, radius in frame heights. */
  orangeX: 0.835,
  orangeAt: 0.3,
  orangeR: 0.045,
  /** It prints in over this span of the retreat, dropping this far (radii) into place. */
  orangeFrom: 0.55,
  orangeTo: 1.0,
  orangeDrop: 0.25,
  /** Skip it entirely on frames narrower than this (CSS px). */
  orangeMinWidth: 768,
  /**
   * Copy: ramp length and the title's lead (scroll units). The title starts `copyEarly` units before
   * the window lands (the window clears column B only in the retreat's last stretch), the rest
   * `titleLead` units after it.
   */
  copyRamp: 60,
  titleLead: 12,
  copyEarly: 24,
  /** Motion smear of the picture: the cap on one frame's displacement (CSS px). */
  smearMax: 24,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Integral of smoothstep(0, 1, u) from 0 to u (u in 0..1): u^3 - u^4 / 2. */
const smoothArea = (u: number) => {
  const k = clamp01(u);
  return k * k * k - 0.5 * k * k * k * k;
};

/**
 * Progress along a travel whose speed ramps in over `ramp` (smoothstep, rule 4) and eases out to
 * zero over the last `settle` (0 for none): the normalised integral of that speed profile, so the
 * position has no kink anywhere. `ramp + settle` must not exceed 1.
 */
export function profile(x: number, ramp: number, settle: number): number {
  const k = clamp01(x);
  const a = ramp > 0 ? (k < ramp ? ramp * smoothArea(k / ramp) : 0.5 * ramp + (k - ramp)) : k;
  const from = 1 - settle;
  const b = settle > 0 && k > from ? settle * smoothArea((k - from) / settle) : 0;
  return (a - b) / (1 - 0.5 * ramp - 0.5 * settle);
}

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

/** Local progress of the drawing at p (0 before it, 1 from the panel on). */
export function drawingT(p: number): number {
  return local("drawing", p);
}

/** The soak's T at p: soakT0 before the drawing, 1 once the whole frame has taken the ink. */
export function soakAt(p: number): number {
  const { soakTo, soakT0, soakRamp } = TERMS_TUNE;
  return mix(soakT0, 1, profile(drawingT(p) / soakTo, soakRamp, 0));
}

/** The orbit's progress 0..1 at p (frame = progress * (count - 1); the last frame is the plan). */
export function orbitAt(p: number): number {
  const { orbitTo, orbitRamp, orbitSettle } = TERMS_TUNE;
  return profile(drawingT(p) / orbitTo, orbitRamp, orbitSettle);
}

/** The retreat's local t at p: 0 while the window holds the frame, 1 once it is the panel. */
export function retreatAt(p: number): number {
  const { retreatFrom, retreatTo } = TERMS_TUNE;
  return clamp01((drawingT(p) - retreatFrom) / (retreatTo - retreatFrom));
}

/** The window's size progress at retreat t: t * (0.6 + 0.4 * t^2), accelerating. */
export function sizeEase(t: number): number {
  const k = clamp01(t);
  const lin = TERMS_TUNE.sizeLin;
  return k * (lin + (1 - lin) * k * k);
}

/** The picture's zoom progress at retreat t: later than the size, settling. */
export function zoomEase(t: number): number {
  return smooth(TERMS_TUNE.zoomFrom, 1, t);
}

/** The margin orange's arrival 0..1 at retreat t. */
export function orangeInAt(t: number): number {
  return smooth(TERMS_TUNE.orangeFrom, TERMS_TUNE.orangeTo, t);
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

/** The top rule (px) and the mid rule (share of the height) from src/app/globals.css. */
const RULE_TOP = 72;
const RULE_MID = 0.705;
/** `--col-a: max(32px, 8%)`. */
const colA = (w: number) => Math.max(32, 0.08 * w);

export interface TermsLayout {
  /** Tall phones: the panel on top, the copy stacked under it in one column. */
  stacked: boolean;
  /** The panel at rest: centre and side, CSS px. */
  panel: { cx: number; cy: number; side: number };
  /** The copy column: left, top and width, and its minimum height (the panel's side beside it). */
  copy: { left: number; top: number; width: number; minHeight: number };
  /** The margin orange at rest: centre and radius (CSS px); `on` false on narrow frames. */
  orange: { x: number; y: number; r: number; on: boolean };
}

let layoutKey = "";
let layoutCache: TermsLayout | null = null;

/** Where the panel, the copy and the orange sit at this frame size (cached per size). */
export function termsLayout(css: Size): TermsLayout {
  const key = `${css[0]}x${css[1]}`;
  if (layoutCache && key === layoutKey) return layoutCache;
  const [w, h] = css;
  const a = colA(w);
  const T = TERMS_TUNE;
  let out: TermsLayout;
  if (narrowFrame(css)) {
    // One column: the panel under the top rule, the copy under the panel.
    // On a tall phone the frame is the picture's band: the panel takes more of it, the copy runs on below.
    const side = Math.max(120, Math.min(w - 2 * a, (stackState.stacked ? 0.46 : 0.34) * h));
    const top = RULE_TOP + 0.03 * h;
    out = {
      stacked: true,
      panel: { cx: w / 2, cy: top + side / 2, side },
      copy: { left: a, top: top + side + 0.03 * h, width: w - 2 * a, minHeight: 0 },
      orange: { x: 0, y: 0, r: 0, on: false },
    };
  } else {
    // Column A is the left margin the copy leaves (about 36% of the width); the panel is the
    // largest square in it that clears the top rule and the mid rule, centred between them.
    const band = RULE_MID * h - RULE_TOP;
    const side = Math.max(120, Math.min(T.colAEnd * w - a, band - 2 * Math.max(24, 0.06 * h)));
    const cx = a + side / 2;
    const cy = RULE_TOP + band / 2;
    const left = a + side + Math.max(40, T.copyGap * w);
    const width = Math.max(220, Math.min(T.copyEnd * w - left, T.copyMaxWidth));
    out = {
      stacked: false,
      panel: { cx, cy, side },
      copy: { left, top: cy - side / 2, width, minHeight: side },
      orange: {
        x: T.orangeX * w,
        y: cy - side / 2 + T.orangeAt * side,
        r: Math.min(64, Math.max(24, T.orangeR * h)),
        on: w >= T.orangeMinWidth,
      },
    };
  }
  layoutKey = key;
  layoutCache = out;
  return out;
}

// ---------------------------------------------------------------------------------------------
// The window and the picture
// ---------------------------------------------------------------------------------------------

export interface WindowRect {
  /** Centre and half-size, CSS px. */
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  /** The brushed band's width and the corner radius, CSS px. */
  band: number;
  radius: number;
}

/**
 * The window at size progress `k` with its centre at progress `kc` (the lagged size): one rect
 * interpolated from the full frame (reaching past every edge by `fullReach` bands, so its brushed
 * edge is never on screen) to the panel.
 */
export function windowAt(k: number, kc: number, css: Size): WindowRect {
  const L = termsLayout(css);
  const [w, h] = css;
  const T = TERMS_TUNE;
  const bandFull = T.bandFull * h;
  const bandPanel = T.bandPanel * L.panel.side;
  const reach = T.fullReach * bandFull;
  const band = mix(bandFull, bandPanel, k);
  return {
    cx: mix(w / 2, L.panel.cx, kc),
    cy: mix(h / 2, L.panel.cy, kc),
    hx: mix(w / 2 + reach, L.panel.side / 2, k),
    hy: mix(h / 2 + reach, L.panel.side / 2, k),
    band,
    radius: band * T.cornerBands,
  };
}

/**
 * The picture's side (CSS px per texture unit) at retreat t for the window W: it eases in log space
 * from a cover fit of the frame (pushed in `coverZoom`) to `pictureFit` of the panel on its own,
 * later curve, so the picture zooms inside the cutout; and it never drops below what covers the
 * window's visible part with its brushed fringe (a smooth maximum, so there is no kink), so the
 * square's straight edge is never inside the cutout (rule 1).
 */
export function pictureSide(t: number, W: WindowRect, css: Size): number {
  const L = termsLayout(css);
  const T = TERMS_TUNE;
  const z0 = Math.max(css[0], css[1]) * T.coverZoom;
  const z1 = L.panel.side * T.pictureFit;
  const eased = Math.exp(mix(Math.log(z0), Math.log(z1), zoomEase(t)));
  const reach = T.fringeBands * W.band;
  const half = (c: number, h: number, size: number) =>
    Math.max(Math.min(c + h + reach, size) - c, c - Math.max(c - h - reach, 0));
  const need = 2 * Math.max(half(W.cx, W.hx, css[0]), half(W.cy, W.hy, css[1]));
  const k = 0.06 * need;
  return 0.5 * (eased + need + Math.sqrt((eased - need) * (eased - need) + k * k));
}

/** The margin orange's centre at retreat t: it drops into place as it prints in. */
export function orangeAt(t: number, css: Size): { x: number; y: number; r: number; on: boolean } {
  const o = termsLayout(css).orange;
  const left = 1 - orangeInAt(t);
  return { ...o, y: o.y - left * left * TERMS_TUNE.orangeDrop * o.r };
}

// ---------------------------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------------------------

/** Scroll units into the drawing at p (negative before it). */
export function drawingUnits(p: number): number {
  return (p - drawingSeg.start) / SCROLL_UNIT;
}

/** Where the title starts to come in (scroll units into the drawing): just before the window lands. */
export const COPY_FROM = TERMS_TUNE.retreatTo * DRAWING_UNITS - TERMS_TUNE.copyEarly;

/**
 * 0..1: a piece of the terms copy at p. It ramps in over `copyRamp` units as the window lands beside
 * it (the title `titleLead` units ahead of the rest, so pass `titleLead` for the title and 0 for the
 * rest) and holds through the panel. It does not leave on its own: the close burns it with the paper
 * (TermsCopy.tsx multiplies this by `burnSurvival()` from passes/coda/timeline.ts).
 */
export function copyAlpha(p: number, lead: number): number {
  const T = TERMS_TUNE;
  const x = drawingUnits(p);
  return smooth(0, 1, (x - (COPY_FROM + T.titleLead - lead)) / T.copyRamp);
}

/** True while the terms copy can be on screen at p (the drawing, the panel and the close that burns it). */
export function copyNear(p: number): boolean {
  return p > drawingSeg.start && p < closeSeg.end;
}

/** The end of the panel segment, for passes that draw the panel at rest (the close, phase 10). */
export const PANEL_END = panelSeg.end;

// ---------------------------------------------------------------------------------------------
// The HUD
// ---------------------------------------------------------------------------------------------

/** HUD readout of the terms at p. `kc` is the lagged centre progress the pass used last frame. */
export function termsHudLines(p: number, css: Size, kc: number, frame: number, count: number, usePlan: boolean): string[] {
  const t = retreatAt(p);
  const k = sizeEase(t);
  const W = windowAt(k, kc, css);
  const L = termsLayout(css);
  return [
    `soak T ${soakAt(p).toFixed(3)}  orbit ${orbitAt(p).toFixed(3)}  frame ${frame}/${count - 1}${usePlan ? " (plan)" : ""}`,
    `retreat ${t.toFixed(3)}  size ${k.toFixed(3)}  centre ${kc.toFixed(3)}  zoom ${zoomEase(t).toFixed(3)}  picture ${pictureSide(t, W, css).toFixed(0)} px`,
    `window ${W.cx.toFixed(0)},${W.cy.toFixed(0)} ${(2 * W.hx).toFixed(0)}x${(2 * W.hy).toFixed(0)}  band ${W.band.toFixed(1)}  panel ${L.panel.side.toFixed(0)} px${L.stacked ? " stacked" : ""}`,
    `copy title ${copyAlpha(p, TERMS_TUNE.titleLead).toFixed(2)} rest ${copyAlpha(p, 0).toFixed(2)}  orange ${L.orange.on ? orangeInAt(t).toFixed(2) : "off"}`,
  ];
}
