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

import { plateEntry, platePoint } from "@/art/manifest";
import type { HairlineCue } from "@/components/chrome/hairlines";
import { dragAxis } from "@/lib/flight";
import type { ProgressEnvelope, ProgressRange } from "@/lib/progress";

import type { CopyPath } from "./copy-path";
import { pointInScene, round6, screensFor, tileScenes, type ScenePlan } from "./define";
import { framedKey, phonePan, plateBox, rigBox, shot, unionBox, type FramingId, type Shot, type ShotSpec, type WorldBox } from "./framing";
import type {
  AnchorId,
  BeatDef,
  BeatEnter,
  BeatId,
  BeatLeave,
  CameraKey,
  CameraMove,
  CardCorner,
  ChapterDef,
  ProgressLineCue,
  QuestionCardDef,
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

/** Height of the pinned stage in vh: 53 screens of scrolling, the reference's length. Tunable. */
export const STAGE_VH = 5400;

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
  { id: "work", part: "work", share: 0.106 }, // room for the three cards once the sand has cleared
  { id: "blueprint", part: "work", share: 0.062 }, // ends at 0.400
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

/** Where the sand has blown away and The Work is uncovered (the end of the `sand` transition). */
const SAND_CLEARED = at("work", 0.072);

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
 * Five question cards take turns in one place, the center, along the questions scene: each holds
 * 1.3 screens (the reference beat), arrives over 0.35 screen and leaves over 0.35. They abut: a card
 * has swung fully away to the left at the very point where the next one starts to arrive from the
 * right, so the deck moves on without a pause and the slot never holds two cards (see `FAQ`).
 */
const QUESTION_FIRST = 0.035;
const QUESTION_SCREENS = 1.3;
const QUESTION_RAMP: readonly [number, number] = [0.35, 0.35];

const questionStart = (n: number) => round6(at("faq", QUESTION_FIRST) + (n - 1) * QUESTION_SCREENS * SCREEN);

const question = (n: 1 | 2 | 3 | 4 | 5): BeatDef =>
  beat({
    id: `question-${n}`,
    scene: "faq",
    slot: "center",
    enter: "zoom",
    leave: n === 5 ? "smoke" : "swing-left",
    copy: `questions.items.${n - 1}`,
    from: questionStart(n),
    to: questionStart(n + 1),
    ramp: QUESTION_RAMP,
  });

const QUESTIONS = [question(1), question(2), question(3), question(4), question(5)] as const;

/**
 * The three service cards follow each other in the right column: the first arrives just after the
 * sand has blown away, each of the others 0.3 screen after the one before has left (the reference
 * gap), and the third (the longest body) holds 1.6 screens. Chained in screens, so they keep their
 * pacing on any stage length; the work scene's share is sized so the last card has left before the
 * blueprint starts to fade in over the clouds (the unit test checks it).
 */
const SERVICE_CARD_SCREENS = [1.3, 1.3, 1.6] as const;
const SERVICE_CARD_GAP = 0.3;

const SERVICE_CARDS: readonly BeatDef[] = SERVICE_CARD_SCREENS.reduce<BeatDef[]>((cards, length, i) => {
  const from = i === 0 ? round6(SAND_CLEARED + 0.1 * SCREEN) : round6(cards[i - 1].out + SERVICE_CARD_GAP * SCREEN);
  cards.push(beat({ id: `card-${i + 1}` as BeatId, scene: "work", slot: "right", enter: "reveal", leave: "fade", copy: `work.cards.${i}` as CopyPath, from, length }));
  return cards;
}, []);

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

  /* The Work: three service cards swap in place in the right column (see SERVICE_CARDS). */
  ...SERVICE_CARDS,

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
    to: at("fall", 0.12), // all text sinks as the branch is cut, before the camera turns to the gardener's face
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
    to: at("fall", 0.12),
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
    end: SAND_CLEARED,
    peak: around(at("work", 0), 0.04),
    layer: "canvas",
  },
  {
    id: "unfold",
    kind: "unfold",
    from: "blueprint",
    to: "site",
    start: at("blueprint", 0.82), // once the plan has opened (BLUEPRINT.panels)
    end: at("site", 0.19), // the sheet opens over about three quarters of a screen, before the camera rises (SITE.rise)
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

type Pan = NonNullable<CameraKey["pan"]>;

const key = (scene: SceneId, p: number, move: CameraMove, position: Vec3, target: Vec3, fov: number, pan?: Pan): CameraKey => ({
  scene,
  at: round6(p),
  position,
  target,
  fov,
  move,
  ...(pan ? { pan } : {}),
});

/** A key filmed from a shot (a row of the framing table, or any `Shot` with its pan). */
const shotKey = (scene: SceneId, p: number, move: CameraMove, s: Shot & { pan?: Pan }, pan: Pan | undefined = s.pan): CameraKey => key(scene, p, move, s.position, s.target, s.fov, pan);

const [SAND_COVERED, SAND_CLEARING] = peakOf("sand");
const [UNFOLD_COVERED, UNFOLD_CLEARING] = peakOf("unfold");
const [DUST_COVERED, DUST_CLEARING] = peakOf("dust");
const [FABRIC_COVERED, FABRIC_CLEARING] = peakOf("fabric");

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
  /**
   * How far (world units) the statue has risen by the end, and the rise's curve (`ascentRiseShare`):
   * from rest, faster and faster as a power of the time (the trunk "keeps growing"), then over the
   * last `riseSettle` of the scene slowing to a stop as the camera reaches the branch.
   */
  riseTotal: 10,
  risePower: 2,
  riseSettle: 0.3,
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

/**
 * The graft's own timings (progress). The art in `src/components/stage/graft-hands.ts` choreographs
 * on these: the hands rise in from below, the left carrying the cutting, which it fits to the cleft
 * (lining it up over the cleft, then pressing it in), lets go of and steadies the branch with; the
 * right winds the twine round the joint and ties the knot in three pulls (each one closes the
 * fingers on the twine, pulls, gives a little and lets the stem spring back; the next knot frame
 * swaps in at the quickest part of the pull); then both let go and drop away. The camera is steady
 * on the branch until `pullOut` (see CAMERA), when it dollies up and pulls out; the fruiting tree
 * fills in with oranges among the leaves while it does.
 */
export const GRAFT = {
  /** The hands rise in from below the frame; the left (with the cutting) first. */
  enter: [at("graft", 0.02), at("graft", 0.16)] as ProgressRange,
  /** The right hand comes in this share of `enter` after the left, and arrives as much later. */
  enterLag: 0.22,
  /** The cutting is fitted to the cleft: lined up over it, then pressed in. */
  fit: [at("graft", 0.16), at("graft", 0.28)] as ProgressRange,
  /** Within `fit`: the share spent lining the cutting up over the cleft (the rest presses it in and settles). */
  fitAlign: 0.42,
  /** The left hand lets go of the seated cutting and moves to steady the branch beside the joint. */
  steady: [at("graft", 0.275), at("graft", 0.335)] as ProgressRange,
  /** The twine winds round the joint: the right hand circles it `wraps` times. */
  wrap: [at("graft", 0.28), at("graft", 0.38)] as ProgressRange,
  wraps: 2,
  /** The knot: three steps, [start, end] each. */
  knot: [
    [at("graft", 0.38), at("graft", 0.44)],
    [at("graft", 0.44), at("graft", 0.5)],
    [at("graft", 0.5), at("graft", 0.56)],
  ] as readonly ProgressRange[],
  /**
   * Within each knot step (shares of it): the hand goes back to the knot (`reach`), its fingers close
   * on the twine there (`grasp`), it pulls (`pull`; the next knot frame swaps in over `swap`, at the
   * quickest part of the pull), and the twine gives a little and the fingers ease (`give`).
   */
  knotBeats: { reach: [0, 0.14], grasp: [0.12, 0.24], pull: [0.24, 0.6], swap: [0.36, 0.46], give: [0.6, 0.86] } as const,
  /** The hands let go and leave: the right first, then the left from the branch. */
  exit: [at("graft", 0.56), at("graft", 0.64)] as ProgressRange,
  /** The camera dollies up and pulls out from here (the second graft camera key). */
  pullOut: [at("graft", 0.62), at("pluck", 0)] as ProgressRange,
  /** Oranges and leaves fill the tree. */
  fruit: [at("graft", 0.64), at("graft", 0.96)] as ProgressRange,
} as const;

/**
 * The pluck's own timings (progress). The art in `src/components/stage/pluck-harvest.ts` choreographs
 * on these: a hand reaches up from below the frame to the one special orange (an arm with an elbow,
 * its hand on an arc), its fingers close round it (where the "We get you found." beat arrives), it
 * tugs until the stem snaps and follows through, the branches shaking as they spring back; then the
 * camera dollies down through the branches (`dolly`, the pluck camera keys) while the hand carries
 * the fruit down with it, the foliage falling away behind. The harvester comes into view, his open
 * arm swings up about his shoulder to take the fruit, it changes hands (`handoff`), the hand that
 * carried it opens and drops away, and his head turns to the orange a beat after his arm arrives.
 */
export const PLUCK = {
  /** The hand reaches up from below the frame to the orange. */
  rise: [at("pluck", 0.02), at("pluck", 0.22)] as ProgressRange,
  /** The fingers close round the orange. */
  grasp: [at("pluck", 0.21), at("pluck", 0.29)] as ProgressRange,
  /** The tug: the hand pulls, the stem stretches and snaps `snap` of the way through, and the hand follows through. */
  tug: [at("pluck", 0.31), at("pluck", 0.43)] as ProgressRange,
  snap: 0.55,
  /** The camera dollies down to the harvester; the hand and the fruit travel with it. */
  dolly: [at("pluck", 0.35), at("pluck", 0.74)] as ProgressRange,
  /** The near and middle foliage fall away as the camera passes below the branches. */
  foliage: {
    near: [at("pluck", 0.36), at("pluck", 0.5)] as ProgressRange,
    mid: [at("pluck", 0.44), at("pluck", 0.64)] as ProgressRange,
  },
  /**
   * The harvester settles into view as the camera comes down to him: he enters the frame from below
   * while the dolly is under way, and the camera lands on him at `dolly[1]`.
   */
  reveal: [at("pluck", 0.44), at("pluck", 0.66)] as ProgressRange,
  /** His open arm swings up about his shoulder to meet the fruit coming down. */
  armUp: [at("pluck", 0.56), at("pluck", 0.725)] as ProgressRange,
  /** The fruit changes hands: from the hand that carried it into his palm (both still). */
  handoff: [at("pluck", 0.742), at("pluck", 0.752)] as ProgressRange,
  /** The hand that carried it opens and drops away out of the frame. */
  release: [at("pluck", 0.752), at("pluck", 0.84)] as ProgressRange,
} as const;

/**
 * The share's own timings (progress). The art in `src/components/stage/share-cut.ts` choreographs
 * on these: his left hand brings the knife up over the orange he holds and cuts down through it (a
 * small lift first, slow through the rind, quicker through the flesh, slow again to his palm), the
 * whole orange giving way to its two peels under the blade; the knife withdraws; the halves tip
 * apart about their cut edges, rock and settle in his palm, turning their cut faces up; a second
 * hand rises from center left to the left half, takes it and draws it a little away, and both hands
 * bring the halves together and hold them (the harvest, shared). The camera pushes into the orange
 * from `cut[0]`, holds on the halves, and pushes in again under the viewfinder and the sand.
 */
export const SHARE = {
  /** The knife hand comes up from his side to above the orange. */
  knifeIn: [at("share", 0.02), at("share", 0.11)] as ProgressRange,
  /** The blade cuts down through the orange. */
  cut: [at("share", 0.11), at("share", 0.2)] as ProgressRange,
  /**
   * The cut's pace, as shares of `cut`: where the blade has lifted a little before it goes in
   * (`lift`), come through the top of the rind (`rind`), through the flesh (`flesh`); then it slows
   * to his palm.
   */
  cutPace: { lift: 0.12, rind: 0.38, flesh: 0.76 } as const,
  /** Under the blade, as it comes into the rind: the whole orange gives way to its two peels. */
  split: [at("share", 0.138), at("share", 0.148)] as ProgressRange,
  /** The knife hand draws the blade back out and drops to his side. */
  knifeOut: [at("share", 0.2), at("share", 0.29)] as ProgressRange,
  /** The halves tip apart about their cut edges, rock and settle in his palm. */
  open: [at("share", 0.19), at("share", 0.31)] as ProgressRange,
  /** The halves turn their cut faces up: the frames swap in the quick part of the opening. */
  faces: [at("share", 0.215), at("share", 0.235)] as ProgressRange,
  /** The second hand rises from center left to the left half. */
  reach: [at("share", 0.27), at("share", 0.38)] as ProgressRange,
  /** It takes the half (the half passes into it) and draws it a little away. */
  take: [at("share", 0.38), at("share", 0.46)] as ProgressRange,
  /** Both hands bring the halves together; then they hold. */
  together: [at("share", 0.46), at("share", 0.58)] as ProgressRange,
} as const;

/**
 * The work's own timings (progress). The art in `src/components/stage/work-sky.ts` choreographs on
 * these: the clouds drift right on idle time and shift right as the story scrolls (`clouds`, the
 * stretch over which the scroll shift runs, so clouds pass on both sides of card 2), and the giant
 * orange on its minaret rises into view with the builder during the third card.
 */
export const WORK = {
  /** The scroll shift of the clouds. */
  clouds: [at("work", 0), at("work", 1)] as ProgressRange,
  /** The giant orange and the builder rise into view, as the third card arrives. */
  rise: [beatOf("card-3").in, at("work", 0.99)] as ProgressRange,
  /** The builder works with his mallet once he is up (wind-up, strike, recoil, lift back). */
  strikes: [at("work", 0.83), at("work", 0.995)] as ProgressRange,
  /** How many blows over `strikes`. */
  blows: 2,
} as const;

/**
 * The blueprint's own timings (progress). The art in `src/components/stage/blueprint-plan.ts`
 * choreographs on these: the builder works on his platform with his mallet (`strikes`, `blows` of
 * them) while the camera is on him, the camera pans down to the architect holding the folded drawing
 * (`toArchitect`), and the drawing unfolds in her hands, panel by panel on its hinges (`folds`, the
 * panel next to her hands first), while the camera pushes in.
 */
export const BLUEPRINT = {
  /** The builder's mallet: wind-up, strike, recoil, lift back. */
  strikes: [at("blueprint", 0.01), at("blueprint", 0.37)] as ProgressRange,
  /** How many blows over `strikes`. */
  blows: 3,
  /** The camera pans down the scaffold to the architect. */
  toArchitect: [at("blueprint", 0.2), at("blueprint", 0.36)] as ProgressRange,
  /** The drawing unfolds. */
  panels: [at("blueprint", 0.36), at("blueprint", 0.8)] as ProgressRange,
  /** Each fold swings open on its hinge (the third panel's off the one in her hands, then the second's, then the first's), each before the one before has settled. */
  folds: [
    [at("blueprint", 0.36), at("blueprint", 0.58)],
    [at("blueprint", 0.47), at("blueprint", 0.69)],
    [at("blueprint", 0.58), at("blueprint", 0.8)],
  ] as readonly ProgressRange[],
} as const;

/**
 * Where the architect holds the drawing: the grip points of its last panel (the one that stays in her
 * hands) on her own grip points, both from the art; the drawing stands at her depth, just in front of
 * her, so the camera's push never slides it off her hands.
 */
const PLAN_GRIP = platePoint("blueprint/plan-4", "grip-left");
const ARCHITECT_GRIP = platePoint("blueprint/architect", "grip-left");
export const PLAN_HELD: readonly [number, number] = [round6(ARCHITECT_GRIP[0] - PLAN_GRIP[0]), round6(ARCHITECT_GRIP[1] - PLAN_GRIP[1])];
export const PLAN_DEPTH = round6(plateEntry("blueprint/architect").depth - 0.01);

/**
 * The site's own timings (progress). The art in `src/components/stage/site-plan.ts` choreographs on
 * these: the builders work at ground level with their mallets (`strikes`), the camera pulls back from a builder to the whole site
 * and rises to a straight top-down view (`rise`, between the site's second and fourth camera keys),
 * the side-view plates give way to the matching top-down set (`sideOut`, `topDownIn`), the top-down view zooms out and shrinks into the left half (`shrink`,
 * the pull camera move) while the tiled ground grows into a large field around it (`tiles`), and
 * the right half becomes the milk-white panel with its leaf shadows (`panel`) until the dust covers
 * it (`end`).
 */
export const SITE = {
  /** The two standing builders' mallets while the camera is still near the ground: `blows` each, half a blow apart, so one strikes as the other winds up. */
  strikes: {
    left: [at("site", 0.1), at("site", 0.34)] as ProgressRange,
    right: [at("site", 0.14), at("site", 0.38)] as ProgressRange,
  },
  blows: 3,
  /** The camera rises from ground level to straight above. */
  rise: [at("site", 0.2), at("site", 0.42)] as ProgressRange,
  /** The seaside figures and the platform fade out as the view tilts down (the last third of the rise). */
  sideOut: [at("site", 0.35), at("site", 0.41)] as ProgressRange,
  /** The sea and its sky leave last (no sky in the top-down view). */
  seaOut: [at("site", 0.4), at("site", 0.42)] as ProgressRange,
  /** The matching top-down set and the first tiles fade in, once the camera looks mostly down. */
  topDownIn: [at("site", 0.33), at("site", 0.4)] as ProgressRange,
  /** The top-down view zooms out and shrinks into the left half of the screen. */
  shrink: [at("site", 0.42), at("site", 0.7)] as ProgressRange,
  /** The tiled ground grows into a large field around the scaffold. */
  tiles: [at("site", 0.38), at("site", 0.72)] as ProgressRange,
  /** The right half becomes the milk-white panel, as the site moves out of it into the left half. */
  panel: [at("site", 0.44), at("site", 0.52)] as ProgressRange,
  /** The dust has covered the screen: the panel and the site are gone. */
  end: DUST_COVERED,
} as const;

/**
 * The gardener's timings (progress). `src/components/stage/prune-plan.ts` choreographs on these: he
 * trims while the title docks and the fit text arrives (`trim`, `snips` open-and-close cycles of the
 * shears), and the left branch comes in a little shorter as he shapes the tree.
 */
export const PRUNE = {
  /** The shears work. */
  trim: [at("prune", 0.1), at("prune", 0.85)] as ProgressRange,
  /** How many times the shears close and open over `trim`. */
  snips: 7,
} as const;

/**
 * The stargazer's timings (progress). `src/components/stage/stars-plan.ts` choreographs on these:
 * the constellation grows outward from the astronomer's fingertip (`grow`, scrubbed: stars appear
 * and edges draw as progress passes them, and shrink back when scrolling up) once the fabric sky
 * has cleared, and its edges each draw over `draw` of the growth.
 */
export const STARS = {
  /** The constellation grows. */
  grow: [at("stars", 0.22), at("stars", 0.95)] as ProgressRange,
  /** How long one edge takes to draw, as a fraction of `grow`. */
  draw: 0.08,
} as const;

/**
 * The application scene's timings (progress). `src/components/stage/apply-plan.ts` moves on these:
 * the astronomer and his platform step down the sky (`sink`) so the top-left text has clear air,
 * while the constellation stays. The finale carries on sinking them away.
 */
export const APPLY = {
  /** The astronomer and his marble platform settle lower in the frame. */
  sink: [at("apply", 0.06), at("apply", 0.2)] as ProgressRange,
} as const;

/**
 * The finale's timings (progress). `src/components/stage/finale-plan.ts` choreographs on these: the
 * astronomer and his platform sink the rest of the way out of the bottom (`sink`), the constellation
 * drifts up and away (`stars`), the old cloud slides right (`cloud`), the tree rises from the bottom
 * center (`tree`), the woman comes in from the left and the man from the right (`woman`, `man`) and
 * settle either side of it. From `loop` on, the orchard keepers run on idle time and no longer
 * depend on scrolling (she waters, he cuts an orange free, oranges drop now and then, the clouds
 * drift right); `loop` is only the ramp that fades that loop in and out, so scrolling up still
 * plays everything back. The hairlines and the wordmark (see HAIRLINES and the `finale` beat) close
 * in around them.
 */
export const FINALE = {
  /** The astronomer and his platform sink the rest of the way down (after the apply sink). */
  sink: [at("finale", 0), at("finale", 0.26)] as ProgressRange,
  /** The stars drift up and away, fading. */
  stars: [at("finale", 0), at("finale", 0.3)] as ProgressRange,
  /** The cloud that kept the bottom right clear slides away to the right. */
  cloud: [at("finale", 0), at("finale", 0.4)] as ProgressRange,
  /** The tree rises from the bottom center. */
  tree: [at("finale", 0.18), at("finale", 0.4)] as ProgressRange,
  /** The woman walks in from the left and settles. */
  woman: [at("finale", 0.32), at("finale", 0.5)] as ProgressRange,
  /** The man walks in from the right and settles. */
  man: [at("finale", 0.34), at("finale", 0.52)] as ProgressRange,
  /** The idle-time loop fades in once both have settled (and out again when scrolling back). */
  loop: [at("finale", 0.52), at("finale", 0.58)] as ProgressRange,
} as const;

/**
 * The falling orange's timings (progress). `src/components/stage/fall-plan.ts` choreographs on
 * these: as the camera comes to his face the gardener raises his shears to the foot of the branch
 * (`reach`) and squeezes them shut (`snip`); the branch comes free (`cut`) and falls, tumbling
 * (`branch`), and the tree springs back; he lowers the shears (`lower`) and drifts right and out of
 * frame (`gardener`). The orange falls from its stem in a true flight (`release`, `FALL_FLIGHT`) with
 * the camera following and pushing in until it fills the center; at the end of `release` it strikes
 * the sky as if it were water, the rainbow ring sweeping out from it (the `ring` transition), and
 * sinks, going soft (`soften`) and fading (`fade`) as the camera pulls back and dollies up between
 * the orchard rows (`push`).
 */
export const FALL = {
  /** He raises the shears to the foot of the branch. */
  reach: [at("fall", 0.1), at("fall", 0.18)] as ProgressRange,
  /** He opens them a little wider and squeezes them shut on it (it is cut at the end). */
  snip: [at("fall", 0.18), at("fall", 0.205)] as ProgressRange,
  /** The still branch (with its fruit) hands over to the cut branch and the orange, at rest, as it comes free. */
  cut: [at("fall", 0.205), at("fall", 0.21)] as ProgressRange,
  /** He lowers the shears. */
  lower: [at("fall", 0.25), at("fall", 0.34)] as ProgressRange,
  /** The gardener drifts right and out of frame. */
  gardener: [at("fall", 0.26), at("fall", 0.42)] as ProgressRange,
  /** The cut branch falls, tumbling, and is gone. */
  branch: [at("fall", 0.21), at("fall", 0.4)] as ProgressRange,
  /** The orange's flight, from its stem to where it strikes (the ring's origin, on the screen). */
  release: [at("fall", 0.21), at("fall", 0.45)] as ProgressRange,
  /** After the strike the camera pulls back from the sinking orange and starts up between the rows. */
  push: [at("fall", 0.45), at("fall", 0.55)] as ProgressRange,
  /** The orange goes soft and out of focus. */
  soften: [at("fall", 0.45), at("fall", 0.72)] as ProgressRange,
  /** The orange fades out for good before the scene ends. */
  fade: [at("fall", 0.84), at("fall", 1)] as ProgressRange,
} as const;

/**
 * The falling orange's flight (world units, seconds of story time), shared by the camera that follows
 * it (CAMERA) and the art that draws it (`fall-plan.ts`): it leaves its stem from rest, under a light
 * air drag, taking up a spin; where the flight ends (`FALL.release`) it meets
 * the sky as if it were water, and the drag that takes its speed rises to `water` (its speed never
 * jumps, only how fast it changes), and it sinks, buoyed, still turning a little.
 */
export const FALL_FLIGHT = {
  /** Air drag, per second (it leaves its stem from rest). */
  air: 0.55,
  /** Drag once it has struck, per second. */
  water: 24,
  /** Share of gravity it still feels once in. */
  sinking: 0.15,
  /** The spin it takes up as it goes (radians per second, clockwise), and how quickly (seconds): the stem's snap turns it from rest. */
  spin: -2.4,
  spinUp: 0.2,
  /** How far it is pressed flat as it strikes (a share of its height), and how it rings back (cycles per second, decay per second). */
  squash: { amount: 0.16, frequency: 3.2, decay: 9 },
} as const;

/**
 * Physics on the scrubbed stage (`src/components/stage/motion-kit.ts`): how many seconds of story
 * time one screen of scrolling stands for, so things fall, ring and settle at a believable pace, and
 * gravity in world units (an adult is 1.75 tall: a world unit is about a metre). Story time is a
 * function of progress, so every fall and every settle plays backwards exactly. At a reading pace (a
 * screen in about two seconds) the story's physics runs at half speed; scrolled briskly, in real time.
 */
export const PHYSICS = {
  secondsPerScreen: 1,
  gravity: 9.81,
} as const;

/** The fruit on the branch the gardener cuts: where the orange's flight starts. */
const STEM_FRUIT = platePoint("prune/branch-right", "fruit");
const flightAxisX: [number, number] = [0, 0];
const flightAxisY: [number, number] = [0, 0];

/**
 * Where the falling orange is (world, the middle of the ball) and how fast it moves (m/s) at progress
 * p, from `FALL_FLIGHT` (`src/lib/flight.ts`): on its stem before `FALL.release`, in the air, then
 * sinking. A function of progress alone. Writes into `out`.
 */
export function fallingOrangeAt(p: number, out: { x: number; y: number; vx: number; vy: number; t: number } = { x: 0, y: 0, vx: 0, vy: 0, t: 0 }) {
  const seconds = (q: number) => (q / SCREEN) * PHYSICS.secondsPerScreen;
  const t = Math.max(0, seconds(p - FALL.release[0]));
  const strike = seconds(FALL.release[1] - FALL.release[0]);
  const g = PHYSICS.gravity;
  const air = Math.min(t, strike);
  dragAxis(STEM_FRUIT[0], 0, 0, FALL_FLIGHT.air, air, flightAxisX);
  dragAxis(STEM_FRUIT[1], 0, -g, FALL_FLIGHT.air, air, flightAxisY);
  if (t > strike) {
    const s = t - strike;
    dragAxis(flightAxisX[0], flightAxisX[1], 0, FALL_FLIGHT.water, s, flightAxisX);
    dragAxis(flightAxisY[0], flightAxisY[1], -g * FALL_FLIGHT.sinking, FALL_FLIGHT.water, s, flightAxisY);
  }
  out.x = flightAxisX[0];
  out.y = flightAxisY[0];
  out.vx = flightAxisX[1];
  out.vy = flightAxisY[1];
  out.t = t;
  return out;
}

/**
 * Scrubbed acting of the painted figures (`src/components/stage/acting.ts`): small moves of a head, a
 * body or an arm that follow the story, so they play backwards exactly. Their idle life (breathing,
 * the hem in the breeze, small head and weight shifts) runs on idle time on top (`life.ts`).
 */
export const ACTING = {
  /** The onlookers' heads tip up further as the orange brightens (the glow's lift over the hero). */
  crowdLook: [at("hero", 0), at("hero", 1)] as ProgressRange,
  /** The harvester's head turns to the orange in his hand: it starts as his arm comes up and settles a beat after the arm has arrived. */
  harvesterHead: [PLUCK.armUp[0] + 0.6 * (PLUCK.armUp[1] - PLUCK.armUp[0]), PLUCK.release[1]] as ProgressRange,
  /** The architect leans in, her head bowing toward the plan, as it opens panel by panel. */
  architectLean: [BLUEPRINT.panels[0], BLUEPRINT.panels[1]] as ProgressRange,
  /** The astronomer's raised arm settles into the point as the fabric sky clears, before the stars grow from his fingertip. */
  astronomerArm: [at("stars", 0.06), STARS.grow[0]] as ProgressRange,
} as const;

/**
 * The painted surface, per scene (`src/components/stage/paint.ts`): a tiny colour grade on the
 * figure plates (warm highlights, cool shadows, a small saturation trim), so paintings made at
 * different times still match each other and the sky, and how strongly the faint craquelure shows
 * (strongest on the paper-cream scenes: the building site and the sheet unfolding into it).
 */
export interface ScenePaint {
  /** Highlights pushed toward the sun's warm cream, 0 to about 0.1. */
  warm: number;
  /** Shadows pushed toward the cool sky, 0 to about 0.1. */
  cool: number;
  /** Saturation change: -0.1 trims a tenth, 0 leaves it. */
  saturation: number;
  /** Craquelure strength, 0 (none) to 1 (the paper-cream scenes). */
  craquelure: number;
}

const SKY_PAINT: ScenePaint = { warm: 0.06, cool: 0.07, saturation: -0.06, craquelure: 0.45 };

export const SCENE_PAINT: Readonly<Record<SceneId, ScenePaint>> = {
  hero: { ...SKY_PAINT, cool: 0.08 },
  ascent: SKY_PAINT,
  graft: { ...SKY_PAINT, warm: 0.05 },
  pluck: SKY_PAINT,
  share: SKY_PAINT,
  work: SKY_PAINT,
  blueprint: { ...SKY_PAINT, craquelure: 0.6 },
  site: { warm: 0.07, cool: 0.04, saturation: -0.05, craquelure: 1 },
  prune: SKY_PAINT,
  fall: SKY_PAINT,
  faq: SKY_PAINT,
  stars: { ...SKY_PAINT, cool: 0.09 },
  apply: { ...SKY_PAINT, cool: 0.09 },
  finale: { ...SKY_PAINT, warm: 0.07 },
};

/**
 * The questions' deck (`src/components/story/question-plan.ts`, drawn by `question-deck.tsx`). All
 * five cards live in one pinned container and move along one arc: the first zooms up from small in
 * the center, the others arrive from the right; each swings left along the arc as it leaves (the
 * last one dissolves upward as smoke instead, with the section title). One shared connector ties the
 * card on screen to an orange in the orchard: the line's end is fixed on that orange (a named point
 * on a near orchard plate, projected to the screen every frame) and its small square stays locked to
 * the card's corner while the card moves. The anchors alternate between the left and right rows, and
 * each card locks to a different corner than the one before it, so the line runs at about 45 degrees
 * while the card is read. The line draws out from the orange to the corner as the card arrives
 * (`draw`). The camera climbs between the rows one step per card (`climb`, see CAMERA), each step
 * landing while its card arrives, so the orange holds still on screen while the card is read.
 */
const lineDraw = (q: BeatDef): ProgressRange => [round6(q.in + 0.45 * (q.hold[0] - q.in)), round6(q.hold[0] + 0.2 * SCREEN)];

const questionCard = (n: 1 | 2 | 3 | 4 | 5, row: "left" | "right", corner: CardCorner): QuestionCardDef => ({
  beat: `question-${n}`,
  arrive: n === 1 ? "zoom" : "arc",
  anchor: { plate: `fall/trees-${row}-near`, point: `question-${n}` },
  corner,
  draw: lineDraw(QUESTIONS[n - 1]),
});

export const FAQ = {
  cards: [
    questionCard(1, "left", "top-left"),
    questionCard(2, "right", "bottom-right"),
    questionCard(3, "left", "bottom-left"),
    questionCard(4, "right", "top-right"),
    questionCard(5, "left", "top-left"),
  ] as readonly QuestionCardDef[],
  /** Camera height (world y) as the questions start, and how far it climbs per card. */
  climb: { from: 1, step: 0.7 },
} as const;

/** Camera position (and target, a little above it) after `n` climbing steps of the questions. */
const faqCamera = (n: number): [Vec3, Vec3] => {
  const y = round6(FAQ.climb.from + FAQ.climb.step * n);
  return [
    [0, y, 12],
    [0, round6(y + 1), 0],
  ];
};

/* The shots: each figure's from its row of the framing table (`framing.ts`), the rest from the art they look at. */

const STATUE = framedKey("statue");

/** The statue's box once the ascent has raised it by fraction `t` of the scene (the rise of `ASCENT`). */
/**
 * The share of the ascent's rise done at fraction t (0 to 1) of the scene: t^risePower, from rest and
 * faster and faster, until the last `riseSettle` of the scene, where a cubic takes it on at the same
 * speed and brings it to rest at the full rise. Shared by the art (`ascent-tree.ts`) and the camera.
 */
export function ascentRiseShare(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const k = ASCENT.risePower;
  const from = 1 - ASCENT.riseSettle;
  if (u <= from) return u ** k;
  const h = 1 - from;
  const s = (u - from) / h;
  const p0 = from ** k;
  const m0 = k * from ** (k - 1) * h;
  return (2 * s ** 3 - 3 * s * s + 1) * p0 + (s ** 3 - 2 * s * s + s) * m0 + (-2 * s ** 3 + 3 * s * s);
}

const risenStatue = (t: number): WorldBox => {
  const box = plateBox("hero/statue");
  const rise = ASCENT.riseTotal * ascentRiseShare(t);
  return { ...box, y0: box.y0 + rise, y1: box.y1 + rise };
};

/** A shot of a subject with its own phone placement: the laptop's pose and the pan to the phone's. */
const withPhone = (spec: ShotSpec, phone: Omit<ShotSpec, "fov" | "aspect" | "box">): Shot & { pan: Pan } => {
  const s = shot(spec);
  return { ...s, pan: phonePan(s, { ...phone, box: spec.box }) };
};

/** The ascent pushes in on the rising statue, pans down the trunk below her, and settles on the branch the graft is made on. */
const ASCENT_PUSH = withPhone({ box: risenStatue(0.28), height: 0.8, at: [0.62, 0.5], fov: 33.5 }, { height: 0.6, at: [0.5, 0.5] });
const ASCENT_TRUNK = withPhone({ box: risenStatue(0.55), height: 0.85, pin: [0.5, 1], at: [0.56, 0.16], fov: 32 }, { height: 0.62, pin: [0.5, 1], at: [0.5, 0.3] });
const ASCENT_BRANCH = withPhone({ box: plateBox("graft/branch"), width: 0.55, at: [0.5, 0.5], fov: 31 }, { width: 0.7, at: [0.5, 0.5] });

const GRAFT_HANDS = framedKey("graftHands");
/** The fruiting tree as the graft pulls out to it: the near foliage fills the frame, the special orange in the middle. */
const HERO_ORANGE: readonly [number, number] = [plateEntry("pluck/hero-orange").position[0], plateEntry("pluck/hero-orange").position[1]];
const FRUITING_TREE = withPhone({ box: plateBox("pluck/foliage-near"), height: 1.25, pinWorld: HERO_ORANGE, at: [0.5, 0.48], fov: 36 }, { height: 0.85, pinWorld: HERO_ORANGE, at: [0.5, 0.5] });
const HARVESTER = framedKey("harvester");
const HALVES = framedKey("shareHands");
/** Under the sand: into the halves (it happens unseen). */
const INTO_HALVES = shot({ box: unionBox(plateBox("share/peel-left"), plateBox("share/peel-right")), width: 0.32, pinWorld: [platePoint("share/arm-open", "orange")[0], platePoint("share/arm-open", "orange")[1]], at: [0.5, 0.47], fov: 28 });

/** The work's dolly up through the clouds, and the builder the camera closes in on during the third card. */
const CLOUDS_LOW: Vec3 = [0, 0, 14];
const CLOUDS_HIGH: Vec3 = [0, 8.5, 13.5];
const WORK_BUILDER = framedKey("workBuilder");
const BLUEPRINT_BUILDER = framedKey("blueprintBuilder");
const ARCHITECT = framedKey("architect");
/** Into the open plan, in her hands, as the paper unfold covers the screen. */
const OPEN_PLAN = unionBox(plateBox("blueprint/plan-1"), plateBox("blueprint/plan-4"));
const INTO_PLAN = shot({
  box: { x0: OPEN_PLAN.x0 + PLAN_HELD[0], x1: OPEN_PLAN.x1 + PLAN_HELD[0], y0: OPEN_PLAN.y0 + PLAN_HELD[1], y1: OPEN_PLAN.y1 + PLAN_HELD[1], z: -PLAN_DEPTH },
  width: 1.15,
  at: [0.5, 0.5],
  fov: 34,
});

const SITE_BUILDER = framedKey("siteBuilder");
/** The whole site at ground level, the sea behind it: where the rise to straight above starts. */
const SITE_WIDE: Vec3 = [0, 1.2, 12];
const TOP_DOWN: Vec3 = [0, 13, 0.01];
const TOP_DOWN_FAR: Vec3 = [0, 24, 0.01];

const GARDENER = framedKey("gardener");
/** Toward the gardener's face (his head, from his rig), before he drifts out of the frame to the right. */
const GARDENER_FACE = withPhone({ box: rigBox("prune/gardener", "head"), height: 0.5, at: [0.56, 0.4], fov: 32 }, { height: 0.35, at: [0.5, 0.42] });

/** Following the falling orange: the field of view, and how near the camera is as it strikes (the orange fills the center). */
const FOLLOW_FOV = 32;
const STRIKE_DISTANCE = 0.65;
/** The keys of the follow (fractions of the scene) and the camera's distance from the orange there. */
const FOLLOW: readonly (readonly [number, number])[] = [
  [0.3, 0.95],
  [0.36, 0.85],
  [0.41, 0.74],
];
/** After the strike the camera eases back from the sinking orange and carries on down a little past it (it sits this share of the half-height above the middle) before it climbs between the rows. */
const AFTER_STRIKE = -0.2;
const AFTER_DISTANCE = 1.5;
/** The ring's origin on the screen, below the middle by this share of the half-height (the orange is there as it strikes). */
const RING_BELOW = (() => {
  const ring = TRANSITIONS.find((t) => t.id === "ring");
  return ring?.origin ? (ring.origin[1] - 0.5) * 2 : 0;
})();
/**
 * The camera on the falling orange at progress p (`fallingOrangeAt`), `distance` in front of it,
 * looking straight at it, the orange at the ring's origin on the screen (or `below` of the
 * half-height under the middle).
 */
const followOrange = (p: number, distance: number, fov = FOLLOW_FOV, below = RING_BELOW): [Vec3, Vec3] => {
  const o = fallingOrangeAt(p);
  const y = round6(o.y + below * distance * Math.tan((fov * Math.PI) / 360));
  return [
    [round6(o.x), y, distance],
    [round6(o.x), y, 0],
  ];
};

const ASTRONOMER = framedKey("astronomer");
const KEEPERS = framedKey("keepers");

/** No pan: a phone films the laptop's frame, fitted to its shape. */
const NO_PAN: Pan = [0, 0, 0];

/** Where the work's dolly through the clouds has got to at progress p: on its straight line, so adding a key there keeps the move. */
const cloudsAt = (p: number): Vec3 => {
  const t = (p - SAND_CLEARING) / (at("work", 0.97) - SAND_CLEARING);
  return [round6(CLOUDS_LOW[0] + (CLOUDS_HIGH[0] - CLOUDS_LOW[0]) * t), round6(CLOUDS_LOW[1] + (CLOUDS_HIGH[1] - CLOUDS_LOW[1]) * t), round6(CLOUDS_LOW[2] + (CLOUDS_HIGH[2] - CLOUDS_LOW[2]) * t)];
};
const CARD_THREE = cloudsAt(WORK.rise[0]);

export const CAMERA: readonly CameraKey[] = [
  // Hero: still, the statue large on the right third, the onlookers' heads along the bottom.
  shotKey("hero", at("hero", 0), "hold", STATUE),
  // Ascent: push in on the statue, ease into a pan along the rising trunk, settle on the branch of the graft.
  shotKey("ascent", at("ascent", 0), "push", STATUE),
  shotKey("ascent", at("ascent", 0.28), "push", ASCENT_PUSH),
  shotKey("ascent", at("ascent", 0.55), "pan", ASCENT_TRUNK),
  shotKey("ascent", at("ascent", 0.85), "dolly-up", ASCENT_BRANCH),
  // Graft: steady on the hands while they work, then dolly up and pull out to the fruiting tree.
  shotKey("graft", at("graft", 0), "hold", GRAFT_HANDS),
  shotKey("graft", at("graft", 0.62), "pull", GRAFT_HANDS),
  // Pluck: the hand rises, then the camera dollies down through the branches to the harvester.
  shotKey("pluck", at("pluck", 0), "hold", FRUITING_TREE),
  shotKey("pluck", PLUCK.dolly[0], "dolly-down", FRUITING_TREE),
  shotKey("pluck", PLUCK.dolly[1], "hold", HARVESTER),
  // Share: the cut, a push into the hands and the orange, the halves held, a push into the halves under the sand.
  shotKey("share", at("share", 0), "hold", HARVESTER),
  shotKey("share", at("share", 0.22), "push", HARVESTER),
  shotKey("share", at("share", 0.45), "hold", HALVES),
  shotKey("share", at("share", 0.72), "push", HALVES),
  shotKey("share", SAND_COVERED, "reframe", INTO_HALVES, HALVES.pan),
  // Work: a slow dolly upward through the clouds; as the third card arrives the camera closes in on
  // the builder rising with the giant orange, left of the card. The blueprint opens on the same
  // frame, so the crossfade into it does not move the camera.
  key("work", SAND_CLEARING, "dolly-up", CLOUDS_LOW, [CLOUDS_LOW[0], CLOUDS_LOW[1] + 0.5, 0], 40, NO_PAN),
  key("work", WORK.rise[0], "push", CARD_THREE, [CARD_THREE[0], CARD_THREE[1] + 0.5, 0], 39.5, NO_PAN),
  shotKey("work", at("work", 0.97), "hold", WORK_BUILDER),
  // Blueprint: the scaffold appears around the builder of the work; across to the builder on his
  // platform, down the scaffold to the architect holding the folded plan, then into the plan as it opens in her hands.
  shotKey("blueprint", at("blueprint", 0), "pan", WORK_BUILDER),
  shotKey("blueprint", at("blueprint", 0.12), "hold", BLUEPRINT_BUILDER),
  shotKey("blueprint", BLUEPRINT.toArchitect[0], "pan", BLUEPRINT_BUILDER),
  shotKey("blueprint", BLUEPRINT.panels[0], "push", ARCHITECT),
  shotKey("blueprint", UNFOLD_COVERED, "reframe", INTO_PLAN, ARCHITECT.pan),
  // Site: a builder at work at ground level; pull back to the whole site by the sea, rise to
  // top-down, then pull out as the view shrinks into the left half.
  shotKey("site", UNFOLD_CLEARING, "hold", SITE_BUILDER),
  shotKey("site", SITE.rise[0], "pull", SITE_BUILDER),
  key("site", at("site", 0.29), "dolly-up", SITE_WIDE, [SITE_WIDE[0], SITE_WIDE[1] - 0.2, 0], 38, NO_PAN),
  key("site", SITE.rise[1], "pull", TOP_DOWN, [0, 0, 0], 38, NO_PAN),
  key("site", SITE.shrink[1], "hold", TOP_DOWN_FAR, [0, 0, 0], 38, NO_PAN),
  key("site", DUST_COVERED, "reframe", TOP_DOWN_FAR, [0, 0, 0], 38, NO_PAN),
  // Prune: the gardener at work, waist up beside his tree.
  shotKey("prune", DUST_CLEARING, "hold", GARDENER),
  // Fall: toward the gardener's face, follow the orange down, push into it, then dolly up the rows.
  shotKey("fall", at("fall", 0), "push", GARDENER),
  shotKey("fall", FALL.cut[0], "dolly-down", GARDENER_FACE),
  ...FOLLOW.map(([f, distance]) => key("fall", at("fall", f), "dolly-down", ...followOrange(at("fall", f), distance), FOLLOW_FOV, NO_PAN)),
  key("fall", FALL.release[1], "push", ...followOrange(FALL.release[1], STRIKE_DISTANCE), FOLLOW_FOV, NO_PAN),
  key("fall", at("fall", 0.47), "pull", ...followOrange(at("fall", 0.47), 0.72), FOLLOW_FOV, NO_PAN),
  key("fall", FALL.push[1], "dolly-up", ...followOrange(FALL.push[1], AFTER_DISTANCE, 30, AFTER_STRIKE), 30, NO_PAN),
  // Questions: climb between the rows one step per card, while the card arrives, and hold while it
  // is read (so its orange holds still under the line); then forward into the blue as the last card
  // dissolves, under the fabric sky.
  key("faq", at("faq", 0), "hold", ...faqCamera(0), 40),
  ...QUESTIONS.flatMap((q, i) => [key("faq", q.in, "dolly-up", ...faqCamera(i), 40), key("faq", q.hold[0], "hold", ...faqCamera(i + 1), 40)]),
  key("faq", LAST_QUESTION.hold[1], "push", ...faqCamera(QUESTIONS.length), 40),
  key("faq", FABRIC_COVERED, "reframe", [0, 5, 6], [0, 6, 0], 38),
  // Stars: the astronomer and the growing constellation.
  shotKey("stars", FABRIC_CLEARING, "hold", ASTRONOMER),
  // Application: the frame stays still while he steps down the sky.
  shotKey("apply", at("apply", 0), "hold", ASTRONOMER),
  // Finale: still while he sinks away, then down to the keepers as the tree rises and they walk in.
  shotKey("finale", at("finale", 0), "hold", ASTRONOMER),
  shotKey("finale", FINALE.tree[0], "dolly-down", ASTRONOMER),
  shotKey("finale", FINALE.man[1], "hold", KEEPERS),
];

/**
 * Where the framing table is checked (`npm run framing`): each row at the key that films it. The
 * onlookers are checked in the statue's shot.
 */
export const FRAMED: readonly { framing: FramingId; at: number }[] = [
  { framing: "statue", at: at("hero", 0) },
  { framing: "onlookers", at: at("hero", 0) },
  { framing: "graftHands", at: at("graft", 0) },
  { framing: "harvester", at: PLUCK.dolly[1] },
  { framing: "shareHands", at: at("share", 0.45) },
  { framing: "workBuilder", at: at("work", 0.97) },
  { framing: "blueprintBuilder", at: at("blueprint", 0.12) },
  { framing: "architect", at: BLUEPRINT.panels[0] },
  { framing: "siteBuilder", at: UNFOLD_CLEARING },
  { framing: "gardener", at: DUST_CLEARING },
  { framing: "astronomer", at: FABRIC_CLEARING },
  { framing: "keepers", at: FINALE.man[1] },
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
  { tone: "milk", start: SITE.topDownIn[1], end: SITE.end }, // once the sand and tiles have replaced the sea
];

/* ------------------------------------------------------------------ */
/* Phones                                                              */
/* ------------------------------------------------------------------ */

/**
 * The same script on a phone (a stacked screen, under `STACKED_MAX_WIDTH`): the stage is shorter,
 * and each scene keeps a share of it. `weights` multiply a scene's share of the scroll before the
 * result is scaled to the shorter stage (`src/scroll/mobile.ts`), so the scenes that carry text
 * keep their reading time while the long camera moves tighten. Nothing else changes: every
 * progress value in this file is the same on every screen, and only the scroll distance between
 * them differs.
 */
export const MOBILE = {
  /** Width (px) under which the page is laid out stacked: one column, text above and below the art. */
  stackedMaxWidth: 767,
  /** The stage is this share of the desktop stage's height (about 70%). */
  stageScale: 0.7,
  /** Per scene: how much of its desktop scroll length it keeps, before the stage is scaled to fit. */
  weights: {
    hero: 1.15,
    ascent: 0.62,
    graft: 0.62,
    pluck: 0.98,
    share: 0.72,
    work: 1,
    blueprint: 0.64,
    site: 0.82,
    prune: 0.82,
    fall: 0.62,
    faq: 0.92,
    stars: 0.52,
    apply: 0.82,
    finale: 0.62,
  } satisfies Record<SceneId, number>,
} as const;

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
