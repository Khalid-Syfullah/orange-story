# Phase 11 of 16: The match cut and Chapter 4, Questions

You are building orange.io. The coda (phase 10) ends on one orange hanging in blue with a halo. This phase match-cuts that orange into the canopy and builds the Questions chapter: the handwritten title, the five cards and the constellation that joins them.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (row Halo → canopy), `docs/STORY.md` (rows 3 → 4 and 4 · Questions), `docs/MOTION-RULES.md`, `docs/COPY.md` (Chapter 4 title and questions), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1 for the picture; the cards, title and constellation are DOM and SVG driven by `p` through the stage's subscribe API (no React state per frame).
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`canopy` loop and its nearest-orange anchor).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Match cut** (`matchcut` segment): the picked orange's screen position and scale are driven from the `share-orange` anchor to the `canopy` nearest-orange anchor (`uncover()` on the canopy's first frame), while the halo opens outward as a ring front (band `exp(−x²/0.0011)`, chroma split, dithered crest) and the canopy loop is inside the ring. Ahead of the ring the blue coda frame; behind it the canopy. The copy fades out underneath.
2. **Canopy** (`questions` segment): the `canopy` loop through `cover()`; one halftone cloud (shared function, cell 6.5px) drifting across the sky gap at 0.008 widths per second, its fbm edge advancing at 0.03/s; the canopy parallaxes at 1.0× and the DOM at 0.6×.
3. **Title:** "Questions worth asking first." with "first" in italic Newsreader, handwritten in stroke by stroke as the reader arrives: an SVG path traced from the italic glyph outlines (generate the path once with a script into `src/content/handwriting.ts`), `stroke-dashoffset` driven by local progress with pen-speed easing (fast in the middle of each stroke, slow at the turns), never linear.
4. **Cards:** the five questions as DOM panels (1px hairline at 55% milk, no fill, question in `title`, answer in `body`), laid out on a loose grid that follows the sky gap (two columns on desktop, one on phones), each ramping in over 60 scroll units with a 10px rise, headline 12 units ahead of the body, never all at once.
5. **Constellation:** SVG hairlines (1px, 55% milk) joining card corners with four-point stars at the joints. Line length `base · (0.55 + 0.75 · (0.5 + 0.5 · sin(p·0.011 + i·1.7)) + 0.9 · exp(−|p − y_i| / 190))` where `y_i` is the line's own scroll position, so lines lengthen as the reader arrives at them and ease away after; star opacity shares the term.
6. **Rail:** Questions from the start of `matchcut`.
7. Verify lint, typecheck and build; scrub the match cut forward and back; screenshots into `docs/screenshots/questions-*.png`.
