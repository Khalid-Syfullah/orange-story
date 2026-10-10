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

const key = (scene: SceneId, p: number, move: CameraMove, position: Vec3, target: Vec3, fov: number, pan?: readonly [number, number]): CameraKey => ({
  scene,
  at: round6(p),
  position,
  target,
  fov,
  move,
  ...(pan ? { pan } : {}),
});

const [SAND_COVERED, SAND_CLEARING] = peakOf("sand");
const [UNFOLD_COVERED, UNFOLD_CLEARING] = peakOf("unfold");
const [DUST_COVERED, DUST_CLEARING] = peakOf("dust");
const [FABRIC_COVERED, FABRIC_CLEARING] = peakOf("fabric");

const HERO_WIDE: Vec3 = [0, 0, 14];
/** On a phone the statue and the crowd sit in the middle band: the camera slides toward them and up, below the title. */
const HERO_PAN = [2, 0.75] as const;
const BRANCH: Vec3 = [2, 8.4, 5.5];
const FRUITING_TREE: Vec3 = [1.6, 11, 12];
const HARVESTER: Vec3 = [1.4, 4.2, 9];
const HALVES: Vec3 = [1.5, 4.5, 4.8];
const TOP_DOWN: Vec3 = [0, 13, 0.01];
const TOP_DOWN_FAR: Vec3 = [0, 24, 0.01];
/**
 * The gardener on his column sits right of center on a wide screen, so the fit text at the bottom
 * left reads on clear sky; on a tall phone screen (`pan`) the camera centers him again and lifts the
 * picture a little, above the text at the bottom.
 */
const GARDENER: Vec3 = [-1.9, 0, 12];
const GARDENER_TARGET: Vec3 = [-1.9, 0.5, 0];
const GARDENER_PAN = [1.9, -0.6] as const;
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

/**
 * The graft's own timings (progress). The art in `src/components/stage/graft-hands.ts` choreographs
 * on these: the hands come in carrying the cutting, fit it to the cleft, wrap the twine, tie the
 * knot in three steps (each step swaps in the next knot frame), then withdraw. The camera is steady
 * on the branch until `pullOut` (see CAMERA), when it dollies up and pulls out; the fruiting tree
 * fills in with oranges among the leaves while it does.
 */
export const GRAFT = {
  /** The hands enter from the lower corners. */
  enter: [at("graft", 0.02), at("graft", 0.16)] as ProgressRange,
  /** The cutting is fitted to the cleft. */
  fit: [at("graft", 0.16), at("graft", 0.28)] as ProgressRange,
  /** The twine winds around the joint. */
  wrap: [at("graft", 0.28), at("graft", 0.38)] as ProgressRange,
  /** The knot: three steps, [start, end] each. */
  knot: [
    [at("graft", 0.38), at("graft", 0.44)],
    [at("graft", 0.44), at("graft", 0.5)],
    [at("graft", 0.5), at("graft", 0.56)],
  ] as readonly ProgressRange[],
  /** The hands let go and leave. */
  exit: [at("graft", 0.56), at("graft", 0.64)] as ProgressRange,
  /** The camera dollies up and pulls out from here (the second graft camera key). */
  pullOut: [at("graft", 0.62), at("pluck", 0)] as ProgressRange,
  /** Oranges and leaves fill the tree. */
  fruit: [at("graft", 0.64), at("graft", 0.96)] as ProgressRange,
} as const;

/**
 * The pluck's own timings (progress). The art in `src/components/stage/pluck-harvest.ts` choreographs
 * on these: the hand rises from the bottom center to the hero orange, closes on it (where the
 * "We get you found." beat arrives), then the camera dollies down through the branches (`dolly`, the
 * pluck camera keys) while the hand pulls the fruit free and carries it down with the camera. The
 * foliage layers fall away behind the camera, the hand lets go, and the harvester is revealed
 * holding the orange in his right hand (his arm arrives once the fruit has reached it).
 */
