# Performance, phones and reduced motion (phases 14 to 16)

The e2e suite's numbers (phase 16) are at the end, under "Phase 16: the checks as a suite".

Measured on the dev machine (a MacBook, Chrome stable, headless, Metal GPU) against a production
build (`npm run build && npm start`). Chrome's 4x CPU slowdown (`Emulation.setCPUThrottlingRate`) is
the stand-in for a mid-range phone; it slows the CPU only, so the GPU numbers below are the
desktop GPU's and a real phone's GPU time is not measured here. Frame time is the pass's real cost:
`?hud&finish` waits for the GPU (a one-pixel readback) after every draw and the HUD prints its
running average. The script that took them drives Playwright through the segments of the story.

## Budgets

| Budget | Where it is set | Value |
| --- | --- | --- |
| devicePixelRatio | `src/stage/gl/context.ts` `MAX_DPR` | 2 |
| Drawing buffer | `MAX_PIXELS` | 3.4 Mpx (1440x900 at dpr 2 draws at dpr 1.62) |
| Texture-field octaves | `engine.ts` (`coarse` or width <= 820) -> `uOctaves` | 2 on phones, 4 elsewhere; motion fields (`fbm4`) keep 4 everywhere |
| Decoded frames per sequence | `textures.ts` `MAX_DECODED` | 24 |
| Texture uploads | `FramesHandle.near`, `LoopTexture` | only when the chosen frame changes / the video has a fresh frame |
| Video uploads | `LoopTexture.setNear` | the loop plays and uploads only while its segment is near, paused otherwise |
| Phone picture | `src/stage/band.ts` | the canvas is the band (0.6 of the viewport height on tall phones): 390x844 at dpr 3 draws 780x1012 = 0.79 Mpx |

## Fast paths

- A pass is drawn only for the active segment; passes that finished compile are never recompiled.
- The scene is redrawn when `p`, the pointer, a texture upload or the scroll-stop kick changed; otherwise
  only the breath draws it, and that is now every second frame (30 Hz, the breath is 0.4% of zoom over
  seconds). Under reduced motion nothing redraws without a change.
- `passes.preload(p)` (which assets are near) runs when `p` changes, not every frame.
- In the shaders: fronts that have passed every pixel are skipped (`behind`, `lag`, `uFlat`, `uSoak`,
  `gone`, `open`, `uCover`, `uWordT`, `uPourGain` and the like are early-outs, as written in each pass).
- The phone band's fade is one `if (uBand < 0.999)` at the end of the pass; below the band nothing is drawn
  (the canvas simply is not there).

## At rest (the scroll stopped, `?p=` held, `?finish`)

Desktop 1440x900, dpr 2 (buffer 3.4 Mpx), no throttle, ms per drawn frame, rAF stayed at 16.7 ms (0 frames
over 20 ms of 88) at every position:

| hero | bridge | model | split | work | parchment | sheet | terms (drawing) | terms (panel) | close | coda | match cut | questions | moire | application | rise | finale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.23 | 2.49 | 1.65 | 3.68 | 2.52 | 3.99 | 2.52 | 3.19 | 3.04 | 3.67 | 2.74 | 4.57 | 2.20 | 4.07 | 1.08 | 2.87 | 3.39 |

At-rest frames of the chapters are under 4 ms; the two heaviest cut frames held mid-cut (the match cut, 4.6 ms, and the
moire, 4.1 ms) are a little over it. A held mid-cut frame is not a resting state a reader stays in.

Phone 390x844, dpr 3 (touch emulation, `pointer: coarse`), 4x CPU throttle: every position 0.8 to 2.4 ms
(hero 1.42, bridge 2.36, model 0.82, split 1.28, work 0.99, parchment 1.44, sheet 1.02, drawing 1.30, panel 1.21,
close 2.09, coda 1.76, match cut 2.44, questions 1.21, moire 2.12, application 0.76, rise 1.07, finale 1.42);
rAF held 16.7 ms with no frame over 20 ms at all 17 positions.

## Scrolling through the cuts (real input, throttled)

Desktop 1440x900 dpr 2, 4x throttle, wheel steps 14 ms apart through the bridge, the split, the push into the
parchment, the close, the match cut, the moire and the rise: rAF avg 16.7, p95 16.8, max 16.8 ms, no frame over
20 ms of 178 in any range; the worst GPU-synced frame was 6.1 ms (parchment, close, moire).

