# Phase 4 of 16: The hero

You are building orange.io. The engine (phase 2) and the assets (phase 3) exist. This phase draws the first thing a visitor sees: the hero painting with its canvas-made clouds, glint and pour, and the hero copy.

## Rules

- **Source of truth:** `docs/STORY.md` (Hero row), `docs/MOTION-RULES.md` (all of it; the rest-state section applies here), `docs/COPY.md` (Hero and Chapter 1), `src/stage/` from phase 2 (use its script, pass manager, GLSL library and texture manager; extend, never duplicate).
- **One stage, one canvas:** raw WebGL 1 only. Scroll-driven state is a function of smoothed `p`; only breath runs on time.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Hero pass** for the `hero` segment: the `hero` loop through `cover()` with the hero's pan; `uncover()` pins the glint anchor and the can spout from `art.ts` to the screen at any viewport.
2. **Halftone clouds** (cells 6.5px × dpr, dot radius `sqrt(coverage) * 0.64`, three instances built from smooth-min circles bitten by fbm, flat underside, different sizes, seeds and sway with the larger slower): drawn in painting coordinates so they stay glued to the sky through parallax; the third instance sits lower and is hidden on tall phones.
3. **Rainbow glint** on the peel at the glint anchor: anisotropic gaussian, spectrum `cos(2π(x·5 + 0.08·time + (0, 0.33, 0.67)))`, screen-blended with a warm halo; a 5.3 s cycle whose pulse is `smoothstep(0, 0.2) · (1 − smoothstep(0.6, 1))`; horizontal slips hashed per band and per 0.45 s (rule 10).
4. **Halftone pour** from the spout anchor to the step below it: cells 4.6px × dpr, rows advancing 13 cells per second, hash-thinned, denser on the centre line, dying over the last 20% of its length.
5. **Rest state:** pointer parallax and ambient drift exactly as in `docs/MOTION-RULES.md`; film grain at ±1.5%; a soft radial vignette.
6. **Ring:** a signal ring that leaves from the glint and opens outward (band `exp(−x²/0.0011)`, chroma split of ±1.5% along its radius, a dithered crest) fired once when the hero finishes printing in and again on a click on the canvas or the hero button; it decays within 1.7 s and never loops.
7. **Print-in on load:** the painting prints itself in from the orange over 2.2 s (halftone dots growing from nothing until they merge, front led by fbm), unless scroll restoration lands past the hero or motion is reduced, in which case the frame is complete at once.
8. **Copy layer:** hero title, subtitle, button (scrolls to the application segment), bottom-left tag and paragraph, positioned by the layout tokens in the open sky and the lower left, fading out over the first third of the `bridge` segment with the paragraph leading the title by 12 scroll units. The button and the canvas click both fire the ring.
9. Verify lint, typecheck, build; in the HUD confirm the hero pass costs under 4 ms at rest on the dev machine; screenshot `/` at 1440×900 and 390×844 into `docs/screenshots/hero-*.png`.
