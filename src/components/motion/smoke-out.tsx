"use client";

import { motion, useTransform, type MotionStyle, type MotionValue } from "motion/react";

import { ease, remap, type ProgressRange } from "@/lib/progress";

import { BlurFade, type BlurFadeProps } from "./blur-fade";

/**
 * Smoke-out: a group of text blurs, rises and dissolves like smoke, scrubbed by `progress` (the
 * questions and the application leave this way). `SmokeOut` is `BlurFade` drifting up, plus a light
 * noise mask: as the group leaves, soft holes of smoke noise open in it and drift upward with it.
 * The mask is a tileable turbulence image (no script per pixel); `useSmokeMask` gives the same mask
 * to anything else that leaves as smoke (the story's beats).
 */

/** Size of one tile of the smoke noise, in px. */
export const SMOKE_TILE = 320;

/** How far the noise drifts up and across as the group dissolves, in px. */
const SMOKE_RISE = 90;
const SMOKE_DRIFT = 24;

const NOISE_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${SMOKE_TILE}' height='${SMOKE_TILE}'>` +
  `<filter id='s' x='0' y='0' width='100%' height='100%'>` +
  `<feTurbulence type='fractalNoise' baseFrequency='0.011 0.017' numOctaves='3' seed='11' stitchTiles='stitch'/>` +
  `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.75'/>` +
  `</filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`;

/** The smoke noise as a CSS image: soft blobs of alpha with holes between them. */
export const SMOKE_NOISE = `url("data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}")`;

const MASK_SIZE = `100% 100%, ${SMOKE_TILE}px ${SMOKE_TILE}px`;
const MASK_REPEAT = "no-repeat, repeat";

/**
 * The mask for a smoke amount (0 untouched, 1 fully dissolved): a solid layer fading out over the
 * noise, so the noise shows through more and more, adding up to `(1 - amount) + noise * amount`.
 */
export function smokeMaskImage(amount: number): string {
  if (amount <= 0) return "none";
  const solid = `rgb(0 0 0 / ${(1 - Math.min(1, amount)).toFixed(3)})`;
  return `linear-gradient(${solid}, ${solid}), ${SMOKE_NOISE}`;
}

export function smokeMaskPosition(amount: number): string {
  return `0 0, ${(amount * SMOKE_DRIFT).toFixed(1)}px ${(-amount * SMOKE_RISE).toFixed(1)}px`;
}

/** Mask styles for an element dissolving like smoke across `range` (null: never). */
export function useSmokeMask(progress: MotionValue<number>, range: ProgressRange | null): MotionStyle {
  const amount = useTransform(progress, (p) => (range ? ease(remap(p, range[0], range[1])) : 0));
  const image = useTransform(amount, smokeMaskImage);
  const position = useTransform(amount, smokeMaskPosition);
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskPosition: position,
    WebkitMaskPosition: position,
    maskSize: MASK_SIZE,
    WebkitMaskSize: MASK_SIZE,
    maskRepeat: MASK_REPEAT,
    WebkitMaskRepeat: MASK_REPEAT,
  };
}

export type SmokeOutProps = Omit<BlurFadeProps, "direction">;

export function SmokeOut({ progress, out, in: enter, distance = 28, blur = 16, scale = 1.04, as, className, style, children }: SmokeOutProps) {
  const mask = useSmokeMask(progress, out);
  // The masked box reaches 2.5rem past the text on every side (without moving it), so the blur and
  // the rise stay inside the mask instead of being clipped at the text's edges.
  return (
    <motion.div data-smoke-out className="-m-10 p-10" style={mask}>
      <BlurFade progress={progress} out={out} in={enter} direction="up" distance={distance} blur={blur} scale={scale} as={as} className={className} style={style}>
        {children}
      </BlurFade>
    </motion.div>
  );
}
