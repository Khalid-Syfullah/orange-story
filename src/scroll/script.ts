/**
 * The orange.io story as data: every chapter, scene, text beat, transition and camera key, placed on
 * the single 0 to 1 `progress` of the pinned stage. Components never own scroll ranges: they read
 * them from here. `SCROLL.md` describes the same script in prose.
 *
 * How positions are written
 * - Scenes are laid end to end by their share of the stage (the shares come from the storyboard
 *   pacing and add up to 1).
 * - Everything else is anchored to a scene: `at("pluck", 0.27)` is 27% of the way through the pluck.
 *   Retuning a share moves the beats, transitions and camera keys of that scene with it.
 * - Text lengths and ramps are in screens of scrolling (`SCREEN` is one screen in progress), the
 *   unit of the reference pacing: a beat holds about 1.3 screens, with about 0.3 screen of gap
 *   before the next beat in the same slot.
 *
 * `validateScript()` (`src/scroll/validate.ts`) checks the result in development and in the unit test.
 */

import type { HairlineCue } from "@/components/chrome/hairlines";
import type { ProgressEnvelope, ProgressRange } from "@/lib/progress";

import type { CopyPath } from "./copy-path";
import { pointInScene, round6, screensFor, tileScenes, type ScenePlan } from "./define";
import type {
  AnchorId,
  BeatDef,
  BeatEnter,
  BeatId,
  BeatLeave,
  CameraKey,
  CameraMove,
  ChapterDef,
  ProgressLineCue,
  SceneId,
  SlotId,
  StoryScript,
  ToneCue,
  TransitionDef,
  TransitionId,
  Vec3,
} from "./types";

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

/** Height of the pinned stage in vh: about 50 screens of scrolling, like the reference. Tunable. */
export const STAGE_VH = 5000;

/** Screens of scrolling from progress 0 to 1 (the pinned frame itself is one screen tall). */
export const SCREENS = screensFor(STAGE_VH);

/** One screen of scrolling, in progress. */
export const SCREEN = 1 / SCREENS;

/** `n` screens of scrolling, in progress. */
export const screens = (n: number) => round6(n * SCREEN);

/* ------------------------------------------------------------------ */
/* Chapters: the ruler switches exactly at these points                */
/* ------------------------------------------------------------------ */

export const CHAPTERS: readonly ChapterDef[] = [
  { id: "model", start: 0.012 },
  { id: "work", start: 0.232 },
  { id: "terms", start: 0.4 },
  { id: "questions", start: 0.628 },
];

/* ------------------------------------------------------------------ */
/* Scenes, in storyboard order                                         */
/* ------------------------------------------------------------------ */

const SCENE_PLAN: readonly ScenePlan[] = [
  // The Model
  { id: "hero", part: "model", share: 0.03 },
  { id: "ascent", part: "model", share: 0.05 },
  { id: "graft", part: "model", share: 0.05 },
  { id: "pluck", part: "model", share: 0.06 },
  { id: "share", part: "model", share: 0.042 }, // ends at 0.232
  // The Work
  { id: "work", part: "work", share: 0.1 },
  { id: "blueprint", part: "work", share: 0.068 }, // ends at 0.400
  // The Terms
  { id: "site", part: "terms", share: 0.08 },
  { id: "prune", part: "terms", share: 0.075 },
  { id: "fall", part: "terms", share: 0.073 }, // ends at 0.628
  // Questions
  { id: "faq", part: "questions", share: 0.14 },
  { id: "stars", part: "questions", share: 0.05 },
  { id: "apply", part: "questions", share: 0.08 },
  // End
  { id: "finale", part: "end", share: 0.102 }, // ends at 1.000
];

export const SCENES = tileScenes(SCENE_PLAN);

/** Progress at fraction `t` of a scene. */
const at = (scene: SceneId, t: number) => pointInScene(SCENES, scene, t);

/** A range centered on `p`, `half` screens to each side. */
const around = (p: number, half: number): ProgressRange => [round6(p - half * SCREEN), round6(p + half * SCREEN)];

/* ------------------------------------------------------------------ */
/* Beats: every text block, its slot, its range and its copy           */
/* ------------------------------------------------------------------ */

