# Phase 13 of 16: The finale

You are building orange.io. The rise (phase 12) ends on the sapling and an empty sky. This phase lands the finale loop, the pour, the wordmark and the footer, and finishes the chapter menu.

## Rules

- **Source of truth:** `docs/STORY.md` (Finale row and Chrome), `docs/TRANSITIONS.md` (row Application → finale), `docs/MOTION-RULES.md`, `docs/COPY.md` (Finale and Chrome), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1; everything a function of smoothed `p`; only the loop and small idle effects run on time.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`finale` loop with its spout anchor).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Finale pass** (`finale` segment): the `finale` loop through `cover()`, taking the frame on a colour already on screen (the sky of the rise), so the cut is a colour continuing rather than a picture appearing. The halftone pour from the hero code runs from the can's spout anchor to the roots, so the page ends on the gesture it opened with.
2. **Wordmark:** "Orange" in `display-xxl` Newsreader 600, centred in the sky above the tree; render it to an offscreen canvas and use it as a texture so it prints in letter by letter through the halftone print-in on the glyph alpha (dots growing until they merge), not a CSS fade. The subtitle under it in `lead`, milk on sky, ramping in after the last letter.
3. **Footer line:** "© {year} Orange" and the contact email along the mid rule in `meta`, the email as selectable text with a copy button (clipboard write inside the click handler, falling back to selecting the text).
4. **Chapter menu:** the grid button opens a full-screen menu (DOM, `--press` at 92%) listing Ch. 1 to Ch. 4 with their titles and the Apply entry; choosing one sets the scroll target to that segment's start with the engine's smoothing; Escape and the button close it; focus is trapped while open.
5. **End of scroll:** the stage holds the finale at `p = 1` with its loop running; the percentage reads 100%; no content below the stage.
6. Verify lint, typecheck and build; screenshots into `docs/screenshots/finale-*.png`.
