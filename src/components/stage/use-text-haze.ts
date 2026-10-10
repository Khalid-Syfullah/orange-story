"use client";

import * as React from "react";
import { useMotionValue, useTransform } from "motion/react";

import { useStacked } from "@/lib/use-stacked";
import type { BeatId } from "@/scroll/types";
import { colors } from "@/styles/tokens";

import type { PlateClearing } from "./plate";
import { useStageProgress } from "./stage-context";
import { beatArea, HAZE_SOFT, hazeAmount, strongestBeat } from "./text-haze";

export interface TextHazeOptions {
  /** `haze`: the art recedes toward the sky's color behind the text. `clear`: it thins out there. */
  mode?: "haze" | "clear";
  /** How far it recedes at most, 0 to 1. */
  strength?: number;
  /** Only on a stacked (phone) screen, where the text runs the full width over art a wide screen keeps beside it. */
  stackedOnly?: boolean;
}

/**
 * A clearing (`PlateClearing`) for plates that run behind the given beats (beats that take turns):
 * while the beat most on stage is up, the plates recede behind its words, over the area of its
 * slot (`text-haze.ts`), on the layout on screen. Pass the same object to every plate that needs it.
 */
export function useTextHaze(ids: readonly BeatId[], { mode = "haze", strength = 1, stackedOnly = false }: TextHazeOptions = {}): PlateClearing {
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  const stacked = useStacked();
  const area = (p: number) => beatArea(ids[strongestBeat(ids, p)], stacked);
  const scale = stackedOnly && !stacked ? 0 : strength;
  const amount = useTransform(progress, (p) => hazeAmount(ids, p) * scale);
  const left = useTransform(progress, (p) => area(p).left);
  const right = useTransform(progress, (p) => area(p).right);
  const top = useTransform(progress, (p) => area(p).top);
  const bottom = useTransform(progress, (p) => area(p).bottom);
  return React.useMemo<PlateClearing>(
    () => ({ left, right, top, bottom, soft: HAZE_SOFT, amount, haze: mode === "haze" ? colors.sky : undefined }),
    [left, right, top, bottom, amount, mode],
  );
}
