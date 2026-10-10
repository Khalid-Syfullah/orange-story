import type { FrameRect, HairlineCue } from "@/components/chrome/hairlines";
import type { ChapterId } from "@/content/copy";
import type { ProgressRange } from "@/lib/progress";

import type { CopyPath } from "./copy-path";

/**
 * Shapes of the story script (`src/scroll/script.ts`). Every position is story progress: 0 is the
 * top of the pinned stage, 1 is the last frame of the finale. One screen of scrolling is `SCREEN`.
 */

export type SceneId =
  | "hero"
  | "ascent"
  | "graft"
  | "pluck"
  | "share"
  | "work"
  | "blueprint"
  | "site"
  | "prune"
  | "fall"
  | "faq"
  | "stars"
  | "apply"
  | "finale";

/** The part of the story a scene belongs to: one of the four ruler chapters, or the finale ("End"). */
export type StoryPart = ChapterId | "end";

/** Ground under the chrome and the hairlines: sky (white text) or milk (ink text). */
export type Tone = "sky" | "milk";

/** A stretch where the ground under the chrome is not sky. Sky everywhere else. */
export interface ToneCue {
  tone: Tone;
  start: number;
  end: number;
}

export interface ChapterDef {
  id: ChapterId;
  /** Progress where the ruler switches to this chapter. */
  start: number;
}

export interface SceneDef {
  id: SceneId;
  /** Storyboard number, 1 to 14. */
  number: number;
  part: StoryPart;
  /** Share of the whole stage. All shares add up to 1. */
  share: number;
  /** `[start, end)`; the finale also owns progress 1. */
  start: number;
  end: number;
}

/** Where a text block sits on the stage. Only one beat per slot is on screen at a time. */
export type SlotId = "center-left" | "bottom-left" | "right" | "top-left" | "top-center" | "center";

/**
 * How a beat arrives, scrubbed by progress unless noted.
 * - `load`: already on screen when the page opens; plays a short timed intro once per page load.
 * - `reveal`: headline letters rise in one by one, the other lines follow in a short stagger.
 * - `fade`: lines fade and un-blur in a short stagger.
 * - `zoom`: the whole block grows from small to full size (question cards).
 * - `dock`: starts very large at the bottom, rises and shrinks into its slot ("The Terms").
 */
export type BeatEnter = "load" | "reveal" | "fade" | "zoom" | "dock";

/**
 * How a beat leaves, always scrubbed by progress.
 * - `drift-left`: lines blur and drift left, one after another, first line first (hero copy).
 * - `fade`: lines blur and fade in place.
 * - `smoke`: lines blur, rise and dissolve upward.
 * - `sink`: the block blurs and sinks back into the picture.
 * - `swing-left`: the block swings left along a curve, shrinking and blurring (question cards).
 * - `hold`: never leaves (the finale).
 */
export type BeatLeave = "drift-left" | "fade" | "smoke" | "sink" | "swing-left" | "hold";

export type BeatId =
  | "hero"
  | "hero-intro"
  | "found"
  | "harvest"
  | "card-1"
  | "card-2"
  | "card-3"
  | "terms"
  | "terms-title"
  | "fit"
  | "questions-title"
  | "question-1"
  | "question-2"
  | "question-3"
  | "question-4"
  | "question-5"
  | "apply-intro"
  | "apply-form"
  | "finale";

export interface BeatDef {
  id: BeatId;
  /** The scene the beat starts in. */
  scene: SceneId;
  slot: SlotId;
  /** Progress where the beat starts to arrive. */
  in: number;
  /** Progress where the beat has fully left (1 or more: it never leaves). */
  out: number;
  /** Fully on screen between these two points: after the arrival, before the leave. */
  hold: ProgressRange;
  enter: BeatEnter;
  leave: BeatLeave;
  /** Dot path into `src/content/copy.ts`, e.g. `"model.found"` or `"work.cards.0"`. */
  copy: CopyPath;
  /** Fields of the copy node this beat shows, in order. Omitted: all of them. */
  parts?: readonly string[];
}

