import { platePoint } from "@/art/manifest";
import { clamp01, ease, remap, seeded } from "@/lib/progress";
import { fitFov, panAmount } from "@/scroll/camera-fit";
import { PHONE_ASPECT } from "@/scroll/framing";
import { CAMERA, STARS } from "@/scroll/script";

import { hazeAmount } from "./text-haze";

import type { TwinklePoint } from "./twinkle";

/**
 * Scene 12, the constellation, as pure functions of progress (no React, no three). Timings live in
 * `STARS` (`src/scroll/script.ts`). A seeded graph of white nodes grows outward from the astronomer's
 * fingertip: nodes nearer the finger appear first, edges join some of them and draw out from the
 * older end as the newer node appears, and many stars just twinkle. The bottom right stays clear
 * (only clouds there). Everything is a function of progress, so it plays backwards exactly.
 *
 * The graph is laid out in the sky the stargazer camera sees (`SKY`): its spread, the size of its
 * stars and how far apart joined stars may be are all fractions of that view, so a nearer or wider
 * frame keeps the same constellation on screen.
 */

/** The stargazer camera key (where the constellation is seen from). */
const KEY = (() => {
  const key = CAMERA.find((k) => k.scene === "stars");
  if (!key) throw new Error("The stars need a camera key");
  return key;
})();

/** World z of the stars: a little behind the astronomer and his platform, in front of the sky. */
export const STAR_Z = -0.6;

/** The sky the stargazer camera sees on the star plane: on a laptop, and the taller one a phone sees (with its pan), together. */
export const SKY = (() => {
  const tan = (fov: number) => Math.tan((fov * Math.PI) / 360);
  const [cx, cy, cz] = KEY.position;
  const halfH = (cz - STAR_Z) * tan(KEY.fov);
  const halfW = halfH * 1.6;
  const pan = KEY.pan ?? [0, 0];
  const k = panAmount(PHONE_ASPECT);
  const px = cx + pan[0] * k;
  const py = cy + pan[1] * k;
  const pz = cz + (pan[2] ?? 0) * k;
  const phoneH = (pz - STAR_Z) * tan(fitFov(KEY.fov, PHONE_ASPECT));
  const phoneW = phoneH * PHONE_ASPECT;
  return {
    /** The laptop's view: its centre and half sizes. */
    cx,
    cy,
    halfW,
    halfH,
    /** Both views together. */
    x: [Math.min(cx - halfW, px - phoneW), Math.max(cx + halfW, px + phoneW)] as const,
    y: [Math.min(cy - halfH, py - phoneH), Math.max(cy + halfH, py + phoneH)] as const,
  };
})();

/** The laptop view's height on the star plane: the unit of the constellation's sizes and spacings. */
export const VIEW = 2 * SKY.halfH;

/**
 * Where the graph grows from: the astronomer's fingertip (the `fingertip` point of his plate), seen
 * from the stargazer camera and carried back onto the stars' plane, so on screen the first stars sit
 * at his finger.
 */
export const FINGERTIP: readonly [number, number] = (() => {
  const [x, y, z] = platePoint("stars/astronomer", "fingertip");
  const camera = KEY.position;
  const t = (camera[2] - STAR_Z) / (camera[2] - z);
  return [camera[0] + (x - camera[0]) * t, camera[1] + (y - camera[1]) * t];
})();

/** The part of the sky that stays empty: the bottom right of the laptop's view, where only clouds drift. */
export function inClearCorner(x: number, y: number): boolean {
  return x > SKY.cx + 0.04 * SKY.halfW && y < SKY.cy - 0.016 * VIEW;
}

/** Keep stars off the astronomer himself (and his platform below him). */
function onFigure(x: number, y: number): boolean {
  return x < FINGERTIP[0] + 0.17 * VIEW && y < FINGERTIP[1] - 0.11 * VIEW;
}

export interface StarEdge {
  from: number;
  to: number;
  /** Progress fraction (0..1 of the growth) at which the edge starts drawing. */
  start: number;
}

export interface Constellation {
  nodes: TwinklePoint[];
  edges: StarEdge[];
}

