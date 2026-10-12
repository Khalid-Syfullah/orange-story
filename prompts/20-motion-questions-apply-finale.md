# Phase 20 of 24: Motion: questions, application and finale

You are improving orange.io. Phases 17 to 19 are done. Finish the closing chapters' motion.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Questions:** keep the vertical branch scroll; add leaf sway (foliage mask times the wind field), a light shimmer, and fruit that swings slightly with scroll velocity (bounded, settling). The match-cut landing frame must still equal the first Questions frame.
2. **Moiré and application:** branches sway; the figure holds still apart from breath; moire t=1 must still equal application t=0.
3. **Rise:** the sapling grows with an overshoot and settle (the toolkit's ease), not a linear print, with branches swaying once grown.
4. **Finale:** the camera cranes up the tree, then a settling breath; the pour gets droplet motion along its path. The wordmark and footer stay as built.
5. Fix anything flat in these real paintings (see the brief); note any asset that needs replacing in `art/briefs/<id>.txt`.
6. Verify lint, typecheck, build, and the matchcut/moire/rise cut tests in `npm run e2e`.