Phone 390x844 dpr 3, 4x throttle, touch flings (`Input.synthesizeScrollGesture`): rAF avg 16.7 ms, one 33 ms frame
in 1246 (the moire's range). The flings travel far, so the ranges ran on through later chapters.

## Touch scroll

Native scrolling with the 60 ms constant (`mode native` in the HUD). A fling of 3000 px from p 0.97: `p` rose to
1.0000 and stayed there (scrollY 49796 of 49796); the HUD's `lag` (target minus current, px) peaked at 315 px
at the fling's top speed (about 60 ms of motion) and was 0.0 within 0.5 s. An upward fling from p 0.02 landed on
exactly 0. `overscroll-behavior-y: none` stops the rubber band, and the clock clamps to 0..max besides.

## Reduced motion

`prefers-reduced-motion: reduce` (checked with Playwright's `reducedMotion`): `uStill = 1` (breath, parallax,
drift stop; the intro and the ring are skipped); the bridge, split, parchment push, sheet, drawing orbit, close,
match cut, moire and rise draw their end frame (t = 1) from the moment the scroll enters them, and the change
dissolves over 300 ms (the canvas holds the last frame in a ghost canvas that fades out; the copy's opacity
changes carry a 300 ms CSS transition); the handwritten title is complete; the loops (hero, canopy, finale) still
play, being content; the chapters' own scroll (the model's beats, the Work's plate, the copy ramps, the coda,
the Questions cards, the application) stays under the reader's hand.

## Phase 15

The cut review (`docs/CUTS-REVIEW.md`, "Performance") re-profiled every cut at local t = 0.2, 0.5 and 0.8 and
every rest state on this machine (Apple M2 Pro, 19 GPU cores), production builds of the phase-14 tree and of the
fixed tree served side by side and measured back to back at each position. Two things came out of it.

- **How to read the figures above.** With `?finish` a drawn frame waits for the GPU through a one-pixel
  `readPixels`, and that drain is about 3 ms whatever the pass draws (the application at rest, one tap and the
  grain, is the floor); at rest the breath draws every second frame, so the HUD's mean, which the tables above
  carry, is half of a drawn frame's time. The review's table gives the drawn frame itself, before and after,
  for every cut position and rest state: 3 to 9.6 ms with the drain in it, the moire the heaviest, no position
  moved outside the 1.5 ms run-to-run spread. `?repeat=N` turned out not to measure the fragment cost on this
  machine: N opaque full-frame draws into one target are shaded once on a tile-based GPU, so the frame time
  barely rises with N; it is left in the engine for GPUs where it does.
- **Two fast paths where the cut frames measured heaviest** (rule 14, exact: no still changed). The moire reads
  a cell's arrival first and draws the landed painting in one tap where it is complete (no canopy, tone,
  print-in or second screen) and the canopy alone where it has not begun; the finale's print-in skips both bites
  in a cell provably ahead of the front. Before and after per position are in the review.

## Phase 16: the checks as a suite

`npm run e2e` (README.md, Checks; `docs/CHECKS.md` maps each check to its test) on the dev machine (Apple M2 Pro),
Playwright 1.64, Chrome for Testing 156 headless, WebGL through ANGLE on SwiftShader (Vulkan, LLVM 10), against
the e2e build: the production build with the stage test hook, served by `npm start` on a free port. Desktop
1280x800 at dpr 1 (the 1440 art tier), phone 390x844 at dpr 3 with touch (the 768 tier, the band 0.6 of the
height). Visual tests draw every frame through the hook at a clock `page.clock` holds (the shader clock reads
60.000 s), with the video loops held at 1.5 s and every texture at exactly the frame it wants. Last run: 43
passed, 1 skipped (the desktop frame-time variant, which needs a real GPU), 6.8 minutes; the 36 stills it writes
were byte-identical to the run before, so frames are the same run to run.

### Scrub and pop, per cut of docs/TRANSITIONS.md