/** Stars in the laptop's view; the phone's taller view gets as many again for its extra sky. */
const DENSITY = 90;
/** The sky they are scattered over: a little inside the two views together. */
const BOUNDS = { x: [SKY.x[0] + 0.02 * VIEW, SKY.x[1] - 0.02 * VIEW], y: [SKY.y[0] + 0.05 * VIEW, SKY.y[1] - 0.02 * VIEW] } as const;
const COUNT = Math.round((DENSITY * ((BOUNDS.x[1] - BOUNDS.x[0]) * (BOUNDS.y[1] - BOUNDS.y[0]))) / (4 * SKY.halfW * SKY.halfH));

function build(): Constellation {
  const rand = seeded("constellation");
  const raw: { x: number; y: number; size: number }[] = [];
  for (let tries = 0; raw.length < COUNT && tries < COUNT * 40; tries++) {
    const x = BOUNDS.x[0] + (BOUNDS.x[1] - BOUNDS.x[0]) * rand();
    const y = BOUNDS.y[0] + (BOUNDS.y[1] - BOUNDS.y[0]) * rand();
    if (inClearCorner(x, y) || onFigure(x, y)) continue;
    raw.push({ x, y, size: (0.0145 + rand() * 0.0226) * VIEW });
  }
  // Order by distance from the fingertip (with a little jitter), so the graph grows outward.
  const dist = (n: { x: number; y: number }) => Math.hypot(n.x - FINGERTIP[0], n.y - FINGERTIP[1]);
  const jitter = raw.map(() => rand() * 0.19 * VIEW);
  const order = raw.map((_, i) => i).sort((a, b) => dist(raw[a]) + jitter[a] - (dist(raw[b]) + jitter[b]));
  const sorted = order.map((i) => raw[i]);

  const last = Math.max(1, sorted.length - 1);
  const nodes: TwinklePoint[] = sorted.map((n, i) => ({
    position: [n.x, n.y, STAR_Z],
    size: n.size,
    phase: rand() * Math.PI * 2,
    speed: 0.25 + rand() * 0.45,
    appear: (i / last) * 0.9,
  }));

  const edges: StarEdge[] = [];
  const has = new Set<string>();
  const add = (a: number, b: number) => {
    const [from, to] = a < b ? [a, b] : [b, a];
    const k = `${from}-${to}`;
    if (from === to || has.has(k)) return;
    has.add(k);
    edges.push({ from, to, start: nodes[to].appear ?? 0 });
  };
  const nearest = (i: number, among: number[]) => {
    let best = -1;
    let d = Infinity;
    for (const j of among) {
      const dd = Math.hypot(sorted[i].x - sorted[j].x, sorted[i].y - sorted[j].y);
      if (dd < d) {
        d = dd;
        best = j;
      }
    }
    return { best, d };
  };
  for (let i = 1; i < sorted.length; i++) {
    const earlier = Array.from({ length: i }, (_, j) => j);
    const { best, d } = nearest(i, earlier);
    // Most newcomers join the graph; many stay loose and only twinkle.
    if (best >= 0 && d < 0.26 * VIEW && rand() < 0.55) add(best, i);
  }
  return { nodes, edges };
}

let cached: Constellation | null = null;
/** The seeded constellation (the same on every render). */
export function constellation(): Constellation {
  return (cached ??= build());
}

/** How much of the graph has grown, 0 to 1 (scrubbed over `STARS.grow`). */
export function growth(p: number): number {
  return remap(p, STARS.grow[0], STARS.grow[1]);
}

/** The `reveal` the twinkle field takes: points with `appear` below it are shown. */
export function starReveal(p: number): number {
  return clamp01(growth(p) * 1.0);
}

/** How drawn an edge is at progress p, 0 to 1 (it draws out from its older node). */
export function edgeDraw(edge: StarEdge, p: number): number {
  const g = growth(p);
  return ease(remap(g, edge.start * 0.9 + 0.02, edge.start * 0.9 + 0.02 + STARS.draw));
}

/** How far the constellation recedes while the application is up, at most (its opacity drops by this much). */
export const STARS_RECEDE = 0.75;

/** The beats the constellation recedes behind: the application's text and its form. */
const OVER_STARS = ["apply-intro", "apply-form"] as const;

/**
 * Opacity of the constellation behind the application, 0 to 1: it recedes while the application
 * text and the form are up (stars and lines run behind both), and comes back as they leave in the
 * finale, where it drifts away.
 */
export function starsDim(p: number): number {
  return 1 - STARS_RECEDE * hazeAmount(OVER_STARS, p);
}
