# Performance, phones and reduced motion (phase 14)

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

## What could not be measured here

- A real phone GPU and thermal behaviour: the throttle slows the CPU only.
- iOS Safari's dynamic toolbar (the viewport resizing while scrolling) and its touch momentum.
- Frame time with the real paintings, which are still the painted placeholders.