/** A beat holds about 1.3 screens (reference pacing). */
const BEAT_SCREENS = 1.3;

/** Arrival and leave ramps, in screens. */
const RAMP: readonly [number, number] = [0.3, 0.3];

interface BeatPlan {
  id: BeatId;
  scene: SceneId;
  slot: SlotId;
  enter: BeatEnter;
  leave: BeatLeave;
  copy: CopyPath;
  parts?: readonly string[];
  /** Where it starts to arrive. */
  from: number;
  /** Where it has fully left. Default: `from` plus `length` screens. */
  to?: number;
  /** Length in screens when `to` is not given. */
  length?: number;
  /** Arrival and leave ramps in screens. */
  ramp?: readonly [number, number];
}

function beat({ from, to, length = BEAT_SCREENS, ramp = RAMP, ...plan }: BeatPlan): BeatDef {
  const start = round6(from);
  const end = round6(to ?? from + length * SCREEN);
  const holdStart = plan.enter === "load" ? start : round6(start + ramp[0] * SCREEN);
  const holdEnd = plan.leave === "hold" ? end : round6(end - ramp[1] * SCREEN);
  return { ...plan, in: start, out: end, hold: [holdStart, holdEnd] };
}

/**
 * Five question cards share one place, one after another along the questions scene. Five cards
 * fit its 6.9 screens at 1.2 screens each with a short gap, so a leaving card has fully swung away
 * before the next one zooms in.
 */
const QUESTION_FIRST = 0.035;
const QUESTION_STEP = 0.194;
const QUESTION_SCREENS = 1.2;

const question = (n: 1 | 2 | 3 | 4 | 5): BeatDef =>
  beat({
    id: `question-${n}`,
    scene: "faq",
    slot: "center",
    enter: "zoom",
    leave: n === 5 ? "smoke" : "swing-left",
    copy: `questions.items.${n - 1}`,
    from: at("faq", QUESTION_FIRST + QUESTION_STEP * (n - 1)),
    length: QUESTION_SCREENS,
  });

const QUESTIONS = [question(1), question(2), question(3), question(4), question(5)] as const;

