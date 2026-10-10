# Orange: the scroll script

The whole story is data in `src/scroll/script.ts`: chapters, scenes, text beats, transitions, camera keys, hairline cues, tones and navigation anchors, all placed on one 0 to 1 `progress`. This file says the same thing in prose. The script is the source of truth: if the two disagree, the script wins. In development, the dev timeline (press the backtick key) shows the live values.

| What | Where |
| --- | --- |
| The script (data only) | `src/scroll/script.ts` |
| Its shapes | `src/scroll/types.ts` |
| Builders it uses (scene tiling, points inside scenes) | `src/scroll/define.ts` |
| Questions about a progress (`sceneProgress`, `currentScene`, `currentChapter`, `beatVisible`, ...) | `src/scroll/helpers.ts` |
| Checks (`validateScript()`) | `src/scroll/validate.ts` |
| Unit tests (`npm test`) | `src/scroll/script.test.ts`, `src/scroll/stage-scroll.test.ts` |
| Scroll engine (Lenis, ScrollTrigger, `progress` and `velocity`) | `src/scroll/stage-scroll.ts` |
| React access to the story (context and hooks) | `src/scroll/story-scroll.tsx` |
| The pinned stage, the beats, the dev timeline, the reduced-motion page | `src/components/story/` |
| Art manifest (every plate, its file, size and place in depth) | `public/art/manifest.json`, read by `src/art/manifest.ts` |
| Stage canvas: plates, morph, twinkle, sway, camera rig, scene presence | `src/components/stage/` |
| Transitions: choreography, shaders, the transition canvas | `src/components/transitions/` |
| Smoke-out for text | `src/components/motion/smoke-out.tsx` |

## The stage

The site is one `<section>` that is `STAGE_VH` tall (5000vh), scrolled natively. Inside it a sticky frame, exactly one viewport tall, holds every layer, bottom to top:

1. the WebGL canvas with the scene plates;
2. the transition canvas (sand, paper unfold, dust, rainbow ring, fabric sky), shown and rendered only while one of them runs;
3. the hairlines, and the progress lines that run along them;
4. the DOM text layer: every beat of the script, each in its slot;
5. the chrome: mark, chapter menu, "Apply", ruler, percent counter.

`progress` is 0 when the top of the section meets the top of the viewport and 1 when its bottom meets the bottom. A 5000vh stage gives 49 screens of scrolling (the frame itself is one screen), so one screen of scrolling is `SCREEN` = 1/49, about 0.0204 of progress. Lengths below are given in screens, the unit of the reference pacing.

How the scroll reaches the story:

