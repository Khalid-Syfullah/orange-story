import { platePoint } from "@/art/manifest";
import { createCameraPath, projectPoint, type CameraPath, type ScreenPoint } from "@/components/stage/camera-path";
import { clamp01, ease, lerp, remap } from "@/lib/progress";
import { beatOf } from "@/scroll/helpers";
import { CAMERA, FAQ, SCREEN } from "@/scroll/script";
import type { BeatDef, CardCorner, QuestionCardDef, Vec3 } from "@/scroll/types";

/**
 * Scene 11, the questions, as pure functions of progress and the stage size (no React, no DOM).
 * Timings and choices live in `FAQ` (`src/scroll/script.ts`); `question-deck.tsx` draws them.
 *
 * - The five cards ride one arc: a wide curve with its top in the center, like the rim of a wheel
 *   turning from right to left. The first card zooms up from small in the center; the others arrive
 *   from the right end of the arc; each swings off to the left end as it leaves, shrinking, blurring
 *   and fading (the last one rises and dissolves as smoke instead).
 * - One connector: the line's end is fixed on the card's anchor orange (a named point on an orchard
 *   plate, projected through the stage camera at every progress), and its square sits on the card's
 *   corner, wherever the card's pose puts that corner.
 */

export interface Size {
  width: number;
  height: number;
}

/** Where a card rests: its center, as fractions of the stage (a little below the middle, under the section title). */
export const CARD_REST = { x: 0.5, y: 0.53 } as const;

/**
 * The cards are laid out at one size and scaled with the stage height, as the painted orchard is
 * (the camera's field of view is vertical), so the lines keep their angle on every screen. The scale
 * is 1 on a stage `height` px tall and stays inside `min` to `max`, so the text stays legible.
 */
export const FIT = { height: 900, min: 0.85, max: 1.2 } as const;

/** The cards' scale on a stage. */
export function cardFit(stage: Size): number {
  return Math.min(FIT.max, Math.max(FIT.min, stage.height / FIT.height));
}

/**
 * The arc. At either end a card is `reach` of the stage width out from the center and has sunk
 * `dip` of its height, tilted `turn` degrees along the curve, at `scale` of its size, blurred
 * `blur` px and fully faded. `bend` (radians) is how much of the wheel's rim the arc covers. It
 * fades as `1 - k^fade` of the way `k` out, so it stays readable for most of the swing.
 */
export const ARC = { reach: 0.34, dip: 0.08, bend: 0.7, turn: 7, scale: 0.6, blur: 10, fade: 1.6 } as const;

/** The first card's zoom: the size it starts at, how far below its place (fraction of the stage height), its blur. */
export const ZOOM = { scale: 0.55, drop: 0.04, blur: 8 } as const;

/** The last card's smoke: how far it rises (fraction of the stage height), how much it grows, its blur. */
export const SMOKE = { rise: 0.03, grow: 0.04, blur: 12 } as const;

/** The connector fades out as its orange leaves the stage (px beyond the edge until it is gone). */
export const ANCHOR_MARGIN = 48;

/** The deck mounts this far (screens) before the first card arrives and stays this long after the last leaves. */
export const DECK_MARGIN_SCREENS = 0.75;

export const OPPOSITE: Readonly<Record<CardCorner, CardCorner>> = {
  "top-left": "bottom-right",
  "top-right": "bottom-left",
  "bottom-left": "top-right",
  "bottom-right": "top-left",
};

export interface DeckCard extends QuestionCardDef {
  index: number;
  def: BeatDef;
  /**
   * The beat the card's rows follow. They arrive with the card's own stagger (title first, then
   * the answer). A card that swings away leaves as one piece (its pose fades and blurs it), so its
   * rows hold still instead of fading out on their own; the last card's rows rise as smoke.
   */
  rows: BeatDef;
  /** The anchor orange in the world (on its orchard plate). */
  world: Vec3;
  /** The corner holding the card's pair of sparkles: across from the line's corner. */
  sparkles: CardCorner;
}

export const DECK: readonly DeckCard[] = FAQ.cards.map((card, index) => {
  const def = beatOf(card.beat);
  return {
    ...card,
    index,
    def,
    rows: def.leave === "swing-left" ? { ...def, leave: "hold" } : def,
    world: platePoint(card.anchor.plate, card.anchor.point),
    sparkles: OPPOSITE[card.corner],
  };
});

const FIRST = DECK[0].def;
const LAST = DECK[DECK.length - 1].def;

/** True while the deck is on stage or about to be (its cards mount just in time, and stay mounted together). */
export function deckNear(p: number): boolean {
  const margin = DECK_MARGIN_SCREENS * SCREEN;
  return p >= FIRST.in - margin && p < LAST.out + margin;
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export interface CardPose {
  /** Offset of the card's center from its rest place, px. */
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotate: number;
  opacity: number;
  /** px */
  blur: number;
  /** Inside the card's beat range. */
  shown: boolean;
}

const HIDDEN: CardPose = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0, blur: 0, shown: false };

/** The pose at point `a` of the arc: -1 its right end, 0 the center, 1 its left end. */
export function arcPose(a: number, stage: Size): CardPose {
  const t = Math.max(-1, Math.min(1, a));
  const angle = t * ARC.bend;
  const k = Math.abs(t);
  // (`+ 0` turns -0 into 0 in the center.)
  return {
    x: (-ARC.reach * stage.width * Math.sin(angle)) / Math.sin(ARC.bend) + 0,
    y: (ARC.dip * stage.height * (1 - Math.cos(angle))) / (1 - Math.cos(ARC.bend)),
    scale: 1 - (1 - ARC.scale) * k,
    rotate: -ARC.turn * t + 0,
    opacity: 1 - k ** ARC.fade,
    blur: ARC.blur * k,
    shown: true,
  };
}

