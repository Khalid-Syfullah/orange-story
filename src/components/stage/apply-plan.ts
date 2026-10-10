import { plateEntry } from "@/art/manifest";
import { fitFov, panAmount } from "@/scroll/camera-fit";
import { DESKTOP_ASPECT, plateBox } from "@/scroll/framing";
import { APPLY, CAMERA } from "@/scroll/script";
import type { CameraKey } from "@/scroll/types";

import { glide, type SceneMotion } from "./motion-kit";

/**
 * Scene 13, the application, as pure functions of progress (no React, no three). The constellation
 * stays as it grew; the astronomer and his marble platform step down the sky so the application
 * text at the top left (and the form at the right) have clear air. Timings live in `APPLY`
 * (`src/scroll/script.ts`). The finale takes over from the lowered position and sinks them away.
 *
 * How far they step down comes from the camera: on a wide screen until his raised hand is level with
 * the middle of the frame, below the title; on a phone right out of the bottom of the frame.
 */

/** The phone shapes the sink is worked out for (CSS width over height): small and large phones, and a narrow tablet. */
export const PHONE_SHAPES: readonly (readonly [number, number])[] = [
  [390, 844],
  [360, 780],
  [430, 932],
  [700, 1000],
];

const astronomer = plateEntry("stars/astronomer");
const platform = plateEntry("stars/platform");
/** The top of the astronomer's painting (his raised hand), in world y, before any sink. */
const HAND = plateBox("stars/astronomer").y1;
/** The highest either of his plates (his and his platform's) reaches, image margins included: what must leave a phone's frame. */
const TOP = Math.max(astronomer.position[1] + astronomer.anchor[1] * astronomer.height, platform.position[1] + platform.anchor[1] * platform.height);

/** World y of the bottom of the frame at the astronomer's depth, filmed from a key on a stage of this shape. */
export function frameBottom(key: CameraKey, aspect: number): number {
  const k = panAmount(aspect);
  const pan = key.pan ?? [0, 0];
  const y = key.position[1] + pan[1] * k;
  const z = key.position[2] + (pan[2] ?? 0) * k;
  const tilt = key.target[1] - key.position[1];
  return y + tilt - (z + astronomer.depth) * Math.tan((fitFov(key.fov, aspect) * Math.PI) / 360);
}

const starsKey = (() => {
  const key = CAMERA.find((k) => k.scene === "stars");
  if (!key) throw new Error("The stars need a camera key");
  return key;
})();

/** How far (world units) the astronomer and his platform stand lower in the application scene: his hand down to the middle of a wide frame. */
export const SINK_DEPTH = HAND - starsKey.target[1];

/**
 * The same on a stacked (phone) screen. The camera shows a much taller picture there (`fitFov`) and
 * the application fills the screen from top to bottom (the text above, the form below), so there is
 * no clear air to step down into: he sinks right out of the bottom of the frame instead, as he does
 * in the finale on a wide screen.
 */
export const SINK_DEPTH_STACKED = Math.max(...PHONE_SHAPES.map(([w, h]) => TOP - frameBottom(starsKey, w / h))) + 0.05 * astronomer.height;

/** Vertical offset of the astronomer and his platform at progress p: 0 before the sink, `-depth` after. */
export function figureOffset(p: number, depth: number = SINK_DEPTH): number {
  return -depth * glide(p, APPLY.sink);
}

/** How far the astronomer sinks in the application scene on a layout. */
export const sinkDepth = (stacked: boolean): number => (stacked ? SINK_DEPTH_STACKED : SINK_DEPTH);

/**
 * How much further the finale sinks him: until his hand is below the bottom of every frame the finale
 * films (it comes down to the keepers), on a wide screen and on a phone.
 */
export const FINALE_SINK = (() => {
  const finale = CAMERA.filter((k) => k.scene === "finale");
  const below = (sink: number, aspect: number) => Math.max(...finale.map((key) => TOP - sink - frameBottom(key, aspect)));
  const margin = 0.05 * astronomer.height;
  return Math.max(below(SINK_DEPTH, DESKTOP_ASPECT), ...PHONE_SHAPES.map(([w, h]) => below(SINK_DEPTH_STACKED, w / h))) + margin;
})();

/** What the application scene drives: the astronomer and his platform stepping down. */
export const APPLY_MOTION: SceneMotion = { channels: [{ name: "astronomer · sink", at: (p) => figureOffset(p) }] };
