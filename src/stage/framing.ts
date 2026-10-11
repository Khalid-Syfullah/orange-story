// cover() / uncover() in TypeScript: the same math as the GLSL library, for DOM layers that need
// to sit on a point of a painting (copy beside an anchor, the stage-test labels). Keep the two in
// step; /stage-test shows a GL mark and a DOM label at the same point so a drift is visible.
//
// All coordinates are 0..1 with y DOWN. `res` is the viewport (or canvas) size, `tex` the
// painting's size: only their aspects matter.
import type { Framing, Point } from "@/content/art";
import { BAND_MIN, stackState } from "./band";

export type Size = readonly [number, number];

/** Fraction of the painting visible on each axis when it cover-fits `res`. */
export function coverScale(res: Size, tex: Size): [number, number] {
  const va = res[0] / res[1];
  const ta = tex[0] / tex[1];
  return ta > va ? [va / ta, 1] : [1, ta / va];
}

/** Screen uv -> painting uv under a cover fit with a pan (painting units) and a zoom about the centre. */
export function cover(uv: Point, res: Size, tex: Size, framing: Framing): Point {
  const s = coverScale(res, tex);
  return {
    x: 0.5 + framing.pan.x + ((uv.x - 0.5) * s[0]) / framing.zoom,
    y: 0.5 + framing.pan.y + ((uv.y - 0.5) * s[1]) / framing.zoom,
  };
}

/** Painting point -> screen uv: the exact inverse of cover(). */
export function uncover(point: Point, res: Size, tex: Size, framing: Framing): Point {
  const s = coverScale(res, tex);
  return {
    x: 0.5 + ((point.x - 0.5 - framing.pan.x) * framing.zoom) / s[0],
    y: 0.5 + ((point.y - 0.5 - framing.pan.y) * framing.zoom) / s[1],
  };
}

/** Push in by `s` about the point `o` (a dolly about a point, not a scale about the centre). */
export function dollyAbout(uv: Point, o: Point, s: number): Point {
  return { x: o.x + (uv.x - o.x) / s, y: o.y + (uv.y - o.y) / s };
}

/** A painting's size from its aspect (only the ratio matters to cover/uncover). */
export function sizeFromAspect(aspect: number, height = 1000): Size {
  return [aspect * height, height];
}

/**
 * How far the phone layout applies, 0..1: 1 on the tallest phones (the band at its minimum), 0 on
 * anything the picture fills. A shot's phone pan (art.ts `phonePan`) is added in this proportion,
 * so a tablet turning upright eases into it and a desktop never sees it.
 */
export function phoneAmount(): number {
  return Math.min(1, Math.max(0, (1 - stackState.band) / (1 - BAND_MIN)));
}

/** A framing with the shot's phone pan added: the pan that keeps the key action in a narrow window. */
export function phoned(framing: Framing, phonePan: Point | undefined): Framing {
  if (!phonePan) return framing;
  const k = phoneAmount();
  if (k === 0) return framing;
  return { pan: { x: framing.pan.x + phonePan.x * k, y: framing.pan.y + phonePan.y * k }, zoom: framing.zoom };
}
