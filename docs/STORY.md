# The story

orange.io is one continuous scroll story in four chapters (The Model, The Work, The Terms, Questions) plus a hero before them and an application and finale after. The structure, pacing and cuts follow pear.no, measured on 2026-10-11; every asset is Orange's own.

## How it works

- One `<section class="stage">` about 60 viewport heights tall. A `position: sticky` `.pin` fills the viewport and holds one WebGL canvas, the hero `<video>`, and DOM text layers over the canvas. Text is never drawn in WebGL.
- Scroll is a clock. `p = smoothedScroll / (scrollHeight - innerHeight)`, 0 to 1. Every chapter, transition and camera move is a pure function of `p` (plus a time uniform for breath). Nothing is keyed to raw `scrollY`.
- Chapters that are camera moves are frame sequences scrubbed by `p`. The hero and the finale are video loops. Everything from the plate on is stills and procedural texture moved by the shader.
- The copy comes from `src/content/copy.ts` (see `docs/COPY.md`). Chapter labels sit on the left rail.

## Sections, scroll ranges and assets

Ranges are fractions of the total scroll. Asset ids are the keys in `docs/PAINTINGS.md`.

| Section | p | What is on screen | Assets |
| --- | --- | --- | --- |
| Hero | 0.00–0.04 | A giant orange on a stepped marble plinth, three attendants in Greek drapery, cobalt sky. Halftone clouds, a rainbow glint on the peel and a halftone pour from the watering can are drawn by the shader. Hero title, subtitle, button, bottom-left tag and paragraph. | `hero` (video loop) |
| Hero → Model | 0.04–0.07 | The bridge: a 121-frame morph that transforms the scene in place rather than cutting. The camera tilts up; the plinth turns to bark from the bottom up along a torn edge while its top slab stays put, then lifts away like a cap; the orange stays until the tilt carries it out of the bottom of the frame; leaves sprout along new branches; the attendants and the cobalt sky fade out as the ground goes paper-white; a grafting knife falls past the lens and comes to rest on the bough. The hero's dotted rings keep pulsing across the sky until the ground has gone white. The shader hands film to reel with the static treatment. | `bridge` (121 frames) |
| 1 · The Model | 0.07–0.19 | Four beats on a pale ground, scrubbed by scroll. (1) Hands grafting a citrus scion, a knife on the bough, no copy (the hero paragraph has just left). (2) The camera pushes through the scion's leaves into a dense orange canopy: We build it. (3) It drops to a hand picking the gilded orange; the top of the young man's head enters the lower right: We rank it. (4) A match cut on the gilded orange to the young man in green velvet, who slices it with a knife while a second hand comes in from the left to take one half; the halves are held a hand's width apart: We share in what it earns. Each beat's copy fades in as its painting settles. | `graft`, `grove`, `share` (frames or stills) |
| 1 → 2 | 0.19–0.22 | The Split: the cut in the orange becomes the cut in the picture. Cobalt bleeds outward from the seam through a coarse halftone and stipple edge; the pushed-aside halves and hands smear and pixelate into chunky dots. See `docs/TRANSITIONS.md`. | reel last frame + `plate` |
| 2 · The Work | 0.22–0.37 | The page settles on a flat cobalt field with a single small halftone cloud and the first Work card (Search engine optimization: Everything it takes to be found, under one roof.). Then a tall painted plate scrolls through its own height: open sky with halftone clouds; the orange prints itself in from the top as a halftone screen whose dots grow until they merge into paint; scaffolding, a man polishing, a woman reading a blueprint. The other two Work cards arrive beside the part of the painting they belong to. | `plate` (9:16 still) |
| 2 → 3 | 0.37–0.40 | The camera pushes into the parchment she holds while the painting fades to the paper's colour around it; the parchment becomes the sheet. | `plate` |
| 3 · The Terms | 0.40–0.59 | A procedural paper sheet. The construction drawing (121 frames) soaks in from the middle holding the whole frame, orbits from eye level to a top-down plan and retreats to a brushed-edge panel in the left margin beside the terms copy. The sheet burns into flat blue: the coda (89 frames) in which a woman in white with a red sash lifts a gilded picking rod to a potted orange tree, one orange floats free, she and the tree leave the frame, and the orange hangs alone with a soft halo. | `drawing` (121 frames), `coda` (89 frames) |
| 3 → 4 | 0.58–0.59 | Match cut on the fruit: the floating orange scales up into the nearest orange of the canopy while its halo opens outward and the canopy arrives inside it. | `coda` last frame + `canopy` |
| 4 · Questions | 0.59–0.76 | FAQ cards over the orange canopy seen from below, a halftone cloud drifting through the gap, the section title with its last word handwritten in as the reader arrives, a constellation of hairlines joining the cards. | `canopy` (video loop) |
| 4 → application | 0.76–0.79 | The sky gap takes a coarse halftone screen with moiré, the branches dissolve, the next painting's cumulus clouds print in as giant dot-screen clouds that resolve into paint. | `canopy` + `application` |
| Application | 0.79–0.90 | A woman in classical dress on marble steps points at a constellation whose stars are the form fields. | `application` (still) |
| The rise | 0.90–0.96 | A sapling prints in at the bottom centre while the halftone cloud crosses behind it; the constellation retracts to her fingertip. | `sapling` (still) |
| Finale | 0.96–1.00 | The footer loop: two figures water and prune a young orange tree under the Orange wordmark; the halftone pour from the can. | `finale` (video loop) |

## Chrome

Hairline frame: a thin grid of left and right verticals, a top rule and one mid rule, with small crosshair markers where hairlines meet and a star marker on the mid rule. It stays fixed over every painting. Top-left the Orange mark and a grid button for the chapter menu; top-right the Apply pill. Left rail: The Model, The Work, The Terms, Questions, switching with `p`. Bottom-right: scroll percentage.
