# Phase 8 of 16: The push into the parchment and the sheet

You are building orange.io. The Work (phase 7) ends on the woman reading a blueprint. This phase pushes the camera into the parchment she holds while the frame takes the paper's colour, and builds the sheet itself: paper made in the pixels, lit by moving light.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (row Work → sheet), `docs/STORY.md` (rows 2 → 3 and 3 · The Terms), `docs/MOTION-RULES.md` (rules 3, 9 and 13 are the ones this phase lives on), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1; everything a function of smoothed `p`; reversible.
- **Art** through `src/content/art.ts` (`plate`, its parchment region as a rect in painting coordinates added to `art.ts`).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Parchment push** in the `parchment` segment: cover-fit the parchment region of the plate with its own zoom and centre (from `art.ts`, matched to the plate by eye) and dolly into it with `t·(0.45 + 0.55·t²)` about the parchment's centre, the centre drifting 2% as the push accelerates (rule 7).
2. **uFlat:** over the same segment `uFlat` rises with smoothstep and takes the whole frame to `--paper`. A faint shadow of the orange (the plate's luminance at 8% opacity) survives in the sheet, fading with `(1 − uFlat)²`.
3. **The sheet** (the `sheet` segment and everything on paper after it) is not a colour, it is paper built in the pixels: pulp (fbm; thick pulp warmer, thin pulp cooler, so it never reads as tinted grey), laid fibre running one way (high-frequency noise stretched 12:1), tooth (fine hash), and a few dark inclusions (`hash > 0.995`, softened). Every term is multiplied by `uFlat`, so texture and colour arrive together and there is no frame where paper appears over a clean picture (rule 3). Texture fields use `uOctaves` (2 on phones), never the motion fields' 4.
4. **Light on the sheet:** a slow raking gradient whose position, patch size, depth and contrast are sums of sines at different periods (rule 9), amplitude kept to 3–4% of value, so it reads as something moving between the sheet and the sun rather than the screen dimming.
5. **Chrome on paper:** the hairlines, rail, mark, pill and percentage switch to ink on paper over the same `uFlat` ramp (CSS variables driven from the stage's subscribe API, no per-frame React state).
6. **Rail:** The Terms from the start of `parchment`.
7. Verify lint, typecheck and build; the pop test from `docs/CHECKS.md` across `parchment` by hand (no frame where texture switches on); screenshots into `docs/screenshots/sheet-*.png`.
