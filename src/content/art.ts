// The art manifest: one typed entry per asset id in docs/PAINTINGS.md.
//
// Every image, video and frame sequence on the stage is referenced through this file and served
// from public/art/ (written by `npm run art:import`, which paints a placeholder for any missing
// source, so every path below always exists once phase 3 has run).
//
// Coordinates: anchor points are in PAINTING coordinates, 0..1 across the painting's own width
// and height, x to the right, y DOWN (0,0 = top-left of the painting, 1,1 = bottom-right). They are
// independent of the viewport; the stage maps them to the screen with `uncover()`. When real art
// replaces a placeholder, these numbers are the ones to retune (by eye, in the dev HUD).
//
// Layout on disk (see docs/PAINTINGS.md and scripts/art-import.mjs):
//   still   /art/<id>/1440.jpg, /art/<id>/768.jpg
//   frames  /art/<id>/1440/f_000.jpg ..., /art/<id>/768/f_000.jpg ..., /art/<id>/manifest.json
//           manifest.json = {"tiers":{"1440":{"count":N},"768":{"count":N}}}
//   loop    /art/<id>.mp4 (H.264 1920x1080, 10 s) and /art/<id>-poster.jpg

export type ArtId =
  | "hero"
  | "bridge"
  | "graft"
  | "grove"
  | "share"
  | "plate"
  | "drawing"
  | "plan"
  | "coda"
  | "share-orange"
  | "canopy"
  | "application"
  | "sapling"
  | "finale";

export type ArtKind = "loop" | "still" | "frames";

/** Image tiers, chosen by viewport width (1440 on desktop, 768 on phones and small tablets). */
export type Tier = "1440" | "768";
export const TIERS: readonly Tier[] = ["1440", "768"];

/** A point in painting coordinates: 0..1, y down. */
export interface Point {
  x: number;
  y: number;
}

/** Per-shot framing used by cover(): pan in painting units (-0.5..0.5), zoom 1 = plain cover fit. */
export interface Framing {
  pan: Point;
  zoom: number;
}

/** A region of a painting in painting coordinates: top-left corner and size, 0..1, y down. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type StillTiers = Record<Tier, string>;

interface ArtBase {
  id: ArtId;
  kind: ArtKind;
  /** Width / height of the painting. */
  aspect: number;
  /** Human-readable aspect, as in docs/PAINTINGS.md. */
  aspectLabel: "16:9" | "9:16" | "1:1";
  /** Where the asset is used (docs/STORY.md). */
  usedIn: string;
  /** Default framing for the shot; later phases tune per shot (and per phone, phase 14). */
  framing: Framing;
}

export interface StillArt extends ArtBase {
  kind: "still";
  tiers: StillTiers;
}

export interface LoopArt extends ArtBase {
  kind: "loop";
  /** One encoded tier (1920x1080). */
  src: string;
  poster: string;
}

export interface FramesArt extends ArtBase {
  kind: "frames";
  /** Frame count from docs/PAINTINGS.md. The real count is read at runtime from manifest.json. */
  expectedCount: number;
  manifest: string;
  /** Directory per tier; frames are `${dir}/f_000.jpg` ... */
  tierDirs: StillTiers;
}

export type ArtEntry = StillArt | LoopArt | FramesArt;

// ---------------------------------------------------------------------------------------------
// Motion: the numbers the shared motion toolkit reads (src/stage/gl/lib.glsl.ts, twins in
// src/stage/motion.ts, docs/MOTION-RULES.md "The motion toolkit")
// ---------------------------------------------------------------------------------------------

/** A band [from, to] of a colour property, eased over +-soft at each end. */
export type Band = readonly [number, number];

/**
 * Colour bands the shader's masks read (lib.glsl.ts foliageMask, paleMask). Hue in turns (0 red,
 * 1/6 yellow, 1/3 green, 2/3 blue), saturation and luma 0..1. Measured on the real paintings
 * (docs/MOTION-AUDIT.md, "Masks"); a band reaching past 0 or 1 is open at that end.
 */
export const MASKS = {
  /** Leaves, lit yellow-green (hue 0.15) to dark olive (0.19); peel (0.06-0.09), gilt (0.11), bark (0.10) and sky (0.60) stay out. */
  foliage: { hue: [0.14, 0.47] as Band, sat: [0.2, 1.2] as Band, lum: [-0.2, 0.93] as Band, soft: 0.02 },
  /** Pale and unsaturated, any hue: a cream ground (sat 0.13, luma 0.94), linen in light, marble, paper; skin (sat 0.5) stays out. */
  pale: { sat: [-0.2, 0.24] as Band, lum: [0.72, 1.2] as Band, soft: 0.06 },
} as const;

