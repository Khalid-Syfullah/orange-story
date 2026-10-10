# Orange: the scroll script

The whole story is data in `src/scroll/script.ts`: chapters, scenes, text beats, transitions, camera keys, hairline cues, tones and navigation anchors, all placed on one 0 to 1 `progress`. This file says the same thing in prose, with the final tuned numbers. The script is the source of truth: if the two disagree, the script wins. In development, the dev timeline (press the backtick key) shows the live values.

| What | Where |
| --- | --- |
| The script (data only) | `src/scroll/script.ts` |
| Its shapes | `src/scroll/types.ts` |
| Builders it uses (scene tiling, points inside scenes) | `src/scroll/define.ts` |
| Questions about a progress (`sceneProgress`, `currentScene`, `currentChapter`, `beatVisible`, ...) | `src/scroll/helpers.ts` |
| Checks (`validateScript()`) | `src/scroll/validate.ts` |
| Unit tests (`npm test`) | `src/**/*.test.ts`, the script's in `src/scroll/script.test.ts` |
| The scroll test (`npm run test:story`, Playwright) | `e2e/story.spec.ts`, `playwright.config.ts` |
| Scroll engine (Lenis, ScrollTrigger, `progress` and `velocity`) | `src/scroll/stage-scroll.ts` |
| Phones: the bent scroll map, restoration, deep links | `src/scroll/mobile.ts`, `src/scroll/navigation.ts`, `src/components/story/story-location.ts` |
| React access to the story (context and hooks) | `src/scroll/story-scroll.tsx` |
| The pinned stage, the beats, the question deck, the dev timeline, the reduced-motion page | `src/components/story/` |
| Art manifest (every plate, its file, size and place in depth) | `public/art/manifest.json`, read by `src/art/manifest.ts` |
| Stage canvas: plates, morph, twinkle, sway, camera rig, scene presence, adaptive quality | `src/components/stage/` |
| Art receding behind text (`useTextHaze`, `SLOT_AREAS`) | `src/components/stage/text-haze.ts`, `src/components/stage/use-text-haze.ts` |
| Transitions: choreography, shaders, the transition canvas | `src/components/transitions/` |
| Smoke-out for text | `src/components/motion/smoke-out.tsx` |

## The final numbers

What phase 21 tuned, in one place (all of it lives in `src/scroll/script.ts`):

| Setting | Value | Why |
| --- | --- | --- |
| `STAGE_VH` | 5400 (53 screens of scrolling) | The reference's length. At 5000 The Work could not fit its three cards between the sand and the blueprint. |
| One screen (`SCREEN`) | 1/53 = 0.01887 of progress | |
| Chapter starts | 0.012, 0.232, 0.400, 0.628 | Measured on the reference; unchanged. |
| Scene shares | 0.03, 0.05, 0.05, 0.06, 0.042, **0.106**, **0.062**, 0.08, 0.075, 0.073, 0.14, 0.05, 0.08, 0.102 | The Work grew from 0.100 to 0.106 and the blueprint shrank from 0.068 to 0.062, inside the same chapter. |
| Plain beats | 1.3 screens: 0.3 to arrive, 0.7 fully on screen, 0.3 to leave; 0.3 screen between beats in a slot | The reference pacing. Every beat stays on screen at least one screen (checked). |
| Service cards | chained from the sand's end: 1.3, 1.3 and 1.6 screens, 0.3 apart | The last one has left before the blueprint starts to fade in (unit test). |
| Question cards | 1.3 screens each, end to end; 0.35 to arrive, 0.6 held, 0.35 to leave | The reference beat; the camera climbs during each arrival and holds while the card is read. |
| Paper unfold | covers over 0.51 screen, opens over 0.73 | Was 0.39 and 0.39: the sheet flipped open too fast. |
| Camera | a monotone cubic through the keys (see Camera) | The story curve front-loaded every move: 76% of it in the first quarter and 96% by half way, so long moves lurched and then sat still. |
| Stage pixel ratio | 1 to 1.5 (1.25 on a phone), stepping down to 0.75 on a device that cannot keep up | `quality.ts` |

## The stage

The site is one `<section>` that is `STAGE_VH` tall (5400vh), scrolled natively. Inside it a sticky frame, exactly one viewport tall, holds every layer, bottom to top:

1. the WebGL canvas with the scene plates;
2. the milk panel of the building site (DOM, under the transitions);
3. the transition canvas (sand, paper unfold, dust, rainbow ring, fabric sky), shown and rendered only while one of them runs;
4. the hairlines, and the progress lines that run along them;
5. the DOM text layer: every beat of the script, each in its slot;
6. the chrome: mark, chapter menu, "Apply", ruler, percent counter.

`progress` is 0 when the top of the section meets the top of the viewport and 1 when its bottom meets the bottom. A 5400vh stage gives 53 screens of scrolling (the frame itself is one screen), so one screen of scrolling is `SCREEN` = 1/53, about 0.0189 of progress. Lengths below are given in screens, the unit of the reference pacing.

The section reports where the story is as data attributes, changed only when they change (never per frame): `data-scene` (the scene id), `data-chapter` (the ruler chapter) and `data-tone` (`sky` or `milk`). The scroll test reads them.

How the scroll reaches the story:

