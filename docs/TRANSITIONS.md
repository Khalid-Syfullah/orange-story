# Transitions

How the story gets from one picture to the next. Each scene change is an event inside the painting:
something pours, piles, drifts, falls, turns or ripples, and the camera travels through it. This file
is the design of every one of them, as built; `SCROLL.md` has the numbers they play on, and the
inventory of what they replaced is `test-results/transitions/inventory.md`, with the captures before
and after (`test-results/transitions/before/`, `after/`, `after-phone/` and the side-by-side
`compare/`).

## Principles

1. **Motivated by the content.** Every transition is an event in the world of the two scenes it joins.
   Nothing exists only as a screen effect.
2. **Continuous camera.** One unbroken move through depth wherever the scenes share a world (the camera
   pushes through the young tree's leaves, pans through a cloud bank). Where the scenes are in
   different places, the camera travels into a medium that fills the lens (sand, paper, dust, cloth),
   the cut happens inside it, and the medium's own motion carries the move on. A cut that shows is a
   match cut on a shared shape (the plan's paper).
3. **Depth and parallax.** Every medium is layered in depth in front of the lens. Near things are large,
   soft and fast; far things small, sharp and slow. Things passing the lens are the wipe.
4. **Physics.** Grains fall under gravity and drag and are carried by the wind; paper turns on its
   creases with stiffness and lands; cloth falls with weight and drag and billows; water rings out from
   an impact and dies away. All of it is closed form or precomputed and scrubbed by story time (a
   function of progress, `PHYSICS`: a screen of scrolling is a second), so it plays backwards exactly.
5. **Paint, not pixels.** Media are painted: brushy dabs, streaks along the wind, the canvas grain,
   the halftone layer for clouds and water, and the story's one light (warm sun from the upper left,
   cool sky fill). The colour temperature carries from one scene into the next.
6. **Speed adds life, never changes the result.** Scrolling fast stretches grains and smears passing
   leaves a little (`useSmear`); it settles to nothing at rest and never moves anything.
7. **Pacing.** 0.6 to 1.2 screens each (the unit test holds every canvas transition to it). The
   scripted full cover, where the scenes swap, lasts at most a tenth of a screen; with the medium's own
   soft edges the frame reads as covered for 0.15 to 0.2 screen (the captures), always moving and never a
   flat colour.

## Where they are drawn

Inside the stage canvas, with the plates. The old transition canvas laid over the stage (one
full-screen shader pass each, `src/components/transitions/`) is gone.

- **Lens layers** (`LensGroup`): a group that follows the camera, so a medium that fills the lens is
  untouched when the camera reframes under it (`holdFov` keeps its size on screen across the reframe's
  change of field of view). Its layers sit at real distances in front of the lens and are drawn after
  every scene's plates, far ones first (`lensOrder`). The sand, the paper, the dust, the cloth and the
  calm veils are lens layers.
- **World layers**: a medium the camera moves through without reframing stands in the world, so the
  camera's own move gives it parallax: the leaves (around the camera's path up the trunk) and the cloud
  bank (in front of the builder).
- **In-scene layers**: the ring's ripple is part of the falling orange's scene, drawn in its halftone
  layer behind the orange and in front of the old picture. The graft's tree filling in and the
  finale's clouds blowing in are their scenes' own plates (`grow` on a plate).
- The plates of the next scene show where the medium thins out: a covering medium hides the swap of
  scenes (a step at the boundary, `presence.ts`); the leaves hide a short cross-fade at their densest
  moment (`swapAt`); the ring cuts the old picture and the orchard along its own wavefront (`reveal`).
- Each medium mounts a few screens before its transition (`TRANSITION_PRELOAD_SCREENS`: its art loads,
  its shaders compile while the browser is idle, the cloth is simulated in idle slices) and unmounts a
  screen after it.

## The toolkit (`src/components/stage/transitions/`)