- The browser scrolls the page; nothing hijacks wheel or touch. Lenis smooths wheel input only (touch keeps its native momentum) and runs on the GSAP ticker, with `lagSmoothing(0)`.
- Every Lenis scroll calls `ScrollTrigger.update`. One ScrollTrigger maps the section to `progress` (0 to 1) and `velocity` (screens per second, positive scrolling down). Both are motion values: nothing sets React state per frame. React state changes only when something discrete changes (the scene, the chapter, the tone, a beat's mount window).
- Everything else reads `progress` and maps it through ranges from the script. Because every scroll-driven value is a function of `progress` alone, scrolling up plays everything backwards exactly.
- A resize or an orientation change keeps the same progress, not the same pixel offset: the story freezes, the geometry is measured again once the resizing stops (120 ms), and the page scrolls to the same progress on the new stage.
- Instant jumps (seeking in the dev timeline, the restore after a resize) are not motion: `velocity` reads 0 through them. Smooth jumps (ruler entries, "Apply") are real scrolls and report their speed.
- `registerGsap()` also registers the story's easing curve as a GSAP ease named `story`, for the camera moves.

## How positions are written

- Scenes are laid end to end by their share of the stage. The shares add up to 1, so the scenes tile 0 to 1 with no gaps.
- Everything else is anchored to a scene: `at("pluck", 0.27)` is 27% of the way through the pluck. Retuning a scene's share moves its beats, transitions and camera keys with it.
- Text lengths and ramps are in screens. A beat stays on screen about 1.3 screens, with about 0.3 screen of gap before the next beat in the same slot. Changing `STAGE_VH` keeps lengths given in screens (beat lengths, ramps) the same number of screens, while everything placed inside a scene scales with the stage; `validateScript()` then says if any beat got too short or ran into the next one.
- The chapter starts are fixed numbers, measured on the reference: the ruler switches exactly at 0.012, 0.232, 0.400 and 0.628. The scene shares are chosen so that The Work, The Terms and Questions each start exactly on a scene boundary.

## Chapters

The ruler shows four chapters. The Model starts at 0.012, but it is also the chapter before that point, so the ruler reads "The Model" from the first frame. The finale belongs to "End" in the storyboard; the ruler keeps showing Questions through it.

| Chapter | Ruler switches at | Screen |
| --- | --- | --- |
| The Model | 0.0120 | 0.59 |
| The Work | 0.2320 | 11.37 |
| The Terms | 0.4000 | 19.60 |
| Questions | 0.6280 | 30.77 |

## The story, scene by scene

Positions are in screens of scrolling from the top of the stage (0 to 49).

**1. Hero, 0.00 to 1.47.** The camera is wide and still. The hero copy is already on screen when the page opens: the title, subtitle and "Start a partnership" button center left, and the "What we do" tag and paragraph bottom left. They play a short timed intro once per page load, hold for a quarter screen (the bottom copy for 0.4), then blur and drift left, title first, and are gone by 1.00. Scrolling back up brings them back the same way, with no second intro.

**2. Ascent, 1.47 to 3.92.** No text (the hero copy has already drifted away). The camera pushes in on the statue from 1.47 (second leg at 2.16), eases into a pan along the rising trunk at 2.82, dollies up from 3.55 and settles on a single branch at 3.92. Its timings are the `ASCENT` object in the script, played by `src/components/stage/ascent-art.tsx` through the pure functions in `ascent-tree.ts`:

- The statue, its orange and the top of the minaret rise together, slowly at first, then faster, to 10 world units by the end. The shaft is one tiling plate that grows from a fixed bottom (more tiles, never stretched).
- The stone turns to bark through the morph mask along a front that climbs the shaft: it enters the frame as the camera pushes in (`ASCENT.front`, world heights) and has closed on the top of the trunk by 2.84 (`ASCENT.barked`).
- Three branches scale out from the trunk once it is tall enough (from 2.94, 3.19 and 3.43), and their leaves unfurl with them (a bud turned toward the branch opens to rest).
- The glow keeps the hero's full brightness and rides up with the orange (the ripple clock is shared with the hero's, so the two scenes' glows trade places without adding up); the statue, the orange and the glow fade once above the frame (`ASCENT.statueFade`).

**3. Graft, 3.92 to 6.37.** No text. The camera holds on the branch while the hands graft the cutting (3.92 to 5.44), then dollies up and pulls out to the fruiting tree by 6.37.

**4. Pluck, 6.37 to 9.31.** The camera holds on the tree while the hand rises (6.37 to 7.40), then dollies down through the branches to the harvester (7.40 to 8.66) and holds. As the hand closes on the orange (7.16), "We get you found." arrives center left; a thin progress line draws along the top hairline from 7.16 to 7.76 and erases as the beat leaves (8.16 to 8.46). As the harvester is revealed (8.77), "We split the harvest." arrives bottom left with the "Revenue share" tag; the line beside the tag types itself out during the beat.

**5. Share, 9.31 to 11.37.** The camera holds on the harvester, then pushes into the orange from 9.76 while the harvest beat fades (gone by 10.07). It holds on the halves from 10.24 and pushes into them from 10.79. The hairlines close into a square viewfinder around the halves (10.34 to 10.73), hold it until 11.00 and open out by 11.25. The sand sweeps in from 10.76, covers the screen fully from 11.33 to 11.41 (the camera reframes unseen at 11.33), and clears by 11.72. The ruler switches to The Work at 11.37; the hairlines slide out and come back under the sand.

**6. Work, 11.37 to 16.27.** The camera dollies slowly upward through the clouds from 11.41. The service cards take turns in the right column: card 1 from 11.86 to 13.16, card 2 from 13.46 to 14.76, card 3 from 15.06 to 16.66 (1.6 screens for its longer body), each 0.3 screen after the last.

**7. Blueprint, 16.27 to 19.60.** The camera holds on the scaffold, then pushes into the plan from 17.43 as it unfolds. The paper unfold starts at 19.13 and covers the screen fully from 19.52 to 19.68 (the camera reframes unseen at 19.52), then opens onto the next scene by 20.07. The chrome and hairlines turn ink on milk from 19.27 to 20.07. The ruler switches to The Terms at 19.60.

**8. Site, 19.60 to 23.52.** From ground level at 19.68 the camera rises to a straight top-down view by 21.25, then pulls out (21.25 to 22.34) as the view shrinks into the left half and holds. The right half is milk white from 21.17 until the dust covers it at 23.48 (ink chrome and text). The terms block sits in the right column from 21.40 to 23.28. The rising dust starts at 23.21, covers the screen from 23.48 to 23.56 and clears by 23.85.

**9. Prune, 23.52 to 27.20.** The camera holds on the gardener from 23.56. "The Terms" starts rising from the bottom in very large type at 23.96 and shrinks as it climbs until it docks in the top-left corner by 25.36. The fit text and its "In plain terms" aside arrive bottom left at 25.18. Both stay until the orange falls.

**10. Fall, 27.20 to 30.77.** The camera pushes toward the gardener's face (27.20 to 27.98), dollies down after the falling orange (27.98 to 28.80), pushes into it (28.80 to 29.41), then dollies up between the rows of trees. All the text blurs and sinks back into the picture between 27.97 and 28.38. The rainbow ring sweeps out from the orange from 28.80 to 29.56 and leaves the orchard behind it. The ruler switches to Questions at 30.77, with the hairlines sliding out from 30.47 and back by 31.37.

**11. Questions, 30.77 to 37.63.** "Questions worth asking first." arrives top center at 30.77 and stays through all five cards. The cards take turns in the center: question 1 from 31.01 to 32.21, question 2 from 32.34 to 33.54, question 3 from 33.67 to 34.87, question 4 from 35.01 to 36.21, question 5 from 36.33 to 37.53. Each zooms in from small; cards 1 to 4 swing left along a curve as they leave, and the next one arrives 0.13 screen later. After the last card, the cards and the title dissolve upward like smoke (37.24 to 37.53). The camera dollies up between the rows until 36.95, then pushes forward into the blue. The fabric sky starts at 37.43, covers the screen from 37.58 to 37.68 (the camera reframes unseen) and clears by 38.12.

**12. Stars, 37.63 to 40.08.** No text. The camera holds on the stargazer from 37.68 while the constellation grows.

**13. Apply, 40.08 to 44.00.** The application tag, title and subtitle arrive top left at 40.40; the form fades in on the right from 40.55. Both are fully on screen from about 40.85 to 44.30 (this is where "Apply" lands), then blur, rise and fade out by 44.60, in the finale.

**14. Finale, 44.00 to 49.00.** The camera holds while the art moves. The hairlines slide out to the edges (45.75 to 46.50), then close in from there into a square viewfinder by 48.25 and stay closed. The wordmark, subtitle, copyright and email arrive inside the frame from 47.00 and never leave. The page ends at 49.00; further scrolling does nothing, and scrolling up plays everything back to the hero.

## Scenes

The shares come from the storyboard pacing. A scene owns `[start, end)`; the finale also owns progress 1.

| # | Scene | Part | Share | Progress | Screens | Length |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `hero` The raised orange | The Model | 0.030 | 0.0000 to 0.0300 | 0.00 to 1.47 | 1.47 |
| 2 | `ascent` The minaret becomes a tree | The Model | 0.050 | 0.0300 to 0.0800 | 1.47 to 3.92 | 2.45 |
| 3 | `graft` The graft | The Model | 0.050 | 0.0800 to 0.1300 | 3.92 to 6.37 | 2.45 |
| 4 | `pluck` The pluck and the harvester | The Model | 0.060 | 0.1300 to 0.1900 | 6.37 to 9.31 | 2.94 |
| 5 | `share` The cut and the share | The Model | 0.042 | 0.1900 to 0.2320 | 9.31 to 11.37 | 2.06 |
| 6 | `work` Services in the clouds | The Work | 0.100 | 0.2320 to 0.3320 | 11.37 to 16.27 | 4.90 |
| 7 | `blueprint` The blueprint | The Work | 0.068 | 0.3320 to 0.4000 | 16.27 to 19.60 | 3.33 |
| 8 | `site` The building site by the sea | The Terms | 0.080 | 0.4000 to 0.4800 | 19.60 to 23.52 | 3.92 |
| 9 | `prune` The gardener | The Terms | 0.075 | 0.4800 to 0.5550 | 23.52 to 27.20 | 3.68 |
| 10 | `fall` The falling orange | The Terms | 0.073 | 0.5550 to 0.6280 | 27.20 to 30.77 | 3.58 |
| 11 | `faq` The questions | Questions | 0.140 | 0.6280 to 0.7680 | 30.77 to 37.63 | 6.86 |
| 12 | `stars` The stargazer | Questions | 0.050 | 0.7680 to 0.8180 | 37.63 to 40.08 | 2.45 |
| 13 | `apply` The application | Questions | 0.080 | 0.8180 to 0.8980 | 40.08 to 44.00 | 3.92 |
| 14 | `finale` The orchard keepers | End | 0.102 | 0.8980 to 1.0000 | 44.00 to 49.00 | 5.00 |

## Beats

A beat is one block of text: a slot, a range and a copy key into `src/content/copy.ts` (with `parts` when it shows only some fields of that node). Inside its range `[in, out)` it arrives, holds fully on screen, then leaves, all scrubbed by progress; outside its range it is hidden. Its content mounts 0.75 screen before it arrives and unmounts 0.75 screen after it leaves, so React state changes only at those two points. Interactive content (buttons, the form) is clickable only while the beat is fully on screen.

Slots, on the layout grid from `DESIGN.md`:

| Slot | Where |
| --- | --- |
| `center-left` | Column A, a little below the middle |
| `bottom-left` | Bottom; tags in column A, text one tab-width right in column B |
| `right` | The right column, from about 52% to the right hairline |
| `top-left` | Below the top hairline, column A |
| `top-center` | Below the top hairline, centered |
| `center` | The middle of the stage (question cards, the finale wordmark) |

Arrivals: `load` (already there; a short timed intro once per page load), `reveal` (headline letters rise in one by one, the other lines follow), `fade` (lines fade and un-blur), `zoom` (the block grows from small), `dock` (starts very large at the bottom, rises and shrinks into its slot). Leaves: `drift-left`, `fade`, `smoke` (blur, rise, dissolve), `sink` (blur back into the picture), `swing-left` (along a curve, shrinking and blurring), `hold` (never leaves). Lines inside a beat stagger both ways, first line first.

| Beat | Slot | Copy key | In | Fully on screen | Out | Screens | Arrives / leaves |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hero` | center-left | `model.hero` (title, subtitle, button) | 0.0000 | 0.0000 to 0.0051 | 0.0204 | 1.00 | load / drift-left |
| `hero-intro` | bottom-left | `model.hero` (tag, paragraph) | 0.0000 | 0.0000 to 0.0082 | 0.0204 | 1.00 | load / drift-left |
| `found` | center-left | `model.found` | 0.1462 | 0.1523 to 0.1666 | 0.1727 | 1.30 | reveal / fade |
| `harvest` | bottom-left | `model.harvest` | 0.1789 | 0.1850 to 0.1994 | 0.2055 | 1.31 | reveal / fade |
| `card-1` | right | `work.cards.0` | 0.2420 | 0.2481 to 0.2624 | 0.2685 | 1.30 | reveal / fade |
| `card-2` | right | `work.cards.1` | 0.2747 | 0.2808 to 0.2951 | 0.3012 | 1.30 | reveal / fade |
| `card-3` | right | `work.cards.2` | 0.3074 | 0.3135 to 0.3339 | 0.3401 | 1.60 | reveal / fade |
| `terms` | right | `terms.block` | 0.4368 | 0.4429 to 0.4691 | 0.4752 | 1.88 | reveal / fade |
| `terms-title` | top-left | `terms.chapterTitle` | 0.4890 | 0.5176 to 0.5709 | 0.5791 | 4.41 | dock / sink |
| `fit` | bottom-left | `terms.fit` | 0.5138 | 0.5199 to 0.5709 | 0.5791 | 3.20 | reveal / sink |
| `questions-title` | top-center | `questions.title` | 0.6280 | 0.6351 to 0.7599 | 0.7660 | 6.76 | reveal / smoke |
| `question-1` | center | `questions.items.0` | 0.6329 | 0.6390 to 0.6513 | 0.6574 | 1.20 | zoom / swing-left |
| `question-2` | center | `questions.items.1` | 0.6601 | 0.6662 to 0.6784 | 0.6845 | 1.20 | zoom / swing-left |
| `question-3` | center | `questions.items.2` | 0.6872 | 0.6933 to 0.7056 | 0.7117 | 1.20 | zoom / swing-left |
| `question-4` | center | `questions.items.3` | 0.7144 | 0.7205 to 0.7327 | 0.7389 | 1.20 | zoom / swing-left |
| `question-5` | center | `questions.items.4` | 0.7415 | 0.7477 to 0.7599 | 0.7660 | 1.20 | zoom / smoke |
| `apply-intro` | top-left | `questions.application` (tag, title, subtitle) | 0.8244 | 0.8305 to 0.9041 | 0.9102 | 4.21 | reveal / smoke |
| `apply-form` | right | `questions.application` (fields, submit) | 0.8276 | 0.8337 to 0.9041 | 0.9102 | 4.05 | fade / smoke |
| `finale` | center | `finale` (wordmark, subtitle, copyright, email) | 0.9592 | 0.9714 to 1.0000 | 1.0000 | 2.00 | reveal / hold |

Pacing, and where it bends on purpose:

- The plain beats (`found`, `harvest`, the service cards) stay 1.3 screens (0.3 to arrive, 0.7 fully on screen, 0.3 to leave) with 0.3 screen between neighbours in the same slot, as measured on the reference.
- The hero copy leaves within the first screen, as on the reference.
- Five question cards share the 6.86 screens of the questions scene, so each holds 1.2 screens with 0.13 screen between them: a leaving card has fully swung away before the next one zooms in.
- Some blocks stay through a whole stretch of camera work: the terms block, the docking chapter title and the fit text, the questions title (through all five cards), the application, and the finale (to the end of the page).
- Long stretches without any text (the ascent, the graft, the stars) are deliberate.

Gaps between beats in the same slot, in screens:

- center-left: `hero` to `found` 6.16
- bottom-left: `hero-intro` to `harvest` 7.77, `harvest` to `fit` 15.10
- right: `card-1` to `card-2` 0.30, `card-2` to `card-3` 0.30, `card-3` to `terms` 4.74, `terms` to `apply-form` 17.27
- top-left: `terms-title` to `apply-intro` 12.02
- top-center: one beat
- center: `question-1` to `question-2` 0.13, then 0.13 between each card, `question-5` to `finale` 9.47

## Transitions

Covering transitions (sand, unfold, dust, fabric) straddle a scene boundary and cover the screen fully across it ("Full" below), so the scenes swap where nobody can see, and the camera may reframe there. The rainbow ring sweeps from the falling orange to the orchard inside the fall scene. The smoke is a text effect on the last question and the questions title. The two viewfinders are drawn by the hairlines: the lines close into a square around a target rectangle (the halves in scene 5, the wordmark in scene 14); the finale one never opens again.

| Transition | Kind | Scenes | Start | Full | End | Screens | Layer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `viewfinder-share` | viewfinder | share | 0.2110 | 0.2190 to 0.2244 | 0.2295 | 0.91 | hairlines |
| `sand` | sand | share to work | 0.2196 | 0.2312 to 0.2328 | 0.2392 | 0.96 | canvas |
| `unfold` | unfold | blueprint to site | 0.3905 | 0.3984 to 0.4016 | 0.4096 | 0.94 | canvas |
| `dust` | dust | site to prune | 0.4736 | 0.4792 to 0.4808 | 0.4868 | 0.64 | canvas |
| `ring` | ring | fall | 0.5878 | none | 0.6032 | 0.75 | canvas |
| `smoke` | smoke | faq | 0.7599 | none | 0.7660 | 0.30 | text |
| `fabric` | fabric | faq to stars | 0.7638 | 0.7670 to 0.7690 | 0.7780 | 0.70 | canvas |
| `viewfinder-finale` | viewfinder | finale | 0.9490 | 0.9847 to 1.0000 | 1.0000 | 2.50 | hairlines |

How each one plays, all scrubbed by progress and so exactly reversible. Every effect draws nothing at its start (the old scene, untouched) and nothing at its end (the new scene, untouched); the covering ones cover every pixel across "Full". The unit test (`src/components/transitions/choreography.test.ts`) proves those three points from the same bounds the shaders use.

- **Sand.** Deep blue sand blows in from the left on a ragged, wind-streaked front, loose grains flying ahead of it, and covers everything. While it covers, its grains keep drifting on idle time. Then it blows on to the right, uncovering The Work from the left.
- **Paper unfold.** The white spreads from the middle until the frame is milk paper (the chrome turns ink). Then the next scene opens out of the white like a folded sheet: the middle column's top panel lifts and falls open, then the left and right columns swing out from behind it, each shaded while it tilts; the creases fade as the sheet settles flat.
- **Rising dust.** Blue rises from the bottom behind a billowing, lit edge, white specks lifting in it and ahead of it, until it covers the screen; then it lifts off the top, uncovering the gardener from the bottom up.
- **Rainbow ring.** A soft spectral band (violet inside, red outside) expands from `origin` (the falling orange) past the farthest corner. Inside it the new scene shows: a plate passes `reveal={{ transition: "ring" }}` to show only inside the ring (and `side: "outside"` to show only outside it), so the orchard rows appear inside the ring while the falling orange, which has no `reveal`, stays in front throughout. The fall scene's art (phase 15) puts `reveal` on its orchard plates.
- **Fabric sky.** The sky turns to rippling cloth, spreading from the middle toward the trees, while a cloud billows from the top centre toward the viewer until it fills the screen. Then a ragged hole opens through it from the middle onto the blue cloth, which clears onto the stargazer.
- **Smoke.** The beats it lists (the last question and the questions title) dissolve together across its range: their lines blur and rise, first line first, and soft holes of smoke noise open in them and drift upward (a CSS mask). Every beat that leaves as `smoke` gets the same mask over its own leave. `SmokeOut` (BlurFade drifting up, plus the mask) does the same for any other group of text.
- **Viewfinders.** The hairlines' `viewfinder` cue (see below): the lines close in from wherever they are into a square around `target`.

Where they are drawn:

- The covering and sweeping ones draw on the transition canvas (`TransitionCanvas`, React Three Fiber): one full-screen shader pass per transition, premultiplied over the stage. Fronts, folds, radii and fades are computed in `choreography.ts`; `shaders.ts` adds the texture (ragged edges, grain, specks, paper fibre, fold shading, the spectrum, the cloth and the cloud). Sweeping fronts move in step with the scroll; fades and folds use the story curve.
- The canvas renders only while a transition runs, plus one clearing frame as it ends; while the sand, the dust or the fabric is on screen it keeps rendering on idle time for its drift. Its pixel ratio is capped at `TRANSITION_MAX_DPR`, its shaders compile while the browser is idle, and its art loads `TRANSITION_PRELOAD_SCREENS` before it is needed: `fall/ring-mask` (the ring's band, a radial image, bright where the ring is), `stars/fabric-sky` (the cloth) and `stars/cloud` (the billowing cloud). Until the art arrives, the shaders draw stand-ins.
- Only one canvas transition runs at a time (`validateScript()` checks it).
- In development, `/design` plays every transition on its real range between placeholder plates of the scenes it joins.

## Camera

The camera rig (`src/components/stage/camera-rig.tsx`) builds one paused GSAP timeline from these keys (`camera-path.ts`), with the story's easing curve on every move, and seeks it to the progress every frame, so the camera always interpolates and plays backwards exactly. Each key is a camera position, a target and a vertical field of view (world units: x right, y up, z toward the viewer; plates sit at z 0 or behind), plus the kind of move that starts there and runs to the next key: `hold`, `push`, `pull`, `pan`, `dolly-up`, `dolly-down`, or `reframe`. The camera always interpolates between keys and never cuts; a `reframe` happens only while a transition fully covers the screen. Every scene has at least one key, and keys never share a position.

| Scene | At | Move from here | Position | Target | FOV |
| --- | --- | --- | --- | --- | --- |
| hero | 0.0000 | hold | 0, 0, 14 | 0, 0, 0 | 35 |
| ascent | 0.0300 | push | 0, 0, 14 | 0, 0, 0 | 35 |
| ascent | 0.0575 | pan | 2.6, 3.4, 7.5 | 2.8, 3.6, 0 | 32 |
| ascent | 0.0725 | dolly-up | 2.2, 6.4, 6.5 | 2.2, 6.6, 0 | 31 |
| graft | 0.0800 | hold | 2, 8.4, 5.5 | 2, 8.4, 0 | 30 |
| graft | 0.1110 | pull | 2, 8.4, 5.5 | 2, 8.4, 0 | 30 |
| pluck | 0.1300 | hold | 1.6, 11, 12 | 1.6, 10.5, 0 | 36 |
| pluck | 0.1510 | dolly-down | 1.6, 11, 12 | 1.6, 10.5, 0 | 36 |
| pluck | 0.1768 | hold | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 |
| share | 0.1900 | hold | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 |
| share | 0.1992 | push | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 |
| share | 0.2089 | hold | 1.5, 4.5, 4.8 | 1.5, 4.5, 0 | 30 |
| share | 0.2202 | push | 1.5, 4.5, 4.8 | 1.5, 4.5, 0 | 30 |
| share | 0.2312 | reframe | 1.5, 4.5, 2.2 | 1.5, 4.5, 0 | 28 |
| work | 0.2328 | dolly-up | 0, 0, 14 | 0, 0.5, 0 | 40 |
| blueprint | 0.3320 | hold | 0, 9, 13 | 0, 9.5, 0 | 38 |
| blueprint | 0.3558 | push | 0, 9, 13 | 0, 9.5, 0 | 38 |
| blueprint | 0.3984 | reframe | 0, 9.6, 5 | 0, 9.6, 0 | 34 |
| site | 0.4016 | dolly-up | 0, 1.2, 12 | 0, 1, 0 | 38 |
| site | 0.4336 | pull | 0, 13, 0.01 | 0, 0, 0 | 38 |
| site | 0.4560 | hold | 0, 24, 0.01 | 0, 0, 0 | 38 |
| site | 0.4792 | reframe | 0, 24, 0.01 | 0, 0, 0 | 38 |
| prune | 0.4808 | hold | 0, 0, 12 | 0, 0.5, 0 | 35 |
| fall | 0.5550 | push | 0, 0, 12 | 0, 0.5, 0 | 35 |
| fall | 0.5711 | dolly-down | 0.4, 2.2, 6.5 | 0.4, 2.2, 0 | 32 |
| fall | 0.5878 | push | 0, -3, 5 | 0, -3, 0 | 32 |
| fall | 0.6003 | dolly-up | 0, -3, 2.6 | 0, -3, 0 | 30 |
| faq | 0.6280 | dolly-up | 0, 1, 12 | 0, 2, 0 | 40 |
| faq | 0.7540 | push | 0, 4.5, 12 | 0, 5.5, 0 | 40 |
| faq | 0.7670 | reframe | 0, 5, 6 | 0, 6, 0 | 38 |
| stars | 0.7690 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 |
| apply | 0.8180 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 |
| finale | 0.8980 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 |

## Scenes on the canvas

Only the scene on stage and its two neighbours are mounted on the WebGL canvas, and only the current scene and the next one are preloaded. Each scene's art fades with its presence (`src/components/stage/presence.ts`): where a covering transition hands one scene to the next, the swap is a step at the boundary, under full cover; at a plain boundary the incoming scene fades in over the outgoing one across 0.2 screen to each side. Scenes without custom art (`SCENE_ART` in `scene-layers.tsx`) draw their manifest plates where the manifest places them.

### The hero's art

The hero has custom art (`src/components/stage/hero-art.tsx`, registered in `SCENE_ART`). It draws the manifest plates with two moves on top:

- **The intro**, once per page view, on time (`hero-intro.ts`): the sky, then the minaret and statue (with the orange as its own layer), then the onlookers by depth, then the text. The canvas starts it when the hero's plates have loaded; the hero text (a `load` beat) waits for its `INTRO.text` mark, or arrives `INTRO.fallback` seconds after load if the canvas never starts. Once played it never plays again: scrolling back finds the finished frame.
- **The glow**, on idle time and always on (`glow-ripple.tsx`): about 300 instanced droplets travel outward from the orange in slow rings ("rain in reverse"), with a halo breathing behind the orange. It runs before the first scroll. Over the hero scene the glow *lift* (0 to 1, from `sceneProgress("hero", p)`) brightens it toward white and speeds the ripple up a little; scrolling up reverses it exactly (the speed-up changes the rate of an accumulated clock, so the ripple never jumps).

## Hairlines, progress lines and tone

The hairline grid moves on cues, each an envelope: it starts, reaches full strength, holds, releases and is gone. `exit` slides the lines out toward their edges (corner stars lock into the screen corners); `viewfinder` closes them into a square frame. At each chapter change the lines leave under the covering transition when there is one, otherwise in a short envelope around the chapter start. In the finale they slide out and then close into the viewfinder, and stay.

| Cue | Starts | Full | Releases | Gone |
| --- | --- | --- | --- | --- |
| viewfinder (share) | 0.2110 | 0.2190 | 0.2244 | 0.2295 |
| exit (into The Work) | 0.2196 | 0.2312 | 0.2328 | 0.2392 |
| exit (into The Terms) | 0.3905 | 0.3984 | 0.4016 | 0.4096 |
| exit (into Questions) | 0.6219 | 0.6280 | 0.6321 | 0.6402 |
| exit (finale) | 0.9337 | 0.9490 | never | never |
| viewfinder (finale) | 0.9490 | 0.9847 | never | never |

- Progress line `found-line`: draws along the top hairline from 0.1462 to 0.1584 as "We get you found." arrives, and erases from 0.1666 to 0.1727 as it leaves.
- Tone: the chrome, the hairlines and the text turn ink on milk during the paper unfold (0.3933 to 0.4096) and over the top-down site with its milk panel (0.4320 to 0.4792). Everywhere else they are white on sky.

## Navigation

Chapter entries (ruler and chapter menu), the "Apply" pill and the hero button scroll smoothly to anchors that land after any covering transition has cleared:

| Anchor | Progress | Lands on |
| --- | --- | --- |
| `model` | 0 | The hero |
| `work` | 0.2392 | The clouds, once the sand has cleared |
| `terms` | 0.4096 | The site, once the unfold has opened |
| `questions` | 0.6351 | "Questions worth asking first." fully on screen |
| `apply` | 0.8337 | The form fully on screen |

The ruler's progress line has one segment per stretch between `RULER_STOPS`: every chapter start and every scene start (0.012, 0.03, 0.08, 0.13, 0.19, 0.232, 0.332, 0.4, 0.48, 0.555, 0.628, 0.768, 0.818, 0.898), so short segments mark short scenes and long ones mark long camera moves.

## Checks

`validateScript()` collects every problem and throws a `ScriptError` listing them. It runs when the stage module loads in development, so a broken script stops the page, and in the unit test (`npm test`, also run in CI). It checks that:

- the scenes follow the storyboard order and tile 0 to 1 exactly: no gaps, no overlaps, each as long as its share;
- the chapters start inside 0 to 1, in order;
- no two beats in the same slot overlap, every beat lasts at least one screen, every hold is inside its range, a beat that never leaves runs to 1, and every copy key (and part) exists in the copy deck;
- every transition has a valid range and peak, is sorted by start, starts on the stage (a ring's `origin`), and a transition that hands one scene to the next straddles their boundary and fully covers the screen at it; transitions on the one transition canvas never overlap;
- the camera starts at 0, its keys increase strictly, every scene has a key, fields of view stay between 10 and 90 degrees, and every `reframe` sits inside a full cover;
- hairline envelopes are in order, progress lines draw before they erase, and tones and anchors stay inside 0 to 1.

## Helpers

From `src/scroll/helpers.ts`, pure and safe on the server, in tests and inside scroll callbacks:

- `sceneProgress(id, p)`: how far through a scene p is, 0 to 1, clamped. Art inside a scene choreographs on this.
- `currentScene(p)` and `currentChapter(p)`: the scene and the ruler chapter at p.
- `beatVisible(id, p)`: whether a beat is on stage at p (arriving, holding or leaving).
- Also `sceneAt(id, t)` (the inverse of `sceneProgress`), `visibleBeats(p)`, `beatEnterAmount` and `beatLeaveAmount`, `beatLineRanges` (the per-line stagger), `transitionProgress(id, p)`, `activeTransitions(p)`, `smokeRange(beat)` (where a beat dissolves as smoke) and `toneAt(p)`.
- For transitions, `src/components/transitions/choreography.ts` adds `transitionPhase(def, p)` (how far through its covering ramp, peak and clearing ramp p is), `canvasTransitionAt(p, defs)`, the per-effect frames (`sandFrame`, `unfoldFrame`, `dustFrame`, `ringFrame`, `fabricFrame`) and `revealCircle(def, p, width, height)`.

In components, `useStory()` gives the `progress` and `velocity` motion values and `scrollTo(p)`. To show something in a scene, map `progress` through `sceneProgress` with `useTransform`, or write to the DOM from `progress.on("change")`; to render content for a beat, register a component for its id in `BEAT_CONTENT` (`src/components/story/story-stage.tsx`) and build it from `BeatLine`, `Headline` and `TypedLine` so it keeps the beat's timing.

## Dev timeline

In development, the backtick key toggles a panel along the bottom (it remembers whether it was open). It draws the whole script on one bar: scenes colored by chapter, one row of beats per slot (the brighter part is the hold), transitions (the brighter part is the full cover), camera keys, and the chapter starts, with a playhead at the current progress. It reads out the progress, the screen, the scene (and how far through it), the chapter, the beats on stage and the velocity. While it is open, number keys jump to scene starts (1 to 9, 0 for scene 10, Shift with 1 to 4 for scenes 11 to 14), and clicking or dragging on the bar seeks. "This chapter" zooms the bar to the current chapter.

## Reduced motion

Visitors who prefer reduced motion get no pinned stage, no smooth scrolling and no canvas. CSS (`motion-reduce:`) shows them a normal stacked page instead, before any script runs: the four chapters and the finale in order, one still per scene (the placeholder plate as an image), and all the copy in reading order. The "Apply" link jumps to the application on that page.
