import { ease, lerp, remap } from "@/lib/progress";
import type { TransitionDef, TransitionKind } from "@/scroll/types";

/**
 * The choreography of the scene transitions, as pure functions of story progress: where each front,
 * fold, ring and cloud is at a given progress. The transition canvas turns these numbers into pixels
 * (`shaders.ts`). Nothing here reads a clock, so scrolling back plays every transition backwards
 * exactly; idle time only moves the grains and specks inside a cover and the ripple of the fabric.
 *
 * Every effect promises three things, checked by `choreography.test.ts` with the same bounds the
 * shaders use (`ragged`, `soft`, `lead`, ...):
 * - at its start it draws nothing: the old scene, untouched;
 * - across its peak (covering transitions) it covers the whole screen, so the stage swaps scenes and
 *   reframes the camera unseen;
 * - at its end it draws nothing again: the new scene, untouched.
 *
 * Shader noise is bounded to -1..1, so a front displaced by `ragged * noise` never strays further.
 */

/** Transitions drawn on the transition canvas (the viewfinder belongs to the hairlines, the smoke to the text). */
export type CanvasKind = Extract<TransitionKind, "sand" | "unfold" | "dust" | "ring" | "fabric">;

export const CANVAS_KINDS = ["sand", "unfold", "dust", "ring", "fabric"] as const satisfies readonly CanvasKind[];

export function isCanvasKind(kind: TransitionKind): kind is CanvasKind {
  return (CANVAS_KINDS as readonly TransitionKind[]).includes(kind);
}

/** Where a transition is at progress p. */
export interface TransitionPhase {
  /** 0 to 1 across the whole transition. */
  t: number;
  /** 0 to 1 through the covering ramp (start to the peak); the whole range for a sweep. */
  enter: number;
  /** 0 to 1 through the clearing ramp (the peak to the end); 0 for a sweep. */
  exit: number;
}

export function transitionPhase(def: TransitionDef, p: number): TransitionPhase {
  const t = remap(p, def.start, def.end);
  if (!def.peak) return { t, enter: t, exit: 0 };
  return { t, enter: remap(p, def.start, def.peak[0]), exit: remap(p, def.peak[1], def.end) };
}

/** True while a transition runs at p: `[start, end)`, and to the very end for one that ends at 1. */
export function transitionRunning(def: TransitionDef, p: number): boolean {
  return p >= def.start && (p < def.end || (def.end >= 1 && p <= 1));
}

/** The canvas transition running at p, or null. The script never overlaps two (`validateScript`). */
export function canvasTransitionAt(p: number, defs: readonly TransitionDef[]): TransitionDef | null {
  for (const def of defs) if (isCanvasKind(def.kind) && transitionRunning(def, p)) return def;
  return null;
}

/** A part of a ramp, eased with the story curve: 0 before `range[0]`, 1 after `range[1]`. */
const part = (x: number, [a, b]: readonly [number, number]) => ease(remap(x, a, b));

/*
 * Fronts that sweep across the screen (the sand, the dust, the ring, the hole through the cloud)
 * move in step with the scroll: scrolling is their pacing, so a sweep feels pushed by the hand.
 * Their margins sit off screen, so the start and stop are never seen. Fades and folds use the story
 * curve.
 */

/* ------------------------------------------------------------------ */
/* Sand: blown in across the screen, then blown away the same way      */
/* ------------------------------------------------------------------ */

/**
 * Lengths are in sweeps: 0 is the upwind corner of the screen, 1 the downwind corner. The cover
 * arrives behind a ragged front with loose grains flying ahead of it, holds while its grains keep
 * drifting, then blows on downwind behind a ragged trailing edge, a few grains lingering behind.
 */
export const SAND = {
  /** Direction the wind blows, in degrees from +x (screen y points down, so negative tilts it up). */
  angle: -9,
  /** Largest offset of the ragged fronts. */
  ragged: 0.18,
  /** Half-width of the soft edge of the cover. */
  soft: 0.035,
  /** How far loose grains fly ahead of the cover. */
  lead: 0.26,
  /** How far grains linger behind it as it blows away. */
  trail: 0.26,
} as const;