/** Card `index` at progress p: arriving (zoom or along the arc), held in the center, then leaving (along the arc or as smoke). */
export function cardPose(index: number, p: number, stage: Size): CardPose {
  const card = DECK[index];
  const beat = card.def;
  if (p < beat.in || p >= beat.out) return HIDDEN;
  const pose = movePose(card, p, stage);
  return { ...pose, scale: pose.scale * cardFit(stage) };
}

/** The move itself, at the cards' layout size. */
function movePose(card: DeckCard, p: number, stage: Size): CardPose {
  const beat = card.def;
  if (p < beat.hold[1]) {
    const e = ease(remap(p, beat.in, beat.hold[0]));
    if (card.arrive === "zoom") {
      return { x: 0, y: (1 - e) * ZOOM.drop * stage.height, scale: lerp(ZOOM.scale, 1, e), rotate: 0, opacity: e, blur: (1 - e) * ZOOM.blur, shown: true };
    }
    return arcPose(-(1 - e), stage);
  }

  const l = ease(remap(p, beat.hold[1], beat.out));
  if (beat.leave === "smoke") {
    return { x: 0, y: -l * SMOKE.rise * stage.height, scale: 1 + SMOKE.grow * l, rotate: 0, opacity: 1 - l, blur: SMOKE.blur * l, shown: true };
  }
  return arcPose(l, stage);
}

/** The CSS transform for a pose (the card is placed by its center at `CARD_REST`). */
export function cardTransform(pose: CardPose): string {
  return `translate(-50%, -50%) translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
}

/** Where a corner of a card (`size`, as laid out before any transform) is on the stage in `pose`. */
export function cardCorner(pose: CardPose, size: Size, corner: CardCorner, stage: Size): [number, number] {
  const cx = CARD_REST.x * stage.width + pose.x;
  const cy = CARD_REST.y * stage.height + pose.y;
  const lx = (corner.endsWith("left") ? -0.5 : 0.5) * size.width * pose.scale;
  const ly = (corner.startsWith("top") ? -0.5 : 0.5) * size.height * pose.scale;
  const r = (pose.rotate * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
}

/** The card on stage at p (its beat range holds p), or -1. The cards' ranges never overlap. */
export function activeCard(p: number): number {
  return DECK.findIndex(({ def }) => p >= def.in && p < def.out);
}

/* ------------------------------------------------------------------ */
/* The connector                                                       */
/* ------------------------------------------------------------------ */

let path: CameraPath | null = null;

/** Card `index`'s anchor orange on the stage at p, seen through the stage camera. */
export function anchorOnScreen(index: number, p: number, stage: Size): ScreenPoint {
  path ??= createCameraPath(CAMERA);
  return projectPoint(path.seek(p), DECK[index].world, stage.width, stage.height);
}

/** 1 while the point is on the stage, fading to 0 as it goes `ANCHOR_MARGIN` px past an edge or behind the camera. */
export function onStage(point: ScreenPoint, stage: Size): number {
  if (point.depth <= 0.1) return 0;
  const outside = Math.max(0, -point.x, point.x - stage.width, -point.y, point.y - stage.height);
  return clamp01(1 - outside / ANCHOR_MARGIN);
}

export interface ConnectorFrame {
  /** The card the connector points at. */
  card: number;
  /** The line's fixed end, on the orange. */
  anchor: [number, number];
  /** The card's corner, where the square sits. */
  corner: [number, number];
  /** Where the drawn line ends right now: from the anchor toward the corner. */
  end: [number, number];
  /** 0 to 1: how far the line has drawn out from the orange. */
  draw: number;
  /** 0 to 1: the square's size as it locks onto the corner. */
  lock: number;
  /** The card's tilt in degrees (the square turns with it). */
  rotate: number;
  opacity: number;
}

/**
 * The shared connector at p, re-pointed at the card on stage: null between cards (never, as they
 * abut, except at the deck's ends) and before the stage has been measured. `sizes` are the cards'
 * laid-out sizes, in deck order.
 */
export function connectorFrame(p: number, stage: Size, sizes: readonly Size[]): ConnectorFrame | null {
  const index = activeCard(p);
  const size = sizes[index];
  if (index < 0 || !size || size.width <= 0 || stage.width <= 0 || stage.height <= 0) return null;
  const card = DECK[index];
  const beat = card.def;
  const pose = cardPose(index, p, stage);
  const corner = cardCorner(pose, size, card.corner, stage);
  const anchor = anchorOnScreen(index, p, stage);
  const draw = ease(remap(p, card.draw[0], card.draw[1]));
  // It draws in as the card arrives, then fades with the card as it leaves.
  const present = p > beat.hold[1] ? pose.opacity : 1;
  return {
    card: index,
    anchor: [anchor.x, anchor.y],
    corner,
    end: draw >= 1 ? corner : [lerp(anchor.x, corner[0], draw), lerp(anchor.y, corner[1], draw)],
    draw,
    lock: ease(remap(draw, 0.72, 1)),
    rotate: pose.rotate,
    opacity: present * onStage(anchor, stage),
  };
}

/** Angle of the connector's full line (anchor to corner) from the horizontal, in degrees, 0 to 90. */
export function lineAngle(frame: Pick<ConnectorFrame, "anchor" | "corner">): number {
  const dx = Math.abs(frame.corner[0] - frame.anchor[0]);
  const dy = Math.abs(frame.corner[1] - frame.anchor[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}