export type TransitionKind = "sand" | "unfold" | "dust" | "ring" | "fabric" | "viewfinder" | "smoke";

export type TransitionId =
  | "viewfinder-share"
  | "sand"
  | "unfold"
  | "dust"
  | "ring"
  | "smoke"
  | "fabric"
  | "viewfinder-finale";

export interface TransitionDef {
  id: TransitionId;
  kind: TransitionKind;
  /** Scene on screen when the transition starts, and the one it hands over to (the same scene for in-scene effects). */
  from: SceneId;
  to: SceneId;
  start: number;
  end: number;
  /**
   * Full strength: the screen is fully covered (the scene swap happens inside this range), or the
   * viewfinder frame is fully closed. Absent for sweeps (the ring) and text effects (smoke).
   */
  peak?: ProgressRange;
  /** What draws it: the transition canvas, the hairline layer, or the text layer. */
  layer: "canvas" | "hairlines" | "text";
  /** Viewfinder: the rectangle (fractions of the stage) the frame closes around. */
  target?: FrameRect;
  /** Viewfinder: extra space around the target, in px. */
  padding?: number;
  /** Ring: where it starts, as fractions of the stage `[x, y]`. */
  origin?: readonly [number, number];
  /** Smoke: the beats that dissolve. */
  beats?: readonly BeatId[];
}

/** Camera moves. `reframe` only happens while a transition fully covers the screen. */
export type CameraMove = "hold" | "push" | "pull" | "pan" | "dolly-up" | "dolly-down" | "reframe";

export type Vec3 = readonly [number, number, number];

export interface CameraKey {
  scene: SceneId;
  /** Progress of the key. Keys are strictly increasing; the camera interpolates between them. */
  at: number;
  /** World units: x right, y up, z toward the viewer. Plates sit at z <= 0. */
  position: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
  /** The move that starts at this key and runs until the next one. */
  move: CameraMove;
  /**
   * World offset (x, y) added to the camera and its target on a tall, narrow screen, in full on a
   * phone and fading to nothing as the screen widens. It re-centers art that sits to one side on a
   * wide stage (or leaves room for text above or below it). An optional third value (z) moves the
   * camera alone toward the picture (negative) or away from it, so a subject keeps its size in the
   * taller picture a phone shows (`fitFov`). A key without `pan` keeps the one before it; the
   * offset eases from key to key like everything else. The framing table (`framing.ts`) works
   * these out from each subject's phone target.
   */
  pan?: readonly [number, number] | readonly [number, number, number];
}

/** A corner of a card (the question cards' connector lines lock to one). */
export type CardCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * One question card of the deck in the questions scene: its beat, how it arrives, the orange its
 * connector line is fixed on (a named point on an orchard plate, see `points` in the art manifest)
 * and the corner of the card the line's square locks to.
 */
export interface QuestionCardDef {
  beat: BeatId;
  /** `zoom`: grows from small in the center (the first card). `arc`: arrives from the right along the arc. */
  arrive: "zoom" | "arc";
  anchor: { plate: string; point: string };
  corner: CardCorner;
  /** The line draws from the orange to the corner over this range, as the card arrives. */
  draw: ProgressRange;
}

/** A thin line that draws itself along a hairline, scrubbed by progress. */
export interface ProgressLineCue {
  id: string;
  /** The beat it accompanies. */
  beat: BeatId;
  along: "top";
  draw: ProgressRange;
  erase?: ProgressRange;
}

/** Places navigation can scroll to (chapter entries, "Apply", deep links). */
export type AnchorId = ChapterId | "apply";

/** The whole script in one object: what `validateScript()` checks. */
export interface StoryScript {
  stageVh: number;
  /** One screen of scrolling, in progress. */
  screen: number;
  chapters: readonly ChapterDef[];
  scenes: readonly SceneDef[];
  beats: readonly BeatDef[];
  transitions: readonly TransitionDef[];
  camera: readonly CameraKey[];
  hairlines: readonly HairlineCue[];
  progressLines: readonly ProgressLineCue[];
  tones: readonly ToneCue[];
  anchors: Readonly<Record<AnchorId, number>>;
}