- The browser scrolls the page; nothing hijacks wheel or touch. Lenis smooths wheel input only (touch keeps its native momentum) and runs on the GSAP ticker, with `lagSmoothing(0)`.
- Every Lenis scroll calls `ScrollTrigger.update`. One ScrollTrigger maps the section to `progress` (0 to 1) and `velocity` (screens per second, positive scrolling down). Both are motion values: nothing sets React state per frame. React state changes only when something discrete changes (the scene, the chapter, the tone, a beat's mount window).
- Everything else reads `progress` and maps it through ranges from the script. Because every scroll-driven value is a function of `progress` alone, scrolling up plays everything backwards exactly.
- A resize or an orientation change keeps the same progress, not the same pixel offset: the story freezes, the geometry is measured again once the resizing stops (120 ms), and the page scrolls to the same progress on the new stage.
- Instant jumps (seeking in the dev timeline, the restore after a resize) are not motion: `velocity` reads 0 through them. Smooth jumps (ruler entries, "Apply") are real scrolls and report their speed.
- `registerGsap()` also registers the story's easing curve as a GSAP ease named `story`, for any GSAP tween that should match CSS and motion.

## How positions are written

- Scenes are laid end to end by their share of the stage. The shares add up to 1, so the scenes tile 0 to 1 with no gaps.
- Everything else is anchored to a scene: `at("pluck", 0.27)` is 27% of the way through the pluck. Retuning a scene's share moves its beats, transitions and camera keys with it.
- Text lengths and ramps are in screens. A beat stays on screen about 1.3 screens, with about 0.3 screen of gap before the next beat in the same slot. Changing `STAGE_VH` keeps lengths given in screens (beat lengths, ramps, the service cards' chain) the same number of screens, while everything placed inside a scene scales with the stage; `validateScript()` then says if any beat got too short or ran into the next one.
- The chapter starts are fixed numbers, measured on the reference: the ruler switches exactly at 0.012, 0.232, 0.400 and 0.628. The scene shares are chosen so that The Work, The Terms and Questions each start exactly on a scene boundary.

## Chapters

The ruler shows four chapters. The Model starts at 0.012, but it is also the chapter before that point, so the ruler reads "The Model" from the first frame. The finale belongs to "End" in the storyboard; the ruler keeps showing Questions through it.

| Chapter | Ruler switches at | Screen |
| --- | --- | --- |
| The Model | 0.0120 | 0.64 |
| The Work | 0.2320 | 12.30 |
| The Terms | 0.4000 | 21.20 |
| Questions | 0.6280 | 33.28 |

## The story, scene by scene

Positions are in screens of scrolling from the top of the stage (0 to 53).

**1. Hero, 0.00 to 1.59.** The camera is wide and still. The hero copy is already on screen when the page opens: the title, subtitle and "Start a partnership" button center left, and the "What we do" tag and paragraph bottom left. They play a short timed intro once per page load, hold for a quarter screen (the bottom copy for 0.4), then blur and drift left, title first, and are gone by 1.00. Scrolling back up brings them back the same way, with no second intro.

**2. Ascent, 1.59 to 4.24.** No text (the hero copy has already drifted away). The camera pushes in on the statue from 1.59 (second leg at 2.33), glides into a pan along the rising trunk at 3.05, dollies up from 3.84 and settles on a single branch at 4.24, without stopping at the keys in between. Its timings are the `ASCENT` object in the script, played by `src/components/stage/ascent-art.tsx` through the pure functions in `ascent-tree.ts`:

- The statue, its orange and the top of the minaret rise together, slowly at first, then faster, to 10 world units by the end. The shaft is one tiling plate that grows from a fixed bottom (more tiles, never stretched).
- The stone turns to bark through the morph mask along a front that climbs the shaft: it enters the frame as the camera pushes in (`ASCENT.front`, world heights) and has closed on the top of the trunk by 3.07 (`ASCENT.barked`).
- Three branches scale out from the trunk once it is tall enough (from 3.18, 3.45 and 3.71), and their leaves unfurl with them.
- The glow keeps the hero's full brightness and rides up with the orange (the ripple clock is shared with the hero's, so the two scenes' glows trade places without adding up); the statue, the orange and the glow fade once above the frame (3.82 to 4.16).

**3. Graft, 4.24 to 6.89.** No text. The camera holds on the branch while the hands come in (4.29 to 4.66), fit the cutting (to 4.98), wrap the twine (to 5.25), tie the knot in three steps (to 5.72) and leave (to 5.94); it then dollies up and pulls out to the fruiting tree (5.88 to 6.89) while the tree fills with oranges (5.94 to 6.78).

**4. Pluck, 6.89 to 10.07.** The camera holds on the tree while the hand rises from the bottom center to the one special orange (6.95 to 7.65) and closes on it (7.59 to 7.84). As the hand closes (7.75) "We get you found." arrives center left, slightly low; a thin progress line draws along the top hairline from 7.75 to 8.35 and erases as the beat leaves (8.75 to 9.05). From 8.00 the camera dollies down through the branches to the harvester and lands on him at 9.24. The hand tugs the fruit free (7.94 to 8.26) and carries it down with the camera (`carryAt` reads the camera's own travel), so the orange stays framed while the foliage rushes up past it; the near foliage falls away first (8.03 to 8.48), then the middle layer (8.29 to 8.93). The harvester (white robe) enters the frame from below and appears from 8.29 to 8.99; the hand lets go and drops away (9.15 to 9.43) as his right arm, holding the orange, takes the fruit over (9.15 to 9.34). Once he is revealed (9.48), "We split the harvest." arrives bottom left with the "Revenue share" tag under it; the line to the right of the tag types itself out during the beat. While each beat is up, the foliage behind its words recedes into the sky's haze (on a phone his robe does too). The timings are the `PLUCK` object in the script, played by `src/components/stage/pluck-art.tsx` through the pure functions in `pluck-harvest.ts`.

**5. Share, 10.07 to 12.30.** His left hand comes in above the orange with a knife (10.11 to 10.31) and plunges the blade down through it (10.31 to 10.52); under the blade the whole orange gives way to its two peels (10.33 to 10.35), and the knife withdraws (10.52 to 10.72). The halves part and their cut faces are revealed (10.49 to 10.76). A second hand reaches in from center left to the left half (10.67 to 10.92), takes it and draws it a little away (10.92 to 11.09), and both hands bring the halves together (11.09 to 11.36) and hold them: the harvest, shared. The timings are the `SHARE` object, played by `src/components/stage/share-art.tsx` through `share-cut.ts`. The camera holds on the harvester, then pushes into the orange from 10.56 while the harvest beat fades (gone by 10.89). It holds on the halves from 11.07 and pushes into them from 11.67. The hairlines close into a square viewfinder around the halves (11.18 to 11.61), hold it until 11.90 and open out by 12.16. The sand sweeps in from 11.64, covers the screen fully from 12.26 to 12.34 (the camera reframes unseen) and clears by 12.70. The ruler switches to The Work at 12.30; the hairlines slide out and come back under the sand.

**6. Work, 12.30 to 17.91.** The camera dollies slowly upward through the clouds from 12.34 to 17.75, ending close to the blueprint's first frame. The service cards take turns in the right column, chained from the moment the sand clears: card 1 from 12.80 to 14.10, card 2 from 14.40 to 15.70, card 3 from 16.00 to 17.60 (1.6 screens for its longer body). Six cloud plates, each drawn twice, drift right on idle time and shift right with the scroll; from 12.50 to 17.90 they part around the card text (`cloudClearing`): a cloud drifting toward the words thins out and re-forms beyond them, so the clouds pass on both sides and white text never sits on a white cloud. The giant orange on its minaret rises into view with its builder as card 3 arrives (16.00 to 17.86).

**7. Blueprint, 17.91 to 21.20.** The camera holds on the scaffold, then pushes into the plan from 19.06. The architect holds the folded packet in his hands; it is brought forward to the middle (18.57 to 19.10) and opens panel by panel (19.10 to 20.54). The paper unfold starts at 20.61 and covers the screen fully from 21.12 to 21.28 (the camera reframes unseen), then the sheet opens onto the next scene by 22.01. The chrome and hairlines turn ink on milk from 20.87 to 22.01. The ruler switches to The Terms at 21.20.

**8. Site, 21.20 to 25.44.** The camera holds at ground level from 21.28 (builders working a little: 21.71 to 22.73), then rises to a straight top-down view (22.05 to 22.98). The matching top-down set, the plain sand ground and the first tiles fade in (22.60 to 22.90) while the side plates fade out (22.68 to 22.94); the sea and its sky leave last (22.90 to 22.98), so the top-down view has no sky. The camera then keeps rising and pulls out (22.98 to 24.17) while the whole site slides into the middle of the left half in step with it (`shrinkAt` reads the camera's travel) and the tiled field grows around it (22.81 to 24.25). The right half becomes the milk-white panel from 23.07 to 23.40 (`SitePanel`, with two slowly drifting, heavily blurred leaf-shadow layers) until the dust covers it at 25.40 (ink chrome and text from 22.90). The terms block sits in the right column from 23.15 to 25.19. The rising dust starts at 25.10, covers the screen from 25.40 to 25.48 and clears by 25.80.

**9. Prune, 25.44 to 29.42.** The camera holds on the gardener from 25.48: on a wide screen he and his column stand right of center, so the fit text at the bottom left reads on clear sky; on a phone the camera centers him again and lifts the picture a little (the key's `pan`), and the column recedes into the haze behind the text. The shears snip from 25.84 to 28.82. "The Terms" starts rising from the bottom in very large type at 25.92 and shrinks as it climbs until it docks in the top-left corner by 27.32. The fit text and its "In plain terms" aside arrive bottom left at 27.23. Both stay until the branch is cut.

**10. Fall, 29.42 to 33.28.** All the text blurs and sinks back into the picture as the scene begins (29.48 to 29.88). The camera pushes toward the gardener's face (29.42 to 30.27), dollies down after the falling orange (30.27 to 31.16), pushes into it (31.16 to 31.54), then dollies up between the rows of trees (31.54 to 33.28). The scene opens on the prune picture as it was left. At 29.69 the branch is cut: the still branch (fruit and all) hands over to a copy without its fruit, which drops faster and faster, turning (29.74 to 30.96), while the orange sits where the fruit hung and falls on its own (29.74 to 31.16), the camera following; the gardener drifts right and out of frame (29.80 to 30.65). The orange is placed relative to the camera and settles at the ring's origin on screen. The rainbow ring sweeps out from the orange from 31.16 to 31.97: the old picture is cut away outside the ring and the orchard rows show only inside it, while the orange stays in front. It goes soft (31.16 to 32.20) and keeps falling out of the bottom of the frame (31.54 to 33.28), fading out by the end. Timings are the `FALL` object, played by `src/components/stage/fall-art.tsx` through `fall-plan.ts`. The ruler switches to Questions at 33.28, with the hairlines sliding out from 32.98 and back by 33.88.

**11. Questions, 33.28 to 40.70.** "Questions worth asking first." arrives top center at 33.28 and stays through all five cards; while it is up, the fruit of the rows behind it recedes into the haze. The cards take turns in the center, 1.3 screens each, end to end: question 1 from 33.54 to 34.84, question 2 to 36.14, question 3 to 37.44, question 4 to 38.74, question 5 to 40.04. The first zooms up from small in the center; the others arrive from the right along the arc; cards 1 to 4 swing left along the arc as they leave, and each has swung fully away at the very point where the next starts to arrive. Each card's connector line draws out from its orange as the card arrives (question 1 from 33.70 to 34.09, then 1.30 screens later for each card) and its square locks onto the card's corner. The camera climbs between the rows one step per card, during the card's arrival (33.54 to 33.89 for the first, and so on), and holds while the card is read, so the orange stays put under the line. After the last card, the card, its line and the title dissolve upward like smoke (39.69 to 40.04) while the camera pushes forward into the blue. The fabric sky starts at 40.48, covers the screen from 40.65 to 40.75 (the camera reframes unseen) and clears by 41.23. The deck is `FAQ` in the script, played by `src/components/story/question-deck.tsx` through `question-plan.ts` (see "The questions' deck" below).

**12. Stars, 40.70 to 43.35.** No text. The camera holds on the stargazer from 40.75 while the constellation grows from his fingertip (41.29 to 43.22).

**13. Apply, 43.35 to 47.59.** The astronomer and his platform step down the sky (43.61 to 44.20; on a phone they sink right out of the frame, which the text and the form fill). The application tag, title and subtitle arrive top left at 43.69; the form fades in on the right from 43.86. Both are fully on screen from about 44.16 to 47.94 (this is where "Apply" lands), then blur, rise and fade out by 48.24, in the finale. The constellation recedes while they are up (`starsDim`).

**14. Finale, 47.59 to 53.00.** The camera holds while the art moves. The astronomer and platform sink on from the apply position and the stars drift up (47.59 to 49.22), the old cloud slides away (to 49.76), the tree rises (48.57 to 49.76), the woman and the man walk in (49.32 to 50.41) and settle, and from 50.41 their loop runs on idle time (watering, snipping, an orange cut free, oranges dropping, clouds drifting right); it pauses offscreen and fades out when scrolling back. The hairlines slide out to the edges (49.49 to 50.30), then close in from there into a square viewfinder by 52.19 and stay closed. The wordmark, subtitle, copyright and email arrive inside the frame from 50.84 and never leave; as they arrive, the tree inside the frame recedes into the haze and goes a little soft. The page ends at 53.00; further scrolling does nothing, and scrolling up plays everything back to the hero.

## Scenes

The shares come from the storyboard pacing. A scene owns `[start, end)`; the finale also owns progress 1.

| # | Scene | Part | Share | Progress | Screens | Length |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `hero` The raised orange | The Model | 0.030 | 0.0000 to 0.0300 | 0.00 to 1.59 | 1.59 |
| 2 | `ascent` The minaret becomes a tree | The Model | 0.050 | 0.0300 to 0.0800 | 1.59 to 4.24 | 2.65 |
| 3 | `graft` The graft | The Model | 0.050 | 0.0800 to 0.1300 | 4.24 to 6.89 | 2.65 |
| 4 | `pluck` The pluck and the harvester | The Model | 0.060 | 0.1300 to 0.1900 | 6.89 to 10.07 | 3.18 |
| 5 | `share` The cut and the share | The Model | 0.042 | 0.1900 to 0.2320 | 10.07 to 12.30 | 2.23 |
| 6 | `work` Services in the clouds | The Work | 0.106 | 0.2320 to 0.3380 | 12.30 to 17.91 | 5.62 |
| 7 | `blueprint` The blueprint | The Work | 0.062 | 0.3380 to 0.4000 | 17.91 to 21.20 | 3.29 |
| 8 | `site` The building site by the sea | The Terms | 0.080 | 0.4000 to 0.4800 | 21.20 to 25.44 | 4.24 |
| 9 | `prune` The gardener | The Terms | 0.075 | 0.4800 to 0.5550 | 25.44 to 29.42 | 3.98 |
| 10 | `fall` The falling orange | The Terms | 0.073 | 0.5550 to 0.6280 | 29.42 to 33.28 | 3.87 |
| 11 | `faq` The questions | Questions | 0.140 | 0.6280 to 0.7680 | 33.28 to 40.70 | 7.42 |
| 12 | `stars` The stargazer | Questions | 0.050 | 0.7680 to 0.8180 | 40.70 to 43.35 | 2.65 |
| 13 | `apply` The application | Questions | 0.080 | 0.8180 to 0.8980 | 43.35 to 47.59 | 4.24 |
| 14 | `finale` The orchard keepers | End | 0.102 | 0.8980 to 1.0000 | 47.59 to 53.00 | 5.41 |

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
| `hero` | center-left | `model.hero` (title, subtitle, button) | 0.0000 | 0.0000 to 0.0047 | 0.0189 | 1.00 | load / drift-left |
| `hero-intro` | bottom-left | `model.hero` (tag, paragraph) | 0.0000 | 0.0000 to 0.0075 | 0.0189 | 1.00 | load / drift-left |
| `found` | center-left | `model.found` | 0.1462 | 0.1519 to 0.1651 | 0.1707 | 1.30 | reveal / fade |
| `harvest` | bottom-left | `model.harvest` | 0.1789 | 0.1846 to 0.1999 | 0.2055 | 1.41 | reveal / fade |
| `card-1` | right | `work.cards.0` | 0.2415 | 0.2472 to 0.2604 | 0.2660 | 1.30 | reveal / fade |
| `card-2` | right | `work.cards.1` | 0.2717 | 0.2774 to 0.2906 | 0.2962 | 1.30 | reveal / fade |
| `card-3` | right | `work.cards.2` | 0.3019 | 0.3076 to 0.3264 | 0.3321 | 1.60 | reveal / fade |
| `terms` | right | `terms.block` | 0.4368 | 0.4425 to 0.4695 | 0.4752 | 2.04 | reveal / fade |
| `terms-title` | top-left | `terms.chapterTitle` | 0.4890 | 0.5154 to 0.5562 | 0.5638 | 3.96 | dock / sink |
| `fit` | bottom-left | `terms.fit` | 0.5138 | 0.5194 to 0.5562 | 0.5638 | 2.65 | reveal / sink |
| `questions-title` | top-center | `questions.title` | 0.6280 | 0.6346 to 0.7499 | 0.7555 | 6.76 | reveal / smoke |
| `question-1` | center | `questions.items.0` | 0.6329 | 0.6395 to 0.6508 | 0.6574 | 1.30 | zoom / swing-left |
| `question-2` | center | `questions.items.1` | 0.6574 | 0.6640 to 0.6754 | 0.6820 | 1.30 | zoom (from the right) / swing-left |
| `question-3` | center | `questions.items.2` | 0.6820 | 0.6886 to 0.6999 | 0.7065 | 1.30 | zoom (from the right) / swing-left |
| `question-4` | center | `questions.items.3` | 0.7065 | 0.7131 to 0.7244 | 0.7310 | 1.30 | zoom (from the right) / swing-left |
| `question-5` | center | `questions.items.4` | 0.7310 | 0.7376 to 0.7489 | 0.7555 | 1.30 | zoom (from the right) / smoke |
| `apply-intro` | top-left | `questions.application` (tag, title, subtitle) | 0.8244 | 0.8301 to 0.9046 | 0.9102 | 4.55 | reveal / smoke |
| `apply-form` | right | `questions.application` (fields, submit) | 0.8276 | 0.8333 to 0.9046 | 0.9102 | 4.38 | fade / smoke |
| `finale` | center | `finale` (wordmark, subtitle, copyright, email) | 0.9592 | 0.9705 to 1.0000 | 1.0000 | 2.16 | reveal / hold |

Pacing, and where it bends on purpose:

- Every beat stays on screen at least one full screen (`validateScript()` and the unit test check it). The plain beats (`found`, the service cards) stay 1.3 screens (0.3 to arrive, 0.7 fully on screen, 0.3 to leave) with 0.3 screen between neighbours in the same slot, as measured on the reference.
- The hero copy leaves within the first screen, as on the reference.
- The service cards are chained in screens from the moment the sand clears, so they keep the reference gaps whatever the stage length; the work scene is sized so the third has left before the blueprint fades in.
- Five question cards share the 7.42 screens of the questions scene at the reference 1.3 screens each (0.35 to arrive, 0.6 fully on screen, 0.35 to leave), end to end with no gap: a leaving card has fully swung away at the very point where the next one starts to arrive, so the deck moves on without a pause and the slot never holds two cards.
- Some blocks stay through a whole stretch of camera work: the terms block, the docking chapter title and the fit text, the questions title (through all five cards), the application, and the finale (to the end of the page).
- Long stretches without any text (the ascent, the graft, the stars) are deliberate; the camera now keeps moving through them instead of settling early.

Gaps between beats in the same slot, in screens:

- center-left: `hero` to `found` 6.75
- bottom-left: `hero-intro` to `harvest` 8.48, `harvest` to `fit` 16.34
- right: `card-1` to `card-2` 0.30, `card-2` to `card-3` 0.30, `card-3` to `terms` 5.55, `terms` to `apply-form` 18.67
- top-left: `terms-title` to `apply-intro` 13.81
- top-center: one beat
- center: `question-1` to `question-2` 0.00, then 0.00 between each card (they abut), `question-5` to `finale` 10.80

## Transitions

Covering transitions (sand, unfold, dust, fabric) straddle a scene boundary and cover the screen fully across it ("Full" below), so the scenes swap where nobody can see, and the camera may reframe there. The rainbow ring sweeps from the falling orange to the orchard inside the fall scene. The smoke is a text effect on the last question and the questions title. The two viewfinders are drawn by the hairlines: the lines close into a square around a target rectangle (the halves in scene 5, the wordmark in scene 14); the finale one never opens again.

| Transition | Kind | Scenes | Start | Full | End | Screens | Layer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `viewfinder-share` | viewfinder | share | 0.2110 | 0.2190 to 0.2244 | 0.2295 | 0.98 | hairlines |
| `sand` | sand | share to work | 0.2196 | 0.2312 to 0.2328 | 0.2396 | 1.06 | canvas |
| `unfold` | unfold | blueprint to site | 0.3888 | 0.3985 to 0.4015 | 0.4152 | 1.40 | canvas |
| `dust` | dust | site to prune | 0.4736 | 0.4792 to 0.4808 | 0.4868 | 0.70 | canvas |
| `ring` | ring | fall | 0.5878 | none | 0.6032 | 0.81 | canvas |
| `smoke` | smoke | faq | 0.7489 | none | 0.7555 | 0.35 | text |
| `fabric` | fabric | faq to stars | 0.7638 | 0.7671 to 0.7689 | 0.7780 | 0.75 | canvas |
| `viewfinder-finale` | viewfinder | finale | 0.9490 | 0.9847 to 1.0000 | 1.0000 | 2.70 | hairlines |

How each one plays, all scrubbed by progress and so exactly reversible. Every effect draws nothing at its start (the old scene, untouched) and nothing at its end (the new scene, untouched); the covering ones cover every pixel across "Full". The unit test (`src/components/transitions/choreography.test.ts`) proves those three points from the same bounds the shaders use.

- **Sand.** Deep blue sand blows in from the left on a ragged, wind-streaked front, loose grains flying ahead of it, and covers everything. While it covers, its grains keep drifting on idle time. Then it blows on to the right, uncovering The Work from the left.
- **Paper unfold.** The white spreads from the middle until the frame is milk paper (the chrome turns ink), over half a screen once the plan has opened. Then the next scene opens out of the white like a folded sheet, over three quarters of a screen: the middle column's top panel lifts and falls open, then the left and right columns swing out from behind it, each shaded while it tilts; the creases fade as the sheet settles flat, just before the camera starts to rise.
- **Rising dust.** Blue rises from the bottom behind a billowing, lit edge, white specks lifting in it and ahead of it, until it covers the screen; then it lifts off the top, uncovering the gardener from the bottom up.
- **Rainbow ring.** A soft spectral band (violet inside, red outside) expands from `origin` (the falling orange) past the farthest corner. Inside it the new scene shows: a plate passes `reveal={{ transition: "ring" }}` to show only inside the ring (and `side: "outside"` to show only outside it), so the orchard rows appear inside the ring while the falling orange, which has no `reveal`, stays in front throughout.
- **Fabric sky.** The sky turns to rippling cloth, spreading from the middle toward the trees, while a cloud billows from the top centre toward the viewer until it fills the screen. Then a ragged hole opens through it from the middle onto the blue cloth, which clears onto the stargazer.
- **Smoke.** The beats it lists (the last question and the questions title) dissolve together across its range: their lines blur and rise, first line first, and soft holes of smoke noise open in them and drift upward (a CSS mask). Every beat that leaves as `smoke` gets the same mask over its own leave. `SmokeOut` (BlurFade drifting up, plus the mask) does the same for any other group of text.
- **Viewfinders.** The hairlines' `viewfinder` cue (see below): the lines close in from wherever they are into a square around `target`.

Where they are drawn:

- The covering and sweeping ones draw on the transition canvas (`TransitionCanvas`, React Three Fiber): one full-screen shader pass per transition, premultiplied over the stage. Fronts, folds, radii and fades are computed in `choreography.ts`; `shaders.ts` adds the texture (ragged edges, grain, specks, paper fibre, fold shading, the spectrum, the cloth and the cloud). Sweeping fronts move in step with the scroll; fades and folds use the story curve.
- The canvas renders only while a transition runs, plus one clearing frame as it ends; while the sand, the dust or the fabric is on screen it keeps rendering on idle time for its drift. Its pixel ratio is capped at `TRANSITION_MAX_DPR`, its shaders compile while the browser is idle, and its art loads `TRANSITION_PRELOAD_SCREENS` before it is needed: `fall/ring-mask`, `stars/fabric-sky` and `stars/cloud`. Until the art arrives, the shaders draw stand-ins.
- Only one canvas transition runs at a time (`validateScript()` checks it).
- In development, `/design` plays every transition on its real range between placeholder plates of the scenes it joins.

## Camera

The camera rig (`src/components/stage/camera-rig.tsx`) builds one paused GSAP timeline from these keys (`camera-path.ts`) and seeks it to the progress every frame, so the camera always interpolates and plays backwards exactly. Each key is a camera position, a target and a vertical field of view (world units: x right, y up, z toward the viewer; plates sit at z 0 or behind), plus the kind of move that starts there and runs to the next key: `hold`, `push`, `pull`, `pan`, `dolly-up`, `dolly-down`, or `reframe`. The camera never cuts; a `reframe` happens only while a transition fully covers the screen. Every scene has at least one key, and keys never share a position.

**The path through the keys.** Each value (position, target, field of view, and the tall-screen `pan`) runs along a monotone cubic through the keys (`cameraSlopes`, Fritsch and Butland's harmonic mean; each segment is one GSAP tween with its own Hermite ease, `hermiteEase`):

- after a hold the camera starts from rest, and it lands at rest before one, so a move never jolts;
- through a chain of moves (the ascent's push, push, pan and dolly; the fall's push and dollies) it glides through the keys without stopping, and its speed never jumps (a value that turns back at a key stops there);
- a long move keeps moving through its middle, rather than doing three quarters of the move in its first quarter and creeping for the rest (the story curve did);
- it never overshoots a key, and never moves faster than three times the straight line between two keys;
- the two ends of a `reframe` rest, so the cover's quick cut never bends the moves around it.

Art that must move in step with a camera move reads the path itself through `cameraTravel(keys, from, to)`: the fruit carried down the pluck's dolly (`carryAt`) and the site sliding into the left half as the camera pulls out (`shrinkAt`). The falling orange and the questions' connector lines project through the same path (`projectPoint`). `camera-path.test.ts` checks the path passes every key, never jumps in speed at a key, rests at holds, keeps long moves moving, and plays backwards exactly.

| Scene | At | Move from here | Position | Target | FOV | Tall-screen pan |
| --- | --- | --- | --- | --- | --- | --- |
| hero | 0.0000 | hold | 0, 0, 14 | 0, 0, 0 | 35 | 2, 0.75 |
| ascent | 0.0300 | push | 0, 0, 14 | 0, 0, 0 | 35 | |
| ascent | 0.0440 | push | 2.1, 2.5, 9.6 | 2.5, 2.9, 0 | 33.5 | 0, 0 |
| ascent | 0.0575 | pan | 2.6, 4.6, 7.5 | 2.8, 4.9, 0 | 32 | |
| ascent | 0.0725 | dolly-up | 2.2, 6.4, 6.5 | 2.2, 6.6, 0 | 31 | |
| graft | 0.0800 | hold | 2, 8.4, 5.5 | 2, 8.4, 0 | 30 | |
| graft | 0.1110 | pull | 2, 8.4, 5.5 | 2, 8.4, 0 | 30 | |
| pluck | 0.1300 | hold | 1.6, 11, 12 | 1.6, 10.5, 0 | 36 | |
| pluck | 0.1510 | dolly-down | 1.6, 11, 12 | 1.6, 10.5, 0 | 36 | |
| pluck | 0.1744 | hold | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 | |
| share | 0.1900 | hold | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 | |
| share | 0.1992 | push | 1.4, 4.2, 9 | 1.4, 4.2, 0 | 34 | |
| share | 0.2089 | hold | 1.5, 4.5, 4.8 | 1.5, 4.5, 0 | 30 | |
| share | 0.2202 | push | 1.5, 4.5, 4.8 | 1.5, 4.5, 0 | 30 | |
| share | 0.2312 | reframe | 1.5, 4.5, 2.2 | 1.5, 4.5, 0 | 28 | |
| work | 0.2328 | dolly-up | 0, 0, 14 | 0, 0.5, 0 | 40 | |
| work | 0.3348 | dolly-up | 0, 8.5, 13.5 | 0, 9, 0 | 39 | |
| blueprint | 0.3380 | hold | 0, 9, 13 | 0, 9.5, 0 | 38 | |
| blueprint | 0.3597 | push | 0, 9, 13 | 0, 9.5, 0 | 38 | |
| blueprint | 0.3985 | reframe | 0, 9.6, 2.6 | 0, 9.6, 0 | 34 | |
| site | 0.4015 | hold | 0, 1.2, 12 | 0, 1, 0 | 38 | |
| site | 0.4160 | dolly-up | 0, 1.2, 12 | 0, 1, 0 | 38 | |
| site | 0.4336 | pull | 0, 13, 0.01 | 0, 0, 0 | 38 | |
| site | 0.4560 | hold | 0, 24, 0.01 | 0, 0, 0 | 38 | |
| site | 0.4792 | reframe | 0, 24, 0.01 | 0, 0, 0 | 38 | |
| prune | 0.4808 | hold | -1.9, 0, 12 | -1.9, 0.5, 0 | 35 | 1.9, -0.6 |
| fall | 0.5550 | push | -1.9, 0, 12 | -1.9, 0.5, 0 | 35 | |
| fall | 0.5711 | dolly-down | 0.4, 2.2, 6.5 | 0.4, 2.2, 0 | 32 | 0, 0 |
| fall | 0.5878 | push | 0, -3, 5 | 0, -3, 0 | 32 | |
| fall | 0.5951 | dolly-up | 0, -4, 2.6 | 0, -4, 0 | 30 | |
| faq | 0.6280 | hold | 0, 1, 12 | 0, 2, 0 | 40 | |
| faq | 0.6329 | dolly-up | 0, 1, 12 | 0, 2, 0 | 40 | |
| faq | 0.6395 | hold | 0, 1.7, 12 | 0, 2.7, 0 | 40 | |
| faq | 0.6574 | dolly-up | 0, 1.7, 12 | 0, 2.7, 0 | 40 | |
| faq | 0.6640 | hold | 0, 2.4, 12 | 0, 3.4, 0 | 40 | |
| faq | 0.6820 | dolly-up | 0, 2.4, 12 | 0, 3.4, 0 | 40 | |
| faq | 0.6886 | hold | 0, 3.1, 12 | 0, 4.1, 0 | 40 | |
| faq | 0.7065 | dolly-up | 0, 3.1, 12 | 0, 4.1, 0 | 40 | |
| faq | 0.7131 | hold | 0, 3.8, 12 | 0, 4.8, 0 | 40 | |
| faq | 0.7310 | dolly-up | 0, 3.8, 12 | 0, 4.8, 0 | 40 | |
| faq | 0.7376 | hold | 0, 4.5, 12 | 0, 5.5, 0 | 40 | |
| faq | 0.7489 | push | 0, 4.5, 12 | 0, 5.5, 0 | 40 | |
| faq | 0.7671 | reframe | 0, 5, 6 | 0, 6, 0 | 38 | |
| stars | 0.7689 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 | |
| apply | 0.8180 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 | |
| finale | 0.8980 | hold | 0, 6, 7 | 0, 6.5, 0 | 38 | |

## Scenes on the canvas

Only the scene on stage and its two neighbours are mounted on the WebGL canvas, and only the current scene and the next one are preloaded. Each scene's art fades with its presence (`src/components/stage/presence.ts`): where a covering transition hands one scene to the next, the swap is a step at the boundary, under full cover; at a plain boundary the incoming scene fades in over the outgoing one across 0.2 screen to each side. Backdrops (the sky) draw before the plates of every scene, so an arriving scene's sky fades in behind the leaving scene's plates, never over them: a figure that carries on across the boundary (the statue, the astronomer) never dims. Scenes without custom art (`SCENE_ART` in `scene-layers.tsx`) draw their manifest plates where the manifest places them; every scene has custom art now.

Every canvas frame first settles the values the scene arts derive from progress (`SettleDerivedValues` in `stage-canvas.tsx` runs Motion's pending `preRender` step), so the camera, which reads progress itself, and the plates, which read derived motion values, always show the same moment. Without it, 380 of 524 frames of a wheel scroll drew plates one frame behind the camera, and anything carried with the camera shook.

**Art receding behind text.** A plate can thin out of, or recede into the sky's haze inside, a soft rectangle of the stage (`clearing`, a `PlateClearing`; the plate shader's `clearInside`). `useTextHaze(beats, options)` builds one from the beats it should give way to: it follows whichever of them is most on stage, over the area of its slot (`SLOT_AREAS` in `text-haze.ts`, wide and stacked), for exactly as long as the words are up. In use:

| Scene | What recedes | Behind |
| --- | --- | --- |
| Work | the clouds thin out (`cloudClearing`, its own envelope over all three cards) | the card text |
| Pluck, share | the foliage (and on a phone the harvester's robe) | "We get you found.", "We split the harvest." |
| Prune | on a phone only: the column, the urn, the tree and the gardener | the fit text |
| Questions | the orchard rows' fruit | "Questions worth asking first." |
| Apply | on a phone only: the stargazer's cloud thins out | the form |
| Finale | the tree, the clouds and the falling fruit (and on a phone the keepers) | the wordmark, subtitle and footer |

### The hero's art

The hero has custom art (`src/components/stage/hero-art.tsx`). It draws the manifest plates with two moves on top:

- **The intro**, once per page view, on time (`hero-intro.ts`): the sky, then the minaret and statue (with the orange as its own layer), then the onlookers by depth, then the text. The canvas starts it when the hero's plates have loaded; the hero text (a `load` beat) waits for its `INTRO.text` mark, or arrives `INTRO.fallback` seconds after load if the canvas never starts. Once played it never plays again: scrolling back finds the finished frame.
- **The glow**, on idle time and always on (`glow-ripple.tsx`): about 300 instanced droplets travel outward from the orange in slow rings ("rain in reverse"), with a halo breathing behind the orange. It runs before the first scroll. Over the hero scene the glow *lift* brightens it toward white and speeds the ripple up a little; scrolling up reverses it exactly (the speed-up changes the rate of an accumulated clock, so the ripple never jumps). The droplets' geometry owns its own quad: it must never share the plates' `UNIT_PLANE`, because disposing it (when the hero unmounts) would delete the buffers every plate draws from (`glow-ripple.test.ts`).

### The questions' deck

The five question cards are not five separate `Beat`s on the stage: they are one group (`QuestionDeck`, `src/components/story/question-deck.tsx`, loaded on the client once the stage is live) that mounts shortly before the first card and stays until shortly after the last. Each card carries its beat id as `data-beat`. The script's `FAQ` lists, per card, its beat, how it arrives (`zoom` for the first, `arc` for the others), its anchor orange (a named point on a near orchard plate) and the corner its line locks to, plus when the line draws (`draw`) and how the camera climbs (`climb`). The pure functions in `question-plan.ts` turn that into poses:

- **The arc.** The cards ride one wide curve with its top in the center, like the rim of a wheel turning from right to left (`ARC`): a card at either end is 34% of the stage width out, has sunk 8% of its height, is tilted 7 degrees along the curve, at 60% of its size, blurred 10 px and faded out. The first card zooms up from 55% in the center instead (`ZOOM`); the last one rises 3% and dissolves instead of swinging (`SMOKE`). A swinging card leaves as one piece; only its rows' arrival is staggered (title first, then the answer). The panel is a sky-tinted glass (a 45% sky fill and a backdrop blur), so the answer keeps WCAG AA over the orchard's fruit.
- **One connector.** A single SVG line with a small square (`Connector`), re-pointed at the card on stage. Its end is fixed on the card's orange: the plate point projected through the stage camera at the current progress (`projectPoint`, the same keys and the same math as the rig), so it stays on the fruit while the camera climbs and pushes. The square sits on the card's chosen corner wherever the card's pose puts it. The line draws out from the orange to the corner as the card arrives, then fades with the card; it fades out if its orange leaves the stage. On a phone the cards are two thirds of the screen wide and the camera widens, so each orange sits in the strip beside its card and the line is short and steep.
- **The anchors.** Cards 1, 3 and 5 anchor in the left near row, 2 and 4 in the right one; the corners go top-left, bottom-right, bottom-left, top-right, top-left, so every card's corner differs from the one before. The points were placed so the line runs at 45 degrees on a 1440 by 900 stage while each card is read; the cards scale with the stage height (`FIT`, 0.85 to 1.2), as the orchard does, so the angle stays between about 40 and 50 degrees on common screens (`question-plan.test.ts`).
- **Real content.** The animated deck is hidden from assistive technology; the same questions are one list in the screen reader outline (`QuestionList`), always present, and on the reduced-motion page that list is the visible, normal FAQ.

## Hairlines, progress lines and tone

The hairline grid moves on cues, each an envelope: it starts, reaches full strength, holds, releases and is gone. `exit` slides the lines out toward their edges (corner stars lock into the screen corners); `viewfinder` closes them into a square frame. At each chapter change the lines leave under the covering transition when there is one, otherwise in a short envelope around the chapter start. In the finale they slide out and then close into the viewfinder, and stay.

| Cue | Starts | Full | Releases | Gone |
| --- | --- | --- | --- | --- |
| viewfinder (share) | 0.2110 | 0.2190 | 0.2244 | 0.2295 |
| exit (into The Work) | 0.2196 | 0.2312 | 0.2328 | 0.2396 |
| exit (into The Terms) | 0.3888 | 0.3985 | 0.4015 | 0.4152 |
| exit (into Questions) | 0.6223 | 0.6280 | 0.6318 | 0.6393 |
| exit (finale) | 0.9337 | 0.9490 | never | never |
| viewfinder (finale) | 0.9490 | 0.9847 | never | never |

- Progress line `found-line`: draws along the top hairline from 0.1462 to 0.1575 as "We get you found." arrives, and erases from 0.1651 to 0.1707 as it leaves.
- Tone: the chrome, the hairlines and the text turn ink on milk during the paper unfold (0.3938 to 0.4152) and over the top-down site with its milk panel (0.4320 to 0.4792). Everywhere else they are white on sky.

## Navigation

Chapter entries (ruler and chapter menu), the "Apply" pill and the hero button scroll smoothly to anchors that land after any covering transition has cleared:

| Anchor | Progress | Screen | Lands on |
| --- | --- | --- | --- |
| `model` | 0 | 0.00 | The hero |
| `work` | 0.2396 | 12.70 | The clouds, once the sand has cleared |
| `terms` | 0.4152 | 22.01 | The site, once the unfold has opened |
| `questions` | 0.6346 | 33.63 | "Questions worth asking first." fully on screen |
| `apply` | 0.8333 | 44.16 | The form fully on screen (a deep link to `#apply` also focuses its first field) |

The ruler's progress line has one segment per stretch between `RULER_STOPS`: every chapter start and every scene start (0.012, 0.03, 0.08, 0.13, 0.19, 0.232, 0.338, 0.4, 0.48, 0.555, 0.628, 0.768, 0.818, 0.898), so short segments mark short scenes and long ones mark long camera moves.

## Checks

`validateScript()` collects every problem and throws a `ScriptError` listing them. It runs when the stage module loads in development, so a broken script stops the page, and in the unit test (`npm test`, also run in CI). It checks that:

- the scenes follow the storyboard order and tile 0 to 1 exactly: no gaps, no overlaps, each as long as its share;
- the chapters start inside 0 to 1, in order;
- no two beats in the same slot overlap, every beat lasts at least one screen, every hold is inside its range, a beat that never leaves runs to 1, and every copy key (and part) exists in the copy deck;
- every transition has a valid range and peak, is sorted by start, starts on the stage (a ring's `origin`), and a transition that hands one scene to the next straddles their boundary and fully covers the screen at it; transitions on the one transition canvas never overlap;
- the camera starts at 0, its keys increase strictly, every scene has a key, fields of view stay between 10 and 90 degrees, and every `reframe` sits inside a full cover;
- hairline envelopes are in order, progress lines draw before they erase, and tones and anchors stay inside 0 to 1.

**The scroll test** (`npm run test:story`, `e2e/story.spec.ts`) builds the site, serves it and walks the story in Chromium on a 1440 by 900 laptop screen and on a phone (Pixel 7), through the window's own scroll (the phone's bent scroll map included). Its expectations come from the script, so retuning never touches the test:

- at the start, the middle and the end of every scene: `data-scene` and `data-chapter`, the beats whose box is on stage against `visibleBeats(p)`, the ruler (its active chapter and every segment's fill) and the percent counter;
- in the middle of every scene, that the stage drew a painted picture (not an empty sky: the check that would have caught the blank stage) and a screenshot, `test-results/story/NN-scene.png` (`phone/` for the phone), plus the opening frame (`00-opening.png`), the end of the page (`15-end.png`) and the reduced-motion page;
- the way back: every point again in reverse, where every element the stage moves in the text layer (computed opacity, transform, blur and smoke mask, and how much of a typed line shows), the hairlines and the ruler must be exactly as on the way down;
- no console errors and no WebGL warnings on the way;
- the three fonts only, no layout shift while they load (cumulative shift under 0.02), and the calm reduced-motion page.

Last run: 6 tests passed in 2.6 minutes (desktop and phone).

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

## Performance

Measured on the production build in Chromium 156 (new headless, on the GPU: an Apple M2 Pro), 1440 by 900 at a device pixel ratio of 2, scrolling the whole story with wheel input through Lenis (scratch harness, not part of the repository):

| Run | Frame time p50 / p95 / p99 | Frames over 20 ms | Stage pixel ratio at the end |
| --- | --- | --- | --- |
| Reading pace (the whole story in about 108 s) | 16.7 / 16.7 / 16.8 ms | 0.1% | 1.5 (the cap) |
| Fast (about 46 s) | 16.7 / 16.8 / 16.8 ms | 0.3% | 1.5 |
| Reading pace, CPU throttled 4 times | 16.7 / 16.8 / 16.8 ms | 0.3% | 1.5 |
| No GPU (software rendering), fast | 16.7 / 66.7 / 116.7 ms | 43% | 0.75 (adapted down; the median was 83 ms before) |

The slowest single frames (up to about 180 ms on the GPU) come when a scene mounts. What keeps it smooth:

- **Textures:** WebP with alpha (98 plates, 3.1 MB in all), capped at 2048 px on the longest side (1024 on low-memory and small touch devices), uploaded with premultiplied alpha and mipmaps. Only the current and the next scene are preloaded; a texture nobody holds leaves the GPU 4 s later.
- **Drawing on demand:** the stage canvas draws once per progress change, plus every frame only while an idle effect is in view; both canvases stop in a hidden tab.
- **Instancing:** the glow's droplets and every star or sparkle field are one instanced draw each, animated in the vertex shader.
- **No allocations per frame** in the canvas frame loops: plates reuse scratch vectors, pairs and quaternions; the idle clock walks the scene graph without callbacks; the finale's loop writes into reused frame objects. Motion's derived values do allocate small objects (that is how Motion works).
- **Pixel ratio:** 1 to 1.5 on the stage (1.25 on a phone), 1 to 1.25 on the transition canvas (1 on a phone), half the glow droplets on a phone.
- **Adaptive quality** (`AdaptiveQuality` in `stage-canvas.tsx`, `adaptDpr` in `quality.ts`): after 1.2 s of frames slower than 45 fps the stage drops its pixel ratio by a fifth (down to 0.75), and after 4 s of frames quicker than 57 fps it raises it again, never back to a ratio that proved too slow. Only draws in consecutive animation frames count, so an on-demand canvas that simply had nothing to draw is never mistaken for a slow one. The adapted ratio goes through the canvas's own `dpr` prop (React Three Fiber re-applies that prop whenever the canvas re-renders).

## Storyboard check

Scene by scene against `docs/STORYBOARD.md`. Everything the storyboard asks for is on the stage; where it differs on purpose, or still waits on something outside the code, it says so here.

| Scene | Status |
| --- | --- |
| 1 Hero | Matched: sky, statue raising the orange on the minaret, the glow ripple before any scroll, the crowd looking up, the hero copy and button, "What we do", the chrome. |
| 2 Ascent | Matched: the glow brightens and quickens, the copy drifts left title first, the push-in, the rising minaret turning to bark, branches and leaves, settling on one branch. |
| 3 Graft | Matched: two sleeved hands fit the cutting, wrap and knot it, then the camera pulls out to the swaying tree full of oranges. |
| 4 Pluck | Matched: the rising hand, "We get you found." with its progress line as the hand closes, the dolly down, the harvester, "We split the harvest." with the tag and the typed line. |
| 5 Share | Matched: knife, halves, the second hand, both holding, the viewfinder, the push into the halves, the sand, the ruler switching to The Work. |
| 6 Work | Matched: clouds drifting right and the dolly up, three cards in turn (the clouds part around them), the giant orange and builder with card 3, the ruler, the percent counter. |
| 7 Blueprint | Matched, with one simplification: the packet is in the architect's hands, but it is brought forward and opens by itself in front of the scaffold (his arms do not move: TODO with final art, arm frames for him). |
| 8 Site | Matched: the seaside site, the rise to straight above with no sky, the shrink into the left half with the field of tiles, the milk panel with drifting leaf shadows, the terms text. |
| 9 Prune | Matched, with one deliberate change: on a wide screen the gardener stands right of center (the storyboard says center) so the fit text at the bottom left never sits on the white column; on a phone he is centered. The dust, the docking title and the fit text are as described. |
| 10 Fall | Matched: the cut branch, the push toward his face and his drift out, the falling orange followed to the center, the text sinking, the rainbow ring, the orchard, the dolly up, Questions on the ruler and the section title. |
| 11 Questions | Matched: five glass cards, one connector fixed on an orange and locked to a different corner each time, zoom then arc, sparkles, exact reversal (checked in the browser), the smoke. |
| 12 Stargazer | Matched: the push into the blue, the fabric sky and the billowing cloud, the astronomer pointing from his platform, the growing constellation, the clear bottom right. |
| 13 Apply | Matched: tag, title and subtitle top left; the form on the right with two short glass fields, the larger one, icons on the labels and the 3D stack on hover or focus (checked in the browser). |
| 14 Finale | Matched: the sink, the clouds, the form leaving, the stars drifting away, the tree, the woman watering and the man trimming, the loop on idle time, the closing frame with the wordmark, subtitle, copyright and email, the end of the page. |

TODO, outside the code:

- **Art.** Every plate is a placeholder; the painted plates go in at the paths in `public/art/manifest.json` (see `docs/ART-PLATES.md`).
- **The contact email** "hello@orange.io" is marked "TODO: confirm the real address" in the storyboard; it lives in `src/content/copy.ts`.
- **The application endpoint.** The form posts to `NEXT_PUBLIC_APPLY_ENDPOINT`; without it the form shows its success message but sends nothing (see the README).
- **The architect's arms** (scene 7): with final art, arm frames for him unfolding the drawing.

## Reduced motion

Visitors who prefer reduced motion get no pinned stage, no smooth scrolling and no canvas. CSS (`motion-reduce:`) shows them a normal stacked page instead, before any script runs: the four chapters and the finale in order, one still per scene (the placeholder plate as an image), and all the copy in reading order, with the five questions as a plain FAQ list. The "Apply" link jumps to the application on that page.

## Phones, restoration and accessibility

**One script, a shorter stage.** Under `MOBILE.stackedMaxWidth` (767px, the same width as Tailwind's `max-md` and the `@media` blocks in `globals.css`; `stacked-css.test.ts` keeps them in step) the page is laid out stacked. The stage is `MOBILE.stageScale` (0.7) as tall (3780vh, about 36.8 screens), and `MOBILE.weights` give each scene a multiplier on its share of the scroll before the result is scaled to fit (`src/scroll/mobile.ts`): the text-heavy scenes keep their reading time, the long camera moves tighten. Every progress value in `script.ts` is the same everywhere; only the scroll distance between them changes, and `stage-scroll.ts` is the one place that maps scroll to progress (`mobile.test.ts` checks that every beat keeps enough scrolling to read). The stage height itself is CSS (`--stage-vh`, `--stage-vh-stacked`, written from the script).

**Layout.** Slots stack (`slots.ts`, `max-md:` classes): titles and the hero hang from the top; paragraphs, cards and the form sit at the bottom; the question cards and the finale keep the middle. The hairline grid mirrors on the right and the top line drops to 56px (`stackedGrid`), so the mark, the menu button and Apply sit in a row above it and no star lands on the pill. The form is one column. The site scene shrinks into the upper half with the milk panel below. Fewer particles (half the glow droplets) and a lower pixel ratio (`quality.ts`).

**Camera on tall screens.** Below an aspect of 1.3 the field of view widens so the picture keeps the width it has at 1.3 (`fitFov`, `camera-path.ts`), and keys can carry a `pan`: the hero slides toward the statue, and the prune centers the gardener again and lifts the picture above the text. The stage reports its shape with `setStageAspect`, so the rig, the connector lines and the falling orange all use the same fitted camera. Wide screens are untouched. The taller picture this shows is accounted for: the astronomer sinks right out of a phone's frame in the application (`SINK_DEPTH_STACKED`, checked against projected phone frames), and the orchard rows fade out at their foot instead of ending in a cut edge.

**Touch.** Native momentum: Lenis smooths wheel input only, and nothing sets `touch-action`.

**Restoration and deep links** (`navigation.ts`, `story-location.ts`). A script in the document head turns off the browser's own scroll restoration and, when a place is to be restored (a reload or back/forward with saved progress, or a hash naming a chapter), marks `<html data-restore>`, which covers the stage until the engine has jumped there (instantly, through Lenis) so the hero never flashes. Progress is saved to session storage once scrolling settles and when the tab hides. `#model`, `#work`, `#terms`, `#questions` and `#apply` scroll to their place (and `#apply` focuses the form's first field, on load as on a later hash change); the hash follows the chapter with `replaceState` once scrolling settles, and a hash change scrolls there.

**Keyboard.** Space, Page Up and Down, Home, End and the arrows are the browser's. J and K jump to the next and previous text beat (`BEAT_STOPS`, where the beat's last line has arrived); they are ignored while typing or in a dialog. A skip link (the first tab stop) goes to the form and focuses its first field; so do Apply and Start a partnership, on the stage and on the reduced-motion page.

**Screen readers** (`story-outline.tsx`). The stage is decorative: its beats are `aria-hidden` (their buttons and links are out of the tab order), as are the art and canvases. A visually hidden outline is always on the page: the four chapters as landmarks with headings, every beat in script order, the questions as one list, and a link to the form.

**Hidden tabs.** The canvases set their frame loop to `never` (`PauseWhenHidden`), the idle clock and the transition drift stop, and `html[data-tab-hidden]` pauses the CSS idle effects.
