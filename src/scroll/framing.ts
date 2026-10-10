import { plateEntry, platePoint, plateWorldSize, WORLD_SCALE, type Pair, type PlateEntry } from "@/art/manifest";

import { fitFov } from "./camera-fit";
import { round6 } from "./define";
import type { SceneId, Vec3 } from "./types";

/**
 * Framing: where the camera stands so a subject fills the share of the screen the framing table
 * asks for (pure: no React, no three, no GSAP).
 *
 * Size on screen comes from two numbers, the plate's world size and the camera's distance; the
 * world scale (`docs/ART-PLATES.md`) fixes the first, so the second is worked out here from a
 * target instead of being typed in: given the subject's box in the world, the share of the stage
 * height (or width) it should cover, where on the stage it should sit and the field of view,
 * `shot()` returns the camera position and target. `phonePan()` does the same for a phone and
 * returns the difference as the key's `pan` (the offset the camera path fades in on tall screens).
 */

/** The two stages the framing table is written for: a laptop and a phone (CSS pixels). */
export const DESKTOP = { width: 1440, height: 900 } as const;
export const PHONE = { width: 390, height: 844 } as const;

export const DESKTOP_ASPECT = DESKTOP.width / DESKTOP.height;
export const PHONE_ASPECT = PHONE.width / PHONE.height;

/** A rectangle standing in the world, facing the camera: x and y extents on the plane z. */
export interface WorldBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
}

/** A part of a box, as fractions of it from its left and its top: [left, top, right, bottom]. */
export type BoxPart = readonly [number, number, number, number];

const DEG = Math.PI / 180;
const tanHalf = (fov: number) => Math.tan((fov * DEG) / 2);

/** The visible painting of a plate in its image (its alpha box, [l, t, r, b] fractions); the whole image when the manifest has none. */
export function visibleBox(entry: PlateEntry): readonly [number, number, number, number] {
  return entry.box ?? [0, 0, 1, 1];
}

/**
 * The world box of a plate's visible painting at its manifest place, or of `part` of it (fractions
 * of the visible box: `[0, 0, 1, 0.55]` is a standing figure from the crown to about the waist).
 */
export function plateBox(id: string, part: BoxPart = [0, 0, 1, 1]): WorldBox {
  const entry = plateEntry(id);
  return plateBoxOf(entry, visibleBox(entry), part);
}

/** The world box of part of an image box (`visible`, [l, t, r, b] fractions of the image) of a plate at its manifest place. */
export function plateBoxOf(entry: PlateEntry, visible: readonly [number, number, number, number], part: BoxPart = [0, 0, 1, 1]): WorldBox {
  const [w, h] = plateWorldSize(entry);
  const [l, t, r, b] = visible;
  const u0 = l + (r - l) * part[0];
  const u1 = l + (r - l) * part[2];
  const v0 = t + (b - t) * part[1];
  const v1 = t + (b - t) * part[3];
  const [ax, ay] = entry.anchor;
  const [px, py] = entry.position;
  return { x0: px + (u0 - ax) * w, x1: px + (u1 - ax) * w, y0: py + (ay - v1) * h, y1: py + (ay - v0) * h, z: -entry.depth };
}

/** The world box of a region of a plate's rig (`head`, `chest`, ... ; of its first person on a shared plate). */
export function rigBox(id: string, region: "head" | "chest" | "hem" | "arm"): WorldBox {
  const entry = plateEntry(id);
  const rect = entry.rig?.[region] ?? entry.rig?.figures?.[0]?.[region];
  if (!rect) throw new Error(`Plate "${id}" has no rig region "${region}"`);
  return plateBoxOf(entry, rect);
}

/** The smallest box around several (on the plane of the first). */
export function unionBox(...boxes: WorldBox[]): WorldBox {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    y1: Math.max(...boxes.map((b) => b.y1)),
    z: boxes[0].z,
  };
}

/** A box `r` around a world point (a hand around its grip, say), on that point's plane. */
export function boxAround([x, y, z]: readonly [number, number, number], rx: number, ry = rx): WorldBox {
  return { x0: x - rx, x1: x + rx, y0: y - ry, y1: y + ry, z };
}

/** The top of a box, from its top down to `bottom` (fractions of its height): `[0, 0.45]` of a standing figure is its waist up. */
export function topOf(box: WorldBox, bottom: number): WorldBox {
  return { ...box, y0: box.y1 - (box.y1 - box.y0) * bottom };
}