/** The wind (lib.glsl.ts windAt): gust cells per painting height, gust cells a second, the flutter's scale and speed as multiples of the gusts'. */
export interface Wind {
  scale: number;
  speed: number;
  flutter: number;
  flutterSpeed: number;
}

/** A painting's leaf sway: its wind, the sway at a full gust (painting heights) and the lattice its foliage mask is read on (painting heights). */
export interface Sway {
  wind: Wind;
  amp: number;
  cell: number;
}

/**
 * Two-layer depth parallax (lib.glsl.ts depthShift): the near and far layers' rates of the camera's
 * travel (1 = with the camera, as the flat picture moved) and the lattice the layer mask is read on
 * (painting heights; the larger, the more travel the warp can take before it would fold).
 */
export interface Depth {
  near: number;
  far: number;
  cell: number;
}

/**
 * The hero's response to the scroll's speed (lib.glsl.ts velAmount): the speed in px a frame at which
 * the response is 63% (`knee`; 40 is a hard flick), the camera's smear at a flick (painting widths),
 * the glint's extra brightness and the pour's extra spray (shares of the rest value at a full flick).
 */
export interface HeroVelocity {
  knee: number;
  smear: number;
  glint: number;
  pour: number;
}

/**
 * The hero sky's painted light (passes/hero/frag.ts), in the sky only and in the far layer's coordinates:
 * a grade (darker at the top, lighter toward the horizon) of `grade` of the colour, a haze toward the soft
 * sky blue at the horizon of `haze`, two scales of slow turbulence (`mottle`, `fine`, shares of the
 * colour) at `scale` cells a painting height drifting `drift` cells a second, and the softening of the
 * sky's hard cut-out edges (`soften`, painting heights of blur).
 */
export interface SkyLight {
  grade: number;
  haze: number;
  mottle: number;
  fine: number;
  scale: number;
  drift: number;
  soften: number;
}

/**
 * The hero's signal rings (passes/hero/rings.ts): `count` concentric rings of tiny halftone dots leave the
 * orange's crown and ripple outward over the sky, each with its own phase and largest radius (`minR` to `maxR`,
 * frame heights), slower the larger (`speed` cycles a second at radius 0, falling as 1 / (0.35 + radius)), a
 * hashed jitter on every cycle's reach and brightness (never a metronome); `cell` is the dot screen's pitch in
 * CSS px and `strength` the dots' opacity at the crest of a ring.
 */
export interface Rings {
  count: number;
  minR: number;
  maxR: number;
  speed: number;
  cell: number;
  strength: number;
}

const R16_9 = 16 / 9;
const R9_16 = 9 / 16;
const R1_1 = 1;

const NO_FRAMING: Framing = { pan: { x: 0, y: 0 }, zoom: 1 };

const stillTiers = (id: string): StillTiers => ({
  "1440": `/art/${id}/1440.jpg`,
  "768": `/art/${id}/768.jpg`,
});

const still = (
  id: ArtId,
  aspectLabel: ArtBase["aspectLabel"],
  usedIn: string,
): StillArt => ({
  id,
  kind: "still",
  aspect: aspectLabel === "16:9" ? R16_9 : aspectLabel === "9:16" ? R9_16 : R1_1,
  aspectLabel,
  usedIn,
  framing: { ...NO_FRAMING, pan: { ...NO_FRAMING.pan } },
  tiers: stillTiers(id),
});

const loop = (id: ArtId, usedIn: string): LoopArt => ({
  id,
  kind: "loop",
  aspect: R16_9,
  aspectLabel: "16:9",
  usedIn,
  framing: { ...NO_FRAMING, pan: { ...NO_FRAMING.pan } },
  src: `/art/${id}.mp4`,
  poster: `/art/${id}-poster.jpg`,
});

const frames = (
  id: ArtId,
  aspectLabel: ArtBase["aspectLabel"],
  expectedCount: number,
  usedIn: string,
): FramesArt => ({
  id,
  kind: "frames",
  aspect: aspectLabel === "16:9" ? R16_9 : aspectLabel === "9:16" ? R9_16 : R1_1,
  aspectLabel,
  usedIn,
  framing: { ...NO_FRAMING, pan: { ...NO_FRAMING.pan } },
  expectedCount,
  manifest: `/art/${id}/manifest.json`,
  tierDirs: { "1440": `/art/${id}/1440`, "768": `/art/${id}/768` },
});