export const PLUCK = {
  /** The hand rises from below the frame to the orange. */
  rise: [at("pluck", 0.02), at("pluck", 0.24)] as ProgressRange,
  /** The fingers close on the orange. */
  grasp: [at("pluck", 0.22), at("pluck", 0.3)] as ProgressRange,
  /** The tug: the fruit comes free of its branch. */
  tug: [at("pluck", 0.33), at("pluck", 0.43)] as ProgressRange,
  /** The camera dollies down to the harvester; the hand and the fruit travel with it. */
  dolly: [at("pluck", 0.35), at("pluck", 0.74)] as ProgressRange,
  /** The near and middle foliage fall away as the camera passes below the branches. */
  foliage: {
    near: [at("pluck", 0.36), at("pluck", 0.5)] as ProgressRange,
    mid: [at("pluck", 0.44), at("pluck", 0.64)] as ProgressRange,
  },
  /**
   * The harvester appears (body, arm with the orange, head) as the camera comes down to him: he
   * enters the frame from below while the dolly is under way, and the camera lands on him at
   * `dolly[1]`.
   */
  reveal: [at("pluck", 0.44), at("pluck", 0.66)] as ProgressRange,
  /** The hand lets go and drops away, as the harvester's own hand takes the fruit (`handoff`). */
  release: [at("pluck", 0.71), at("pluck", 0.8)] as ProgressRange,
  /** The fruit becomes the one in the harvester's hand (once the carry has all but landed): his arm arrives as the hero orange gives way. */
  handoff: [at("pluck", 0.71), at("pluck", 0.77)] as ProgressRange,
} as const;

/**
 * The share's own timings (progress). The art in `src/components/stage/share-cut.ts` choreographs
 * on these: his left hand comes in with the knife and plunges it down through the orange he holds
 * (the whole orange gives way to its two peels as the blade passes), the knife withdraws, the halves
 * open and their cut faces are revealed, a second hand reaches in from center left and takes the
 * left half, and both hands bring the halves together and hold them (the harvest, shared). The
 * camera pushes into the orange from `cut[0]`, holds on the halves, and pushes in again under the
 * viewfinder and the sand.
 */
export const SHARE = {
  /** The knife hand comes in above the orange. */
  knifeIn: [at("share", 0.02), at("share", 0.11)] as ProgressRange,
  /** The blade plunges down through the orange. */
  cut: [at("share", 0.11), at("share", 0.2)] as ProgressRange,
  /** Under the blade: the whole orange gives way to its two peels. */
  split: [at("share", 0.117), at("share", 0.127)] as ProgressRange,
  /** The knife hand withdraws. */
  knifeOut: [at("share", 0.2), at("share", 0.29)] as ProgressRange,
  /** The halves part and their cut faces are revealed. */
  open: [at("share", 0.19), at("share", 0.31)] as ProgressRange,
  /** The second hand reaches in from center left to the left half. */
  reach: [at("share", 0.27), at("share", 0.38)] as ProgressRange,
  /** It takes the half and draws it a little away. */
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
} as const;

/**
 * The blueprint's own timings (progress). The art in `src/components/stage/blueprint-plan.ts`
 * choreographs on these: the architect brings the folded drawing forward (`bring`), unfolds it panel
 * by panel (`panels`, four equal slices of the stretch) while the camera pushes in, and the workers
 * move while the plan is still closed.
 */
export const BLUEPRINT = {
  /** The folded drawing comes out and settles in front of the scaffold. */
  bring: [at("blueprint", 0.2), at("blueprint", 0.36)] as ProgressRange,
  /** The four fold panels open one after another. */
  panels: [at("blueprint", 0.36), at("blueprint", 0.8)] as ProgressRange,
  /** The builder's to-and-fro on his platform. */
  work: [at("blueprint", 0), at("blueprint", 0.5)] as ProgressRange,
} as const;