| Part | What |
| --- | --- |
| `transition-stage.tsx` | Mounts the media near their transitions, the mode and the smear they share, `usePrecompile` |
| `lens.tsx` | `LensGroup` and the lens render order: depth-sorted passes in front of the camera; `lensView` for the size of the view at a depth |
| `particles.ts`, `particle-field.tsx` | The deterministic particle system: seeded, shuffled attributes (a first share is an even sample, for the light mode), a closed-form flight under gravity, drag, wind and eddies (`particleAt`, the reference the GLSL twin follows), drawn as painted dabs or sprites in one instanced draw, defocused by distance, stretched by the smear |
| `hinge.ts`, `page-material.ts` | Paper on a crease: a turn with stiffness (a lift, the swing, a landing a touch past and the settle), the bend of the page whose free edge lags its hinge, the sun on whichever face the camera sees, the shade in a closing fold |
| `cloth.ts` | A deterministic cloth (position-based, fixed step, seeded gusts), run once in idle slices and stored as frames, read back by story time; `clothCrossings` measures when it covers and uncovers the frame |
| `smear.ts` | The velocity-driven blur: a critically damped spring on the scroll speed that settles to zero at rest (off with idle held, in the light and calm modes) |
| `match-cut.ts` | Where a world thing lands on the screen through the camera path (a point, a box, a circle), and the lens placement that matches it exactly |
| `media.ts`, `noise-texture.ts` | The painted look in GLSL: four fields of tileable noise baked once (one lookup instead of hashing octaves per pixel), the palette, the canvas grain, the sun |
| `choreography.ts` | Where a transition is in its ramps, the circle the ring reveals, how much of a calm veil shows |
| `calm-veil.tsx` | The calm version of a covering transition: a still painted veil in the medium's colours |
| `modes.ts` | `full`, `light` (phones and the lowest tier: 40% of the particles, two sheets, no smear) and `calm` (reduced motion); `?transitions=full|light|calm` forces one |
| `*-plan.ts` | Each transition's choreography, pure and unit tested (`transitions.test.ts`): `leaf-plan`, `sand-plan`, `cloud-plan`, `unfold-plan`, `dust-plan`, `ring-plan`, `fabric-plan` |

Also: `grow` on a plate (`plate.tsx`, `materials.ts`) fills a plate in clump by clump from a point
instead of fading it up; `useMutable` (`src/lib/use-mutable.ts`) is how a frame loop moves the meshes a
component made.

## The transitions

Ranges are in screens of scrolling from the top of the stage (53 in all), with progress in brackets
where it helps. "Covered" is where the medium covers every pixel: the scenes swap there and the camera
may reframe.

### 1. Hero to ascent, pluck to share, prune to fall, fall to questions, stars to application

One continuous picture: the next scene opens on the plates the last one ends with and the camera keeps
moving. Nothing to add.

### 2. Ascent to graft: through the leaves (3.87 to 4.48)

