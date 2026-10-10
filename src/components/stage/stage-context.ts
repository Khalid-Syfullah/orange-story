"use client";

import * as React from "react";
import type { MotionValue } from "motion/react";

import type { SceneDef } from "@/scroll/types";

/**
 * Contexts inside the stage canvas. The story `progress` (0 to 1) reaches every plate, and each
 * mounted scene tells its plates how present it is (crossfades and covered swaps) and where it
 * stacks: later scenes draw over earlier ones.
 */

export const StageProgressContext = React.createContext<MotionValue<number> | null>(null);

/** The story progress inside the stage canvas, or null outside it (for example on /design). */
export function useStageProgress(): MotionValue<number> | null {
  return React.useContext(StageProgressContext);
}

export interface SceneLayer {
  scene: SceneDef;
  /** Stacking of the whole scene: plates of later scenes draw over earlier ones. */
  order: number;
  /** How much of the scene is on stage at progress p, 0 to 1. */
  presence: (p: number) => number;
}

export const SceneLayerContext = React.createContext<SceneLayer | null>(null);

/** The scene a plate belongs to, or null outside a scene (always fully present, stacked at 0). */
export function useSceneLayer(): SceneLayer | null {
  return React.useContext(SceneLayerContext);
}

/** Render order of a plate: its scene's stack first, then its layer inside the scene. */
export function plateRenderOrder(layer: SceneLayer | null, plateLayer: number): number {
  return (layer?.order ?? 0) * 1000 + plateLayer;
}