export const BEATS: readonly BeatDef[] = [
  /* The Model */
  beat({
    id: "hero",
    scene: "hero",
    slot: "center-left",
    enter: "load",
    leave: "drift-left",
    copy: "model.hero",
    parts: ["title", "subtitle", "button"],
    from: 0,
    length: 1,
    ramp: [0, 0.75],
  }),
  beat({
    id: "hero-intro",
    scene: "hero",
    slot: "bottom-left",
    enter: "load",
    leave: "drift-left",
    copy: "model.hero",
    parts: ["tag", "paragraph"],
    from: 0,
    length: 1,
    ramp: [0, 0.6],
  }),
  beat({
    id: "found",
    scene: "pluck",
    slot: "center-left",
    enter: "reveal",
    leave: "fade",
    copy: "model.found",
    from: at("pluck", 0.27), // as the hand closes on the orange
  }),
  beat({
    id: "harvest",
    scene: "pluck",
    slot: "bottom-left",
    enter: "reveal",
    leave: "fade",
    copy: "model.harvest",
    from: at("pluck", 0.815), // the harvester is revealed
    to: at("share", 0.37), // fades as the camera pushes into the orange
  }),

  /* The Work: three service cards swap in place in the right column. */
  beat({ id: "card-1", scene: "work", slot: "right", enter: "reveal", leave: "fade", copy: "work.cards.0", from: at("work", 0.1) }),
  beat({ id: "card-2", scene: "work", slot: "right", enter: "reveal", leave: "fade", copy: "work.cards.1", from: at("work", 0.427) }),
  beat({
    id: "card-3",
    scene: "work",
    slot: "right",
    enter: "reveal",
    leave: "fade",
    copy: "work.cards.2",
    from: at("work", 0.754),
    length: 1.6, // the longest card body
  }),

  /* The Terms */
  beat({
    id: "terms",
    scene: "site",
    slot: "right",
    enter: "reveal",
    leave: "fade",
    copy: "terms.block",
    from: at("site", 0.46), // once the top-down view has shrunk into the left half
    to: at("site", 0.94), // leaves as the dust rises
  }),
  beat({
    id: "terms-title",
    scene: "prune",
    slot: "top-left",
    enter: "dock",
    leave: "sink",
    copy: "terms.chapterTitle",
    from: at("prune", 0.12),
    to: at("fall", 0.33), // all text sinks as the camera follows the falling orange
    ramp: [1.4, 0.4],
  }),
  beat({
    id: "fit",
    scene: "prune",
    slot: "bottom-left",
    enter: "reveal",
    leave: "sink",
    copy: "terms.fit",
    from: at("prune", 0.45),
    to: at("fall", 0.33),
    ramp: [0.3, 0.4],
  }),

  /* Questions */
  beat({
    id: "questions-title",
    scene: "faq",
    slot: "top-center",
    enter: "reveal",
    leave: "smoke",
    copy: "questions.title",
    from: at("faq", 0), // appears as the ruler switches to Questions
    to: QUESTIONS[4].out, // dissolves with the last card
    ramp: [0.35, 0.3],
  }),
  ...QUESTIONS,
  beat({
    id: "apply-intro",
    scene: "apply",
    slot: "top-left",
    enter: "reveal",
    leave: "smoke",
    copy: "questions.application",
    parts: ["tag", "title", "subtitle"],
    from: at("apply", 0.08),
    to: at("finale", 0.12),
  }),
  beat({
    id: "apply-form",
    scene: "apply",
    slot: "right",
    enter: "fade",
    leave: "smoke", // the form blurs, rises and fades out
    copy: "questions.application",
    parts: ["fields", "submit"],
    from: at("apply", 0.12),
    to: at("finale", 0.12),
  }),

  /* End */
  beat({
    id: "finale",
    scene: "finale",
    slot: "center",
    enter: "reveal",
    leave: "hold",
    copy: "finale",
    parts: ["wordmark", "subtitle", "copyright", "email"],
    from: at("finale", 0.6), // inside the closing viewfinder
    to: 1,
    ramp: [0.6, 0],
  }),
];

function beatOf(id: BeatId): BeatDef {
  const found = BEATS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown beat "${id}"`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

const LAST_QUESTION = beatOf("question-5");
const QUESTIONS_TITLE = beatOf("questions-title");

export const TRANSITIONS: readonly TransitionDef[] = [
  {
    id: "viewfinder-share",
    kind: "viewfinder",
    from: "share",
    to: "share",
    start: at("share", 0.5), // both hands hold the halves
    end: at("share", 0.94),
    peak: [at("share", 0.69), at("share", 0.82)],
    layer: "hairlines",
    target: { x: 0.4, y: 0.3, width: 0.2, height: 0.34 },
    padding: 16,
  },
  {
    id: "sand",
    kind: "sand",
    from: "share",
    to: "work",
    start: at("share", 0.705),
    end: at("work", 0.072),
    peak: around(at("work", 0), 0.04),
    layer: "canvas",
  },
  {
    id: "unfold",
    kind: "unfold",
    from: "blueprint",
    to: "site",
    start: at("blueprint", 0.86),
    end: at("site", 0.12),
    peak: around(at("site", 0), 0.08),
    layer: "canvas",
  },
  {
    id: "dust",
    kind: "dust",
    from: "site",
    to: "prune",
    start: at("site", 0.92),
    end: at("prune", 0.09),
    peak: around(at("prune", 0), 0.04),
    layer: "canvas",
  },
  {
    id: "ring",
    kind: "ring",
    from: "fall",
    to: "fall",
    start: at("fall", 0.45), // from the falling orange outward, into the orchard
    end: at("fall", 0.66),
    layer: "canvas",
    origin: [0.5, 0.55],
  },
  {
    id: "smoke",
    kind: "smoke",
    from: "faq",
    to: "faq",
    start: Math.min(LAST_QUESTION.hold[1], QUESTIONS_TITLE.hold[1]),
    end: Math.max(LAST_QUESTION.out, QUESTIONS_TITLE.out),
    layer: "text",
    beats: ["questions-title", "question-5"],
  },
  {
    id: "fabric",
    kind: "fabric",
    from: "faq",
    to: "stars",
    start: at("faq", 0.97),
    end: at("stars", 0.2),
    peak: around(at("stars", 0), 0.05),
    layer: "canvas",
  },
  {
    id: "viewfinder-finale",
    kind: "viewfinder",
    from: "finale",
    to: "finale",
    start: at("finale", 0.5),
    end: 1,
    peak: [at("finale", 0.85), 1], // stays closed to the end of the page
    layer: "hairlines",
    target: { x: 0.3, y: 0.2, width: 0.4, height: 0.56 },
    padding: 12,
  },
];

function transitionOf(id: TransitionId): TransitionDef {
  const found = TRANSITIONS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown transition "${id}"`);
  return found;
}