- **What happens.** The camera rises along the trunk to the first branch through the young tree's
  leaves. Forty-six leaves (the ascent's own painted leaf) stand in the world on the twigs around the
  camera's path, between it and the branch; its push carries them past the lens, the nearest huge, soft
  and fast, the farthest small and sharp, each turning a little in the air the camera stirs. Two stand
  right on its path and fill the lens as it reaches them (4.08): the trunk's branch gives way to the
  graft's close-up of the same branch behind them. Every leaf is behind the camera by the time it
  settles on the branch.
- **Camera.** Unchanged: the dolly up and in to the branch.
- **Link.** The branch and its leaves.
- **Layers.** Two particle fields in the world (the canopy, the two on the path, beyond the camera's
  near plane), drawn after both scenes; the scenes cross-fade over 0.012 screen to each side of the
  leaves' densest moment (`swap`, `swapAt`).
- **Light and calm.** 40% of the canopy leaves (the two on the path always); calm: the plain 0.2-screen
  cross-fade, no leaves.

### 3. Graft to pluck: the tree fills in (5.88 to 7.08)

- **What happens.** As the camera pulls back from the knot, the fruiting tree fills in around the
  graft clump by clump, never faded half through (`grow`): the far and middle boughs spread out from the
  knot, the near boughs close in from the edges of the frame. Leaves shaken loose by the filling
  branches drift down past the lens at every depth, fluttering, and fall out of the frame.
- **Layers.** The pluck's foliage plates in the graft scene, filling in (0.112 to 0.128 of progress);
  thirty falling leaves in the world.
- **Light and calm.** 40% of the falling leaves; calm: the tree still fills in, no leaves fall.

### 4. Share to work: the sand (11.64 to 12.70; covered 12.25 to 12.34)

- **What happens.** The camera pushes into the two halves held together. Their cut flesh crumbles:
  grains pour from the rims of both cut faces under gravity, bending right as the wind gets up, and the
  wind lifts grains off the pour and carries them across. A dune of blue sand piles up from the bottom
  of the frame, faster and faster as the camera dives into it, its crest lit by the sun and smoking with
  spindrift, while streams of grains blow across the frame at three depths. The frame fills only as
  the camera reaches the cover: a grained, streaked, moving mass with lit grains in it. Under it the camera reframes onto
  The Work's sky. The wind, already blowing hard, opens holes in the drift at once, where it is
  thinnest, and widens them; The Work's clouds show through, and the last of the sand streams off to
  the right and falls away below as the camera rises.
- **Camera.** The share's push into the halves carries on into the drift and slows to rest; after the
  cut the work's dolly up makes the remaining sand fall away below.
- **Link.** The halves: the pour starts at their cut faces. The storyboard's blue sand, lit by the
  sky it blows through, which is The Work's sky.
- **Layers.** Grains poured from the faces (4,200), grains the wind lifts and carries (9,000), three
  drift sheets 0.36, 0.8 and 1.6 in front of the lens (each covering its share so that together they
  cover what the plan asks), grains streaming close past the lens (140).
- **Light and calm.** 40% of the grains, the two nearest sheets, no stretch; calm: a still blue grained
  veil.

### 5. Viewfinder (share, 11.18 to 12.16)

The hairlines close into a square around the shared halves (chrome over the picture, on purpose). It
opens out as the camera pushes into the halves and the sand takes over.

### 6. Work to blueprint: through the cloud (17.63 to 18.28; covered 17.90 to 17.93)

- **What happens.** After the builder's last blows, a gust carries a bank of The Work's clouds in front
  of him from the left (from 17.76); the gust dies away as the nearest fills the lens, its solid core
  over the whole frame at the scene boundary (the scenes swap inside it); the camera's pan across to the
  scaffold carries it out of the bank, the clouds sliding off to the left, the nearest fastest, leaving
  the builder on his scaffold. Nothing fades: every cloud starts and ends outside the frame.
- **Camera.** The work's hold, then the blueprint's pan across to the scaffold, unchanged.
- **Link.** The same sky and the same builder, before and after; the clouds that fill The Work.
- **Layers.** Three cloud plates of The Work in the world in front of the camera (2.6, 1.3 and 0.6
  away, sized in frame heights there and wider on a screen wider than 16 by 10), in the halftone layer
  with a finer, softer dot near the lens.
- **Light and calm.** The same bank (on a tall phone frame it thins away after the swap, being wider
  than the pan); calm: a still white cloud veil.

### 7. Blueprint to site: the paper unfolds (20.67 to 21.84; covered 21.15 to 21.25)

- **What happens.** The plan in the architect's hands is paper: four drawn panels on cream sheets,
  hinged on their creases. The camera dives into it until the two middle panels fill the frame (and a
  quarter more, so a frame up to 2 by 1 is full). That picture is matched exactly by a sheet in front of
  the lens, and the camera reframes to the building site under it. Then the sheet opens on its real
  creases: the right page lifts and turns toward the camera over the middle crease, its free edge
  lagging as stiff paper does, its face catching the sun as it rises and its plain back in shade as it
  goes over, and lands on the left half with a small flop; then the doubled left half turns away over
  the left crease and sweeps out past the lens. Behind it: the building site in the sun.
- **Camera.** The blueprint's push into the plan becomes the dive; under the paper the camera reframes
  to the site's ground-level shot, which holds while the pages turn.
- **Link.** The paper: the plan's own sheet and drawings become the sheet that opens (match cut).
- **Layers.** The plan's panels (with their paper), the lens sheet (two pages, each a bent strip
  subdivided along its length), the shade in the closing fold.
- **Light and calm.** The same pages (they are two meshes); calm: a still milk paper veil.

### 8. Site to prune: the wind lifts the dust (25.04 to 25.80; covered 25.40 to 25.48)