const SAND_FRONT = [-(SAND.ragged + Math.max(SAND.soft, SAND.lead)) - 0.01, 1 + SAND.ragged + SAND.soft + 0.01] as const;
const SAND_BACK = [-(SAND.ragged + SAND.soft) - 0.01, 1 + SAND.ragged + Math.max(SAND.soft, SAND.trail) + 0.01] as const;

export interface SandFrame {
  /** The arriving front: everything upwind of it is covered. */
  front: number;
  /** The trailing edge: everything upwind of it is clear again. */
  back: number;
}

export function sandFrame({ enter, exit }: TransitionPhase): SandFrame {
  return { front: lerp(SAND_FRONT[0], SAND_FRONT[1], enter), back: lerp(SAND_BACK[0], SAND_BACK[1], exit) };
}

/** The shader's sand cover at sweep position `s1` (front side) and `s2` (trailing side), noise included. */
export function sandCoverage({ front, back }: SandFrame, s1: number, s2: number): { cover: number; grains: number } {
  return {
    cover: (1 - smoothstep(front - SAND.soft, front + SAND.soft, s1)) * smoothstep(back - SAND.soft, back + SAND.soft, s2),
    grains: (1 - smoothstep(front - SAND.soft, front + SAND.lead, s1)) * smoothstep(back - SAND.trail, back + SAND.soft, s2),
  };
}

/* ------------------------------------------------------------------ */
/* Rising dust: blue rises from the bottom and lifts off the top       */
/* ------------------------------------------------------------------ */

/**
 * Lengths are in screen heights, measured down from the top. The cover rises behind a billowing
 * edge with white specks lifting ahead of it, holds, then lifts off the top, uncovering the new
 * scene from the bottom up.
 */
export const DUST = {
  ragged: 0.12,
  soft: 0.04,
  /** Specks lift this far above the rising edge. */
  lead: 0.18,
  /** And trail this far below the cover as it lifts away. */
  trail: 0.2,
} as const;

const DUST_TOP = [1 + DUST.ragged + Math.max(DUST.soft, DUST.lead) + 0.01, -(DUST.ragged + DUST.soft) - 0.01] as const;
const DUST_BOTTOM = [1 + DUST.ragged + DUST.soft + 0.01, -(DUST.ragged + Math.max(DUST.soft, DUST.trail)) - 0.01] as const;

export interface DustFrame {
  /** The rising top edge: everything below it is covered. */
  top: number;
  /** The rising bottom edge: everything below it is clear again. */
  bottom: number;
}

export function dustFrame({ enter, exit }: TransitionPhase): DustFrame {
  return { top: lerp(DUST_TOP[0], DUST_TOP[1], enter), bottom: lerp(DUST_BOTTOM[0], DUST_BOTTOM[1], exit) };
}

/** The shader's dust cover at height `y1` (top edge side) and `y2` (bottom edge side), noise included. */
export function dustCoverage({ top, bottom }: DustFrame, y1: number, y2: number): { cover: number; specks: number } {
  return {
    cover: smoothstep(top - DUST.soft, top + DUST.soft, y1) * (1 - smoothstep(bottom - DUST.soft, bottom + DUST.soft, y2)),
    specks: smoothstep(top - DUST.lead, top + DUST.soft, y1) * (1 - smoothstep(bottom - DUST.soft, bottom + DUST.trail, y2)),
  };
}

/* ------------------------------------------------------------------ */
/* Paper unfold: white, then a folded sheet opens panel by panel       */
/* ------------------------------------------------------------------ */

/**
 * The sheet is the whole frame, folded into a packet: three columns (creases at a third and two
 * thirds of the width) and, in the middle column, two rows (a crease across the middle). Opening,
 * the middle column's top panel lifts off the bottom one and falls open upward, then the left and
 * right columns swing out from behind the middle one. Where a panel has opened, the new scene shows
 * through, shaded while the panel is still tilted; the creases fade as the sheet settles flat.
 *
 * Ranges are parts of the clearing ramp.
 */