/** Full-cover interval of a covering transition (where the camera may reframe unseen). */
function peakOf(id: TransitionId): ProgressRange {
  const peak = transitionOf(id).peak;
  if (!peak) throw new Error(`Transition "${id}" has no peak`);
  return peak;
}

/* ------------------------------------------------------------------ */
/* Camera: keyframes per scene                                         */
/* ------------------------------------------------------------------ */

const key = (scene: SceneId, p: number, move: CameraMove, position: Vec3, target: Vec3, fov: number): CameraKey => ({
  scene,
  at: round6(p),
  position,
  target,
  fov,
  move,
});

const [SAND_COVERED, SAND_CLEARING] = peakOf("sand");
const [UNFOLD_COVERED, UNFOLD_CLEARING] = peakOf("unfold");
const [DUST_COVERED, DUST_CLEARING] = peakOf("dust");
const [FABRIC_COVERED, FABRIC_CLEARING] = peakOf("fabric");

const HERO_WIDE: Vec3 = [0, 0, 14];
const BRANCH: Vec3 = [2, 8.4, 5.5];
const FRUITING_TREE: Vec3 = [1.6, 11, 12];
const HARVESTER: Vec3 = [1.4, 4.2, 9];
const HALVES: Vec3 = [1.5, 4.5, 4.8];
const TOP_DOWN: Vec3 = [0, 13, 0.01];
const TOP_DOWN_FAR: Vec3 = [0, 24, 0.01];
const GARDENER: Vec3 = [0, 0, 12];
const STARGAZER: Vec3 = [0, 6, 7];

/**
 * The ascent's own timings (progress). The art in `src/components/stage/ascent-tree.ts` choreographs
 * on these: the statue and the minaret rise through the whole scene; the stone turns to bark along a
 * front that climbs the shaft (`front` is world heights at fractions of the scene, so the front
 * stays in view while the camera climbs); the three branches grow from the trunk once it is tall
 * enough, and their leaves unfurl with them; the statue and its glow fade once they are above the
 * frame.
 */
export const ASCENT = {
  /** The statue and the minaret rise. */
  rise: [at("ascent", 0), at("ascent", 1)] as ProgressRange,
  /** The stone-to-bark front: [progress, world height] pairs, then it rides the top of the trunk. */
  front: [
    [at("ascent", 0), -5.2],
    [at("ascent", 0.1), -2.2],
    [at("ascent", 0.28), 1.1],
    [at("ascent", 0.45), 2.9],
  ] as readonly (readonly [number, number])[],
  /** The stone is bark everywhere by here. */
  barked: at("ascent", 0.56),
  /** Each branch grows from the trunk (scale and fade), its leaves unfurling along the way. */
  branches: {
    "ascent/branch-1": [at("ascent", 0.6), at("ascent", 0.8)] as ProgressRange,
    "ascent/branch-2": [at("ascent", 0.7), at("ascent", 0.9)] as ProgressRange,
    "ascent/branch-3": [at("ascent", 0.8), at("ascent", 1)] as ProgressRange,
  },
  /** The statue, its orange and the glow leave the picture once above the frame. */
  statueFade: [at("ascent", 0.84), at("ascent", 0.97)] as ProgressRange,
} as const;