- **What happens.** Looking straight down on the site, a wind gets up: the milk page beside the site
  lifts at its upwind edge, curls and flies off, and dust lifts off the sand and the tiles in billowing
  plumes that come up toward the camera, the sand's warm colour as they leave the ground, cooling to the
  blue of the sky they are lit by as they rise (the storyboard's blue dust), white specks of grit
  glinting in them. They close over the lens only as the camera reaches the cover; inside, the camera reframes to the
  gardener. The dust, already rising, lifts off at once from the bottom: its edge is the billows' own
  (the dense puffs hang lower), uncovering the gardener from the bottom up, the last motes drifting up
  past him.
- **Camera.** The site's top-down hold; after the cut, the gardener's hold. The rise is the plumes'
  approach (layers coming toward the lens) and, from the cover, their climb out of the frame.
- **Link.** The site's sand in the plumes, cooling to the gardener's blue sky.
- **Layers.** The site's milk page (a lens sheet), three plume sheets (each its share of the cover), 800
  specks of grit.
- **Light and calm.** Two sheets and 40% of the grit; calm: a still dusty veil.

### 9. The ring (inside the fall, 31.16 to 31.97)

- **What happens.** The falling orange, followed by the camera, strikes the sky as if it were water: a
  ripple runs out from it, a real wave (a leading crest and a train of smaller rings dying away behind
  it) in the halftone layer: dots swell on the crests, the grid bends on the slopes, and the leading
  crest carries a thin, soft spectral sheen. Drops of light jump from the strike and fall back. The old
  picture is carried away at the leading crest; behind it, the orchard. The ripple spreads from the
  orange wherever the camera takes it, slowing as a ripple does, past every corner of the frame by the
  end.
- **Camera.** The follow, the strike, the pull back and the climb between the rows: unchanged.
- **Link.** The orange's own impact is the ring's origin; the halftone rings answer the hero's glow.
- **Layers.** The ripple (in the fall scene, behind the orange), the drops (140), the reveal along the
  crest (projected through the camera, so it stays on the ripple while the camera moves).
- **Light and calm.** 40% of the drops; calm: the two pictures cross-fade over the ring's range.

### 10. The smoke (inside the questions, 39.69 to 40.04)

The last card and the title rise and dissolve like smoke as the camera pushes forward between the
trees: text leaving, drawn by the text layer.

### 11. Questions to stars: the fabric sky (40.35 to 41.02; covered 40.68 to 40.73)

- **What happens.** As the camera pushes into the blue between the trees, the sky comes loose: a great
  blue cloth falls into view from above, billowing as the air catches it (its two top corners let go one
  after the other, so it swings as it falls), its folds catching the sun on their crowns and going cool
  in their troughs. It falls across the lens and covers it for a moment; inside it the camera reframes.
  It keeps falling and slides out at the bottom, uncovering the stargazer from the top down, its hem
  flicking as it goes. The storyboard's billowing cloud is the cloth's own billow: no second, pasted
  cloud.
- **Camera.** The questions' push; the stargazer's hold.
- **Link.** The sky itself: its blue becomes the cloth, and the cloth's blue is the stargazer's sky.
- **Layers.** One cloth (a 26 by 20 grid, 1.7 frame heights tall, simulated under gravity, air drag
  and seeded gusts, stored at 60 frames a second of story time; the script's cover is inside the
  cloth's measured cover, which the unit test checks), lit per vertex, with the painted fabric as its
  weave.
- **Light and calm.** The same cloth; calm: a still blue cloth veil.

### 12. Application to finale: the clouds blow in (from 47.73)

The finale's clouds no longer fade up where they stand: once the scenes have changed, each blows in on
the wind, forming from its upwind side, its edge breaking into the halftone's dots, one after another
(47.73 to 48.62, `FINALE.cloudsIn`). The stargazer's old cloud breaks up from its upwind side as it
slides away.

### 13. Viewfinder (finale, 50.30 to 53.00)

The hairlines close into the finale's frame around the wordmark and stay.

## Lighter and calmer versions

- **Light** (phones and the lowest quality tier): the same events with fewer grains, specks, drops and
  leaves (40%), the two nearest drift or plume sheets instead of three, no stretch and no smear.
- **Calm** (reduced motion): no moving medium. The old scene cross-fades into a still painted veil in
  the medium's colours (blue sand, milk paper, sand-blue dust, blue cloth, white cloud), the scenes swap
  under it, and it cross-fades out; the leaves become a plain cross-fade and the ring a cross-fade
  between the two pictures. Reduced-motion visitors get the calm stacked page instead of the stage
  (`SCROLL.md`, "Reduced motion"), so the stage shows the calm version only when asked for
  (`?transitions=calm`, and on `/design`).

## How it was checked

- **Unit tests** (`src/components/stage/transitions/transitions.test.ts`, `src/scroll/script.test.ts`,
  `src/components/stage/presence.test.ts`): the modes; the particles seeded, shuffled, a function of
  time alone, born where they should be and with a GLSL twin on the same constants; the hinge from rest
  to rest, bending and keeping its length; the cloth deterministic and covering where the script says;
  the sand poured from the faces and full only at its cover; the dust whole until its clearing and gone
  by its end; the cloud's core over the frame through its cover and every cloud outside the frame at
  both ends, on a laptop, a 16:9 screen, a 2 by 1 browser, a portrait tablet and a phone; the plan's
  paper filling those frames where the sheet takes over; the ring from nothing to past every corner,
  the orange in the frame throughout; the path leaves beyond the near plane and filling the lens; the
  calm veils; every canvas transition 0.6 to 1.2 screens with a cover of at most 0.2, and no text beat
  over one.
- **Captures** (`npm run motion:capture -- --transitions`): every boundary and in-scene transition in
  60 steps on a 1440 by 900 laptop (`after/`, with `--reverse`: the way back matches the way down) and
  on a phone (`after-phone/`), side by side with the captures before (`compare/`).
- **Frame times** during the transitions only, against the phase 25 build (`SCROLL.md`, "Performance"): the whole story holds 16.7 / 16.8 / 16.8 ms; inside the transitions the median and 95th percentile are 16.7 and 16.8 ms in every run (reading pace, fast, phone, lowest tier), and at reading pace the 99th is 16.8 ms too. The slow frames there are where the next scene mounts, at the same moments in both builds.
