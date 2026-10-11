# Phase 5 of 16: The bridge and Chapter 1, The Model

You are building orange.io. The hero (phase 4) is painted. This phase carries the visitor from the hero film into the story: the bridge morph, the static handover, and the three beats of The Model with their copy.

## Rules

- **Source of truth:** `docs/STORY.md` (rows Hero → Model and 1 · The Model), `docs/TRANSITIONS.md` (row Hero → Model), `docs/MOTION-RULES.md`, `docs/COPY.md` (Chapter 1 beats), `src/stage/` (extend the engine; never duplicate it).
- **One stage, one canvas:** raw WebGL 1; scroll-driven state is a function of smoothed `p`, reversible.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`bridge`, `graft`, `grove`, `share`).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Bridge reel:** in the `bridge` segment scrub the `bridge` sequence (121 frames) by local progress through the texture manager's `aim`/`near`, framed by the same `cover()` math as the hero with the pan keyed to the reel's frames (a small per-frame pan table in `art.ts`, default zero), so the orange never jumps between film and reel.
2. **Static handover:** the shader hands the hero loop to the reel through the static treatment exactly as `docs/TRANSITIONS.md` describes: a diagonal wave from the bottom-right corner, aspect-corrected to run at 45°, bent by slow noise; film ahead, reel behind; at the crest a horizontal tear with hashed row shifts, a mosaic that starts coarse (24px cells) and resolves to 1px as the crest passes, a chroma split of ±0.006 along x, and a 5×5 bitmap-font ASCII rubbing of the luminance inside the crest band only (glyphs from arithmetic: five 5-bit rows per glyph, ordered lightest to heaviest ` .:-+=*%#@`). Tear amplitudes scale with `|uVel|` so a fast scroll tears harder. Fast paths: pixels provably ahead of or behind the crest skip the treatment.
3. **The three beats:** `graft`, `grove`, `share` as three stills or sequences in the `model` segment (thirds of its range), each cover-fitted with its own pan from `art.ts`; cuts between beats use the static treatment at a quarter of its amplitude. The `share` beat ends on its second keyframe (the halves held apart), which must be exactly the frame The Split (phase 6) opens, so expose it as `textures.shareLast`.
4. **Copy beats:** over `grove`, the title and subtitle "We get you found."; over `share`, the title "We split the harvest.", the tag "Revenue share" and the typed line, typed character by character by local progress with a blinking caret that stops when the line completes. Each beat ramps in over 60 scroll units with the title 12 units ahead of the rest, in column A, and ramps out before the next beat.
5. **Rail:** the left rail shows The Model from the start of `bridge`.
6. Verify lint, typecheck and build; scrub the bridge forward and back in the dev HUD and confirm no frame pops to blank (`near()` always returns a frame); screenshot the three beats into `docs/screenshots/model-*.png`.
