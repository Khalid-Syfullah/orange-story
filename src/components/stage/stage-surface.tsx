"use client";

import * as React from "react";
import { useThree } from "@react-three/fiber";

import { hasPlate, plateEntry } from "@/art/manifest";

import { STAGE_UNIFORMS } from "./materials";
import { lowEndDevice, qualityOverride, qualityTier } from "./quality";
import { useLazyPlateTexture } from "./textures";

/**
 * The painted canvas every plate shares (`STAGE_UNIFORMS`): loads the grain and craquelure
 * textures once for the whole stage (one small tileable texture each, held while the stage is up;
 * every plate reads the same ones, so no plate fetches anything of its own), and keeps the quality
 * tier in step with the adaptive pixel ratio (`quality.ts`).
 */

export const GRAIN_PLATE = "hero/canvas-grain";
export const CRACK_PLATE = "hero/craquelure";

const entryOf = (id: string) => (hasPlate(id) ? plateEntry(id) : null);

export function StageSurface({ dpr, max }: { dpr: number; max: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const grain = useLazyPlateTexture(entryOf(GRAIN_PLATE));
  const crack = useLazyPlateTexture(entryOf(CRACK_PLATE));

  React.useEffect(() => {
    if (!grain) return;
    const before = STAGE_UNIFORMS.grainMap.value;
    STAGE_UNIFORMS.grainMap.value = grain;
    invalidate();
    return () => {
      STAGE_UNIFORMS.grainMap.value = before;
    };
  }, [grain, invalidate]);

  React.useEffect(() => {
    if (!crack) return;
    const before = STAGE_UNIFORMS.crackMap.value;
    STAGE_UNIFORMS.crackMap.value = crack;
    invalidate();
    return () => {
      STAGE_UNIFORMS.crackMap.value = before;
    };
  }, [crack, invalidate]);

  React.useEffect(() => {
    STAGE_UNIFORMS.quality.value = qualityOverride(window.location.search) ?? qualityTier(dpr, max, lowEndDevice());
    invalidate();
  }, [dpr, max, invalidate]);

  return null;
}
