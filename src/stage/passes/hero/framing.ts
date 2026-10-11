// The hero's framing at this viewport. The default framing is a plain cover fit; on a tall phone
// the 16:9 painting overflows sideways by a lot, so the pan moves the view onto the orange (the
// glint, the peel) instead of the empty centre. The weight eases in as the overflow grows, so
// desktops keep the composed frame (the attendants at the edges) and phones keep the orange.
import { art, type Framing } from "@/content/art";
import { coverScale } from "../../framing";

/** Where a narrow viewport centres the view, in painting x. */
const PHONE_CENTRE_X = 0.68;
/** Parallax and drift never move the view more than this, so the pan leaves it room (painting units). */
const EDGE_ROOM = 0.008;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 on wide screens, 1 on tall phones: also drives the copy protection in the shader. */
export function phoneWeight(css: readonly [number, number]): number {
  return 1 - smooth(0.7, 1.2, css[0] / css[1]);
}

export function heroFraming(css: readonly [number, number]): Framing {
  const base = art.hero.framing;
  const s = coverScale(css, [art.hero.aspect * 1000, 1000]);
  const overflow = 1 - s[0];
  const w = smooth(0.1, 0.4, overflow);
  const room = Math.max(0, (1 - s[0] / base.zoom) / 2 - EDGE_ROOM);
  const want = Math.min(room, Math.max(-room, PHONE_CENTRE_X - 0.5));
  return { pan: { x: base.pan.x + want * w, y: base.pan.y }, zoom: base.zoom };
}
