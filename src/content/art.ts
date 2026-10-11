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

  bridge: frames("bridge", "16:9", 121, "Hero to Model (morph)"),

  graft: still("graft", "16:9", "Model beat 1"),

  grove: still("grove", "16:9", "Model beat 2"),

  share: {
    ...still("share", "16:9", "Model beat 3"),
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

  plate: still("plate", "9:16", "The Work, the push into the parchment"),

  drawing: frames("drawing", "1:1", 121, "The Terms (window)"),

  plan: still("plan", "1:1", "Last frame of drawing"),

  coda: frames("coda", "16:9", 89, "The Terms (blue)"),

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
  },

  sapling: {
    ...still("sapling", "16:9", "The rise"),
    anchors: {
      /** Foot of the trunk at the bottom centre: the print-in front is measured from here. */
      trunkFoot: { x: 0.5, y: 0.9 },
    },
  },

  finale: {
    ...loop("finale", "Finale"),
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
    /** Named points in painting coordinates (0..1, y down). */
    anchors?: Record<string, Point>;
    /** Named radii as fractions of the painting's width. */
    radii?: Record<string, number>;
    /** Extra keyframe still (share's second keyframe). */
    last?: StillTiers;
  }
>;

export type Art = typeof art;

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