export const UNFOLD = {
  /** The white spreads from the middle: how far the middle leads the corners (0 = all at once). */
  lead: 0.7,
  /** The folded packet lifts off the white (its soft shadow fades in). */
  packet: [0, 0.14],
  /** The middle column's top panel opens upward. */
  center: [0.03, 0.42],
  /** The left column swings out from behind the middle. */
  left: [0.36, 0.7],
  /** Then the right column. */
  right: [0.62, 0.96],
  /** The creases fade as the sheet settles flat. */
  crease: [0.8, 1],
  /** Viewing distance for the fold perspective, in screen heights. */
  distance: 2.4,
} as const;

export interface UnfoldFrame {
  /** Covering: how far the white has spread, 0 to 1. */
  milk: number;
  /** 1 once the sheet has started to open (the white is complete). */
  opening: number;
  /** Strength of the packet's shadow on the white. */
  packet: number;
  /** Angle of the middle column's top panel in radians: PI folded down on the bottom panel, 0 open. */
  center: number;
  /** Angles of the side columns: PI/2 edge-on behind the middle, 0 open. */
  left: number;
  right: number;
  /** Strength of the crease lines, fading to 0 as the sheet settles. */
  crease: number;
}

export function unfoldFrame({ enter, exit }: TransitionPhase): UnfoldFrame {
  const opening = exit > 0 ? 1 : 0;
  const settle = part(exit, UNFOLD.crease);
  return {
    milk: enter,
    opening,
    packet: part(exit, UNFOLD.packet) * (1 - settle),
    center: Math.PI * (1 - part(exit, UNFOLD.center)),
    left: (Math.PI / 2) * (1 - part(exit, UNFOLD.left)),
    right: (Math.PI / 2) * (1 - part(exit, UNFOLD.right)),
    crease: opening * (1 - settle),
  };
}

/* ------------------------------------------------------------------ */
/* Rainbow ring: sweeps out from a point and leaves the new scene      */
/* ------------------------------------------------------------------ */

/**
 * The ring is drawn through the ring mask (`fall/ring-mask`): a radial image whose bright band is
 * the spectral ring. Measured as fractions of the mask's radius: the band runs from `inner` to
 * `outer`, brightest around `middle`, where the new scene begins (with a soft `seam`).
 */
export const RING = {
  inner: 0.6,
  middle: 0.8,
  outer: 1,
  seam: 0.07,
  /** Strongest opacity of the band. */
  alpha: 0.62,
  /** The band fades in as it leaves the point and out as it leaves the screen (parts of the sweep). */
  fadeIn: [0, 0.12],
  fadeOut: [0.8, 1],
} as const;

/** A circle in CSS px, from the top left of the stage. */
export interface RevealCircle {
  x: number;
  y: number;
  radius: number;
  /** Half-width of the soft edge. */
  softness: number;
}

export interface RingFrame extends RevealCircle {
  /** Radius of the ring mask (the band's outer edge), CSS px. */
  outer: number;
  /** Strength of the band, 0 to 1. */
  intensity: number;
}

/** The ring at progress p on a stage of `width` by `height` CSS px. */
export function ringFrame(def: TransitionDef, p: number, width: number, height: number): RingFrame {
  const t = remap(p, def.start, def.end);
  const [ox, oy] = def.origin ?? [0.5, 0.5];
  const x = ox * width;
  const y = oy * height;
  // Leaves the screen when its inner edge passes the farthest corner.
  const far = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
  const outer = (t * (far + 2)) / RING.inner;
  const softness = Math.max(1, outer * RING.seam);
  return {
    x,
    y,
    outer,
    radius: outer * RING.middle - softness,
    softness,
    intensity: part(t, RING.fadeIn) * (1 - part(t, RING.fadeOut)),
  };
}

