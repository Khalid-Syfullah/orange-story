// The per-frame context the engine hands to passes (as uniforms) and to DOM layers (through the
// hub's subscribe API). Everything scroll-driven derives from `p`; `time` is for breath only.
import type { Segment } from "./script";

export interface FrameCtx {
  /** Smoothed scroll progress 0..1. */
  p: number;
  /** Local progress 0..1 inside the active segment. */
  t: number;
  segment: Segment;
  /** Scroll velocity in px per frame, signed (+ = down). */
  vel: number;
  /** ms since the previous frame (clamped). */
  dt: number;
  /** Seconds on the page's clock (performance.now from the time origin): breath only, read through sines and differences. */
  time: number;
  /** Drawing buffer size in device pixels. */
  res: readonly [number, number];
  /** CSS size of the picture in CSS pixels: the whole stage, or on a tall phone its band (src/stage/band.ts). */
  css: readonly [number, number];
  /** CSS size of the whole viewport (where copy stacks under the band). */
  view: readonly [number, number];
  /** The picture's share of the viewport height: 1, down to 0.6 on tall phones. */
  band: number;
  /** The page colour at p (the fade's target and the pin's background), 0..1 RGB. */
  page: readonly [number, number, number];
  dpr: number;
  /** Smoothed pointer, -1..1 each axis, y down. */
  mouse: readonly [number, number];
  /** 1 under reduced motion (breath, parallax and drift stop). */
  still: 0 | 1;
  /** Exp decay from the last scroll stop (rest-state kick). */
  kick: number;
  /** fbm octaves for texture fields (2 on phones, 4 otherwise). */
  octaves: number;
  reduced: boolean;
  /** Frames drawn since the stage started. */
  frame: number;
  /** CPU time of the previous frame in ms (scroll, textures, draw and subscribers). */
  ms: number;
  /** True when WebGL is off (`?nogl` or no context); DOM layers still run. */
  glOff: boolean;
  /** Dev (`?finish`): the frame waited for the GPU after its draw, so `ms` includes the pass. */
  synced: boolean;
}
