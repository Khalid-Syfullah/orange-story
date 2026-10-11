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
| Transitions: drawn on the stage (lens layers, particles, paper hinges, cloth, the smear), a pure plan each, their design (`docs/TRANSITIONS.md`) | `src/components/stage/transitions/` |
| Smoke-out for text | `src/components/motion/smoke-out.tsx` |
| Framing: the world scale's figures framed by targets, worked out into camera keys (`FRAMING`, `framedKey`, `phonePan`); the fit to a tall screen (`camera-fit.ts`); the report (`npm run framing`) | `src/scroll/framing.ts`, `src/scroll/camera-fit.ts`, `scripts/framing-report.mjs`, `scripts/framing/core.mjs` |
| The living, painted stage: the canvas, the figure treatment, the halftone layer (`paint.ts`), rigs (`rig.ts`), idle life (`life.ts`), scrubbed acting (`acting.ts`, ranges in `ACTING`), figures and their parts (`figure-life.ts`), the shared uniforms and textures (`materials.ts`, `stage-surface.tsx`) | `src/components/stage/` |
| Natural motion: the motion kit (weighted curves, two-bone IK, grips, flights, damped rings, live lag), every scene's driven values (`motion-channels.ts`) and the check that walks them; the shared flight and monotone curves | `src/components/stage/motion-kit.ts`, `src/components/stage/motion-channels.ts`, `src/lib/flight.ts`, `src/lib/monotone.ts` |
| The motion lab (scene picker, scrubbing, bones, pivots, grips, arcs, the driven values plotted) and the motion capture (`npm run motion:capture`) | `/design` (`src/app/design/motion-lab.tsx`), `scripts/motion-capture.mjs`, `test-results/motion/` |

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
| Transitions | 0.6 to 1.2 screens each; a scripted full cover of at most a tenth of a screen, which reads as 0.15 to 0.2 screen with the medium's soft edges (the paper unfold: covered after 0.48 screen, open over 0.59) | Phase 26: a cover held for a quarter to a third of a screen was an empty, flat frame (`docs/TRANSITIONS.md`). |
| Camera | a monotone cubic through the keys (see Camera) | The story curve front-loaded every move: 76% of it in the first quarter and 96% by half way, so long moves lurched and then sat still. |
| Framing | the figure scenes' keys are worked out from targets (`src/scroll/framing.ts`, see Framing) | Phase 24: the figures stood full length in the middle of wide shots (the statue 26% of the height, each onlooker 15%); now they fill the frame and are cropped by it. |
| Stage pixel ratio | 1 to 1.5 (1.25 on a phone), stepping down to 0.75 on a device that cannot keep up | `quality.ts` |
| Wheel smoothing (`WHEEL_LERP`) | 0.085 (Lenis's lerp per 60th of a second; touch stays native) | Phase 25: a wheel notch arrives as a glide of about a fifth of a second, so motion that is smooth in progress stays smooth on screen (see Natural motion). |
| Story time (`PHYSICS`) | 1 second per screen, gravity 9.81 (a world unit is a metre) | Phase 25: the stage's falls, rings and settles run on story time, a function of progress. |

## The stage

The site is one `<section>` that is `STAGE_VH` tall (5400vh), scrolled natively. Inside it a sticky frame, exactly one viewport tall, holds every layer, bottom to top:

1. the WebGL canvas: the scene plates and, drawn with them, the transitions (the leaves, the sand, the cloud, the paper unfold, the dust and the site's milk page, the ring, the fabric sky);
2. the hairlines, and the progress lines that run along them;
3. the DOM text layer: every beat of the script, each in its slot;
4. the chrome: mark, chapter menu, "Apply", ruler, percent counter.

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

**1. Hero, 0.00 to 1.59.** The camera is still, close on the statue: she fills 62% of the height on the right third, the orange at the top, and the onlookers stand nearer the camera in front of her, a band of heads and shoulders along the bottom third, cropped by the bottom edge (on a phone she stands right of the button, 55% of the height, and the onlookers recede into the haze behind "What we do"). The hero copy is already on screen when the page opens: the title, subtitle and "Start a partnership" button center left, and the "What we do" tag and paragraph bottom left. They play a short timed intro once per page load, hold for a quarter screen (the bottom copy for 0.4), then blur and drift left, title first, and are gone by 1.00. Scrolling back up brings them back the same way, with no second intro.

**2. Ascent, 1.59 to 4.24.** No text (the hero copy has already drifted away). The camera pushes in on the statue from 1.59 (at 2.33 she fills 80% of the height), glides into a pan down the rising trunk as she rises out of the top of the frame (3.05), dollies up from 3.84 and settles at 4.24 on the first branch, where the graft is made, without stopping at the keys in between. Its timings are the `ASCENT` object in the script, played by `src/components/stage/ascent-art.tsx` through the pure functions in `ascent-tree.ts`:

- The statue, its orange and the top of the minaret rise together, slowly at first, then faster, to 10 world units by the end. The shaft is one tiling plate that grows from a fixed bottom (more tiles, never stretched).
- The stone turns to bark through the morph mask along a front that climbs the shaft: it enters the frame as the camera pushes in (`ASCENT.front`, world heights) and has closed on the top of the trunk by 3.07 (`ASCENT.barked`).
- Three branches scale out from the trunk once it is tall enough (from 3.18, 3.45 and 3.71), and their leaves unfurl with them.
- The glow keeps the hero's full brightness and rides up with the orange (the ripple clock is shared with the hero's, so the two scenes' glows trade places without adding up); the statue, the orange and the glow fade once above the frame (3.82 to 4.16).

**3. Graft, 4.24 to 6.89.** No text. The camera holds on the branch, the hands and their work half the width of the frame, while the hands come in (4.29 to 4.66), fit the cutting (to 4.98), wrap the twine (to 5.25), tie the knot in three steps (to 5.72) and leave (to 5.94); it then dollies up and pulls out to the fruiting tree (5.88 to 6.89) while the tree fills with oranges (5.94 to 6.78).

**4. Pluck, 6.89 to 10.07.** The camera holds on the tree while the hand rises from the bottom center to the one special orange (6.95 to 7.65) and closes on it (7.59 to 7.84). As the hand closes (7.75) "We get you found." arrives center left, slightly low; a thin progress line draws along the top hairline from 7.75 to 8.35 and erases as the beat leaves (8.75 to 9.05). From 8.00 the camera dollies down through the branches to the harvester and lands on him at 9.24, waist up, 88% of the height, cropped by the bottom and right edges, the orange in his hand large above the bottom-left words. The hand tugs the fruit free (7.94 to 8.26) and carries it down with the camera (`carryAt` reads the camera's own travel), so the orange stays framed while the foliage rushes up past it; the near foliage falls away first (8.03 to 8.48), then the middle layer (8.29 to 8.93). The harvester (white robe) enters the frame from below and appears from 8.29 to 8.99; the hand lets go and drops away (9.15 to 9.43) as his right arm, holding the orange, takes the fruit over (9.15 to 9.34). Once he is revealed (9.48), "We split the harvest." arrives bottom left with the "Revenue share" tag under it; the line to the right of the tag types itself out during the beat. While each beat is up, the foliage behind its words recedes into the sky's haze (on a phone his robe does too). The timings are the `PLUCK` object in the script, played by `src/components/stage/pluck-art.tsx` through the pure functions in `pluck-harvest.ts`.

**5. Share, 10.07 to 12.30.** His left hand comes in above the orange with a knife (10.11 to 10.31) and plunges the blade down through it (10.31 to 10.52); under the blade the whole orange gives way to its two peels (10.33 to 10.35), and the knife withdraws (10.52 to 10.72). The halves part and their cut faces are revealed (10.49 to 10.76). A second hand reaches in from center left to the left half (10.67 to 10.92), takes it and draws it a little away (10.92 to 11.09), and both hands bring the halves together (11.09 to 11.36) and hold them: the harvest, shared. The timings are the `SHARE` object, played by `src/components/stage/share-art.tsx` through `share-cut.ts`. The camera holds on the harvester, then pushes into the orange from 10.56 while the harvest beat fades (gone by 10.89). It holds on the hands and the halves from 11.07 (half the width of the frame, the halves in the middle of the viewfinder) and pushes into them from 11.67. The hairlines close into a square viewfinder around the halves (11.18 to 11.61), hold it until 11.90 and open out by 12.16. The sand sweeps in from 11.64, covers the screen fully from 12.26 to 12.34 (the camera reframes unseen) and clears by 12.70. The ruler switches to The Work at 12.30; the hairlines slide out and come back under the sand.

**6. Work, 12.30 to 17.91.** The camera dollies slowly upward through the clouds from 12.34; as the third card arrives (16.00) it closes in on the builder rising with the giant orange, left of the card, and by 17.75 holds on him knees up, 80% of the height. The service cards take turns in the right column, chained from the moment the sand clears: card 1 from 12.80 to 14.10, card 2 from 14.40 to 15.70, card 3 from 16.00 to 17.60 (1.6 screens for its longer body). Six cloud plates, each drawn twice, drift right on idle time and shift right with the scroll; from 12.50 to 17.90 they part around the card text (`cloudClearing`): a cloud drifting toward the words thins out and re-forms beyond them, so the clouds pass on both sides and white text never sits on a white cloud. The giant orange on its minaret rises into view with its builder as card 3 arrives (16.00 to 17.86).

**7. Blueprint, 17.91 to 21.20.** The work's frame dissolves into the sky beside the scaffold; the camera pans across to the builder on his platform (knees up, by 18.30), holds while he works, then from 18.57 comes down the scaffold to the architect (knees up, at 19.10) as she brings the plan forward, and pushes into the plan as it opens. The architect holds the folded packet in his hands; it is brought forward to the middle (18.57 to 19.10) and opens panel by panel (19.10 to 20.54). The paper unfold starts at 20.61 and covers the screen fully from 21.12 to 21.28 (the camera reframes unseen), then the sheet opens onto the next scene by 22.01. The chrome and hairlines turn ink on milk from 20.87 to 22.01. The ruler switches to The Terms at 21.20.

**8. Site, 21.20 to 25.44.** The camera holds at ground level from 21.28, on a builder at work (knees up, 80% of the height, the orange under construction beside him; builders working a little: 21.71 to 22.73), then pulls back to the whole site by the sea (22.05 to 22.43) and rises to a straight top-down view (to 22.98). The matching top-down set, the plain sand ground and the first tiles fade in (22.60 to 22.90) while the side plates fade out (22.68 to 22.94); the sea and its sky leave last (22.90 to 22.98), so the top-down view has no sky. The camera then keeps rising and pulls out (22.98 to 24.17) while the whole site slides into the middle of the left half in step with it (`shrinkAt` reads the camera's travel) and the tiled field grows around it (22.81 to 24.25). The right half becomes the milk-white panel from 23.07 to 23.40 (`SitePanel`, with two slowly drifting, heavily blurred leaf-shadow layers) until the dust covers it at 25.40 (ink chrome and text from 22.90). The terms block sits in the right column from 23.15 to 25.19. The rising dust starts at 25.10, covers the screen from 25.40 to 25.48 and clears by 25.80.

**9. Prune, 25.44 to 29.42.** The camera holds on the gardener from 25.48, waist up, 90% of the height, on the right beside his young tree, which fills the left of the frame and recedes into the sky's haze behind the chapter title and the fit text while they are up (`unionArea`: behind both slots at once); on a phone he is half the height, his shears in the frame, and recedes behind the fit text too. The shears snip from 25.84 to 28.82. "The Terms" starts rising from the bottom in very large type at 25.92 and shrinks as it climbs until it docks in the top-left corner by 27.32. The fit text and its "In plain terms" aside arrive bottom left at 27.23. Both stay until the branch is cut.

**10. Fall, 29.42 to 33.28.** All the text blurs and sinks back into the picture as the scene begins (29.48 to 29.88). The camera pushes toward the gardener's face (29.42 to 30.27: his head half the height of the frame), dollies down after the falling orange (30.27 to 31.16), pushes into it (31.16 to 31.54), then dollies up between the rows of trees (31.54 to 33.28). The scene opens on the prune picture as it was left. At 29.69 the branch is cut: the still branch (fruit and all) hands over to a copy without its fruit, which drops faster and faster, turning (29.74 to 30.96), while the orange sits where the fruit hung and falls on its own (29.74 to 31.16), the camera following; the gardener drifts right and out of frame (29.80 to 30.65). The orange is placed relative to the camera and settles at the ring's origin on screen. The rainbow ring sweeps out from the orange from 31.16 to 31.97: the old picture is cut away outside the ring and the orchard rows show only inside it, while the orange stays in front. It goes soft (31.16 to 32.20) and keeps falling out of the bottom of the frame (31.54 to 33.28), fading out by the end. Timings are the `FALL` object, played by `src/components/stage/fall-art.tsx` through `fall-plan.ts`. The ruler switches to Questions at 33.28, with the hairlines sliding out from 32.98 and back by 33.88.

**11. Questions, 33.28 to 40.70.** "Questions worth asking first." arrives top center at 33.28 and stays through all five cards; while it is up, the fruit of the rows behind it recedes into the haze. The cards take turns in the center, 1.3 screens each, end to end: question 1 from 33.54 to 34.84, question 2 to 36.14, question 3 to 37.44, question 4 to 38.74, question 5 to 40.04. The first zooms up from small in the center; the others arrive from the right along the arc; cards 1 to 4 swing left along the arc as they leave, and each has swung fully away at the very point where the next starts to arrive. Each card's connector line draws out from its orange as the card arrives (question 1 from 33.70 to 34.09, then 1.30 screens later for each card) and its square locks onto the card's corner. The camera climbs between the rows one step per card, during the card's arrival (33.54 to 33.89 for the first, and so on), and holds while the card is read, so the orange stays put under the line. After the last card, the card, its line and the title dissolve upward like smoke (39.69 to 40.04) while the camera pushes forward into the blue. The fabric sky starts at 40.48, covers the screen from 40.65 to 40.75 (the camera reframes unseen) and clears by 41.23. The deck is `FAQ` in the script, played by `src/components/story/question-deck.tsx` through `question-plan.ts` (see "The questions' deck" below).

**12. Stars, 40.70 to 43.35.** No text. The camera holds on the stargazer from 40.75 (82% of the height, top left, his pointing hand in the sky) while the constellation grows from his fingertip (41.29 to 43.22); the constellation is laid out in the sky that frame sees (`SKY`, `stars-plan.ts`).

**13. Apply, 43.35 to 47.59.** The astronomer and his platform step down the sky until his hand is level with the middle of the frame (43.61 to 44.20; on a phone they sink right out of the frame, which the text and the form fill). Both depths are worked out from the camera (`apply-plan.ts`). The application tag, title and subtitle arrive top left at 43.69; the form fades in on the right from 43.86. Both are fully on screen from about 44.16 to 47.94 (this is where "Apply" lands), then blur, rise and fade out by 48.24, in the finale. The constellation recedes while they are up (`starsDim`).

**14. Finale, 47.59 to 53.00.** The camera holds while the astronomer and platform sink on from the apply position (out of every frame the finale films) and the stars drift up (47.59 to 49.22), then from 48.57 comes down to the orchard keepers as the old cloud slides away (to 49.76), the tree rises (48.57 to 49.76) and the woman and the man walk in (49.32 to 50.41) and settle: by 50.41 they fill 95% of the height either side of the frame, cropped at the bottom, the tree between them; and from 50.41 their loop runs on idle time (watering, snipping, an orange cut free, oranges dropping, clouds drifting right); it pauses offscreen and fades out when scrolling back. The hairlines slide out to the edges (49.49 to 50.30), then close in from there into a square viewfinder by 52.19 and stay closed. The wordmark, subtitle, copyright and email arrive inside the frame from 50.84 and never leave; as they arrive, the tree inside the frame recedes into the haze and goes a little soft. The page ends at 53.00; further scrolling does nothing, and scrolling up plays everything back to the hero.

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

Every scene change is an event inside the painting, designed in `docs/TRANSITIONS.md` (what happens, the camera, the link, the layers, the lighter and calm versions). Covering transitions (sand, cloud, unfold, dust, fabric) straddle a scene boundary and cover the screen fully across it ("Full" below), so the scenes swap where nobody can see, and the camera may reframe there. The leaves pass the lens as the camera rises to the branch (the scenes cross-fade behind their densest moment, "swap at"), and fall past it as the tree fills with fruit. The ring ripples out from the falling orange to the orchard inside the fall scene. The smoke is a text effect on the last question and the questions title. The two viewfinders are drawn by the hairlines: the lines close into a square around a target rectangle (the halves in scene 5, the wordmark in scene 14); the finale one never opens again.

| Transition | Kind | Scenes | Start | Full | End | Screens | Layer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `leaves` | leaves | ascent to graft | 0.0730 | swap at 0.0770 | 0.0845 | 0.61 | canvas |
| `foliage` | leaves | graft to pluck | 0.1110 | none | 0.1336 | 1.20 | canvas |
| `viewfinder-share` | viewfinder | share | 0.2110 | 0.2190 to 0.2244 | 0.2295 | 0.98 | hairlines |
| `sand` | sand | share to work | 0.2196 | 0.2312 to 0.2328 | 0.2396 | 1.06 | canvas |
| `cloud` | cloud | work to blueprint | 0.3327 | 0.3377 to 0.3383 | 0.3448 | 0.65 | canvas |
| `unfold` | unfold | blueprint to site | 0.3901 | 0.3991 to 0.4009 | 0.4120 | 1.16 | canvas |
| `dust` | dust | site to prune | 0.4724 | 0.4792 to 0.4808 | 0.4868 | 0.76 | canvas |
| `ring` | ring | fall | 0.5878 | none | 0.6032 | 0.81 | canvas |
| `smoke` | smoke | faq | 0.7489 | none | 0.7555 | 0.35 | text |
| `fabric` | fabric | faq to stars | 0.7613 | 0.7676 to 0.7685 | 0.7740 | 0.67 | canvas |
| `viewfinder-finale` | viewfinder | finale | 0.9490 | 0.9847 to 1.0000 | 1.0000 | 2.70 | hairlines |

How each one plays, all scrubbed by progress (its physics on story time, a function of progress) and so exactly reversible. Every medium draws nothing at its start (the old scene, untouched) and nothing at its end (the new scene, untouched); the covering ones cover every pixel across "Full" (a little longer on screen, with their soft edges). The unit tests (`src/components/stage/transitions/transitions.test.ts`) prove it from the same bounds the shaders use, on five stage shapes from a phone to a 2 by 1 browser.

- **Leaves.** Forty-six of the ascent's painted leaves stand in the world on the twigs around the camera's path to the branch; the push carries them past the lens, near ones huge and soft. Two on the path fill the lens at 0.0770, where the scenes cross-fade over 0.012 screen to each side (`swap`, `swapAt`). Back out of the tree, thirty loosened leaves flutter down past the lens while the tree fills in clump by clump (`grow`, `GRAFT.fruit`).
- **Sand.** Grains pour from the halves' cut faces under gravity, the wind lifts them across, a blue dune piles up from the bottom (its lit crest smoking) and streams of grains cross at three depths; the frame fills only as the cover comes; then the wind opens holes in it at once and carries it off right, falling away below as the camera rises.
- **Cloud.** A gust carries a bank of The Work's clouds in from the left; the nearest's solid core fills the frame at the boundary; the pan to the scaffold carries the camera out of it. Every cloud starts and ends outside the frame.
- **Paper unfold.** The camera dives into the plan until its two middle panels overfill the frame; a sheet in front of the lens matches them exactly (match cut) and the camera reframes to the site under it; the right page turns toward the camera over the middle crease (`UNFOLD_PAGES.first`, 0.4009 to 0.4081) and lands with a small flop, then the doubled left half turns away over the left crease (`UNFOLD_PAGES.second`, 0.4047 to 0.4120).
- **Rising dust.** The site's page lifts and flies off; plumes rise from the site toward the lens, cooling from the sand's colour to blue, white specks in them; the frame fills only as the cover comes; then the dust lifts off from the bottom along its billows' edge, uncovering the gardener.
- **The ring.** A ripple of halftone dots (a crest and a train dying away, the grid bent on the slopes, a thin spectral sheen on the crest) runs out from the orange's strike past every corner; the old picture is cut along the crest (`reveal={{ transition: "ring" }}` on the orchard, `side: "outside"` on the old picture), drops of light jump and fall back.
- **Fabric sky.** The sky comes loose as a blue cloth, simulated once (`cloth.ts`) and read back by story time: it falls into view billowing, covers the lens for a moment and slides out at the bottom, uncovering the stargazer.
- **Smoke.** The beats it lists (the last question and the questions title) dissolve together across its range: their lines blur and rise, first line first, and soft holes of smoke noise open in them and drift upward (a CSS mask). Every beat that leaves as `smoke` gets the same mask over its own leave. `SmokeOut` (BlurFade drifting up, plus the mask) does the same for any other group of text.
- **Viewfinders.** The hairlines' `viewfinder` cue (see below): the lines close in from wherever they are into a square around `target`.
- **The finale's clouds** blow in once the scenes have changed (`FINALE.cloudsIn`, 0.9006 to 0.9174), forming from their upwind side, instead of fading up where they stand.

Where they are drawn:

- On the stage canvas itself (`src/components/stage/transitions/`), not on a canvas over it: lens layers in front of the camera for the media that fill the lens (`LensGroup`, drawn after every scene's plates, far to near), world layers for those the camera moves through (the leaves, the cloud bank), and the ring in the fall scene's halftone layer. `TransitionStage` mounts each medium `TRANSITION_PRELOAD_SCREENS` (3) before its transition (art loading, shaders compiled while the browser is idle, the cloth simulated in idle slices) and unmounts it a screen after; a mounted medium draws only while its transition runs.
- Only one canvas transition runs at a time, and no text beat is on screen during one (`validateScript()` and the script's unit test check it).
- Three versions (`modes.ts`): `full`; `light` on a phone or the lowest quality tier (40% of the particles, the two nearest sheets, no smear); `calm` (a still painted veil in the medium's colours that the scenes cross-fade through; the ring and the leaves become cross-fades). `?transitions=full|light|calm` forces one.
- Scrolling fast smears the grains and leaves along their flight (`smear.ts`, a spring on the scroll speed that settles to nothing at rest; off in the light and calm modes and with idle time held).
- In development, `/design` plays every transition on the real stage over its real range (and a tenth of a screen either side), in any of the three versions.

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
| hero | 0.0000 | hold | 2, 2.16, 3.87 | 2, 2.16, -1.5 | 35 | 0.96, 0.39, -3.09 |
| ascent | 0.0300 | push | 2, 2.16, 3.87 | 2, 2.16, -1.5 | 35 | 0.96, 0.39, -3.09 |
| ascent | 0.0440 | push | 2.9, 3.34, 2.86 | 2.9, 3.34, -1.5 | 33.5 | 0.5, 0, -2.29 |
| ascent | 0.0575 | pan | 3.17, 3.69, 2.81 | 3.17, 3.69, -1.5 | 32 | 0.24, 0.16, -2.21 |
| ascent | 0.0725 | dolly-up | 2.76, 5.51, 1.28 | 2.76, 5.51, -1.69 | 31 | 0, 0, -0.1 |
| graft | 0.0800 | hold | 2.75, 5.48, -0.14 | 2.75, 5.48, -1.61 | 30 | 0, -0.04, 0.17 |
| graft | 0.1110 | pull | 2.75, 5.48, -0.14 | 2.75, 5.48, -1.61 | 30 | 0, -0.04, 0.17 |
| pluck | 0.1300 | hold | 2.62, 6.05, 1.96 | 2.62, 6.05, -1.59 | 36 | 0, 0.05, -1.69 |
| pluck | 0.1510 | dolly-down | 2.62, 6.05, 1.96 | 2.62, 6.05, -1.59 | 36 | 0, 0.05, -1.69 |
| pluck | 0.1744 | hold | 2.54, 4.42, -0.42 | 2.54, 4.42, -1.88 | 34 | 0.27, -0.34, -0.51 |
| share | 0.1900 | hold | 2.54, 4.42, -0.42 | 2.54, 4.42, -1.88 | 34 | 0.27, -0.34, -0.51 |
| share | 0.1992 | push | 2.54, 4.42, -0.42 | 2.54, 4.42, -1.88 | 34 | 0.27, -0.34, -0.51 |
| share | 0.2089 | hold | 2.59, 4.29, -0.54 | 2.59, 4.29, -1.75 | 30 | 0, -0.05, 0.28 |
| share | 0.2202 | push | 2.59, 4.29, -0.54 | 2.59, 4.29, -1.75 | 30 | 0, -0.05, 0.28 |
| share | 0.2312 | reframe | 2.59, 4.3, -1.19 | 2.59, 4.3, -1.77 | 28 | 0, -0.05, 0.28 |
| work | 0.2328 | dolly-up | 0, 0, 14 | 0, 0.5, 0 | 40 | 0, 0, 0 |
| work | 0.3019 | push | 0, 5.76, 13.66 | 0, 6.26, 0 | 39.5 | 0, 0, 0 |
| work | 0.3348 | hold | -4, 11.78, 1.9 | -4, 11.78, -0.6 | 39 | -0.57, -0.72, -0.92 |
| blueprint | 0.3380 | pan | -4, 11.78, 1.9 | -4, 11.78, -0.6 | 39 | -0.57, -0.72, -0.92 |
| blueprint | 0.3454 | hold | -1.31, 11.77, 1.95 | -1.31, 11.77, -0.6 | 38 | -0.56, -0.72, -0.94 |
| blueprint | 0.3504 | pan | -1.31, 11.77, 1.95 | -1.31, 11.77, -0.6 | 38 | -0.56, -0.72, -0.94 |
| blueprint | 0.3603 | push | 0.85, 9, 1.89 | 0.85, 9, -0.5 | 38 | 0.45, 0, -1.15 |
| blueprint | 0.3985 | reframe | 0.2, 9.5, 1.47 | 0.2, 9.5, -0.3 | 34 | 0.45, 0, -1.15 |
| site | 0.4015 | hold | -1.59, 2.09, 1.78 | -1.59, 2.09, -0.8 | 38 | -0.28, -0.13, -1.24 |
| site | 0.4160 | dolly-up | -1.59, 2.09, 1.78 | -1.59, 2.09, -0.8 | 38 | -0.28, -0.13, -1.24 |
| site | 0.4336 | pull | 0, 13, 0.01 | 0, 0, 0 | 38 | 0, 0, 0 |
| site | 0.4560 | hold | 0, 24, 0.01 | 0, 0, 0 | 38 | 0, 0, 0 |
| site | 0.4792 | reframe | 0, 24, 0.01 | 0, 0, 0 | 38 | 0, 0, 0 |
| prune | 0.4808 | hold | 0.06, 0.71, 1.44 | 0.06, 0.71, 0 | 35 | 0.2, -0.05, -0.52 |
| fall | 0.5550 | push | 0.06, 0.71, 1.44 | 0.06, 0.71, 0 | 35 | 0.2, -0.05, -0.52 |
| fall | 0.5711 | dolly-down | 0.31, 0.94, 1.08 | 0.31, 0.94, 0 | 32 | 0.06, -0.01, -0.53 |
| fall | 0.5878 | push | 0, -3, 5 | 0, -3, 0 | 32 | 0, 0, 0 |
| fall | 0.5951 | dolly-up | 0, -4, 2.6 | 0, -4, 0 | 30 | 0, 0, 0 |
| faq | 0.6280 | hold | 0, 1, 12 | 0, 2, 0 | 40 |  |
| faq | 0.6329 | dolly-up | 0, 1, 12 | 0, 2, 0 | 40 |  |
| faq | 0.6395 | hold | 0, 1.7, 12 | 0, 2.7, 0 | 40 |  |
| faq | 0.6574 | dolly-up | 0, 1.7, 12 | 0, 2.7, 0 | 40 |  |
| faq | 0.6640 | hold | 0, 2.4, 12 | 0, 3.4, 0 | 40 |  |
| faq | 0.6820 | dolly-up | 0, 2.4, 12 | 0, 3.4, 0 | 40 |  |
| faq | 0.6886 | hold | 0, 3.1, 12 | 0, 4.1, 0 | 40 |  |
| faq | 0.7065 | dolly-up | 0, 3.1, 12 | 0, 4.1, 0 | 40 |  |
| faq | 0.7131 | hold | 0, 3.8, 12 | 0, 4.8, 0 | 40 |  |
| faq | 0.7310 | dolly-up | 0, 3.8, 12 | 0, 4.8, 0 | 40 |  |
| faq | 0.7376 | hold | 0, 4.5, 12 | 0, 5.5, 0 | 40 |  |
| faq | 0.7489 | push | 0, 4.5, 12 | 0, 5.5, 0 | 40 |  |
| faq | 0.7671 | reframe | 0, 5, 6 | 0, 6, 0 | 38 |  |
| stars | 0.7689 | hold | -1.84, 6.98, 3.26 | -1.84, 6.98, -0.2 | 38 | -0.69, 0.06, -1.91 |
| apply | 0.8180 | hold | -1.84, 6.98, 3.26 | -1.84, 6.98, -0.2 | 38 | -0.69, 0.06, -1.91 |
| finale | 0.8980 | hold | -1.84, 6.98, 3.26 | -1.84, 6.98, -0.2 | 38 | -0.69, 0.06, -1.91 |
| finale | 0.9164 | dolly-down | -1.84, 6.98, 3.26 | -1.84, 6.98, -0.2 | 38 | -0.69, 0.06, -1.91 |
| finale | 0.9510 | hold | -0.06, 4.85, 2.38 | -0.06, 4.85, -0.3 | 38 | 0, 0.01, 0.67 |

The keys of the questions inherit the fall's pan (none). Positions are rounded to two places here; the script has them exact.

### Framing

The camera keys of the figure scenes are not typed in: they are worked out from the framing table (`FRAMING` in `src/scroll/framing.ts`; the targets are in `docs/ART-PLATES.md`, "Framing"). Each row names a subject (a world box from the manifest: a figure's visible `box`, the top of it for "waist up" or "knees up", two hands around their grips), the share of the stage it should fill (of the height, or the width for hands), where on the stage its pin should land, and the field of view, on a laptop (1440 by 900) and on a phone (390 by 844):

- `shot(spec)` puts the camera on the subject's plane normal, far enough away that the box fills the share, and slides it so the pin lands where it should. Shots look straight along -z, so a pan never tilts the picture.
- `phonePan(desktop, phone)` works out the phone's own shot and returns the difference as the key's `pan`: [x, y, z], the third value bringing the camera nearer the picture (the phone's fitted field of view is nearly three times as tall). The camera path fades it in on tall screens (`panAmount`), so a phone frames the subject at its own size, below or beside the text.
- `framedKey(id)` is both, for a row; `FRAMED` in the script lists the key each row is checked at.

Keys between framed ones keep the moves of the story: the ascent's push, pan and dolly follow the rising statue (`risenStatue`, the rise of `ASCENT`) to the branch of the graft; the pluck's dolly runs from the fruiting tree (its near foliage filling the frame, the special orange in the middle) to the harvester; the work's dolly through the clouds turns into a push toward the builder as the third card arrives; the reframes under the covers go into the halves and into the plan.

**Checked by `npm run framing`** (`scripts/framing-report.mjs`): every target at its key, on both stages; at every camera key of every figure scene, how much of the height and the width each figure plate covers, where its heads and hands land and how much of a text slot (`SLOT_AREAS`) it covers while words are up; along every move (48 samples, both stages), the nearest any figure comes to the camera (the near plane is 0.1; nearer than 0.35 is flagged) and whether its size on screen pops; and how many pixels each figure plate needs. The report goes to `test-results/framing/` (`-- --save before` and `-- --save after` for a phase's comparison). Figures stand at their manifest places there (their rest pose): the choreography (rising into view, walking in, sinking away) moves them from it.

## Scenes on the canvas

Only the scene on stage and its two neighbours are mounted on the WebGL canvas, and only the current scene and the next one are preloaded. Each scene's art fades with its presence (`src/components/stage/presence.ts`): where a covering transition hands one scene to the next, the swap is a step at the boundary, under full cover; at a plain boundary the incoming scene fades in over the outgoing one across 0.2 screen to each side. Backdrops (the sky) draw before the plates of every scene, so an arriving scene's sky fades in behind the leaving scene's plates, never over them: a figure that carries on across the boundary (the statue, the astronomer) never dims. Scenes without custom art (`SCENE_ART` in `scene-layers.tsx`) draw their manifest plates where the manifest places them; every scene has custom art now.

Every canvas frame first settles the values the scene arts derive from progress (`SettleDerivedValues` in `stage-canvas.tsx` runs Motion's pending `preRender` step), so the camera, which reads progress itself, and the plates, which read derived motion values, always show the same moment. Without it, 380 of 524 frames of a wheel scroll drew plates one frame behind the camera, and anything carried with the camera shook.

**Art receding behind text.** A plate can thin out of, or recede into the sky's haze inside, a soft rectangle of the stage (`clearing`, a `PlateClearing`; the plate shader's `clearInside`). `useTextHaze(beats, options)` builds one from the beats it should give way to: it follows whichever of them is most on stage, over the area of its slot (`SLOT_AREAS` in `text-haze.ts`, wide and stacked), for exactly as long as the words are up. In use:

| Scene | What recedes | Behind |
| --- | --- | --- |
| Hero | on a phone only: the onlookers | "What we do" and its paragraph |
| Work | the clouds thin out (`cloudClearing`, its own envelope over all three cards) | the card text |
| Pluck, share | the foliage (and on a phone the harvester's robe) | "We get you found.", "We split the harvest." |
| Prune (and the fall, as the words sink) | the urn, the young tree and its branches, behind both words at once (`union`); on a phone also the column and the gardener | "The Terms" docked and the fit text |
| Questions | the orchard rows' fruit | "Questions worth asking first." |
| Apply | on a phone only: the stargazer's cloud thins out | the form |
| Finale | the tree, the clouds, the water from the jug and the falling fruit (and on a phone the keepers) | the wordmark, subtitle and footer |

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
- Tone: the chrome, the hairlines and the text turn ink on milk while the plan's paper fills the frame in the paper unfold (0.3953 to 0.4084, until the second page is half way over) and over the top-down site with its milk page (0.4320 to 0.4792). Everywhere else they are white on sky.

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
- every transition has a valid range and peak (and a pass's `swapAt` inside its range), is sorted by start, starts on the stage (a ring's `origin`), and a transition that hands one scene to the next straddles their boundary and fully covers the screen at it; transitions on the stage never overlap;
- the camera starts at 0, its keys increase strictly, every scene has a key, fields of view stay between 10 and 90 degrees, and every `reframe` sits inside a full cover;
- hairline envelopes are in order, progress lines draw before they erase, and tones and anchors stay inside 0 to 1.

**The framing check** (`npm run framing`, see Camera, "Framing") is not part of `npm test`: it prints a report (`test-results/framing/report.md`) of every target of the framing table, every figure at every camera key on both stages, every move (near-plane clearance and pops) and the pixels each figure plate needs. The unit tests hold the parts it depends on: the world scale's heights (`npm run art:import -- --check`), the onlookers turning toward the statue as the hero's camera sees them, the statue whole on a phone, the astronomer leaving every phone frame.

**The scroll test** (`npm run test:story`, `e2e/story.spec.ts`) builds the site, serves it and walks the story in Chromium on a 1440 by 900 laptop screen and on a phone (Pixel 7), through the window's own scroll (the phone's bent scroll map included). Its expectations come from the script, so retuning never touches the test:

- at the start, the middle and the end of every scene: `data-scene` and `data-chapter`, the beats whose box is on stage against `visibleBeats(p)`, the ruler (its active chapter and every segment's fill) and the percent counter;
- in the middle of every scene, that the stage drew a painted picture (not an empty sky: the check that would have caught the blank stage) and a screenshot, `test-results/story/NN-scene.png` (`phone/` for the phone), plus the opening frame (`00-opening.png`), the end of the page (`15-end.png`) and the reduced-motion page;
- the way back: every point again in reverse, where every element the stage moves in the text layer (computed opacity, transform, blur and smoke mask, and how much of a typed line shows), the hairlines and the ruler must be exactly as on the way down;
- no console errors and no WebGL warnings on the way;
- the three fonts only, no layout shift while they load (cumulative shift under 0.02), and the calm reduced-motion page.

Last run: 6 tests passed in 2.7 minutes (desktop and phone).

## The living stage

The stage is one oil painting on canvas with a graphic layer over it (`DESIGN.md`, "The living, painted stage"). What moves, and on which clock:

**Idle life** (`life.ts`), on the stage's idle clock, so it runs only while a figure is drawn and in view, and stops offscreen, in a hidden tab and with reduced motion (the clock freezes and never jumps on resume; `?idle=off` holds it still on purpose, to compare frames of the scrubbed story):

| Motion | How much | How often |
| --- | --- | --- |
| Breathing: the chest and everything above it rise | 0.7% of the plate's height (`LIFE.breath.rise`) | about 0.2 Hz, a quicker breath in than out |
| The hem ripples across the robe | up to 0.45% of the plate's height, in gusts | 0.31 Hz |
| The head turns on the neck | up to 2 degrees | holds, then eases to a new angle every 3.4 to 6.2 s |
| The weight shifts: the whole figure about its feet | up to 0.3 degrees | every 5.2 to 8.8 s |

Each person has their own phase (`figurePhase`, from the plate and their place on it), so the onlookers never move in unison. The harvester, large in the frame, lives at 0.6 of that; the orchard keepers at 1.3 (and shift their weight with their loop: she leans into the pour, he into the cut). The marble statue keeps still.

**How a figure is bent.** The manifest's rig (rectangles for the chest, the hem, the head and a raised arm, and the feet; `docs/ART-PLATES.md`) becomes a soft weight texture (`rigWeightData`, 64 texels on its long side, `linear`); the figure plate is drawn as a mesh of cells about a 64th of its long side, and the vertex shader bends it: the arm turns on the shoulder, the head on the neck, the chest rises, the hem swings, and the whole figure turns about its feet, all in the plate's own space, so nothing slides off the art. A head or an arm on its own plate rides its body (the same bend, worked out on the CPU at the joint, `deformQ`), and things held in a hand on their own plates move with it, so held objects stay in hand. Several people on one plate each take their own phase and pivots (`rigVertexData`), fading to stillness where two people meet.

**Scrubbed acting** (`acting.ts`, ranges in `ACTING` in the script), a function of progress alone, so it plays backwards exactly; idle life runs on top:

| Who | What | When (screens) |
| --- | --- | --- |
| The onlookers | tip their heads up further toward the statue, as the orange brightens (up to 4.3 degrees) | over the hero, 0.00 to 1.59 |
| The harvester | turns his head from the descending fruit to the orange in his hand (7.4 degrees) | 8.99 to 9.34 |
| The builders (work, blueprint, site) | the forearm turns on the elbow with the mallet: a wind-up (5.7 degrees), a fast strike that stops hard (9.7 degrees past the painted pose), a recoil and the lift back; the body leans and the head nods a beat later (`mallet`, `malletActing`) | work 16.96 to 17.89, blueprint 17.95 to 19.13, site 21.62 to 22.81 (the two half a blow apart) |
| The architect | leans in (`architectLean`) and bows her head toward the plan (4.9 degrees) as it opens | 18.57 to 20.54 |
| The gardener | his body leans into each of the seven squeezes, a beat behind his arms, and back as they open; in the fall he leans back as he lifts the shears to the branch and bows his head after the fruit | 25.84 to 28.82; 29.80 to 30.73 |
| The astronomer | his raised arm comes up past the point (8.6 degrees) and settles, before the stars grow from his fingertip | 40.86 to 41.29 |

**The canvas and the halftone** (`paint.ts`, `materials.ts`). The canvas grain (one tile per 1.6 world units on a plate, 5.5 tiles per screen height on the sky) and the craquelure (one tile per 2.6 world units, about ten cells) are read in each plate's own UV space with mipmaps: they move and scale with the art, so they never crawl or shimmer while the camera moves. The halftone's dots are cells of 0.12 world units on a cloud, 0.03 on the water and 0.11 in the hero's ripple rings, in plate space at 45 degrees; where a cell would be smaller than about 3 screen pixels it gives way to the plain soft version (no moire). The ripple rings run on the same ripple clock as the glow's droplets (`RINGS`, eight fronts), so the lift still quickens them without a jump and scrolling up slows them again.

**Quality tiers** (`qualityTier` in `quality.ts`, one shared uniform): 2 everything; 1 (a low-memory device, or a pixel ratio that had to come below 1) without the canvas; 0 (still slow at the lowest pixel ratio) plain soft paint: no canvas, no rim or bounce, the halftone soft. The grade and idle life cost next to nothing and stay on. `?quality=low`, `medium` or `high` forces a tier (low also takes the lowest pixel ratio).

## Natural motion

Phase 25 rebuilt every movement on the stage so it moves the way bodies and things do: from rest to
rest, along arcs, with weight, held where it is held, falling as things fall. The list of what was
artificial, scene by scene, and what became of each, is `test-results/motion/issues.md`.

**The rules.**

- A scrubbed value is a function of progress alone (it plays backwards exactly) and its speed never
  jumps: every move starts and ends at rest, two moves meet at one speed, a contact (a mallet on a
  chisel, a jug's pour) is a hard but continuous stop. `motion-channels.test.ts` walks the whole
  script and fails on any jump in the speed of any driven value; the camera has its own check.
- The story curve (`EASE`) is for the words. It leaves rest at four and a half times its average
  speed, and Motion's solver for it is a staircase at fine scale, so stage bodies never move on it.
- Limbs reach with two-bone IK from their shoulders (the forearm plates bend at the wrist and curl
  their fingers in the shader); hands travel on arcs; things held stay at their holder's grip point
  (`platePoint`) and at the holder's depth, so the camera's moves never slide them out of the hand.
- Falls are flights: gravity and drag in closed form on story time (`PHYSICS`: a second per screen),
  spin taken up from rest, a landing or a strike that takes the speed without a jump. Shakes and
  rings are damped (`A e^(-kt) sin(wt)`, eased in so they start from rest).
- A frame swap stays only where a pose cannot be bent (the shears' open and closed frames, the
  graft's knots): inside the quick part of a move, in a short cross-fade, one frame replacing the
  other. Faces turning are foreshortening, panels opening are hinges (`turnY`), never a stretch.
- Time-driven motion (idle life, the finale's loop) only adds movement that settles; it is faded in
  and out by progress.

**The kit** (`src/components/stage/motion-kit.ts`, pure, unit tested):

| Part | What |
| --- | --- |
| `glide`, `smoother`, `span` | a move over a range, from rest to rest (the quintic smoothstep) |
| `track`, `beat`, `strike`, `blows` | one C1 curve through keys (the camera's monotone rule, `src/lib/monotone.ts`); a move with anticipation and overshoot as keys of their own; a strike that speeds up to its contact and stops hard, recoils and settles; a run of tool blows (wind-up 42%, swing 20%, recoil 16%, lift back) |
| `arcPoint`, `moves` | a point along gentle arcs, one move after another, each from rest to rest |
| `solveArm`, `forearmRig`, `reachWith` | two-bone IK with a soft reach limit; a forearm plate's elbow, wrist and grip from its rig, and the pose that puts the grip on a target |
| `fromAnchor`, `placeOn`, `poseThrough`, `holdAt`, `offsetsFrom` | grips and attachment: where a plate's point is, a thing held at a hand's grip by its own grip |
| `ballistic`, `dragAxis` (`src/lib/flight.ts`) | a flight with drag, spin and bounces as damped half-periods ending in a critically damped settle, all closed form in time |
| `dampedRelease`, `dampedKick` | a spring let go from a bend; a kick that rings out, eased in from rest |
| `springStep` | the optional live lag: an exact critically damped step on idle time that always settles to nothing |
| `storyTime`, `perSecond` | story seconds from progress, and speeds per second |
| `velocityJumps` | where a value's speed jumps (it zooms in on each suspect, so a quick but smooth change passes) |

**Where it is used.** The graft's hands (IK, arcs, a grasp before each pull, the stem springing
back), the pluck (the reach, the grasp drawn again in front of the fruit, the snap and the branch's
damped shake, the fruit at the hand's grip, the handoff to the harvester's palm), the share (the
knife's arc and its pressure through the rind, the halves hinging about their cut edges, the second
hand), the builders' mallets, the architect's plan (an accordion on hinges in her hands, shaded by
its turn, its paper back), the gardener's squeezes and the tree's shake, the cut branch and the
orange falling (`FALL_FLIGHT`, the camera following the same flight, `fallingOrangeAt`), the
ascent's rise slowing to rest (`ascentRiseShare`, shared with the camera keys), and the finale: the
walk-ins (a step's rise in time with the ground covered), the man's squeeze and the falling fruit,
and the water (`WaterStream`: a parabola from the spout that follows the jug's tilt, as much water as
the tilt lets out, breaking into drops).

**The scroll that reaches it.** Motion that is smooth in progress is smooth on screen only if
progress is smooth in time:

- Wheel: Lenis, `WHEEL_LERP` 0.085 per 60th of a second (frame-rate independent). At 0.1 a notch
  reached the stage in about 0.16 s; 0.085 gives about a fifth of a second, which rounds off the
  steps of a notched wheel without the page trailing the hand. Lower felt late on a trackpad.
- Touch: native momentum (`syncTouch` off). The phone's own inertia is already smooth; smoothing it
  again would only add lag.
- Desktop maps scroll to progress in a straight line. The phone's map bends at every scene boundary
  (each scene keeps `MOBILE.weights` of its length): it was a polyline, so a steady thumb changed the
  story's speed at each boundary; it is now a monotone cubic through the same boundaries
  (`mobile.ts`), so scenes still start and end at the same moments and the speed changes smoothly
  (unit tested with `velocityJumps`).

**Seeing it.** On `/design`, the motion lab films any scene on the real stage: pick it, scrub it,
show the bones, pivots, grips and arcs, and read every driven value plotted with its speed (a jump
shows as a white dot). `?motion=<scene>&at=<0..1>` opens it on a moment. `npm run motion:capture`
scrubs every scene in 60 steps in the production build and saves the frames, a contact sheet and an
animated preview per scene (`--reverse` also scrubs each back up and compares the stage pixel for
pixel; `--range a:b:name` films any stretch, for the transitions' own work).

## Helpers

From `src/scroll/helpers.ts`, pure and safe on the server, in tests and inside scroll callbacks:

- `sceneProgress(id, p)`: how far through a scene p is, 0 to 1, clamped. Art inside a scene choreographs on this.
- `currentScene(p)` and `currentChapter(p)`: the scene and the ruler chapter at p.
- `beatVisible(id, p)`: whether a beat is on stage at p (arriving, holding or leaving).
- Also `sceneAt(id, t)` (the inverse of `sceneProgress`), `visibleBeats(p)`, `beatEnterAmount` and `beatLeaveAmount`, `beatLineRanges` (the per-line stagger), `transitionProgress(id, p)`, `activeTransitions(p)`, `smokeRange(beat)` (where a beat dissolves as smoke) and `toneAt(p)`.
- For transitions, `src/components/stage/transitions/choreography.ts` adds `transitionPhase(def, p)` (how far through its covering ramp, peak and clearing ramp p is), `stageTransitionAt(p, defs)`, `revealCircle(def, p, width, height)` and `veilAmount(def, p)`; each transition's own motion is in its plan (`sand-plan.ts`, `cloud-plan.ts`, ...), and `storyBoundaries()` (`src/scroll/boundaries.ts`) lists every place the picture changes.

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

The living stage (phase 23: the painted canvas, the figures' life, the halftone layer), measured the same way, before and after, on the same machine, with the paintings then in the manifest:

| Run | Before: p50 / p95 / p99, over 20 ms | After: p50 / p95 / p99, over 20 ms | Pixel ratio |
| --- | --- | --- | --- |
| Reading pace (about 108 s) | 16.7 / 16.7 / 16.8 ms, 0.06% | 16.7 / 16.7 / 16.8 ms, 0.15% | 1.5 |
| Fast (about 46 s) | 16.7 / 16.8 / 16.8 ms, 0.18% | 16.7 / 16.8 / 16.8 ms, 0.39% | 1.5 |
| Reading pace, CPU throttled 4 times | 16.7 / 16.8 / 16.8 ms, 0.31% | 16.7 / 16.7 / 16.8 ms, 0.33% | 1.5 |
| Phone (Pixel 7, scripted scroll, 46 s) | 16.7 / 16.7 / 16.8 ms, 0.14% | 16.7 / 16.7 / 16.8 ms, 0.46% | 1.25 |
| Lowest tier (`?quality=low`), fast | | 16.7 / 16.8 / 16.8 ms, 0.42% | 0.75 |
| Lowest tier, phone | | 16.7 / 16.7 / 16.8 ms, 0.42% | 0.75 |

The p99 holds at 16.8 ms. The share of frames over 20 ms is up (about a dozen more frames in a fast run): they fall where a scene mounts and its figures' rig meshes and the new shaders are first built (the slowest single frame on the GPU went from 183 to 217 ms). The slowest single frames come when a scene mounts.

The framing (phase 24: figures at one world scale, the camera close on them, the glow and the constellation laid out for the nearer frames), measured the same way on the same machine (the textures are the same images: no painting grew yet):

| Run | p50 / p95 / p99 | Frames over 20 ms | Slowest frame | Pixel ratio |
| --- | --- | --- | --- | --- |
| Reading pace (about 110 s) | 16.7 / 16.8 / 16.8 ms | 0.15% | 217 ms | 1.5 |
| Fast (about 48 s) | 16.7 / 16.8 / 16.8 ms | 0.32% | 233 ms | 1.5 |
| Reading pace, CPU throttled 4 times | 16.7 / 16.8 / 16.8 ms | 0.36% | 667 ms | 1.5 |
| Phone (Pixel 7, scripted scroll, 48 s) | 16.7 / 16.7 / 16.8 ms | 0.39% | 50 ms | 1.25 |
| Lowest tier (`?quality=low`), fast | 16.7 / 16.8 / 16.8 ms | 0.35% | 233 ms | 0.75 |

Natural motion (phase 25: the motion kit, the hands and figures on IK with their fingers bent in the shader, the hand drawn a second time in front of the fruit, the plan's panels turning in perspective, the falls as flights, the finale's water drawn as a stream and its drops), measured the same way on the same machine:

| Run | p50 / p95 / p99 | Frames over 20 ms | Slowest frame | Pixel ratio |
| --- | --- | --- | --- | --- |
| Reading pace (about 110 s) | 16.7 / 16.7 / 16.8 ms | 0.12% | 217 ms | 1.5 |
| Fast (about 48 s) | 16.7 / 16.8 / 16.8 ms | 0.35% | 233 ms | 1.5 |
| Reading pace, CPU throttled 4 times | 16.7 / 16.8 / 16.8 ms | 0.30% | 600 ms | 1.5 |
| Phone (Pixel 7, scripted scroll, 48 s) | 16.7 / 16.7 / 16.8 ms | 0.42% | 50 ms | 1.25 |

At or under phase 21's 16.7 / 16.8 / 16.8 ms. The motion kit's work per frame is a few dozen closed-form numbers (no stepping: a value at any progress is computed directly, so scrubbing far costs the same as scrubbing near); the water is one dynamic strip of 58 vertices and one instanced draw of at most 28 drops, and only while the loop shows.

The transitions (phase 26: the media drawn on the stage itself, in depth), measured the same way on the same machine, against the phase 25 build (the commit before, built and served beside it), and the frames inside the transitions (from each canvas transition's start to its end, the new ranges for both builds) counted apart from the rest. The laptop was running on a low battery, where Chromium's battery saver paces every page at 30 frames a second (a blank page too); the harness turns it off in a fresh profile, so both builds were measured at 60. The scroll reached the end of the story in every run.

| Run | Whole story, before → after (p50 / p95 / p99, over 20 ms) | In the transitions, before → after (p50 / p95 / p99, over 20 ms, slowest) |
| --- | --- | --- |
| Reading pace (the whole story in about 108 s) | 16.7 / 16.8 / 16.8, 0.20% → 16.7 / 16.7 / 16.8, 0.18% | 16.7 / 16.8 / 33.3, 1.09%, 233 ms → 16.7 / 16.8 / 16.8, 0.93%, 233 ms |
| Fast (wheel input for 46 s) | 16.7 / 16.8 / 16.8, 0.42% → 16.7 / 16.7 / 16.8, 0.39% | 16.7 / 16.8 / 33.4, 2.93%, 67 ms → 16.7 / 16.8 / 33.4, 2.24%, 217 ms |
| Phone (Pixel 7, scripted scroll, 46 s) | 16.7 / 16.8 / 16.8, 0.39% → 16.7 / 16.8 / 16.8, 0.39% | 16.7 / 16.8 / 33.3, 1.92%, 33 ms → 16.7 / 16.8 / 33.3, 1.61%, 50 ms |
| Lowest tier (`?quality=low`), fast | 16.7 / 16.8 / 16.8, 0.42% → 16.7 / 16.8 / 16.8, 0.46% | 16.7 / 16.8 / 33.4, 2.29%, 67 ms → 16.7 / 16.8 / 33.4, 2.91%, 233 ms |

The whole story holds phase 21's 16.7 / 16.8 / 16.8 ms. Inside the transitions the median and the 95th percentile are 16.7 and 16.8 in every run; the slow frames there are the scene changes, where the next scene mounts (its textures go up to the GPU, its rigs are built), at the same moments in both builds (the 217 to 233 ms frame is the pluck mounting as the graft becomes the scene, at the end of the leaves: in the phase 25 build it falls a hair after the same range). In a short range they weigh more: at reading pace the transitions' own 99th percentile is 16.8. What the media cost: instanced particles in one draw each (13,340 sand grains at most, a light 40% on phones and the lowest tier), sheets that read one baked noise texture instead of hashing octaves per pixel, a cloth read back from frames simulated in idle moments, shaders compiled in parallel as a medium mounts (three screens ahead), and nothing drawn by a medium outside its range.

The percentiles are phase 21's; the share of frames over 20 ms is phase 23's (where a scene mounts), within a few frames of phase 21's. A figure drawn larger costs no more to draw: the plates are the same images, the same meshes and the same shaders. When the larger paintings of "Regenerate at higher resolution" (`docs/ART-BRIEFS.md`) land, the texture cap (2560 on the long side, `TEXTURE_CAP`) bounds what they cost on the GPU. What keeps it smooth:

- **Textures:** WebP with alpha (98 plates, 3.1 MB in all), capped at 2560 px on the longest side (1024 on low-memory and small touch devices; no plate is over 2048 yet), uploaded with premultiplied alpha and mipmaps. Only the current and the next scene are preloaded; a texture nobody holds leaves the GPU 4 s later.
- **Drawing on demand:** the stage canvas draws once per progress change, plus every frame only while an idle effect is in view; both canvases stop in a hidden tab.
- **Instancing:** the glow's droplets and every star or sparkle field are one instanced draw each, animated in the vertex shader.
- **The living stage in the shaders:** one plate program for every plate (the canvas, the grade, the rim and the life are uniforms, not variants, so nothing compiles mid-story) and one halftone program (clouds, water and rings), both first compiled in the hero. The figures' life is computed once per figure per frame on the CPU (a few dozen numbers) and bends the mesh in the vertex shader; the rig meshes and weight textures are built once per plate and shared by reference count. The canvas is two shared textures every plate reads, loaded once.
- **No allocations per frame** in the canvas frame loops: plates reuse scratch vectors, pairs and quaternions; the idle clock walks the scene graph without callbacks; the finale's loop writes into reused frame objects. Motion's derived values do allocate small objects (that is how Motion works).
- **Pixel ratio:** 1 to 1.5 on the stage (1.25 on a phone), half the glow droplets on a phone. The transitions draw on the stage at its pixel ratio (there is no second canvas): instanced particles (a light share on a phone and the lowest tier), sheets that read one baked noise texture instead of hashing octaves, a cloth read back from stored frames.
- **Adaptive quality** (`AdaptiveQuality` in `stage-canvas.tsx`, `adaptDpr` in `quality.ts`): after 1.2 s of frames slower than 45 fps the stage drops its pixel ratio by a fifth (down to 0.75), and after 4 s of frames quicker than 57 fps it raises it again, never back to a ratio that proved too slow. Only draws in consecutive animation frames count, so an on-demand canvas that simply had nothing to draw is never mistaken for a slow one. The adapted ratio goes through the canvas's own `dpr` prop (React Three Fiber re-applies that prop whenever the canvas re-renders).

## Storyboard check

Scene by scene against `docs/STORYBOARD.md`. Everything the storyboard asks for is on the stage; where it differs on purpose, or still waits on something outside the code, it says so here.

| Scene | Status |
| --- | --- |
| 1 Hero | Matched: sky, statue raising the orange on the minaret (large, on the right third), the glow ripple before any scroll, the crowd looking up (heads and shoulders along the bottom, in front of the minaret), the hero copy and button, "What we do", the chrome. |
| 2 Ascent | Matched: the glow brightens and quickens, the copy drifts left title first, the push-in, the rising minaret turning to bark, branches and leaves, settling on one branch (the camera rises to it through the leaves, which hide the change of scene). |
| 3 Graft | Matched: two sleeved hands fit the cutting, wrap and knot it, then the camera pulls out to the swaying tree full of oranges (it fills in clump by clump around the graft while loosened leaves drift down past the lens). |
| 4 Pluck | Matched: the rising hand, "We get you found." with its progress line as the hand closes, the dolly down, the harvester, "We split the harvest." with the tag and the typed line. |
| 5 Share | Matched: knife, halves, the second hand, both holding, the viewfinder, the push into the halves, the sand (blue grains pouring from the halves and blowing across until they cover the frame, then thinning onto The Work's sky), the ruler switching to The Work. |
| 6 Work | Matched: clouds drifting right and the dolly up, three cards in turn (the clouds part around them), the giant orange and builder with card 3, the ruler, the percent counter. |
| 7 Blueprint | Matched, with one simplification: the packet is in the architect's hands, but it is brought forward and opens by itself in front of the scaffold (his arms do not move: TODO with final art, arm frames for him). The camera reaches the scaffold through a cloud bank, and the plan fills the frame as paper; the next scene opens out of it as the paper opens on its creases (the drawings stay on the paper rather than the frame turning plain milk white first). |
| 8 Site | Matched: the seaside site, the rise to straight above with no sky, the shrink into the left half with the field of tiles, the milk page with drifting leaf shadows (a sheet on the stage now, which the dust's wind lifts away), the terms text. |
| 9 Prune | Matched, with one deliberate change: the gardener stands right of center, waist up beside his tree (the storyboard says center), so the words on the left sit on the tree receding into the sky's haze rather than on him. The column is below the frame. The dust (blue, with white specks, lifting from the site and off the top of the frame), the docking title and the fit text are as described. |
| 10 Fall | Matched: the cut branch, the push toward his face and his drift out, the falling orange followed to the center, the text sinking, the rainbow ring (a ripple of halftone dots from the orange's strike, its leading crest a soft spectral band, the orchard shown inside it), the orchard, the dolly up, Questions on the ruler and the section title. |
| 11 Questions | Matched: five glass cards, one connector fixed on an orange and locked to a different corner each time, zoom then arc, sparkles, exact reversal (checked in the browser), the smoke. |
| 12 Stargazer | Matched, with one deliberate change: the push into the blue, the fabric sky (the sky comes loose as a blue cloth that falls across the lens, billowing), the astronomer pointing from his platform, the growing constellation, the clear bottom right. The storyboard's cloud billowing over to fill the screen is the cloth's own billow: no second cloud is pasted in. |
| 13 Apply | Matched: tag, title and subtitle top left; the form on the right with two short glass fields, the larger one, icons on the labels and the 3D stack on hover or focus (checked in the browser). |
| 14 Finale | Matched: the sink, the clouds (blowing in from the left as they form), the form leaving, the stars drifting away, the tree, the woman watering and the man trimming, the loop on idle time, the closing frame with the wordmark, subtitle, copyright and email, the end of the page. |

TODO, outside the code:

- **Art.** A plate marked `painted: true` in `public/art/manifest.json` is a finished painting brought in with `npm run art:import`; the rest are stand-ins (the characters as procedurally painted oil studies), briefed in `docs/ART-BRIEFS.md` (see `docs/ART-PLATES.md`). The places the scenes tie to the figures (the orange in a hand, the fingertip the stars grow from, the blade tip, the spout, the shears) are named points on the plates, so a painting moves them with its sidecar; a painted figure's rig is a first guess from its cut-out until its sidecar brings a measured one.
- **The contact email** "hello@orange.io" is marked "TODO: confirm the real address" in the storyboard; it lives in `src/content/copy.ts`.
- **The application endpoint.** The form posts to `NEXT_PUBLIC_APPLY_ENDPOINT`; without it the form shows its success message but sends nothing (see the README).
- **The architect's arms** (scene 7): with final art, arm frames for her unfolding the drawing.

## Reduced motion

Visitors who prefer reduced motion get no pinned stage, no smooth scrolling and no canvas. CSS (`motion-reduce:`) shows them a normal stacked page instead, before any script runs: the four chapters and the finale in order, one still per scene (the placeholder plate as an image), and all the copy in reading order, with the five questions as a plain FAQ list. The "Apply" link jumps to the application on that page.

## Phones, restoration and accessibility

**One script, a shorter stage.** Under `MOBILE.stackedMaxWidth` (767px, the same width as Tailwind's `max-md` and the `@media` blocks in `globals.css`; `stacked-css.test.ts` keeps them in step) the page is laid out stacked. The stage is `MOBILE.stageScale` (0.7) as tall (3780vh, about 36.8 screens), and `MOBILE.weights` give each scene a multiplier on its share of the scroll before the result is scaled to fit (`src/scroll/mobile.ts`): the text-heavy scenes keep their reading time, the long camera moves tighten. Every progress value in `script.ts` is the same everywhere; only the scroll distance between them changes, and `stage-scroll.ts` is the one place that maps scroll to progress (`mobile.test.ts` checks that every beat keeps enough scrolling to read). The stage height itself is CSS (`--stage-vh`, `--stage-vh-stacked`, written from the script).

**Layout.** Slots stack (`slots.ts`, `max-md:` classes): titles and the hero hang from the top; paragraphs, cards and the form sit at the bottom; the question cards and the finale keep the middle. The hairline grid mirrors on the right and the top line drops to 56px (`stackedGrid`), so the mark, the menu button and Apply sit in a row above it and no star lands on the pill. The form is one column. The site scene shrinks into the upper half with the milk page below. Fewer particles (half the glow droplets) and a lower pixel ratio (`quality.ts`).

**Camera on tall screens.** Below an aspect of 1.3 the field of view widens so the picture keeps the width it has at 1.3 (`fitFov`, `camera-fit.ts`), and keys can carry a `pan` of x, y and z: the framing table gives every framed key one (`phonePan`), so on a phone the camera also comes nearer and the subject keeps a phone-sized share of the taller picture, placed below or beside the text (the statue right of the button, the harvester with his orange above the words, the builder above the card). The stage reports its shape with `setStageAspect`, so the rig, the connector lines and the falling orange all use the same fitted camera. Wide screens are untouched. The taller picture this shows is accounted for: the astronomer sinks right out of a phone's frame in the application (`SINK_DEPTH_STACKED`, checked against projected phone frames), and the orchard rows fade out at their foot instead of ending in a cut edge.

**Touch.** Native momentum: Lenis smooths wheel input only, and nothing sets `touch-action`.

**Restoration and deep links** (`navigation.ts`, `story-location.ts`). A script in the document head turns off the browser's own scroll restoration and, when a place is to be restored (a reload or back/forward with saved progress, or a hash naming a chapter), marks `<html data-restore>`, which covers the stage until the engine has jumped there (instantly, through Lenis) so the hero never flashes. Progress is saved to session storage once scrolling settles and when the tab hides. `#model`, `#work`, `#terms`, `#questions` and `#apply` scroll to their place (and `#apply` focuses the form's first field, on load as on a later hash change); the hash follows the chapter with `replaceState` once scrolling settles, and a hash change scrolls there.

**Keyboard.** Space, Page Up and Down, Home, End and the arrows are the browser's. J and K jump to the next and previous text beat (`BEAT_STOPS`, where the beat's last line has arrived); they are ignored while typing or in a dialog. A skip link (the first tab stop) goes to the form and focuses its first field; so do Apply and Start a partnership, on the stage and on the reduced-motion page.

**Screen readers** (`story-outline.tsx`). The stage is decorative: its beats are `aria-hidden` (their buttons and links are out of the tab order), as are the art and canvases. A visually hidden outline is always on the page: the four chapters as landmarks with headings, every beat in script order, the questions as one list, and a link to the form.

**Hidden tabs.** The canvas sets its frame loop to `never` (`PauseWhenHidden`), the idle clock (and with it the figures' breathing and shifts, the ripple, the clouds' drift, the leaf shadows on the site's page) stops, and `html[data-tab-hidden]` pauses the CSS idle effects. The transitions themselves are functions of progress: nothing of theirs runs on time but the smear, which settles.
