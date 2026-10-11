import { remap } from "@/lib/progress";
import type { TransitionDef, TransitionKind } from "@/scroll/types";

import { glide } from "../motion-kit";
import { ringReveal, type RingCircle } from "./ring-plan";

/**
 * The transitions' shared choreography, as pure functions of story progress: where a transition is in
 * its covering ramp, its full cover and its clearing ramp (`transitionPhase`), which one runs at a
 * moment, and the circle the ring reveals the next picture in (from its own plan, `ring-plan.ts`).
 * Each medium's own motion lives in its plan (`sand-plan.ts`, `unfold-plan.ts`, ...); every one of
 * them is a function of progress alone, so scrolling back plays it backwards exactly.
 */

/** Transitions drawn on the stage canvas (the viewfinders belong to the hairlines, the smoke to the text). */
export type StageKind = Extract<TransitionKind, "leaves" | "sand" | "cloud" | "unfold" | "dust" | "ring" | "fabric">;

export const STAGE_KINDS = ["leaves", "sand", "cloud", "unfold", "dust", "ring", "fabric"] as const satisfies readonly StageKind[];

export function isStageKind(kind: TransitionKind): kind is StageKind {
  return (STAGE_KINDS as readonly TransitionKind[]).includes(kind);
}

/** Where a transition is at progress p. */
export interface TransitionPhase {
  /** 0 to 1 across the whole transition. */
  t: number;
  /** 0 to 1 through the covering ramp (start to the peak); the whole range for a sweep or a pass. */
  enter: number;
  /** 0 to 1 through the clearing ramp (the peak to the end); 0 for a sweep or a pass. */
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

/** The stage transition running at p, or null. The script never overlaps two (`validateScript`). */
export function stageTransitionAt(p: number, defs: readonly TransitionDef[]): TransitionDef | null {
  for (const def of defs) if (isStageKind(def.kind) && transitionRunning(def, p)) return def;
  return null;
}

/**
 * How much of the calm version's still veil shows at p (`calm-veil.tsx`): up over the covering ramp,
 * whole through the cover, down over the clearing ramp; none for a transition that does not cover.
 */
export function veilAmount(def: TransitionDef, p: number): number {
  if (!def.peak || p < def.start || p >= def.end) return 0;
  return glide(p, [def.start, def.peak[0]]) * (1 - glide(p, [def.peak[1], def.end]));
}

/** A circle in CSS px, from the top left of the stage. */
export type RevealCircle = RingCircle;

/**
 * The circle a transition reveals the next picture in at p: plates of the new picture pass `reveal` to
 * show only inside it (`Plate`), the old one's to show only outside it. Only the ring reveals this way.
 */
export function revealCircle(def: TransitionDef, p: number, width: number, height: number): RevealCircle {
  if (def.kind === "ring") return ringReveal(p, width, height);
  return { x: width / 2, y: height / 2, radius: p >= def.end ? 1e6 : -2, softness: 1 };
}

/** How much of a point is inside a reveal circle, 0 to 1: the shader's soft edge. */
export function insideCircle(circle: RevealCircle, x: number, y: number): number {
  const d = Math.hypot(x - circle.x, y - circle.y);
  return 1 - smoothstep(circle.radius - circle.softness, circle.radius + circle.softness, d);
}

/** GLSL's smoothstep. Edges must increase. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