/**
 * The circle a transition reveals at p: nothing inside it before it starts, everything after it
 * ends. Plates of the new scene pass `reveal` to show only inside it (`Plate` in the stage).
 */
export function revealCircle(def: TransitionDef, p: number, width: number, height: number): RevealCircle {
  const ring = ringFrame(def, p, width, height);
  if (p < def.start) return { x: ring.x, y: ring.y, radius: -2, softness: 1 };
  if (p >= def.end) return { x: ring.x, y: ring.y, radius: 1e6, softness: 1 };
  return { x: ring.x, y: ring.y, radius: ring.radius, softness: ring.softness };
}

/** How much of a point is inside a reveal circle, 0 to 1: the shader's soft edge. */
export function insideCircle(circle: RevealCircle, x: number, y: number): number {
  const d = Math.hypot(x - circle.x, y - circle.y);
  return 1 - smoothstep(circle.radius - circle.softness, circle.radius + circle.softness, d);
}

/* ------------------------------------------------------------------ */
/* Fabric sky: the sky turns to cloth, a cloud billows over, then blue */
/* ------------------------------------------------------------------ */

/**
 * Covering: the sky turns to rippling cloth, spreading from the middle toward the trees on both
 * sides, while a cloud billows from the top centre toward the viewer until it fills the screen.
 * Clearing: a hole opens through the cloud from the middle onto the blue cloth, which clears in
 * turn onto the new scene. Ranges are parts of the covering ramp (`in`) or the clearing one (`out`).
 */
export const FABRIC = {
  /** The cloth fades in, and spreads from the centre line (half-widths of the screen). */
  fabricIn: [0, 0.6],
  spreadIn: [0.05, 0.75],
  spreadSoft: 0.18,
  /** The cloud billows from the top centre, fading in at first. */
  cloudIn: [0.12, 1],
  cloudShow: [0.12, 0.34],
  /** Its inside fills the screen. */
  fill: [0.7, 1],
  /** The hole through it opens from the middle (screen heights, with a ragged soft edge). */
  hole: [0, 0.72],
  holeRagged: 0.25,
  holeSoft: 0.12,
  /** The cloth clears. */
  fabricOut: [0.32, 1],
  /** Ripple phase travelled across each ramp, in radians. */
  rippleIn: 5,
  rippleOut: 3,
} as const;

export interface FabricFrame {
  /** Opacity of the cloth. */
  fabric: number;
  /** How far the cloth has spread from the centre line, in half-widths (past 1 + soft: everywhere). */
  spread: number;
  /** Growth of the cloud, 0 at the top centre to 1 filling the view. */
  cloud: number;
  cloudAlpha: number;
  /** The cloud's inside covering everything, 0 to 1. */
  fill: number;
  /** Radius of the hole through the cloud, in screen heights from the centre. */
  hole: number;
  /** Phase of the cloth's ripple. */
  ripple: number;
}

/** The fabric sky at a phase, on a stage `aspect` wide per unit of height. */
export function fabricFrame({ enter, exit }: TransitionPhase, aspect: number): FabricFrame {
  const reach = Math.hypot(aspect / 2, 0.5);
  const holeEdge = FABRIC.holeRagged + FABRIC.holeSoft + 0.01;
  return {
    fabric: part(enter, FABRIC.fabricIn) * (1 - part(exit, FABRIC.fabricOut)),
    spread: lerp(0, 1 + FABRIC.spreadSoft + 0.05, part(enter, FABRIC.spreadIn)),
    cloud: remap(enter, FABRIC.cloudIn[0], FABRIC.cloudIn[1]),
    cloudAlpha: part(enter, FABRIC.cloudShow),
    fill: part(enter, FABRIC.fill),
    hole: lerp(-holeEdge, reach + holeEdge, remap(exit, FABRIC.hole[0], FABRIC.hole[1])),
    ripple: enter * FABRIC.rippleIn + exit * FABRIC.rippleOut,
  };
}

/* ------------------------------------------------------------------ */

/** GLSL's smoothstep (for the shader mirrors above). Edges must increase. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
