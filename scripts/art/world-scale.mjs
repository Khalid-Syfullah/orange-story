/**
 * The one world scale (`docs/ART-PLATES.md`, "World scale"), for the importer. The stage reads the
 * same numbers from `WORLD_SCALE` in `src/art/manifest.ts`.
 *
 * Every figure plate's `height` is worked out from its painting, not its image: the importer measures
 * the visible box (the alpha) and sets `height = span / box height`, so a painting with more empty
 * margin around the figure is not drawn smaller. `span` is how tall that visible box is in the world,
 * from the world scale: a standing adult is 1.75 from crown to soles, a head 0.23 from crown to chin,
 * a hand 0.19 from wrist to fingertip, so a figure with an arm or a tool raised above the head, or a
 * hat, spans a little more. Parts of a figure (a head, an arm) and things in a hand take the size of
 * their body; frames of one pose share the first frame's height (`sameAs`), so they stay in register.
 */

export const WORLD_SCALE = { adult: 1.75, head: 0.23, hand: 0.19 };

/**
 * World height of each figure plate's visible box, or the plate whose height it shares. Measured on
 * the paintings in phase 24 (each figure set to the world scale, its parts and props with it).
 */
export const FIGURE_SPANS = {
  // The statue: crown to soles an adult, her arm raised above her head with the orange.
  "hero/statue": { span: 2.0989 },
  // The onlookers: the tallest of each group an adult with a raised hand or a hat.
  "hero/crowd-far": { span: 1.78 },
  "hero/crowd-mid": { span: 1.78 },
  "hero/crowd-near": { span: 1.78 },
  // The grafting hands: a forearm in its sleeve and a hand (0.19).
  "graft/hand-left": { span: 0.3414 },
  "graft/hand-right": { span: 0.3461 },
  // The rising hand: the arm from the fingertips down to the sleeve, its hand 0.19.
  "pluck/hand": { span: 0.9326 },
  // The harvester: his body from the shoulders to the soles, his head (crown to chin) and his arm.
  "pluck/harvester-body": { span: 1.6552 },
  "pluck/harvester-arm": { span: 0.3481 },
  "pluck/harvester-head": { span: 0.2285 },
  "share/arm-open": { sameAs: "pluck/harvester-arm" },
  "share/knife-hand": { span: 0.1352 },
  "share/second-hand": { span: 0.0827 },
  // The builder: an adult, his hammer raised over his head.
  "work/builder": { span: 1.8885 },
  "blueprint/builder": { span: 1.8713 },
  "site/builder-left": { span: 1.8926 },
  "site/builder-right": { span: 1.8884 },
  // Seated on his stool.
  "site/builder-seated": { span: 1.3023 },
  // The architect: an adult in her head covering.
  "blueprint/architect": { span: 1.7558 },
  // The gardener in his straw hat, and his arms with the shears.
  "prune/gardener": { span: 1.82 },
  "prune/gardener-arms-1": { span: 0.38774 },
  "prune/gardener-arms-2": { sameAs: "prune/gardener-arms-1" },
  // The astronomer: an adult, his pointing arm raised above his head.
  "stars/astronomer": { span: 1.9548 },
  // The orchard keepers: adults, her arm with the jug, his arms with the shears.
  "finale/woman-body": { span: 1.75 },
  "finale/woman-arm": { span: 0.26704 },
  "finale/man-body": { span: 1.7516 },
  "finale/man-arms-1": { span: 0.3286 },
  "finale/man-arms-2": { sameAs: "finale/man-arms-1" },
};

const round4 = (v) => Math.round(v * 1e4) / 1e4;

/**
 * The height a plate should have for its visible box (`box`, [l, t, r, b] fractions), or null for a
 * plate the world scale does not size. `heights` gives the heights already settled (for `sameAs`).
 */
export function heightFor(id, box, heights = {}) {
  const rule = FIGURE_SPANS[id];
  if (!rule) return null;
  if (rule.sameAs) return heights[rule.sameAs] ?? null;
  const visible = box[3] - box[1];
  return visible > 0 ? round4(rule.span / visible) : null;
}

/** The world height a plate's visible box has at a height (to check a plate against its span). */
export const spanOf = (height, box) => height * (box[3] - box[1]);
