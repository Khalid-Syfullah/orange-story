import { clamp01, ease, remap, seeded } from "@/lib/progress";
import { STARS } from "@/scroll/script";

import { hazeAmount } from "./text-haze";

import type { TwinklePoint } from "./twinkle";

/**
 * Scene 12, the constellation, as pure functions of progress (no React, no three). Timings live in
 * `STARS` (`src/scroll/script.ts`). A seeded graph of white nodes grows outward from the astronomer's
 * fingertip: nodes nearer the finger appear first, edges join some of them and draw out from the
 * older end as the newer node appears, and many stars just twinkle. The bottom right stays clear
 * (only clouds there). Everything is a function of progress, so it plays backwards exactly.
 */

/** World position of the astronomer's fingertip (the graph grows from here). */
export const FINGERTIP = [-1.55, 8.15] as const;

/** World z of the stars (behind the platform, in front of the sky). */
export const STAR_Z = -2;

/** The part of the sky that stays empty: the bottom right, where only clouds drift. */
export function inClearCorner(x: number, y: number): boolean {
  return x > 0.2 && y < 6.4;
}

/** Keep stars off the astronomer himself. */
function onFigure(x: number, y: number): boolean {
  return x < -1.1 && y < 7.3;
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

const COUNT = 90;
const BOUNDS = { x: [-5.2, 5.2], y: [3.9, 9.3] } as const;

function build(): Constellation {
  const rand = seeded("constellation");
  const raw: { x: number; y: number; size: number }[] = [];
  for (let tries = 0; raw.length < COUNT && tries < COUNT * 40; tries++) {
    const x = BOUNDS.x[0] + (BOUNDS.x[1] - BOUNDS.x[0]) * rand();
    const y = BOUNDS.y[0] + (BOUNDS.y[1] - BOUNDS.y[0]) * rand();
    if (inClearCorner(x, y) || onFigure(x, y)) continue;
    raw.push({ x, y, size: 0.09 + rand() * 0.14 });
  }
  // Order by distance from the fingertip (with a little jitter), so the graph grows outward.
  const dist = (n: { x: number; y: number }) => Math.hypot(n.x - FINGERTIP[0], n.y - FINGERTIP[1]);
  const jitter = raw.map(() => rand() * 1.2);
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
    if (best >= 0 && d < 1.6 && rand() < 0.55) add(best, i);
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
