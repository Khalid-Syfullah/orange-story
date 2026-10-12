# Phase 17 of 21: Motion audit and shared toolkit

You are improving orange.io. The build is finished but the paintings feel flat. This phase audits what moves today and builds the shared pieces the next three phases use.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Fix the known failing test first:** `e2e/cuts.spec.ts` "cut drawing: Drawing → panel, pop" fails on the current tree (it also failed without the later motion changes). Find the real cause and fix it, not the test.
2. **Audit:** for every segment in `src/stage/script.ts`, record in `docs/MOTION-AUDIT.md` what moves today (camera, parallax, ambient, scroll-velocity response), how far in px at 1440x900, and what is flat in the real painting (hard sky/leaf edges, banding, a sky that never changes, stiff figures). Screenshot each at three `p` values.
3. **Shared toolkit** in `src/stage/gl/lib.glsl.ts` and a small `src/stage/motion.ts` (TS twins where the DOM needs them): (a) a wind field `windAt(painting point, tm)` for sway masks; (b) a luminance/colour mask helper for leaves and cloth (foliage = green/yellow-dark, sky = `skyMask`); (c) a two-layer depth parallax helper (foreground and background by mask, different offsets); (d) a velocity response `uVel`-driven smear and sway amount, bounded; (e) an overshoot-and-settle ease for growth. Each is scrub-safe, reduced-motion aware (`uStill`), and documented in `docs/MOTION-RULES.md`.
4. Prove the helpers on one painting each (the graft for depth parallax, the canopy for leaf sway) with a screenshot pair, without changing any chapter's timing.
5. Verify lint, typecheck, build, and `npm run e2e` (all green, including the fixed test).
