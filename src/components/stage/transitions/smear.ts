"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";

import { springStep, type Spring } from "../motion-kit";
import { IDLE_MAX_STEP } from "../quality";

/**
 * Speed adds life, never changes the result: the faster the story is scrolled, the more the media
 * smear (grains stretch along their flight, passing leaves and clouds blur a little). The smear follows
 * the scroll speed through a critically damped spring on real time, so it settles to nothing once
 * scrolling stops, and it never moves anything: where every grain is stays a function of progress.
 * Off when idle time is held (a capture compares frames), on a phone, on the lowest tier and with
 * reduced motion (the `light` and `calm` modes).
 */
export const SMEAR = {
  /** Scroll speed (screens per second) at which the smear is full. */
  full: 3,
  /** Speeds below this add nothing (a slow, reading scroll stays crisp). */
  floor: 0.35,
  /** The spring's stiffness (radians per second): it settles in about 0.4 s. */
  omega: 10,
} as const;

/** The smear a scroll speed asks for, 0 to 1. */
export function smearTarget(screensPerSecond: number): number {
  const v = Math.abs(screensPerSecond);
  if (!(v > SMEAR.floor)) return 0;
  return Math.min(1, (v - SMEAR.floor) / (SMEAR.full - SMEAR.floor));
}

/**
 * The current smear (0 to 1), read with `smear.current` inside a frame loop. While it is settling it
 * keeps the on-demand canvas drawing, so it reaches zero on screen too.
 */
export function useSmear(velocity: MotionValue<number> | null | undefined, enabled: boolean): React.RefObject<number> {
  const invalidate = useThree((s) => s.invalidate);
  const state = React.useRef<Spring>({ x: 0, v: 0 });
  const value = React.useRef(0);
  useFrame((_, delta) => {
    const target = enabled && velocity ? smearTarget(velocity.get()) : 0;
    const s = state.current;
    if (!enabled) {
      s.x = 0;
      s.v = 0;
    } else springStep(s, target, Math.min(Math.max(delta, 0), IDLE_MAX_STEP), SMEAR.omega);
    value.current = Math.max(0, Math.min(1, s.x));
    if (Math.abs(s.x) > 1e-4 || Math.abs(s.v) > 1e-4) invalidate();
  }, -1.4);
  return value;
}
