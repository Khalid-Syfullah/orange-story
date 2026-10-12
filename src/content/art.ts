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
    /** A 2% push-in so pointer parallax and drift never show the painting's edge. */
    framing: { pan: { x: 0, y: 0 }, zoom: 1.02 },
    anchors: {
      /** Rainbow glint on the peel: upper-left of the giant orange, where the light hits. */
      glint: { x: 0.64, y: 0.3 },
      /** Centre of the giant orange (the bridge keeps it in place; the ring leaves from the glint). */
      orange: { x: 0.7, y: 0.42 },
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
    drift: { x: -0.012, y: 0.004 },
    /** Phone pans (painting units, added on tall phones): the window is 0.4 of the width, so it centres on the hands and the fruit. */
    phonePan: { x: 0.04, y: 0 },
  },

  grove: {
    ...still("grove", "16:9", "Model beat 2"),
    framing: { pan: { x: 0.01, y: 0 }, zoom: 1.04 },
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
     * Pushed in 10% and held low, so the Questions chapter can tilt the camera up through the
     * branches (pan.y walks from here by `CANOPY_TRAVEL`, passes/canopy/timeline.ts) without the
     * painting's edge ever showing, with room left for breath, pointer parallax and drift. The
     * match cut lands on the nearest orange as mapped by exactly this framing (the chapter's first
     * frame).
     */
    framing: { pan: { x: 0, y: -0.035 }, zoom: 1.1 },
    /** The nearest fruit (x 0.34) sits in the left third of the narrow window the match cut lands in. */
    phonePan: { x: -0.1, y: 0 },
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
