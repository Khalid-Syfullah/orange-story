# Art plates

Every scene is built as a 2.5D stack of painted layers (plates) in React Three Fiber: flat images with transparency, set at different depths so the camera can push, pan and dolly through them. Until the paintings exist, each plate is a generated stand-in loaded from the same path, so swapping in final art needs no code changes: the characters are painted as small oil studies by a procedural painter, the props are drawn and lit in the same light, the skies and masks are simple.

All plates live in `public/art/<scene>/<plate>.webp` (with alpha), listed in `public/art/manifest.json` with size, depth and anchor points. The look is `docs/ART-DIRECTION.md` (an academic neoclassical oil painting, one shared light, the cast and its palette); every character plate has a generation brief in `docs/ART-BRIEFS.md` (`npm run art:briefs`). Use only original artwork you have the rights to.

| Scene | Plates |
| --- | --- |
| hero | painted cobalt sky; glow droplet sprite; statue holding an orange aloft (cut-out, orange as a separate layer); minaret shaft (tileable); crowd of robed onlookers looking up (2 to 3 depth layers); the shared canvas grain and craquelure; the contact shadow under standing figures |
| ascent | minaret-to-trunk transition (stone texture, bark texture, a mask texture for the morph); branch layers; leaf sprites |
| graft | branch close-up; left hand; right hand; cutting; twine wrap; knot (each as separate layers for animation) |
| pluck | foliage layers with oranges (3 depths); single hero orange; rising hand; harvester in white robe (body, right arm with orange, head) |
| share | knife hand; orange halves (outer peel and cut face separate); second person's hand |
| work | cloud sprites (4 to 6, drawn by the stage as halftone); giant orange on minaret; builder |
| blueprint | scaffold and minaret; builder; architect; plan in 4 fold panels |
| site | seaside ground and sea; marble platform; timber stage and steps; orange under construction; three builders; matching top-down plate of the same set; plain ground (sand, far larger than the view); tiled ground pattern; blurred leaf-shadow texture |
| prune | marble column and urn; young orange tree (branches as separate layers so one can fall); gardener |
| fall | falling orange; the cut branch without its fruit; two rows of orange trees left and right (2 depths each); rainbow ring mask |
| faq | orchard plates reused (the question cards' lines are fixed on oranges at named points of the two near rows); sparkle sprite |
| stars | fabric sky texture; billowing cloud; marble platform and stairs; astronomer with raised arm; star sprite |
| finale | tree; woman pouring from a terracotta jug (body, arm, water stream frames); man with shears (body, arms frames); falling orange sprite; cloud sprites |

## Manifest, placeholders and final art

- `public/art/manifest.json` lists every plate: its file (`src`), pixel `size`, `depth` (distance behind the picture plane in world units, z = -depth), `anchor` (the image point, as fractions from the left and top, placed at `position`; plates turn and scale about it), world `height`, and the `scenes` that use it (the first one owns the folder). Optional fields: `role` (`plate`, `backdrop`, `texture`, `sprite`), `rotation`, `layer`, `tile` and `repeat` for tileable images, `linear` for masks, a default `sway` in degrees, `frame` for animation frames, `points`, `rig`, `paint`, and either a `placeholder` spec or `painted: true`.
- **`points`**: named image points (fractions from the left and top) that code ties things to, read through `platePoint()` in `src/art/manifest.ts`. Positions come from the art, not from constants:

  | Plate | Point | What the code does with it |
  | --- | --- | --- |
  | `hero/statue` | `orange` | the orange plate stands there and the glow ripples out from it (`ORANGE`, `hero-art.tsx`) |
  | `hero/crowd-*` | `look-at` | where every onlooker turns (on the top edge, below the statue; the test checks it) |
  | `pluck/harvester-arm`, `share/arm-open` | `orange` | the plucked fruit lands there and is cut there (`HELD`, `pluck-harvest.ts`; `CUT_X`, `share-cut.ts`) |
  | `share/knife-hand` | `knife-tip` | the blade tip follows the cut path, wherever it is on the plate (`knifeAt`, `share-cut.ts`) |
  | `share/peel-*`, `share/face-*` | `cut-edge` | the halves are placed by their cut edges (`HALF_EDGE`, `share-cut.ts`) |
  | `blueprint/architect` | `plan` | the folded drawing is held there (`HELD`, `blueprint-plan.ts`) |
  | `prune/branch-right` | `fruit` | the falling orange starts there (`BRANCH_FRUIT`, `fall-plan.ts`) |
  | `fall/trees-*-near` | `question-1` to `-5` | the question cards' connector lines are fixed there |
  | `stars/astronomer` | `fingertip` | the constellation grows from there, seen from the stargazer camera (`FINGERTIP`, `stars-plan.ts`) |
  | `finale/woman-arm` | `spout` | the water frames hang from there (`SPOUT`, `finale-plan.ts`) |
  | `finale/man-arms-*` | `shears-tip` | where he cuts an orange free in the loop (`CUT_POINT`, `finale-plan.ts`) |
  | `prune/gardener-arms-*` | `shears-tip` | where the blades meet the branch he trims |
  | `graft/hand-*`, `pluck/hand`, `share/second-hand` | `grip`, `fingertips` | where the hand holds or reaches (each plate's anchor sits there) |

  For the stand-ins the fractions were chosen so every place came out where the scenes were tuned (the unit test holds them to it), except the fingertip: the old constant was not on the figure at all, and the stars now grow from the painted finger.
- **`rig`**: how the living stage moves a figure (`src/components/stage/rig.ts`, `life.ts`), in the plate's own fractions:

  | Field | What it is | What moves |
  | --- | --- | --- |
  | `chest` | `[left, top, right, bottom]` around the chest and shoulders | it and everything above it rise as the figure breathes (about 0.7% of its height, at about 0.2 Hz) |
  | `hem` | around the bottom of the robe | it ripples a little in the breeze, most at its bottom edge; the feet below stay planted |
  | `head` | around the head (hat or veil included) | it turns a little every few seconds, and with the scene's acting, on `neck` |
  | `arm` | around a raised arm (the astronomer's) | it settles into the point on `shoulder` |
  | `pivot` | the feet | the whole figure shifts its weight about it; the contact shadow sits there |
  | `neck`, `shoulder` | the joints | (default: the middle of the head's bottom edge; the arm's lower left corner) |
  | `figures` | a list of the above, one per person (at most four) | each person on a shared plate (the onlookers) moves on their own |

  A small build step (`rigWeightData`) turns the rectangles into a soft-edged weight texture (`linear`, one channel each for breath, hem, head and arm), so a finished painting needs no hand-painted mask; the plate is drawn as a subdivided mesh bent by it in the vertex shader. A **part** of a figure on its own plate (a head, an arm: `PART_PLATES` in `scripts/art/cast.mjs`) carries only its `pivot`, the joint it turns on (its anchor): the scene carries it on its body (`useFigureLife`, `figure-life.ts`), so a head or an arm moves with the body's breathing and weight shifts and turns on its own joint (the harvester's head to the orange, the gardener's arms with the shears, the jug as it tips). Things the figure holds that are plates of their own (the fruit in the harvester's hand and its halves, the knife and the second hand, the architect's folded plan, the stream from the jug, the fruit the man cuts free) move with the hand that holds them.

  Where a rig comes from: a stand-in's from its posed figure (`figureRig`, written to the manifest by `npm run art:placeholders`; `-- --rigs` writes the rigs alone); a painting's from its sidecar's `rig` (in the painting's fractions, remapped by the import), or, without one, a first guess from its cut-out (`guessRig` in `scripts/art/import-core.mjs`: each person found under the top of their head, with a head about a seventh of their height; the import warns, and `npm run art:import -- --rigs` writes the sidecars' rigs, or the guesses, without importing the paintings again). Check a guess and write the sidecar's own rig to calibrate it.
- **`paint`**: how the stage paints the plate (`platePaint()` in `src/art/manifest.ts`):

  | Field | Default | What it does |
  | --- | --- | --- |
  | `figure` | false | the figure treatment: the scene's colour grade, a soft sky-blue rim on the shadow edge (from the alpha gradient), a faint warm bounce from below on a standing body; with a rig, idle life. Subtler on painted plates than on stand-ins; off (but the grade) at the lowest quality tier |
  | `grain` | on for stand-in plates and backdrops | the canvas weave and paint tooth, in the plate's own UV space. Always off on a painted plate (it carries its own) and on the halftone layer |
  | `craquelure` | 1 (0 for painted plates) | the faint crack network, times the scene's strength |
  | `halftone` | none | `cloud` or `water`: drawn as the graphic halftone layer (soft painted luminance in, dots out) |
  | `contact` | 0 | the figure stands on something: a soft contact shadow plate (`hero/contact-shadow`) this many world units wide under its feet |
  | `life` | true | false keeps a rigged figure still (the marble statue) |

- **The shared grade** is set per scene in `SCENE_PAINT` (`src/scroll/script.ts`): warm highlights, cool shadows and a small saturation trim on every figure plate, so paintings made at different times match each other and the sky, and how strongly the craquelure shows (strongest on the paper-cream building site).
- **The canvas** is two small shared tileable data textures, generated by the placeholder script: `hero/canvas-grain` (256 px, the weave and the tooth) and `hero/craquelure` (512 px), loaded once for the whole stage.
- **`placeholder`**: how `npm run art:placeholders` draws the stand-in. `kind: "study"` is a character plate, painted by `scripts/art/` (the cast in `cast.mjs`, posed per plate in `poses.mjs`, built by `figure.mjs`, painted by `paint.mjs`); other kinds are drawn in `scripts/art/plates.mjs`, the props among them given the same light and surface. Plates render on worker threads (all of them in under two minutes); the stand-in figures stay under about 450 KB each.
- **`painted: true`**: the file is a finished painting, brought in by `npm run art:import`, which also deleted the `placeholder` spec, so the generator never overwrites it. An entry has one or the other, never both (`npm test` checks).
- `npm run art:placeholders -- --check` verifies that every entry has a WebP file of its size, and runs the **texture guard** on every character plate: inside the alpha it measures the luminance spread, the number of distinct colours and the high-frequency energy, prints them, and fails on a flat plate (`scripts/art/guard.mjs`; calibrated on the stand-ins against the flat placeholders they replaced). `npm run art:import -- --check` does the same for painted plates, and checks their alpha edge is clean.
- Textures are capped at 2048 px on the longest side (1024 on low-memory and small touch devices) and loaded only for the scene on stage and the next one.

## Replacing the art

1. **Brief.** `npm run art:briefs` writes `docs/ART-BRIEFS.md` from the manifest and the cast: the generation order (one reference sheet per recurring character first), then per plate the file to save, the size to ask for, the key colour, the prompt and negative prompt, the sidecar to write, what it must match and what to check.
2. **Paint or generate** each painting on its flat key colour (or with real alpha) and save it as `art/source/<scene>/<name>.png` (not committed: large files; reference sheets go in `art/source/sheets/`, which the importer skips).
3. **Sidecar.** Write `art/rig/<scene>/<name>.json` (committed), in the painting's own fractions:

   ```json
   { "key": "cyan", "points": { "anchor": [0.86, 0.14], "orange": [0.18, 0.7] }, "rig": { "head": [0.4, 0.05, 0.6, 0.2], "pivot": [0.5, 0.95] } }
   ```

   `key` overrides the brief's key colour; `anchor` (for plates not standing on their foot: an arm's shoulder, a blade tip, a fingertip) lands exactly on the manifest anchor; every other point is written to the manifest. The plate lab on `/design` (Points) opens the painting, lets you click or drag each point into place and copies this JSON.
4. **Import.** `npm run art:import` (or `-- --only <prefix>`, `-- --dry-run`) cuts each painting out (its alpha, or its key colour with a soft matte, spill suppression and a 2 px defringe), trims it, fits it inside the manifest canvas (standing on the bottom edge for figures anchored at the foot, centred otherwise, or by its `anchor` point; with a transparent margin), writes the WebP at the manifest path (quality lowered until it is at most 600 KB), writes the points and the rig, deletes the `placeholder` spec and sets `painted: true`. It prints a table of every plate: source size, output size, KB, alpha margin and warnings (a point kept from the stand-in, a fringe, a flat plate, a small source).
5. **Check.** `npm run art:import -- --check`, `npm test` and `npm run test:story`; calibrate any point that is off and import again.

For a replacement already registered to its final canvas, use `"fit": "canvas"` in its sidecar and save the source with the manifest's aspect ratio. The importer retains that framing instead of trimming and fitting it again, so separate heads, shoulders, fruit, and animation frames stay aligned. Repeating textures, the sky, and the seaside background intentionally fill their canvases; the transparent-edge check applies to isolated cutouts.

## What final art must keep

Learned by walking the placeholder story end to end; the placeholders already follow these rules.

- **The sky stays deep behind text.** `hero/sky` is every scene's backdrop, and white and milk text sit on it. Its lightest part (the bottom) must not be lighter than `#416EB4`, a 42% mix of sky toward sky-soft, so milk text keeps 4.5:1. `npm test` reads the plate and checks it.
- **Nothing is cut by its own image edge.** A cloud, a leaf or a crown that reaches the edge of its image shows a flat, cut edge once it is on stage (the first cloud placeholders did). Leave a margin of transparency on every side.
- **The orchard rows fade out at their foot.** A phone's taller picture sees below the rows (`fall/trees-*`), so their trunks fade to transparent over the bottom fifth of the image instead of ending in a cut line. Keep an orange at each named point (`points`), above that fade.
- **Hands are where the points say.** The harvester's fruit, the architect's sheet, the blade tip, the shears, the spout and the fingertip are named points: paint the hands anywhere sensible and mark them in the sidecar; the code follows. Keep the plates of one figure (body, arm, head, frames) in one pose, so they still meet where the manifest places them.
- **One light.** Warm sun from the upper left, a cool sky fill, a thin warm rim on the right (`docs/ART-DIRECTION.md`). A plate lit from elsewhere will look pasted in.
- **No ground, no shadow on it, no outline.** Each painting is a cut-out on a flat key colour; the stage supplies the sky, the contact shadow under a standing figure and the graphic layer.
- **Parts overlap at their joints.** A head or an arm on its own plate turns a few degrees on its joint (the head bows, the arm settles, the body leans into a snip): paint it on past the joint, about a quarter of a head into the body plate, and paint the body under it (the neck stub, the shoulder under the sleeve), so no gap shows when it turns (`docs/ART-BRIEFS.md`).
- **A rig with every figure.** Give the sidecar of every figure that lives (a body, a crowd) its `rig` (the chest, hem and head rectangles, the feet), and of every part its `pivot`: a guess from the cut-out works, a measured rig works better (a head box over a hand turns the hand).
- **No canvas, no cracks of the stage's on a painting.** A finished painting carries its own weave and craquelure: the stage lays none over it, and keeps its rim subtle; keep the painting's own surface fine, so it matches the stand-ins' canvas on the sky around it.
- **Clouds and water are luminance.** The stage turns them into halftone dots (dense where the paint is darkest): paint them soft, lit from the upper left, shading into a cool blue-grey underneath, with no dots of their own.
- **Text areas stay calm.** Where words stand (`SLOT_AREAS` in `src/components/stage/text-haze.ts`), the scene's art recedes into the sky's haze while they are up; still, avoid bright whites and saturated fruit right behind the words, and keep the bottom-left and the right column of the work scene's clouds airy.
- The transition canvas also reads three plates, a few screens before it needs them: `fall/ring-mask` (the rainbow ring's band: a radial image, black inside and outside, bright where the ring is; its radius is the mask's edge), `stars/fabric-sky` (the cloth the sky turns into) and `stars/cloud` (the cloud that billows over to fill the screen). Until they load, the shaders draw stand-ins.