// ---------------------------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------------------------

export const art = {
  hero: {
    ...loop("hero", "Hero"),
    /**
     * A 4.5% push-in so pointer parallax, drift, the orbit's layers and the bridge reel's handheld camera never
     * show the painting's edge (it was 2% before phase 18: on a 16:9 screen that left under 1% above and below).
     * The hero, the bridge's film and reel and the Model's first frame all read it through heroFraming, so
     * they stay one picture.
     */
    framing: { pan: { x: 0, y: 0 }, zoom: 1.045 },
    /**
     * The orbit (passes/hero/timeline.ts): over the hero the camera travels this far sideways (x) and
     * rises and falls (y, an arc that is back at 0 where the hero ends), painting units. Eased in from
     * rest. The bridge holds the end of it and relaxes it with its dolly.
     */
    orbit: { x: 0.022, y: 0.006 } as Point,
    /**
     * Two layers from the sky mask (the sky is far, the figures, the fruit and the steps near), as rates of
     * the orbit's travel from rest: the near layer moves 1.5x, the sky 0.3x, so the fruit and the women
     * slide across the sky and the halftone clouds. The mask lattice is 0.09 painting heights (about 81 px).
     */
    depth: { near: 1.5, far: 0.3, cell: 0.09 } satisfies Depth,
    /** Dotted rings rippling outward from the crown like a signal, over the sky (and over the bridge's ground until it is white). */
    rings: { count: 6, minR: 0.2, maxR: 0.95, speed: 0.045, cell: 4.4, strength: 0.6 } satisfies Rings,
    /** The scroll's speed on the camera's smear, the glint and the pour; bounded, 0 at rest. */
    velocity: { knee: 30, smear: 0.005, glint: 0.35, pour: 0.6 } satisfies HeroVelocity,
    /** The painted light of the flat cobalt sky; see SkyLight. */
    sky: { grade: 0.05, haze: 0.16, mottle: 0.035, fine: 0.02, scale: 2.4, drift: 0.012, soften: 0.0014 } satisfies SkyLight,
    anchors: {
      /** Rainbow glint on the peel: upper-left of the giant orange, where the light hits. */
      glint: { x: 0.64, y: 0.3 },
      /** Centre of the giant orange (the bridge keeps it in place; the ring leaves from the glint). */
      orange: { x: 0.7, y: 0.42 },
      /** The orange's crown, where the stem meets the peel: the signal rings ripple outward from here. */
      crown: { x: 0.675, y: 0.115 },
      /** Spout of the brass watering can held by the woman lower left. */
      spout: { x: 0.33, y: 0.7 },
      /** Where the halftone pour lands: the step below the spout. */
      pourEnd: { x: 0.37, y: 0.86 },
    },
  },

  bridge: {
    ...frames("bridge", "16:9", 121, "Hero to Model (morph)"),
    /**
     * The pan table, keyed to the reel's frames: rows of [frame, panX, panY] in painting units,
     * added to the hero's pan and linearly interpolated between rows (see bridgePanAt). It exists
     * so the orange stays exactly where the hero film had it while the real morph (which may drift
     * a little between frames) is retuned by eye in the dev HUD. Default: zero on every frame.
     */
    pans: [
      [0, 0, 0],
      [120, 0, 0],
    ] as readonly PanKey[],
  },

  graft: {
    ...still("graft", "16:9", "Model beat 1"),
    /** Each beat has its own pan; a small drift (painting units) is walked across the beat by scroll. */
    framing: { pan: { x: 0, y: 0 }, zoom: 1.04 },
    drift: { x: -0.028, y: 0.006 },
    /**
     * Depth: the pale cream ground is the far layer, the hands, branch, knife and leaves the near one;
     * the near slides 1.8x the camera's travel (the drift, the pointer, the ambient drift), the ground
     * 0.5x, so the hands move over the ground. The mask lattice is 0.1 painting heights (about 90 px):
     * the cream ground is flat, so the soft band it gives the layers' boundary does not show, and the
     * wider lattice lets the beat's slow lateral dolly (the drift, 0.028 of the width) part the layers
     * by about 22 px before the warp would fold (motion.ts depthTravelMax).
     */
    depth: { near: 1.8, far: 0.5, cell: 0.1 } satisfies Depth,
    /** The scion's leaves barely stir (the painting's own motion line): foliage mask x wind, a few px, held by the room the framing leaves. */
    sway: { wind: { scale: 1.2, speed: 0.22, flutter: 3, flutterSpeed: 3.5 }, amp: 0.006, cell: 0.02 } satisfies Sway,
    /** Phone pans (painting units, added on tall phones): the window is 0.4 of the width, so it centres on the hands and the fruit. */
    phonePan: { x: 0.04, y: 0 },
  },

  grove: {
    ...still("grove", "16:9", "Model beat 2"),
    framing: { pan: { x: 0.01, y: 0 }, zoom: 1.04 },
    /**
     * The cloudscape is the far layer (the pale sky, left behind at 0.3x of the camera's lateral travel
     * while the branch and fruit keep the camera's own move: near rate 1), so the clouds lag the leaves as
     * the camera crosses. The mask lattice is 0.1 painting heights. `hold` is the velvet sleeve, the lace
     * cuff and the sky beside them: the cuff is pale like cloud but sewn to the sleeve, so the region
     * stays in the near layer and its leaves-like velvet sways at `holdSway` of the leaves' amount.
     */
    depth: { near: 1, far: 0.3, cell: 0.1 } satisfies Depth,
    hold: { x: 0.5, y: 0.58, w: 0.5, h: 0.42 } satisfies Rect,
    holdSway: 0.3,
    /** The leaves stir in the wind (foliage mask x wind): a little more than the graft's, there are more of them. */
    sway: { wind: { scale: 1.4, speed: 0.26, flutter: 3.2, flutterSpeed: 3.8 }, amp: 0.008, cell: 0.02 } satisfies Sway,
    /**
     * The grove's camera: a push-in at constant speed with a lateral travel, running through the
     * cuts on both sides (like The Work's creep, it never stops). `zoom` is a multiplier on
     * `framing.zoom`; `pan` is added to `framing.pan`.
     */
    camera: {
      zoom: { from: 1.06, to: 1.2 },
      pan: { from: { x: -0.03, y: 0.012 }, to: { x: 0.03, y: -0.012 } },
    },
    phonePan: { x: 0.05, y: 0 },
  },

  share: {
    ...still("share", "16:9", "Model beat 3"),
    framing: { pan: { x: 0, y: 0 }, zoom: 1.04 },
    /**
     * Framing of the LAST keyframe. The Split (phase 6) cover-fits `share.last` with exactly this,
     * so the model's final frame and the split's first frame are the same picture. It equals
     * `framing` (the share beat does not drift), so the cut between the two keyframes holds still.
     */
    lastFraming: { pan: { x: 0, y: 0 }, zoom: 1.04 },
    /**
     * The share's camera: a pull-back from the grove's push-in that decelerates onto
     * `lastFraming`, so the beat ends at rest on exactly the frame The Split opens on. `zoom` is a
     * multiplier on the framing zoom at the start (1 at the end); `pan` is the offset at the start.
     */
    camera: { zoom: 1.17, pan: { x: 0.025, y: -0.012 } },
    /** The man and the fruit he holds; the last keyframe takes the same pan, so the cut holds still on a phone too. */
    phonePan: { x: 0.06, y: 0 },
    /**
     * Second keyframe: the orange cut in half, the halves held a hand's width apart.
     * The Split (phase 6) opens on exactly this frame.
     */
    last: stillTiers("share/last"),
    anchors: {
      /** The seam between the two halves in the LAST keyframe: the point The Split opens from. */
      seam: { x: 0.5, y: 0.44 },
    },
  },

  plate: {
    ...still("plate", "9:16", "The Work, the push into the parchment"),
    anchors: {
      /** Open sky above the orange: where Work card 1 sits. */
      sky: { x: 0.2, y: 0.16 },
      /** The orange's shoulder, level with the man polishing it: Work card 2. */
      shoulder: { x: 0.38, y: 0.4 },
      /** The woman reading the blueprint on the lower stage: Work card 3. */
      blueprint: { x: 0.42, y: 0.73 },
    },
    rects: {
      /**
       * The parchment she holds open: the sheet between its two rollers (rollers, hands and the
       * drawn plan's frame inside it). Measured on the plate by eye; the push into the sheet lands
       * on it (passes/parchment).
       */
      parchment: { x: 0.507, y: 0.7055, w: 0.1875, h: 0.0738 },
    },
    framings: {
      /**
       * Where the push lands: the parchment rect cover-fitted to the frame, `zoom` beyond that fit
       * (so the rollers and the rect's edges stay out of frame through the push's 2% drift), its
       * centre moved by `pan` (painting units) off the rect's centre.
       */
      parchment: { pan: { x: 0, y: 0 }, zoom: 1.06 },
    },
  },

  drawing: frames("drawing", "1:1", 121, "The Terms (window)"),

  plan: still("plan", "1:1", "Last frame of drawing"),

  coda: {
    ...frames("coda", "16:9", 89, "The Terms (blue)"),
    /** A 2% push-in so pointer parallax and drift never show the frame's edge (as the hero). */
    framing: { pan: { x: 0, y: 0 }, zoom: 1.02 },
    /** The woman, the rod and the tree in the first frames, the floating orange in the last. */
    phonePan: { x: 0.06, y: 0 },
  },

  "share-orange": {
    ...still("share-orange", "1:1", "Last frame of coda"),
    anchors: {
      /** Centre of the floating gilded orange (the halo is drawn round it). */
      orange: { x: 0.5, y: 0.5 },
    },
    radii: {
      /** Radius of the orange as a fraction of the painting's width (halo and match-cut scale). */
      orange: 0.14,
    },
  },

  canopy: {
    ...loop("canopy", "Questions"),
    /**
     * Pushed in 32% and held low (the chapter scrolls the branches by 0.22 of the painting's height), so the Questions chapter can tilt the camera up through the
     * branches (pan.y walks from here by `CANOPY_TRAVEL`, passes/canopy/timeline.ts) without the
     * painting's edge ever showing, with room left for breath, pointer parallax and drift. The
     * match cut lands on the nearest orange as mapped by exactly this framing (the chapter's first
     * frame).
     */
    framing: { pan: { x: 0, y: -0.11 }, zoom: 1.32 },
    /** The nearest fruit (x 0.34) sits in the left third of the narrow window the match cut lands in. */
    phonePan: { x: -0.1, y: 0 },
    /**
     * The leaves sway in the wind (foliage mask x windAt); the fruit, the branches and the sky hold.
     * Gusts 1.6 cells a painting height crossing at 0.3 cells a second (one passes in about 3 s),
     * a flutter 3.5x finer and 4x faster; 0.011 painting heights per unit of wind (about 13 px at
     * 1440x900 before the bound: a leaf sways about 4 px, 8 px in a gust); the mask's lattice 0.02
     * heights (about 24 px), and the sway never past 0.4 of it, so the warp never folds.
     */
    sway: { wind: { scale: 1.6, speed: 0.3, flutter: 3.5, flutterSpeed: 4 }, amp: 0.011, cell: 0.02 } satisfies Sway,
    rects: {
      /**
       * The open sky in the middle of the frame: the centre 50% that docs/PAINTINGS.md keeps clear of
       * branches, a little taller than that (the placeholder's sky is wider but its fruit hangs at
       * the sides). The cards and the title sit inside it.
       */
      gap: { x: 0.22, y: 0.2, w: 0.52, h: 0.6 },
    },
    anchors: {
      /**
       * The canopy orange nearest the centre on the loop's first frame: the match cut lands the
       * floating orange here.
       */
      nearestOrange: { x: 0.34, y: 0.27 },
    },
    radii: {
      /** Radius of that orange as a fraction of the painting's width. */
      nearestOrange: 0.035,
    },
  },

  application: {
    ...still("application", "16:9", "Application"),
    anchors: {
      /** Tip of the woman's raised index finger: the constellation's first line starts here. */
      fingertip: { x: 0.3, y: 0.2 },
    },
    rects: {
      /**
       * The figure, from her hair to the hem of her gown (a little generous: it is a feathered mask).
       * The moire print-in brings the clouds and the sky in first and her last
       * (passes/application).
       */
      figure: { x: 0.15, y: 0.18, w: 0.2, h: 0.74 },
      /** The marble steps along the bottom, with the gilded orange on the top one: they resolve with her. */
      steps: { x: 0.0, y: 0.83, w: 0.64, h: 0.17 },
    },
  },

  sapling: {
    ...still("sapling", "16:9", "The rise"),
    anchors: {
      /** Foot of the trunk at the bottom centre: the print-in front is measured from here. */
      trunkFoot: { x: 0.5, y: 0.9 },
    },
    rects: {
      /**
       * The sapling alone, trunk foot to crown, with a margin of sky: the rise prints only what is
       * not sky inside this box onto the application painting, so its own marble and sky never
       * replace the figure and the steps.
       */
      tree: { x: 0.42, y: 0.55, w: 0.17, h: 0.352 },
    },
  },

  finale: {
    ...loop("finale", "Finale"),
    /** The tree in the middle with the watering can in reach; the rise ends on this pan (passes/application). */
    phonePan: { x: -0.03, y: 0 },
    anchors: {
      /** Spout of the watering can held by the woman on the left. */
      spout: { x: 0.3, y: 0.6 },
      /** The tree's roots, where the halftone pour lands. */
      roots: { x: 0.48, y: 0.86 },
    },
  },
} satisfies Record<
  ArtId,
  ArtEntry & {
    /** Bridge: pan table rows of [frame, panX, panY]. */
    pans?: readonly PanKey[];
    /** A beat's drift across its scroll range, in painting units. */
    drift?: Point;
    /** Framing of the extra `last` keyframe. */
    lastFraming?: Framing;
    /** A beat's scroll-driven camera move (see passes/model/timeline.ts). */
    camera?: object;
    /** Two-layer depth parallax (the motion toolkit). */
    depth?: Depth;
    /** Leaf sway in the wind (the motion toolkit). */
    sway?: Sway;
    /** The hero: the orbit's travel, the scroll's speed on the film, the sky's painted light, the signal rings. */
    orbit?: Point;
    rings?: Rings;
    velocity?: HeroVelocity;
    sky?: SkyLight;
    /** The grove: the region held in the near layer, and how much of the sway it keeps. */
    hold?: Rect;
    holdSway?: number;
    /** Added to the framing's pan on tall phones, in proportion to how tall (src/stage/framing.ts phoned). */
    phonePan?: Point;
    /** Named points in painting coordinates (0..1, y down). */
    anchors?: Record<string, Point>;
    /** Named radii as fractions of the painting's width. */
    radii?: Record<string, number>;
    /** Named regions in painting coordinates (0..1, y down). */
    rects?: Record<string, Rect>;
    /** Named framings of a region (a landing shot inside the painting). */
    framings?: Record<string, Framing>;
    /** Extra keyframe still (share's second keyframe). */
    last?: StillTiers;
  }