export const CAMERA: readonly CameraKey[] = [
  // Hero: wide and still.
  key("hero", at("hero", 0), "hold", HERO_WIDE, [0, 0, 0], 35),
  // Ascent: push in on the statue, ease into a pan and dolly along the trunk, settle on one branch.
  key("ascent", at("ascent", 0), "push", HERO_WIDE, [0, 0, 0], 35),
  key("ascent", at("ascent", 0.28), "push", [2.1, 2.5, 9.6], [2.5, 2.9, 0], 33.5),
  key("ascent", at("ascent", 0.55), "pan", [2.6, 4.6, 7.5], [2.8, 4.9, 0], 32),
  key("ascent", at("ascent", 0.85), "dolly-up", [2.2, 6.4, 6.5], [2.2, 6.6, 0], 31),
  // Graft: steady on the branch while the hands work, then dolly up and pull out to the fruiting tree.
  key("graft", at("graft", 0), "hold", BRANCH, [2, 8.4, 0], 30),
  key("graft", at("graft", 0.62), "pull", BRANCH, [2, 8.4, 0], 30),
  // Pluck: the hand rises, then the camera dollies down through the branches to the harvester.
  key("pluck", at("pluck", 0), "hold", FRUITING_TREE, [1.6, 10.5, 0], 36),
  key("pluck", at("pluck", 0.35), "dolly-down", FRUITING_TREE, [1.6, 10.5, 0], 36),
  key("pluck", at("pluck", 0.78), "hold", HARVESTER, [1.4, 4.2, 0], 34),
  // Share: the cut, a push into the orange, the halves held, a push into the halves under the sand.
  key("share", at("share", 0), "hold", HARVESTER, [1.4, 4.2, 0], 34),
  key("share", at("share", 0.22), "push", HARVESTER, [1.4, 4.2, 0], 34),
  key("share", at("share", 0.45), "hold", HALVES, [1.5, 4.5, 0], 30),
  key("share", at("share", 0.72), "push", HALVES, [1.5, 4.5, 0], 30),
  key("share", SAND_COVERED, "reframe", [1.5, 4.5, 2.2], [1.5, 4.5, 0], 28),
  // Work: a slow dolly upward through the clouds.
  key("work", SAND_CLEARING, "dolly-up", [0, 0, 14], [0, 0.5, 0], 40),
  // Blueprint: the scaffold, then a push into the plan as it unfolds.
  key("blueprint", at("blueprint", 0), "hold", [0, 9, 13], [0, 9.5, 0], 38),
  key("blueprint", at("blueprint", 0.35), "push", [0, 9, 13], [0, 9.5, 0], 38),
  key("blueprint", UNFOLD_COVERED, "reframe", [0, 9.6, 5], [0, 9.6, 0], 34),
  // Site: rise from ground level to top-down, then pull out as the view shrinks into the left half.
  key("site", UNFOLD_CLEARING, "dolly-up", [0, 1.2, 12], [0, 1, 0], 38),
  key("site", at("site", 0.42), "pull", TOP_DOWN, [0, 0, 0], 38),
  key("site", at("site", 0.7), "hold", TOP_DOWN_FAR, [0, 0, 0], 38),
  key("site", DUST_COVERED, "reframe", TOP_DOWN_FAR, [0, 0, 0], 38),
  // Prune: the gardener at work.
  key("prune", DUST_CLEARING, "hold", GARDENER, [0, 0.5, 0], 35),
  // Fall: toward the gardener's face, follow the orange down, push into it, then dolly up the rows.
  key("fall", at("fall", 0), "push", GARDENER, [0, 0.5, 0], 35),
  key("fall", at("fall", 0.22), "dolly-down", [0.4, 2.2, 6.5], [0.4, 2.2, 0], 32),
  key("fall", at("fall", 0.45), "push", [0, -3, 5], [0, -3, 0], 32),
  key("fall", at("fall", 0.62), "dolly-up", [0, -3, 2.6], [0, -3, 0], 30),
  // Questions: drift up between the rows, then forward into the blue under the fabric sky.
  key("faq", at("faq", 0), "dolly-up", [0, 1, 12], [0, 2, 0], 40),
  key("faq", at("faq", 0.9), "push", [0, 4.5, 12], [0, 5.5, 0], 40),
  key("faq", FABRIC_COVERED, "reframe", [0, 5, 6], [0, 6, 0], 38),
  // Stars: the astronomer and the growing constellation.
  key("stars", FABRIC_CLEARING, "hold", STARGAZER, [0, 6.5, 0], 38),
  // Application and finale: the frame stays still while the art moves.
  key("apply", at("apply", 0), "hold", STARGAZER, [0, 6.5, 0], 38),
  key("finale", at("finale", 0), "hold", STARGAZER, [0, 6.5, 0], 38),
];

