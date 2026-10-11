# Phase 10 of 16: The close and the coda

You are building orange.io. The terms sit on the sheet (phase 9). This phase burns the sheet into flat blue, scrubs the coda in which the orange is picked, and leaves the orange hanging with a halo.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (row Sheet → blue), `docs/STORY.md` (row 3 · The Terms, second half), `docs/MOTION-RULES.md` (rules 1, 2, 5, 8 and 9), `docs/COPY.md` (Chapter 3: large chapter title, fit text, fit tag, fit side text), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1; everything a function of smoothed `p`; reversible.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`coda` sequence, `share-orange` still, its orange centre as an anchor).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **The close** (`close` segment): the sheet burns from the bottom left into the coda's first frame. Two decorrelated fbm fields bend the front; ordered dither and hash stipple print its boundary; the side about to go carbonises in a band that travels with the front (scorch multiplied into the sheet so the paper keeps reading through the char, saturating a little way back and releasing further back, rule 8); an ember glow sits on the cut; the blue arrives offset in the direction of travel with `lag = exp(−distBehindCut/0.12)` and settles. The stipple is gated on coverage so nothing speckles ahead of the front. Fast paths on both sides. The panel, the terms copy and the margin orange are under the burn and go with the paper.
2. **The coda** (`coda` segment): the `coda` sequence (89 frames) scrubbed by local progress on flat `--sky`, cover-fitted; the large chapter title "The Terms" in `display-xl` in column A over the first half, then the fit text, tag and side text in column B over the second half, milk on sky, ramping with the rules' 60-unit ramps.
3. **The halo:** once the orange hangs alone (the last 20% of the coda), a soft halo grows round it at the `share-orange` anchor: an annulus of width 0.012 with 0.004 softness, a faint chroma split on its outer edge, breathing by rule 9 (radii 0.6% from sines at 5.3 s, 7.9 s and 11.4 s; a scroll stop adds a 1.5% exp-decay kick dying in 1.2 s). The copy behind it is DOM blurred with `backdrop-filter`, fading out as the halo grows.
4. **Rail:** The Terms throughout.
5. Verify lint, typecheck and build; still-frame test on the close at t = 0.2, 0.5, 0.8; screenshots into `docs/screenshots/close-*.png` and `coda-*.png`.
