// The phone band: on a tall phone the painting hangs from the top of the viewport in a band 0.6 of
// its height (1 on landscape and tablets) and fades its base into the page colour over the lower
// 34% of the band, so the copy stacks under the picture instead of over it (docs/STORY.md,
// phase 14). The canvas is the band: `FrameCtx.css` is the picture's size (every pass and every
// layout that maps a painting reads it), `FrameCtx.view` the whole viewport (where copy stacks).
//
// The fade is drawn by the shader (lib.glsl.ts, uBand and uPage) and the area under the canvas is
// the pin's own background (`--page`), both from `pageAt()`, so there is no seam and no pop where
// the ground changes: the page colour is a function of `p` like everything else.
import { active, local } from "./script";
import type { Ground } from "./script";
import type { RGB } from "./tokens";

/** The band on the tallest phones, and the share of the band the fade takes (the lower 34%). */
export const BAND_MIN = 0.6;
export const BAND_FADE = 0.34;
/** Where, in the band, copy may start: the picture is 60% faded there, so text sits on near-page colour. */
export const ZONE_IN_BAND = 0.8;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The band for a viewport: 1 from aspect 0.66 up, 0.6 below 0.62 (every phone held upright). */
export function bandFor(width: number, height: number): number {
  const a = width / Math.max(1, height);
  return 1 - (1 - BAND_MIN) * smooth(0.66, 0.62, a);
}

/**
 * The layout state of the live stage, set by the engine on every resize. The per-section layouts
 * take only the picture's size, so "is this the phone layout" is read from here when the picture
 * (a band of a tall viewport) is no longer tall itself.
 */
export const stackState = { band: 1, stacked: false };

export function setBand(band: number): void {
  stackState.band = band;
  stackState.stacked = band < 0.999;
}

/** The phone's one-column layouts apply: a tall picture frame, or a band hung from a tall viewport. */
export function narrowFrame(css: readonly [number, number]): boolean {
  return stackState.stacked || css[0] / css[1] < 0.8;
}

/** The page colour behind and under the picture at `p`: the ground, crossing over its switch. */
export function pageAt(p: number, tokens: Record<"sky" | "paper" | "milk", RGB>): RGB {
  const seg = active(p);
  const g = seg.ground;
  if (typeof g === "string") return tokens[g as Ground];
  const t = local(seg.id, p);
  const k = smooth(g.at - 0.1, g.at + 0.1, t);
  const a = tokens[g.from];
  const b = tokens[g.to];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
