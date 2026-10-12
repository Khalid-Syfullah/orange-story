# Phase 24 of 24: Motion checks and final pass

You are improving orange.io. Phases 17 to 23 are done. Prove the new motion is scrub-safe, within budget and accessible.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. Extend the Playwright suite (`e2e/`) for the new motion (phases 21 to 23 added the Model's four beats and settled copy, the match cut's fruit position, the slice front, and the split's `chunk` and `bleed`; make sure each has a test and that all of them are in this run): scrub forward and backward identical per chapter (fixed clock), no region switching on outside a cut's crest, no painting edge visible at any `p` in 40 steps per chapter at 1440x900 and 390x844, and reduced motion showing no velocity or wind motion.
2. Measure frame time per chapter (the existing frame-time spec) and record before and after in `docs/PERF.md`. Anything over budget gets a cheaper path, not a weaker test.
3. Re-run the whole suite (`npm run e2e`) until green; read every failure's cause. Update `docs/TRANSITIONS.md`, `docs/CHECKS.md` and `docs/MOTION-AUDIT.md` with what changed and what remains flat (and which assets need replacing).
4. Final screenshots into `docs/screenshots/motion-*.png`. Report honestly what you could not verify (real phone GPU, iOS Safari, hand-driven trackpad scrolling).
