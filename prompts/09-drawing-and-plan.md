# Phase 9 of 16: The drawing, the plan window and the terms

You are building orange.io. The sheet (phase 8) is on screen. This phase soaks the construction drawing into it, orbits it to a top-down plan, draws the window back to a panel beside the terms copy, and hangs a small turning orange in the margin.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (rows Sheet → drawing and Drawing → panel), `docs/STORY.md` (row 3 · The Terms), `docs/MOTION-RULES.md`, `docs/COPY.md` (Chapter 3: terms block, tag, side text), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1; everything a function of smoothed `p`; reversible.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`drawing` sequence, `plan` still).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Soak-in** (`drawing` segment start): the drawing arrives holding the whole frame, soaking in from the middle as a smudge that resolves into line: `coverage = clamp(t·4.2 − dist·1.9 + (fbm(uv·3) − 0.5)·0.7, 0, 1)` from the drawing's centre, patches spreading and joining, never a compass circle; the drawing is multiplied into the sheet (ink on paper), not composited over it.
2. **Orbit:** the `drawing` sequence (121 frames) scrubbed by local progress inside the window; the last frame is `plan`. On scroll reversal it plays back at the same cadence; never snap to frame 0.
3. **The window** (`panel` segment): one rect interpolated from the full frame to a square panel in the left margin that the copy leaves (column A, about 36% of the width on desktop), the sampling following it so there is never a second copy of the drawing. Size eases with `t·(0.6 + 0.4·t²)`; the centre follows the size with a 220 ms lag so the panel settles after it shrinks. The edge is brushed, not cut: eaten by two scales of fbm (a broad tear and a finer fray) across a wide band, advancing at 0.02/s so a held frame still breathes at the fray. The picture zooms inside the cutout, not with it.
4. **The margin orange:** a small raymarched gilded orange (sphere with dimple noise on the normal, warm key light matching the sheet's raking light, soft contact shadow on the paper) hangs in the empty right margin, turning at 0.11 rad/s plus a 0.03 rad wobble from two sines. March only for fragments inside its bounding circle; skip it entirely on phones under 768px wide.
5. **Terms copy:** the terms block title and body in column B beside the panel, the tag "In plain terms" and the side text below, ramping in with the panel's retreat (title 12 units ahead), ink on paper.
6. Verify lint, typecheck and build; scrub `drawing` and `panel` forward and back in the HUD; screenshots into `docs/screenshots/terms-*.png`.