/**
 * The site's own timings (progress). The art in `src/components/stage/site-plan.ts` choreographs on
 * these: the builders work at ground level, the camera rises to a straight top-down view (`rise`,
 * the first two site camera keys), the side-view plates give way to the matching top-down set
 * (`sideOut`, `topDownIn`), the top-down view zooms out and shrinks into the left half (`shrink`,
 * the pull camera move) while the tiled ground grows into a large field around it (`tiles`), and
 * the right half becomes the milk-white panel with its leaf shadows (`panel`) until the dust covers
 * it (`end`).
 */
export const SITE = {
  /** The builders' to-and-fro while the camera is still near the ground. */
  work: [at("site", 0.12), at("site", 0.36)] as ProgressRange,
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
 * these: the cut branch drops (`cut`, `branch`), the gardener drifts right and out of frame
 * (`gardener`), the orange falls from the branch with the camera following it (`release`), the
 * camera pushes into it until it fills the center (`push`), the rainbow ring sweeps out from it
 * (the `ring` transition) and the orange goes soft (`soften`) while it keeps falling out of the
 * bottom of the frame (`exit`, `fade`) as the camera dollies up between the orchard rows.
 */
export const FALL = {
  /** The still branch (with its fruit) hands over to the dropping cut branch and the orange. */
  cut: [at("fall", 0.07), at("fall", 0.085)] as ProgressRange,
  /** The cut branch drops, turning, and is gone. */
  branch: [at("fall", 0.085), at("fall", 0.4)] as ProgressRange,
  /** The gardener drifts right and out of frame. */
  gardener: [at("fall", 0.1), at("fall", 0.32)] as ProgressRange,
  /** The orange falls from the branch to the middle of the frame (the ring's origin). */
  release: [at("fall", 0.085), at("fall", 0.45)] as ProgressRange,
  /** The camera pushes into the orange until it fills the center. */
  push: [at("fall", 0.45), at("fall", 0.55)] as ProgressRange,
  /** The orange goes soft and out of focus. */
  soften: [at("fall", 0.45), at("fall", 0.72)] as ProgressRange,
  /** The orange keeps falling, out of the bottom of the frame. */
  exit: [at("fall", 0.55), at("fall", 1)] as ProgressRange,
  /** The orange fades out for good before the scene ends. */
  fade: [at("fall", 0.84), at("fall", 1)] as ProgressRange,
} as const;

/**
 * Scrubbed acting of the painted figures (`src/components/stage/acting.ts`): small moves of a head, a
 * body or an arm that follow the story, so they play backwards exactly. Their idle life (breathing,
 * the hem in the breeze, small head and weight shifts) runs on idle time on top (`life.ts`).
 */
export const ACTING = {
  /** The onlookers' heads tip up further as the orange brightens (the glow's lift over the hero). */
  crowdLook: [at("hero", 0), at("hero", 1)] as ProgressRange,
  /** The harvester's head turns to the orange as he takes it from the hand. */
  harvesterHead: [PLUCK.reveal[1], PLUCK.handoff[1]] as ProgressRange,
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

export const CAMERA: readonly CameraKey[] = [
  // Hero: wide and still.
  key("hero", at("hero", 0), "hold", HERO_WIDE, [0, 0, 0], 35, HERO_PAN),
  // Ascent: push in on the statue, ease into a pan and dolly along the trunk, settle on one branch.
  key("ascent", at("ascent", 0), "push", HERO_WIDE, [0, 0, 0], 35),
  key("ascent", at("ascent", 0.28), "push", [2.1, 2.5, 9.6], [2.5, 2.9, 0], 33.5, [0, 0]),
  key("ascent", at("ascent", 0.55), "pan", [2.6, 4.6, 7.5], [2.8, 4.9, 0], 32),
  key("ascent", at("ascent", 0.85), "dolly-up", [2.2, 6.4, 6.5], [2.2, 6.6, 0], 31),
  // Graft: steady on the branch while the hands work, then dolly up and pull out to the fruiting tree.
  key("graft", at("graft", 0), "hold", BRANCH, [2, 8.4, 0], 30),
  key("graft", at("graft", 0.62), "pull", BRANCH, [2, 8.4, 0], 30),
  // Pluck: the hand rises, then the camera dollies down through the branches to the harvester.
  key("pluck", at("pluck", 0), "hold", FRUITING_TREE, [1.6, 10.5, 0], 36),
  key("pluck", PLUCK.dolly[0], "dolly-down", FRUITING_TREE, [1.6, 10.5, 0], 36),
  key("pluck", PLUCK.dolly[1], "hold", HARVESTER, [1.4, 4.2, 0], 34),
  // Share: the cut, a push into the orange, the halves held, a push into the halves under the sand.
  key("share", at("share", 0), "hold", HARVESTER, [1.4, 4.2, 0], 34),
  key("share", at("share", 0.22), "push", HARVESTER, [1.4, 4.2, 0], 34),
  key("share", at("share", 0.45), "hold", HALVES, [1.5, 4.5, 0], 30),
  key("share", at("share", 0.72), "push", HALVES, [1.5, 4.5, 0], 30),
  key("share", SAND_COVERED, "reframe", [1.5, 4.5, 2.2], [1.5, 4.5, 0], 28),
  // Work: a slow dolly upward through the clouds, ending close to the blueprint's scaffold shot so
  // the crossfade into it barely moves the camera.
  key("work", SAND_CLEARING, "dolly-up", [0, 0, 14], [0, 0.5, 0], 40),
  key("work", at("work", 0.97), "dolly-up", [0, 8.5, 13.5], [0, 9, 0], 39),
  // Blueprint: the scaffold, then a push into the plan as it unfolds.
  key("blueprint", at("blueprint", 0), "hold", [0, 9, 13], [0, 9.5, 0], 38),
  key("blueprint", at("blueprint", 0.35), "push", [0, 9, 13], [0, 9.5, 0], 38),
  key("blueprint", UNFOLD_COVERED, "reframe", [0, 9.6, 2.6], [0, 9.6, 0], 34),
  // Site: rise from ground level to top-down, then pull out as the view shrinks into the left half.
  key("site", UNFOLD_CLEARING, "hold", [0, 1.2, 12], [0, 1, 0], 38),
  key("site", SITE.rise[0], "dolly-up", [0, 1.2, 12], [0, 1, 0], 38),
  key("site", SITE.rise[1], "pull", TOP_DOWN, [0, 0, 0], 38),
  key("site", SITE.shrink[1], "hold", TOP_DOWN_FAR, [0, 0, 0], 38),
  key("site", DUST_COVERED, "reframe", TOP_DOWN_FAR, [0, 0, 0], 38),
  // Prune: the gardener at work.
  key("prune", DUST_CLEARING, "hold", GARDENER, GARDENER_TARGET, 35, GARDENER_PAN),
  // Fall: toward the gardener's face, follow the orange down, push into it, then dolly up the rows.
  key("fall", at("fall", 0), "push", GARDENER, GARDENER_TARGET, 35),
  key("fall", at("fall", 0.22), "dolly-down", [0.4, 2.2, 6.5], [0.4, 2.2, 0], 32, [0, 0]),
  key("fall", at("fall", 0.45), "push", [0, -3, 5], [0, -3, 0], 32),
  key("fall", FALL.push[1], "dolly-up", [0, -4, 2.6], [0, -4, 0], 30),
  // Questions: climb between the rows one step per card, while the card arrives, and hold while it
  // is read (so its orange holds still under the line); then forward into the blue as the last card
  // dissolves, under the fabric sky.
  key("faq", at("faq", 0), "hold", ...faqCamera(0), 40),
  ...QUESTIONS.flatMap((q, i) => [key("faq", q.in, "dolly-up", ...faqCamera(i), 40), key("faq", q.hold[0], "hold", ...faqCamera(i + 1), 40)]),
  key("faq", LAST_QUESTION.hold[1], "push", ...faqCamera(QUESTIONS.length), 40),
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
