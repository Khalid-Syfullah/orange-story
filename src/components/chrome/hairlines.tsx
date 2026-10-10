"use client";

import * as React from "react";
import type { MotionValue } from "motion/react";

import { cn } from "@/lib/utils";
import { envelope, lerp, seeded, type ProgressEnvelope } from "@/lib/progress";
import { useElementSize } from "@/lib/use-element-size";
import { grid, HAIRLINE_ALPHA } from "@/styles/tokens";

import { STAR_PATH } from "./star-mark";

/**
 * The fixed hairline grid: thin SVG paths with a slight hand-drawn wobble and four-point stars where
 * they cross. Positions come from the layout tokens (`grid` in `src/styles/tokens.ts`).
 *
 * Every part has an exit direction. Moves are given as cues (from the scroll script, never hardcoded
 * here) and are scrubbed by `progress`, so they reverse exactly:
 * - `exit`: lines slide out toward their direction; the corner crosses travel to the screen corners
 *   and lock there.
 * - `viewfinder`: lines slide in from wherever they are (the edges, after an exit) and close into a
 *   square frame around a target rectangle (scenes 5 and 14).
 *
 * The geometry is written straight to the SVG on each progress change; React only re-renders on resize.
 */

export type HairlineDirection = "l" | "r" | "u" | "d" | "lu" | "ru" | "ld" | "rd";

export interface HairlinePart {
  id: "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  kind: "line" | "cross";
  exit: HairlineDirection;
}

export const HAIRLINE_PARTS: readonly HairlinePart[] = [
  { id: "left", kind: "line", exit: "l" },
  { id: "right", kind: "line", exit: "r" },
  { id: "top", kind: "line", exit: "u" },
  /* Waits just below the stage; only the viewfinder brings it in. */
  { id: "bottom", kind: "line", exit: "d" },
  { id: "top-left", kind: "cross", exit: "lu" },
  { id: "top-right", kind: "cross", exit: "ru" },
  { id: "bottom-left", kind: "cross", exit: "ld" },
  { id: "bottom-right", kind: "cross", exit: "rd" },
];

/** A rectangle in fractions of the stage (0 to 1 on both axes). */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HairlineCue =
  | { kind: "exit"; at: ProgressEnvelope }
  | {
      kind: "viewfinder";
      at: ProgressEnvelope;
      /** The frame is the smallest square that contains this rectangle, plus `padding` px. */
      target: FrameRect;
      padding?: number;
    };

export interface HairlinesProps {
  progress: MotionValue<number>;
  cues?: readonly HairlineCue[];
  /** `fixed` on the story stage; `absolute` to fill a positioned container (e.g. on /design). */
  position?: "fixed" | "absolute";
  className?: string;
}

/** How far past an edge a line hides, how far the frame lines overshoot their corners, corner inset. */
const OFF = 14;
const EXTEND = 10;
const CORNER_INSET = 16;
const WOBBLE_POINTS = 12;
const WOBBLE_PX = 0.7;

type Pt = readonly [number, number];

/** Seeded wobble per line: the same hand-drawn shape on every frame and every visit. */
const WOBBLE: Record<string, number[]> = Object.fromEntries(
  HAIRLINE_PARTS.filter((p) => p.kind === "line").map((p) => {
    const rand = seeded(`hairline-${p.id}`);
    return [p.id, Array.from({ length: WOBBLE_POINTS - 1 }, () => (rand() * 2 - 1) * WOBBLE_PX)];
  }),
);