/** A standing figure from the crown to about the waist (its visible box, a hat or a raised hand included). */
export const WAIST_UP = 0.45;
/** ...and to about the knees. */
export const KNEES_UP = 0.75;

/** What to frame and how. */
export interface ShotSpec {
  /** The subject. */
  box: WorldBox;
  /** Share of the stage height the box's height covers (1: exactly the height; more: cropped). */
  height?: number;
  /** Or: share of the stage width the box's width covers. */
  width?: number;
  /** Where on the stage the box's `pin` lands, as fractions of the stage from its left and its top. */
  at: Pair;
  /** The point of the box placed at `at`, as fractions of the box from its left and its top. Default: its centre. */
  pin?: Pair;
  /** Or a world point (on the box's plane) placed at `at`: the orange in a hand, say. */
  pinWorld?: Pair;
  /** Vertical field of view (degrees) on a wide stage. */
  fov: number;
  /** The stage shape (width over height). Default: the laptop's. */
  aspect?: number;
}

export interface Shot {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/**
 * The camera that frames a subject: looking straight at its plane (along -z), far enough away that
 * the box covers `height` of the stage (or `width`), and moved so that the box's `pin` lands at `at`.
 * `fovUsed` is the field of view the stage actually shows (a phone's is wider, `fitFov`).
 */
export function shotFor(spec: ShotSpec, fovUsed: number = spec.fov): Shot {
  const aspect = spec.aspect ?? DESKTOP_ASPECT;
  const { box } = spec;
  const t = tanHalf(fovUsed);
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  let distance: number;
  if (spec.height !== undefined) distance = bh / (spec.height * 2 * t);
  else if (spec.width !== undefined) distance = bw / (spec.width * 2 * t * aspect);
  else throw new Error("A shot needs a height or a width share");
  const halfH = distance * t;
  const halfW = halfH * aspect;
  const [pu, pv] = spec.pin ?? [0.5, 0.5];
  const px = spec.pinWorld ? spec.pinWorld[0] : box.x0 + pu * bw;
  const py = spec.pinWorld ? spec.pinWorld[1] : box.y1 - pv * bh;
  const cx = px - (2 * spec.at[0] - 1) * halfW;
  const cy = py - (1 - 2 * spec.at[1]) * halfH;
  return { position: [round6(cx), round6(cy), round6(box.z + distance)], target: [round6(cx), round6(cy), round6(box.z)], fov: spec.fov };
}

/** The camera for a subject on a wide stage. */
export function shot(spec: ShotSpec): Shot {
  return shotFor(spec);
}

/**
 * The tall-screen `pan` of a key filmed from `desktop`: the offset that takes the camera (fading in
 * on tall screens, `panAmount`) to where it frames `phone` on the phone stage, whose field of view
 * is wider (`fitFov`). The target moves sideways and up with it; the third value brings the camera
 * nearer the picture so the subject keeps a phone-sized share of the much taller picture.
 */
export function phonePan(desktop: Shot, phone: Omit<ShotSpec, "fov" | "aspect">): readonly [number, number, number] {
  const spec: ShotSpec = { ...phone, fov: desktop.fov, aspect: PHONE_ASPECT };
  const onPhone = shotFor(spec, fitFov(desktop.fov, PHONE_ASPECT));
  // The pan moves the target sideways and up as well; its plane stays the desktop's.
  return [round6(onPhone.position[0] - desktop.position[0]), round6(onPhone.position[1] - desktop.position[1]), round6(onPhone.position[2] - desktop.position[2])];
}

/** Half the view's height at `distance` in front of a camera with this field of view. */
export function viewHalfHeight(distance: number, fov: number): number {
  return distance * tanHalf(fov);
}

/* ------------------------------------------------------------------ */
/* The framing table                                                   */
/* ------------------------------------------------------------------ */

/** How a subject sits on one stage: the share the shot gives it, the range the check accepts, and where it goes. */
export interface Placement {
  /** The share the camera is placed for (of the stage height, or width for `measure: "width"`). */
  share: number;
  /** The range the framing check accepts (`npm run framing`). */
  range: Pair;
  at: Pair;
  pin?: Pair;
  pinWorld?: Pair;
}

/** One row of the framing table: a subject, and how large and where it sits on a laptop and on a phone. */
export interface Framing {
  scene: SceneId;
  /** What is framed, in words (the report prints it). */
  subject: string;
  /** Its world box. */
  box: () => WorldBox;
  /** What the share is of: the stage height, its width, or (`top`) where the box's top edge sits. */
  measure: "height" | "width" | "top";
  /** Vertical field of view on a wide stage (degrees). */
  fov: number;
  desktop: Placement;
  /** The phone's placement (its pan); none where the phone keeps the laptop's frame. */
  phone?: Placement;
  /** Checked in another row's shot, not a shot of its own (the onlookers, in the statue's). */
  checkedIn?: string;
  /** Where it should be, in words, or why a target cannot be met. */
  note?: string;
}

const hand = WORLD_SCALE.hand;

/** A figure and its parts on their own plates, as one box (the harvester's body and head). */
const figure = (...ids: string[]) => unionBox(...ids.map((id) => plateBox(id)));

/** Where a held thing is: a named point of a plate, on the plate's plane. */
const pointOf = (id: string, name: string): Pair => {
  const [x, y] = platePoint(id, name);
  return [x, y];
};

/**
 * The framing table: the target for every figure the story frames (phase 24's brief), from which the
 * camera keys in `script.ts` are worked out (`framedKey`). Shares are of the stage height unless the
 * row says width; `at` is where on the stage the subject's `pin` (default its centre) lands, as
 * fractions from the left and the top. A phone shows a much taller picture (`fitFov`), so its row
 * moves the camera nearer (the key's `pan`) and centres the subject below the text.
 */
export const FRAMING = {
  statue: {
    scene: "hero",
    subject: "the statue",
    box: () => plateBox("hero/statue"),
    measure: "height",
    fov: 35,
    desktop: { share: 0.62, range: [0.6, 0.7], pin: [0.5, 0], at: [0.76, 0.075] },
    phone: { share: 0.55, range: [0.5, 0.6], pin: [0.5, 0], at: [0.74, 0.235] },
    note: "on the right third, the orange at the top; on a phone right of the button, her feet above the paragraph",
  },
  onlookers: {
    scene: "hero",
    subject: "the onlookers' heads",
    box: () => figure("hero/crowd-near", "hero/crowd-mid", "hero/crowd-far"),
    measure: "top",
    fov: 35,
    desktop: { share: 0.67, range: [0.64, 0.71], at: [0.82, 0.67] },
    checkedIn: "statue",
    note: "the tops of their heads along the bottom third, cropped by the bottom edge, right of the words: four or five people, not eleven",
  },
  graftHands: {
    scene: "graft",
    subject: "the hands and the work",
    box: () =>
      unionBox(boxAround(platePoint("graft/hand-left", "grip"), hand, 0.8 * hand), boxAround(platePoint("graft/hand-right", "grip"), hand, 0.8 * hand), plateBox("graft/cutting")),
    measure: "width",
    fov: 30,
    desktop: { share: 0.5, range: [0.4, 0.6], at: [0.5, 0.55] },
    phone: { share: 0.55, range: [0.4, 0.6], at: [0.5, 0.5] },
  },
  harvester: {
    scene: "pluck",
    subject: "the harvester, waist up",
    box: () => topOf(figure("pluck/harvester-body", "pluck/harvester-head"), WAIST_UP),
    measure: "height",
    fov: 34,
    desktop: { share: 0.88, range: [0.85, 1.1], pin: [0.5, 0], at: [0.84, 0.07] },
    phone: { share: 0.48, range: [0.45, 0.6], pin: [0.5, 0], at: [0.78, 0.06] },
    note: "cropped by the bottom and right edges, the orange in his hand above the bottom-left words; on a phone his outstretched arm and the orange fit its width only at about half its height",
  },
  shareHands: {
    scene: "share",
    subject: "both hands and the halves",
    box: () => unionBox(plateBox("share/second-hand"), boxAround(platePoint("share/arm-open", "orange"), 0.8 * hand, 0.6 * hand)),
    measure: "width",
    fov: 30,
    desktop: { share: 0.5, range: [0.4, 0.6], pinWorld: pointOf("share/arm-open", "orange"), at: [0.5, 0.47] },
    phone: { share: 0.5, range: [0.4, 0.6], pinWorld: pointOf("share/arm-open", "orange"), at: [0.5, 0.47] },
    note: "the halves in the middle of the viewfinder",
  },
  workBuilder: {
    scene: "work",
    subject: "the builder, knees up",
    box: () => topOf(plateBox("work/builder"), KNEES_UP),
    measure: "height",
    fov: 39,
    desktop: { share: 0.8, range: [0.7, 0.9], at: [0.3, 0.5] },
    phone: { share: 0.45, range: [0.4, 0.55], at: [0.5, 0.27] },
    note: "left of the cards, the giant orange beside him; the blueprint opens on this frame; on a phone above the card",
  },
  blueprintBuilder: {
    scene: "blueprint",
    subject: "the builder, knees up",
    box: () => topOf(plateBox("blueprint/builder"), KNEES_UP),
    measure: "height",
    fov: 38,
    desktop: { share: 0.8, range: [0.7, 0.9], at: [0.3, 0.5] },
    phone: { share: 0.45, range: [0.4, 0.55], at: [0.5, 0.27] },
    note: "on his platform, where the camera pans from the work's last frame",
  },
  architect: {
    scene: "blueprint",
    subject: "the architect, knees up, the plan in front of her",
    box: () => topOf(plateBox("blueprint/architect"), KNEES_UP),
    measure: "height",
    fov: 38,
    desktop: { share: 0.8, range: [0.7, 0.9], at: [0.72, 0.5] },
    phone: { share: 0.55, range: [0.5, 0.65], at: [0.62, 0.5] },
    note: "the plan opens in her hands, to her left, before the camera pushes into it",
  },
  siteBuilder: {
    scene: "site",
    subject: "a builder at ground level, knees up",
    box: () => topOf(plateBox("site/builder-left"), KNEES_UP),
    measure: "height",
    fov: 38,
    desktop: { share: 0.8, range: [0.7, 0.9], at: [0.4, 0.5] },
    phone: { share: 0.55, range: [0.5, 0.65], at: [0.5, 0.45] },
    note: "the orange under construction beside him, before the camera rises",
  },
  gardener: {
    scene: "prune",
    subject: "the gardener, waist up",
    box: () => topOf(plateBox("prune/gardener"), WAIST_UP),
    measure: "height",
    fov: 35,
    desktop: { share: 0.9, range: [0.8, 1.0], at: [0.74, 0.5] },
    phone: { share: 0.5, range: [0.45, 0.6], at: [0.7, 0.47] },
    note: "beside the tree, the shears in it; the tree recedes into the haze behind the words",
  },
  astronomer: {
    scene: "stars",
    subject: "the astronomer",
    box: () => plateBox("stars/astronomer"),
    measure: "height",
    fov: 38,
    desktop: { share: 0.82, range: [0.75, 0.9], pin: [0.5, 0], at: [0.3, 0.07] },
    phone: { share: 0.65, range: [0.6, 0.75], pin: [0.5, 0], at: [0.45, 0.18] },
    note: "top left, the pointing hand clear in the sky",
  },
  keepers: {
    scene: "finale",
    subject: "the orchard keepers",
    box: () => figure("finale/woman-body", "finale/man-body"),
    measure: "height",
    fov: 38,
    desktop: { share: 0.95, range: [0.8, 1.0], pin: [0.5, 0], at: [0.5, 0.09] },
    phone: { share: 0.27, range: [0.24, 0.32], at: [0.5, 0.52] },
    note: "cropped at the bottom, the tree between them; on a phone both keepers and the tree fit its width only at about a quarter of its height",
  },
} as const satisfies Record<string, Framing>;

export type FramingId = keyof typeof FRAMING;

/** A camera key's pose and tall-screen pan, worked out from a row of the framing table. */
export interface FramedKey extends Shot {
  pan: readonly [number, number, number];
}

const NO_PAN = [0, 0, 0] as const;

/** The camera for a row of the framing table: its laptop shot, and the pan that gives the phone its own. */
export function framedKey(id: FramingId): FramedKey {
  const row: Framing = FRAMING[id];
  if (row.measure === "top") throw new Error(`Framing "${id}" is checked in another row's shot`);
  const box = row.box();
  const share = (p: Placement) => (row.measure === "width" ? { width: p.share } : { height: p.share });
  const desktop = shot({ box, ...share(row.desktop), at: row.desktop.at, pin: row.desktop.pin, pinWorld: row.desktop.pinWorld, fov: row.fov });
  const pan = row.phone ? phonePan(desktop, { box, ...share(row.phone), at: row.phone.at, pin: row.phone.pin, pinWorld: row.phone.pinWorld }) : NO_PAN;
  return { ...desktop, pan };
}
