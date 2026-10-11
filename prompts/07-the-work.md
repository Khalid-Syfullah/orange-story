# Phase 7 of 16: Chapter 2, The Work

You are building orange.io. The Split (phase 6) has left the plate's sky on screen. This phase scrolls down through the tall scaffold painting, prints it in as halftone, and lands the three Work cards.

## Rules

- **Source of truth:** `docs/STORY.md` (row 2 · The Work), `docs/MOTION-RULES.md`, `docs/COPY.md` (Chapter 2), `docs/TRANSITIONS.md` (row Model → Work for the arrival values), `src/stage/` (extend; reuse the shared cloud function from phase 6).
- **One stage, one canvas:** raw WebGL 1; everything a function of smoothed `p`; reversible.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`plate`).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Work pass** for the `work` segment: the `plate` (9:16) fitted to the frame's width and scrolled through its own height, y offset a function of local progress from the top (sky) to the bottom (the blueprint), horizontal pan from pointer parallax only.
2. **Arrival:** the pass starts where the split left off: scale 1.18 about the seam point easing to the plain width-fit over the first 8% of local progress with `t·(0.45 + 0.55·t²)` inverted (fast at first, settling), then a creep-in through the pan of 0.6% per 10% of local progress that never stops, so a held scroll still breathes.
3. **Print-in:** below the sky the painting prints itself in. A halftone screen (cell 14px × dpr) whose dots carry the painting's own tone grows with the scroll until the dots merge into paint; the front rises up the plate as it scrolls, bitten by fbm so the stem and leaves arrive in patches; the fully printed region below it is the plain painting; nothing above the front exists yet. Coverage follows `docs/TRANSITIONS.md`'s soak-in formula with the front position driven by local progress.
4. **Clouds:** the shared halftone cloud function drawn in plate coordinates in the sky band, so they scroll with the painting; one larger cloud enters from the plate's right edge over the chapter and never fully clears it.
5. **Scrim:** multiply the plate by `2 · (0.35, 0.33, 0.32)` faded by a scrim uniform that rises with smoothstep over the first 20% of the chapter, inside the shader (no DOM layer), so copy stays readable over the painting.
6. **Cards:** the three Work cards (tag, title, body from `copy.ts`) as DOM panels in column B, each pinned to a plate y position so it arrives with the part of the painting it sits beside: card 1 in the sky, card 2 beside the orange's shoulder, card 3 beside the blueprint. Each ramps in over 60 scroll units, title 12 units ahead of the body, and parallaxes at 0.6× against the plate's 1.0×.
7. **Rail:** The Work from the start of `split`.
8. Verify lint, typecheck and build; screenshot three points of the chapter at 1440×900 and 390×844 into `docs/screenshots/work-*.png`.