function wobblyPath(id: string, [x1, y1]: Pt, [x2, y2]: Pt): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offsets = WOBBLE[id];
  const pts: Pt[] = [[x1, y1]];
  for (let k = 1; k < WOBBLE_POINTS; k++) {
    const t = k / WOBBLE_POINTS;
    const o = offsets[k - 1];
    pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o]);
  }
  pts.push([x2, y2]);
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2;
    const my = (pts[k][1] + pts[k + 1][1]) / 2;
    d += ` Q${f(pts[k][0])} ${f(pts[k][1])} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}

const mix = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

interface Square {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Positions of every part at progress p, for a stage of w by h px. */
export function hairlineGeometry(p: number, w: number, h: number, cues: readonly HairlineCue[]) {
  let e = 0;
  let v = 0;
  let square: Square | null = null;
  for (const cue of cues) {
    const amount = envelope(p, cue.at);
    if (cue.kind === "exit") e = Math.max(e, amount);
    else if (amount > v) {
      v = amount;
      const { x, y, width, height } = cue.target;
      const side = Math.max(width * w, height * h) + 2 * (cue.padding ?? 0);
      const cx = (x + width / 2) * w;
      const cy = (y + height / 2) * h;
      square = { l: cx - side / 2, r: cx + side / 2, t: cy - side / 2, b: cy + side / 2 };
    }
  }
  const sq = square ?? { l: 0, r: w, t: 0, b: h };

  const gl = grid.left * w;
  const gr = grid.right * w;
  const gt = Math.min(grid.top * w, h / 3);

  const leftX = lerp(lerp(gl, -OFF, e), sq.l, v);
  const rightX = lerp(lerp(gr, w + OFF, e), sq.r, v);
  const topY = lerp(lerp(gt, -OFF, e), sq.t, v);
  const bottomY = lerp(h + OFF, sq.b, v);
  const vy1 = lerp(-OFF, sq.t - EXTEND, v);
  const vy2 = lerp(h + OFF, sq.b + EXTEND, v);
  const hx1 = lerp(-OFF, sq.l - EXTEND, v);
  const hx2 = lerp(w + OFF, sq.r + EXTEND, v);

  const lines: Record<string, [Pt, Pt]> = {
    left: [[leftX, vy1], [leftX, vy2]],
    right: [[rightX, vy1], [rightX, vy2]],
    top: [[hx1, topY], [hx2, topY]],
    bottom: [[hx1, bottomY], [hx2, bottomY]],
  };

  const m = CORNER_INSET;
  const cross = (rest: Pt, corner: Pt, frame: Pt) => mix(mix(rest, corner, e), frame, v);
  const crosses: Record<string, Pt> = {
    "top-left": cross([gl, gt], [m, m], [sq.l, sq.t]),
    "top-right": cross([gr, gt], [w - m, m], [sq.r, sq.t]),
    "bottom-left": cross([gl, h + OFF], [m, h - m], [sq.l, sq.b]),
    "bottom-right": cross([gr, h + OFF], [w - m, h - m], [sq.r, sq.b]),
  };

  return { lines, crosses, exit: e, viewfinder: v };
}

export function Hairlines({ progress, cues = [], position = "fixed", className }: HairlinesProps) {
  const [measureRef, size] = useElementSize<HTMLDivElement>();
  const nodes = React.useRef<Record<string, SVGElement | null>>({});
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const { width: w, height: h } = size;
    if (!w || !h) return;
    const draw = (p: number) => {
      const g = hairlineGeometry(p, w, h, cues);
      for (const [id, [a, b]] of Object.entries(g.lines)) nodes.current[id]?.setAttribute("d", wobblyPath(id, a, b));
      for (const [id, [x, y]] of Object.entries(g.crosses))
        nodes.current[id]?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      const root = rootRef.current;
      if (root) {
        root.dataset.exit = g.exit.toFixed(3);
        root.dataset.viewfinder = g.viewfinder.toFixed(3);
      }
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [progress, cues, size]);

  const setRoot = React.useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      measureRef(el);
    },
    [measureRef],
  );

  return (
    <div
      ref={setRoot}
      aria-hidden
      data-hairlines
      className={cn(position === "fixed" ? "fixed" : "absolute", "pointer-events-none inset-0 overflow-hidden", className)}
    >
      {size.width > 0 && (
        <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="block">
          {HAIRLINE_PARTS.map((part) =>
            part.kind === "line" ? (
              <path
                key={part.id}
                ref={(el) => {
                  nodes.current[part.id] = el;
                }}
                data-part={part.id}
                data-exit={part.exit}
                fill="none"
                stroke="currentColor"
                strokeOpacity={HAIRLINE_ALPHA}
                strokeWidth={1}
              />
            ) : (
              <g
                key={part.id}
                ref={(el) => {
                  nodes.current[part.id] = el;
                }}
                data-part={part.id}
                data-exit={part.exit}
              >
                <path d={STAR_PATH} transform="scale(0.8)" fill="currentColor" fillOpacity={0.85} />
              </g>
            ),
          )}
        </svg>
      )}
    </div>
  );
}