40 increments of `p` forward then back, 1280x800. "Scrub" is the worst step's difference between the forward and
the backward frame (mean per channel, 0..255, and share of pixels over 8). "Largest change" is the step whose 32 px
tile changed most, with the tile's mean change and whether it lies in the crest band, the zone the cut's shader
reports through its probe (`lib.glsl.ts` PROBE, each cut's own band widths). "Switches" are regions of 64x64 px or
more outside the band that changed at one step while nothing within 64 px of them did at the steps either side.
Where a frame sequence moves on (the bridge reel, the drawing's orbit) the step is judged with the sequence held,
so the placeholder frames' own motion is not counted.

| Cut | p | Scrub, worst step | First to last frame | Largest change | Crest on screen | Switches | Steps with the sequence held |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bridge | 0.04–0.07 | 0.000, 0.000% | 89.9% changed | t 0.400, 194.3, at the crest | 15 of 40 steps | 0 | 40 |
| split | 0.19–0.22 | 0.000, 0.000% | 99.8% | t 0.575, 172.7, at the crest | 23 | 0 | 0 |
| parchment | 0.37–0.40 | 0.000, 0.000% | 100% | t 0.500, 61.7 (no front: a push and a colour) | 0 | 0 | 0 |
| soak | 0.42–0.44 | 0.000, 0.000% | 100% | t 0.225, 35.0, at the crest | 21 | 0 | 35 |
| drawing | 0.42–0.48 | 0.000, 0.000% | 12.9% | t 0.700, 89.0, at the crest | 26 | 0 | 31 |
| close | 0.50–0.53 | 0.000, 0.000% | 98.6% | t 0.475, 182.7, at the crest | 33 | 0 | 0 |
| matchcut | 0.58–0.59 | 0.000, 0.000% | 89.5% | t 0.775, 140.2, at the crest | 40 | 0 | 0 |
| moire | 0.76–0.79 | 0.000, 0.000% | 87.9% | t 0.825, 64.6, at the crest | 40 | 0 | 0 |
| rise | 0.90–0.98 | 0.000, 0.000% | 79.7% | t 0.850, 226.3, at the crest | 32 | 0 | 0 |

With the clock fixed and the loops held every cut comes back to the pixel: the scrub differences in
`docs/CUTS-REVIEW.md` were the loops playing on and the breath moving between passes. A negative control (the
Split's bottom 30% darkened by 18% from t 0.31 on, put in for one run and taken out again) was caught as two
regions of 74 and 78 tiles at the step it switched on, and again where it switched off at the segment's end.

### Edge, at the crest of every printed front

The share of the boundary's pixels (where the print reaches the front, the pass's PROBE_MIX) caught between the two
pictures, and the share the print puts across the front. An alpha ramp leaves a quarter or more between; a clean
line puts none across.

| Cut at its crest | Boundary pixels | Between | Across |
| --- | --- | --- | --- |
| bridge (static), t 0.3 | 106,062 | 8.5% | 11.0% |
| split, t 0.4 | 73,392 | 8.5% | 11.1% |
| close (burn), t 0.5 | 52,445 | 8.5% | 10.8% |
| matchcut (ring), t 0.5 | 89,554 | 8.5% | 10.8% |
| split with its print taken out (the measure's control) | 10,381 | 60.9% | 0.0% |

Before the fixes below, the Split measured 27.3% between and the bridge 28.9% between and 1.4% across: dithered
alpha ramps.

### Speed (crest effects against the scroll's speed)

The same p drawn at rest, at 8 px a frame (a slow wheel) and at 40 (a flick): the mean change from rest and the
pixels it moves by more than 8, and the share of them at the crest.

| Cut at its crest | 8 px a frame | 40 px a frame | At the crest |
| --- | --- | --- | --- |
| bridge, t 0.3 (the tear) | 1.163, 18,051 px | 3.391, 56,789 px | 100% |
| split, t 0.4 (the zest) | 0.005, 192 px | 0.014, 577 px | 100% |
| close, t 0.5 (ember and sparks) | 0.206, 9,300 px | 0.903, 29,534 px | 100% |

### Frame time, 4x CPU slowdown

Main-thread time per frame (`frameMs()`: the scroll clock, texture uploads, the draw call, the DOM layers), one new
`p` per frame across each cut's 40 increments (41 to 44 frames recorded per cut), then 3 s at rest. Mean, p95 and
max, ms.

Phone, 390x844 at dpr 3, SwiftShader (the suite's assertion):

| bridge | split | parchment | soak | drawing | close | matchcut | moire | rise | hero at rest | sheet at rest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2.41 / 3.9 / 4.7 | 0.51 / 1.0 / 1.2 | 0.53 / 1.1 / 1.2 | 2.51 / 3.8 / 4.0 | 2.12 / 3.5 / 3.7 | 0.45 / 0.9 / 1.1 | 0.63 / 1.2 / 5.3 | 0.96 / 1.6 / 4.4 | 1.00 / 1.7 / 9.7 | 0.54 / 1.2 / 1.6 | 0.11 / 0.4 / 1.0 |

Desktop, 1280x800, on this Mac's GPU (`E2E_GPU=metal`), where the desktop variant passes:

| bridge | split | parchment | soak | drawing | close | matchcut | moire | rise | hero at rest | sheet at rest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5.01 / 6.2 / 8.0 | 0.29 / 1.1 / 1.2 | 0.42 / 1.0 / 1.1 | 6.87 / 10.3 / 13.0 | 6.10 / 9.7 / 11.0 | 0.33 / 1.1 / 1.2 | 0.62 / 1.0 / 10.3 | 0.55 / 1.0 / 2.7 | 0.71 / 1.5 / 13.3 | 0.25 / 0.8 / 1.4 | 0.08 / 0.3 / 1.0 |

Desktop on SwiftShader the sequence cuts do not hold the budget: bridge 55.5 / 83.6 / 125.7, soak 38.2 / 99.7 /
106.5, drawing 33.9 / 94.7 / 103.7 (every other cut under 10 ms, the rests at most 1.5 ms). Each of those frames
uploads a new 1440-tier frame of a sequence (1440x810 or 1440x1440), and an upload measured on its own returns in
about 1 ms unless it blocks, every second to fourth one, for 30 to 70 ms while SwiftShader, which is the GPU process
running on the CPU, takes the previous ones in (roughly 150 to 300 MB/s; the same with every ImageBitmap and unpack
option tried, texImage2D or texSubImage2D). That is the rasterizer's speed, not the page's work: on the real GPU the same run
holds the budget (the table above), and phones use the 768 tier. So the suite asserts the frame-time test where
`docs/CHECKS.md` sets it, on the phone, and runs the desktop variant on a real GPU only. The heaviest desktop
frames on Metal (single frames of 13.3 ms in the rise and 10.3 ms in the match cut, 11 to 13 ms in the soak and the
drawing's orbit) are the ones to watch with the real paintings.

### Reduced motion, phone, build

- Reduced motion: each cut entered at t 0.2, 0.5 and 0.8 from just before it: a 300 ms dissolve (the ghost's CSS
  transition, timed on the document timeline), then the cut's end frame exactly, all 27 entries. At rest in nine
  chapters and at the nine cuts' ends, the canvas and the whole page (`page.screenshot`) do not change over 1.5 s.
- Phone, 390x844 at dpr 3: texture fields at 2 octaves, native scrolling; no horizontal overflow at 85 positions
  (5 in every segment); every copy block shown there inside the viewport; the form shows its three messages when
  sent empty and its success message when filled in.
- Build: no chunk of the production build in `.next` carries the hook (`__stage` or its flag); `npm start` is
  `next start -p 3000`.

### What the suite found, and the fixes

- **The Split's boundary was a dithered alpha ramp** (edge test: 27.3% of its pixels between the two pictures).
  Its smoothstep was as wide as the print's own reach (±0.02 against ±0.024), so the print only scrambled which
  pixels were half-way. `edgeSoft` is now a tune entry at 0.004, the width the burn and the match cut already print
  through: each pixel is one picture or the other (8.5% between, the anti-aliasing; 11.1% put across the front).
  `docs/TRANSITIONS.md` has the new row and skeleton.
- **The static treatment's boundary, the same** (the bridge and the Model's beat cuts; 28.9% between, 1.4% across):
  `CUT_EDGE` 0.004 in `passes/static.ts`.
- **Under reduced motion the Application -> finale cut did not collapse to its end frame.** The rise held its own
  last frame and the finale's loop printed in with the scroll (63% of pixels away from the cut's end frame at t
  0.2, 0.5 and 0.8). The rise and the finale's arrival are one cut: both now land on the finale where it has landed
  (`script.ts` FINALE_LANDED, local t 0.78: the loop in, the pour grown, the wordmark printed; the finale's timeline
  fails to load if a retune moves those past it), and the subtitle and footer run on from there with the scroll.
- **Two rows of `docs/TRANSITIONS.md` named the wrong range.** Sheet -> drawing said 0.40–0.42, where the sheet
  rests and nothing changes (0.0% of pixels between the first and last frame); the soak runs at the start of
  `drawing`, as phase 9 placed it: now 0.42–0.44. Application -> finale said 0.94–0.97, cutting the sapling's
  print-in in half: now 0.90–0.98 (the sapling from about 0.915, the loop taking the frame to 0.977). The comments in
  `script.ts` that put the soak in `sheet` say where it is.
- **Frames were not the same run to run under a fixed clock**: the shader clock counted from the stage's start, which
  depends on how long the page took to load. It now reads the page's clock (performance.now from the time origin);
  breath reads it only through sines and differences, so nothing on the page changes.
- Lint had one warning (an unused import in `scripts/art-video.mjs`); it is clean now.

## What could not be measured here

- A real phone GPU and thermal behaviour: the throttle slows the CPU only.
- The desktop frame time under the suite's own renderer: SwiftShader takes in 1440-tier sequence frames too slowly to
  measure the page (above); measured on this Mac's GPU instead, with `E2E_GPU=metal`.
- iOS Safari's dynamic toolbar (the viewport resizing while scrolling) and its touch momentum.
- The speed test with real input (a trackpad flick, a slow wheel, Page Down) and the settle, by hand.
- Frame time with the real paintings, which are still the painted placeholders.
