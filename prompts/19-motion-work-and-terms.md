# Phase 19 of 21: Motion: the work and the terms

You are improving orange.io. Phases 17 and 18 are done. The Work is the reference for good; the Terms chapters are the flattest.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Work:** keep the plate scroll, creep, print-in and cards. Add velocity-linked smear on the plate edge of the print front and cloud wind from the shared field. Do not make it busier than it is.
2. **Parchment and sheet:** a slight perspective tilt as the camera pushes onto the paper, settling flat as the sheet lands (no change to the landed frame).
3. **Drawing and plan:** the orbit gains perspective and a slow rotate and zoom on the paper; the ink lines draw on with scroll (a coverage driven by local progress, bitten by fbm, printed, never a wipe). The plan still takes over on the orbit's last frame exactly.
4. **Panel and close:** the margin orange turns with scroll velocity; the burn keeps its ember and char and the coda's first frame stays exact.
5. Fix anything flat in these real paintings (see the brief); note any asset that needs replacing in `art/briefs/<id>.txt`.
6. Verify lint, typecheck, build, and the work/parchment/sheet/drawing/close cut tests in `npm run e2e`.
