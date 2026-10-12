# Motion audit (phase 17)

What moves in every segment of `src/stage/script.ts` today, how far at 1440x900, and what is flat in the real
painting, written before phases 18 to 20 give each chapter its own motion (`docs/MOTION-BRIEF.md`). Phase 21
updates it with what changed and what remains flat.

## Method

- **Frames.** The e2e build (the production `next build` with the stage test hook, served by `next start`) at
  1440x900, dpr 1, on this Mac's GPU (ANGLE on Metal), `?p=<value>&clock=5`: the shader clock fixed at 5 s, the
  video loops held at 1.5 s through the hook, every texture settled before the shot. Each segment at local
  t = 0.2, 0.5 and 0.8, three to a sheet: `docs/screenshots/motion-audit-<segment>.png` (each frame scaled to
  720x450). The hook build is used so the loops hold still and the pairs below compare to the pixel; the page
  is otherwise the production page.
- **Distances** are computed from the code's numbers at 1440x900 (a 16:9 painting cover-fits with 90% of its
  width visible, so a painting unit is 1440 x zoom / 0.9 px across and 900 x zoom px down), and checked by block
  matching where the picture allows (the graft's drift: 16 px between u 90 and 340 of its beat, as computed).
  "Scroll" distances: one scroll unit (1/10000 of the story) is about 5.3 px of page scroll on a 900 px screen.
- **Rest state, everywhere it is used** (hero, bridge, model, split, work, parchment, coda, canopy, application,
  finale): ambient drift 0.22% (3.5 px across, 2 px down at zoom 1), pointer parallax up to 7.2 px / 2.9 px,
  breath 0.4% of zoom (2.9 px at the side edges) and the scroll-stop kick 1.5% (11 px at the edges, gone in
  1.2 s). Nothing else moves at rest unless the table says so.
- **The loops' own motion** (the canvas with the loop held at 0.5 s and at 5.5 s, same p and clock): hero 6.0% of
  pixels change by more than 24, the canopy 11.2%, the finale 32.7%.

## Per segment

Velocity response is anything that reads `uVel` (the scroll's speed). Before this phase only three crests did.

| Segment | p | Camera and parallax (px at 1440x900) | Ambient | Velocity response | Flat in the real painting |
| --- | --- | --- | --- | --- | --- |
| hero | 0.00–0.04 | A 5% push about the orange, accelerating: 58 px at the far corner, 17 px at the centre, over the whole hero. The three stills are near identical | Loop (6%); halftone clouds `cloudSway` (the large one ±69 px over ~30 s) plus a scroll drift of 12–20 px; glint every 5.3 s; pour | None | A flat cobalt sky with no gradient or light; the figures and fruit cut out against it with hard, over-sharp edges; the attendants barely move in the loop; the camera all but holds still |
| bridge | 0.04–0.07 | The 121-frame morph scrubbed by p (content); the reel's dolly 1.05 to 1 over t 0.6–1: 58 px at the corner | Rest state | The static tear: rows slip up to 69 px at a flick against 24 px at rest | The reel's paper ground is flat; the camera is the scrub itself, so a fast scroll and a slow one look the same apart from the tear |
| model: graft | 0.07–0.11 | The drift: 20 px across, 3.7 px down over the beat's 400 units (about 2100 px of scroll): everything moves as one plane | Rest state | None | A flat cream ground; hands, branch, knife and leaves pasted on it with no depth; nothing in it moves. **This phase:** two depth layers (below) |
| model: grove | 0.11–0.15 | A constant-speed push-in, zoom 1.06 to 1.20 (95 px at the side edges) with a lateral travel of 113 px across, 25 px down over 470 units | Rest state | None | The painted cloudscape behind the branch never changes; leaves and fruit are still; the velvet sleeve is a dark mass |
| model: share | 0.15–0.19 | A pull-back from zoom 1.17 to 1 decelerating onto `share.lastFraming` (105 px at the edges, 45 px across); the keyframe cut to the halves | Rest state | None | A pure white ground with no texture or light, so the figure reads as a cut-out; he is still; the halves keyframe is white too |
| split | 0.19–0.22 | The halves part 81 px each and push in 10% about the seam; the plate settles from 1.18 to 1 (about 130 px at the corners) | Rest state, plate clouds | Zest at the cut, denser with speed | The white ground: at t 0.2 the rind band darkens the gap between the halves into a grey smudge on the white |
| work | 0.22–0.37 | The plate scrolls 1660 px through its height over 1500 units (0.21x the page), eased; a creep push-in of 6% (51 px at the corners); cards at 0.6x | Plate clouds in plate coordinates with `cloudSway`; the large cloud walks 333 px in | None | Flat cobalt sky; hard scaffold edges. The best motion on the page. **Edge, computed:** on a desktop the plate is width-fitted at zoom 1 with no side slack, so the pointer parallax and the drift (up to 0.67% of the width) sample up to about 10 px past its side edge until the creep has pushed in 1.4% (t about 0.23). It shows only where that edge carries paint rather than flat sky; with the pointer at the far left at t 0.01 the edge is sky and nothing showed (rule 3 of the brief; for phase 19) |
| parchment | 0.37–0.40 | The push into the parchment: 5.65x, accelerating, about a drifting point | Rest state; uFlat | Radial smear from the per-frame change of the push | Fine: a push and a colour |
| sheet | 0.40–0.42 | None: the three stills are identical | The paper's raking light (time) | None | Flat paper; nothing moves but the light |
| drawing | 0.42–0.48 | The soak; the 121-frame orbit (content); the window draws back from the full frame to the 403 px panel, its centre 403 px left and 97 px up; the picture zooms inside it | The brushed edge's fray creeps 0.02 a second | Smear from the per-frame motion of the picture | The orbit is the frames' own camera; the paper does not tilt with it. **Fixed this phase:** the retreat started at 60% of its speed (below) |
| panel | 0.48–0.50 | None: the three stills are identical | The margin orange turns 0.11 rad/s; the fray | None | The panel is a still on still paper |
| close | 0.50–0.53 | The burn front crosses the frame; the coda arrives with its lag | Rest state | Ember and sparks scale with speed | Fine |
| coda | 0.53–0.58 | The 89 frames scrubbed by p (content); the halo | Rest state | None | A flat blue ground (the hero's cobalt) with the woman and the tree cut out against it |
| matchcut | 0.58–0.59 | The orange thrown on a bowed path; the ring opens to past the far corner; the canopy settles from a 1.14 dolly (about 100 px at the edges) | Rest state, the canopy cloud | None | Fine |
| questions | 0.59–0.76 | The canopy tilts up 261 px over 1700 units (9000 px of scroll, 0.03x the page); the cards at 0.6x (DOM) | Loop (11%); the halftone cloud crosses at 46 px a second | None | A flat blue sky with no light; hard cut-out leaf edges with a bright rim along every leaf (the source's sharpening); before this phase no wind. **This phase:** the leaves sway (below) |
| moire | 0.76–0.79 | The application arrives from a 1.1 dolly (72 px at the edges); the canopy as the chapter left it | Rest state | None | **A tell:** at t 0.5 and 0.8 the bare screen over the gap is a block with long straight edges (rule 1), the canopy's gap rectangle printed as a hard-edged slab (`motion-audit-moire.png`; for phase 20) |
| application | 0.79–0.90 | None: the three stills are identical apart from the form | Rest state only (3.6 px of drift) | None | The painted clouds never move; the figure is still; the flattest chapter on the page |
| rise | 0.90–0.96 | The sapling prints in from its foot; the halftone cloud crosses 2600 px; a phone pan to the sapling | Rest state | None | The sapling prints linearly and stands at the bottom centre over the painted clouds, rooted in nothing (the application painting has no ground there): for phase 20, and the `sapling` brief if the asset is the fix |
| finale | 0.96–1.00 | None (the loop takes the frame through a print-in) | Loop (33%); the pour | None | Flat cobalt sky. **Edge:** the loop is a plain cover fit (zoom 1.0) with no vertical slack, so the breath, drift and pointer can show up to about 7 px of the painting's clamped top and bottom rows (computed); measured: 3 repeated rows at the bottom with the pointer at the top edge and the clock at 0.58 s (rule 3; for phase 20) |

## Masks

The toolkit's masks read colour bands measured on the real paintings (art.ts `MASKS`; hue in turns, saturation,
luma). Sampled points:

| Painting, point | Hue | Sat | Luma | Foliage | Pale |
| --- | --- | --- | --- | --- | --- |
| canopy, a lit leaf | 0.155 | 0.84 | 0.34 | 1.00 | 0.00 |
| canopy, the dark olive shade | 0.188 | 0.90 | 0.20 | 1.00 | 0.00 |
| canopy, an orange | 0.061 | 0.98 | 0.48 | 0.00 | 0.00 |
| canopy, the nearest orange | 0.091 | 0.99 | 0.62 | 0.00 | 0.00 |
| canopy, the sky | 0.602 | 1.00 | 0.32 | 0.00 | 0.00 |
| graft, the cream ground | 0.108 | 0.12 | 0.95 | 0.00 | 1.00 |
| graft, a hand | 0.083 | 0.50 | 0.74 | 0.00 | 0.00 |
| graft, the branch | 0.106 | 0.57 | 0.41 | 0.00 | 0.00 |
| graft, a leaf | 0.190 | 0.91 | 0.26 | 1.00 | 0.00 |
| graft, the right sleeve in light | 0.106 | 0.23 | 0.87 | 0.00 | about 0.6 |

Foliage picks every leaf of the canopy, the grove, the finale's tree and the graft's scion and leaves out the
fruit, gilt, skin, bark and sky. Green velvet (the grove's sleeve, the finale's drapery) reads as foliage: it may
sway like cloth, and a pass that must hold it still multiplies by its own region. Linen in full light reads as
pale, so on the graft the sleeves sit partly in the far layer; their folds warp a little against their
highlights, which reads as cloth, not as a tear.

## Fixed in this phase

- **The drawing's pop test** (`e2e/cuts.spec.ts` "cut drawing: Drawing → panel, pop") failed on the tree with the
  real paintings: a region of 5 tiles in the top-left corner changed by 20 at t 0.4 against at most 5.7 around
  it. The cause: the window's retreat (`sizeEase`, `t*(0.6 + 0.4t^2)`) left the full frame at 60% of its speed
  at once, so the picture jumped 12 px between two steps after holding still (rule 4); the real drawing's orange
  wash in that corner made the jump visible, where the placeholder's plain paper had hidden it. The ease now runs
  behind a smoothstep ramp over the first 15% of the retreat (`TERMS_TUNE.sizeRamp`; equal to the old curve from
  there on, so the panel lands where it did): 0 switches, the largest change at the crest.

## The toolkit, proven

The helpers (`docs/MOTION-RULES.md`, "The motion toolkit") on one painting each, with no chapter's timing changed.
Before and after are the same build but for the helper, at the same p and clock, loops held.

- **Depth parallax on the graft** (`passes/model/frag.ts` `graftAt`, art.ts `graft.depth`): the cream ground is
  the far layer (0.5x the camera's travel), the hands, branch, knife and leaves the near one (1.8x), the mask
  `1 - paleMask` read on a 0.05-painting-height lattice. Block matching across the beat (p 0.079 to 0.104): before,
  every point moved 16 px across and 3 down; after, the hands, raffia and knife move 25 to 27 px across and 5 to 6
  down, while the ground moves half the camera's travel by construction (it is flat cream, so block matching
  cannot see it). The hand's edge warps over the ground with no tear (`motion-graft-*`). The pointer parallax and
  the ambient drift split into the two layers the same way.
- **Leaf sway on the canopy** (`passes/canopy/frag.ts` `canopySway`, art.ts `canopy.sway`): `foliageMask` read on a
  0.02-height lattice times `windAt`; the oranges, the branches and the sky hold (the nearest orange measures 0 px
  of change, so the match cut still lands on it). Computed with the TS twin, a leaf sways about 4 px at a time and
  8 px in a gust, never past 9.5 px (the fold bound); block matching ten points against the frame before, at two
  clocks, measured 0 to 7 px on the leaves and 0 on the fruit and the sky. Shared by the match cut, the chapter
  and the moire, so the landing frame is the chapter's first and the moire's first frame the chapter's last (the
  matchcut and moire scrub and pop tests pass unchanged).
- **Under reduced motion** both are the frames before the toolkit (`depthShift` and `windAt` return 0).

Screenshots: `motion-graft-1440-before.png` / `-after.png` and `motion-graft-390-*` (the graft at p 0.104, the end
of its drift), `motion-graft-1440-diff.png` (what changed: only the near layer); `motion-canopy-1440-before.png` /
`-after.png`, `motion-canopy-390-*` (p 0.62) and `motion-canopy-1440-diff.png` (only the leaves).

## For the next phases

- Phase 18: the hero's camera barely moves and its sky is flat; the bridge is the scrub; the graft now has depth
  layers to dolly with, the grove's sky and leaves and the share's white ground are flat.
- Phase 19: the Work's plate shows its clamped side edge under the pointer early in the chapter; the sheet and the
  panel hold perfectly still.
- Phase 20: the canopy now sways (tune it with the cards over it); the moire's straight-edged slab; the
  application never moves; the sapling stands on nothing and prints linearly (`growSettle` is ready); the
  finale's zoom 1.0 leaves no room for its own breath.