>;

export type Art = typeof art;

/** One row of the bridge pan table: [frame, panX, panY]. */
export type PanKey = readonly [frame: number, x: number, y: number];

/** The bridge's extra pan at a (fractional) frame: linear between rows, clamped at both ends. */
export function bridgePanAt(frame: number): Point {
  const rows = art.bridge.pans;
  if (rows.length === 0) return { x: 0, y: 0 };
  if (frame <= rows[0][0]) return { x: rows[0][1], y: rows[0][2] };
  for (let i = 1; i < rows.length; i++) {
    if (frame <= rows[i][0]) {
      const [f0, x0, y0] = rows[i - 1];
      const [f1, x1, y1] = rows[i];
      const k = f1 > f0 ? (frame - f0) / (f1 - f0) : 1;
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
    }
  }
  const last = rows[rows.length - 1];
  return { x: last[1], y: last[2] };
}

export const ART_IDS = Object.keys(art) as ArtId[];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Pick the image tier for a viewport width in CSS pixels (times devicePixelRatio, capped). */
export function tierFor(viewportWidth: number, dpr = 1): Tier {
  return viewportWidth * Math.min(dpr, 2) > 1100 ? "1440" : "768";
}

/** Path of frame `index` (0-based) of a sequence at a tier: `/art/<id>/<tier>/f_000.jpg`. */
export function framePath(entry: FramesArt, tier: Tier, index: number): string {
  return `${entry.tierDirs[tier]}/f_${String(Math.max(0, Math.floor(index))).padStart(3, "0")}.jpg`;
}

/** Shape of public/art/<id>/manifest.json, written by the import. */
export interface FramesManifest {
  tiers: Record<Tier, { count: number }>;
}

/**
 * Read a sequence's real frame count for a tier from its manifest.json (runtime, browser or
 * server). Falls back to the count in docs/PAINTINGS.md if the manifest cannot be read.
 */
export async function loadFrameCount(entry: FramesArt, tier: Tier): Promise<number> {
  try {
    const res = await fetch(entry.manifest, { cache: "force-cache" });
    if (!res.ok) return entry.expectedCount;
    const data = (await res.json()) as Partial<FramesManifest>;
    const count = data.tiers?.[tier]?.count;
    return typeof count === "number" && count > 0 ? count : entry.expectedCount;
  } catch {
    return entry.expectedCount;
  }
}