/* ------------------------------------------------------------------ */
/* Hairlines, progress lines, tone                                     */
/* ------------------------------------------------------------------ */

/** Never releases: the envelope stays at full strength to the end of the page. */
const forever = (p: number) => (p >= 1 ? Infinity : p);

function viewfinderCue(id: TransitionId): HairlineCue {
  const t = transitionOf(id);
  if (!t.peak || !t.target) throw new Error(`Viewfinder "${id}" needs a peak and a target`);
  return {
    kind: "viewfinder",
    at: [t.start, t.peak[0], forever(t.peak[1]), forever(t.end)],
    target: t.target,
    padding: t.padding,
  };
}

/**
 * Hairlines leave at each chapter change: under the covering transition when there is one,
 * otherwise in a short envelope around the chapter start.
 */
function chapterExit(chapter: ChapterDef): HairlineCue {
  const cover = TRANSITIONS.find(
    (t) => t.layer === "canvas" && t.from !== t.to && t.peak && t.start < chapter.start && chapter.start < t.end,
  );
  const envelope: ProgressEnvelope = cover?.peak
    ? [cover.start, cover.peak[0], cover.peak[1], cover.end]
    : [round6(chapter.start - 0.3 * SCREEN), chapter.start, round6(chapter.start + 0.2 * SCREEN), round6(chapter.start + 0.6 * SCREEN)];
  return { kind: "exit", at: envelope };
}

export const HAIRLINES: readonly HairlineCue[] = [
  viewfinderCue("viewfinder-share"),
  ...CHAPTERS.slice(1).map(chapterExit),
  // Finale: the lines slide out to the edges, then close in from there into the viewfinder.
  { kind: "exit", at: [at("finale", 0.35), at("finale", 0.5), Infinity, Infinity] },
  viewfinderCue("viewfinder-finale"),
];

const FOUND = beatOf("found");

export const PROGRESS_LINES: readonly ProgressLineCue[] = [
  {
    id: "found-line",
    beat: "found",
    along: "top",
    draw: [FOUND.in, round6(FOUND.hold[0] + 0.3 * SCREEN)],
    erase: [FOUND.hold[1], FOUND.out],
  },
];

const UNFOLD = transitionOf("unfold");

/** Milk-white moments: the paper unfold, and the top-down site with its milk panel. Sky elsewhere. */
export const TONES: readonly ToneCue[] = [
  { tone: "milk", start: round6(UNFOLD_COVERED - 0.25 * SCREEN), end: UNFOLD.end },
  { tone: "milk", start: at("site", 0.4), end: DUST_COVERED },
];

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/** Where chapter entries, "Apply" and deep links land: after covering transitions have cleared. */
export const ANCHORS: Readonly<Record<AnchorId, number>> = {
  model: 0,
  work: transitionOf("sand").end,
  terms: UNFOLD.end,
  questions: QUESTIONS_TITLE.hold[0],
  apply: beatOf("apply-form").hold[0],
};

/** Boundaries of the ruler's progress segments: every chapter and scene start. */
export const RULER_STOPS: readonly number[] = Array.from(
  new Set([...CHAPTERS.map((c) => c.start), ...SCENES.slice(1).map((s) => s.start)]),
).sort((a, b) => a - b);

/** The whole script in one object. */
export const SCRIPT: StoryScript = {
  stageVh: STAGE_VH,
  screen: SCREEN,
  chapters: CHAPTERS,
  scenes: SCENES,
  beats: BEATS,
  transitions: TRANSITIONS,
  camera: CAMERA,
  hairlines: HAIRLINES,
  progressLines: PROGRESS_LINES,
  tones: TONES,
  anchors: ANCHORS,
};
