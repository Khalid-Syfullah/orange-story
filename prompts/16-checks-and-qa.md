# Phase 16 of 16: Checks, QA and the final pass

You are building orange.io. The story is complete and polished (phases 4 to 15). This phase turns `docs/CHECKS.md` into automated tests, runs them against a production build, fixes everything they find, and leaves the repo ready to deploy.

## Rules

- **Source of truth:** `docs/CHECKS.md` (every item becomes a test or a recorded manual check), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `src/stage/`.
- **Deploy contract:** `npm run lint`, `npm run typecheck`, `npm run build` green; `npm start` serves on 3000. The e2e suite runs as `npm run e2e` (not `test`, so CI's `--if-present` test step stays fast); document how to run it.
- **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Playwright** (`@playwright/test` as a dev dependency, Chromium only, `--use-gl=angle --use-angle=swiftshader` so WebGL renders headless) against `npm run build && npm start` on a free port, with a fixed clock (`page.clock`) so frames are reproducible. Expose a test hook `window.__stage` with `setP(p)`, `getP()`, `segment()`, `frameMs()` and `frame()` (returns the canvas as PNG bytes), gated behind `NEXT_PUBLIC_STAGE_TEST_HOOK=1` so production builds do not ship it.
2. **Scrub test:** for every cut in `docs/TRANSITIONS.md`, step `p` across it in 40 increments forward, then backward; assert the per-step frame difference between the two directions stays under a small threshold (breath only).
3. **Pop test:** diff consecutive frames across every cut; assert the largest per-frame change sits at the crest region, never at a texture or scrim switching on (measure change outside the crest band).
4. **Still-frame test:** save frames at t = 0.2, 0.5, 0.8 of every cut into `docs/screenshots/cuts/`; these are reviewed by eye, so the test only asserts they exist and are not blank.
5. **Edge test:** at the split's crest, assert the boundary pixels are bimodal (dots and stipple), not a smooth ramp.
6. **Frame-time test:** with a 4× CPU throttle, assert `frameMs()` under 16.7 through every cut and under 4 at rest in the hero and the sheet.
7. **Reduced-motion test:** emulate `prefers-reduced-motion` and assert each cut sits at its end frame after 300 ms and that breath is off.
8. **Phone test:** at 390×844, assert no horizontal overflow, every copy block is within the viewport when its segment is active, and the form is operable.
9. **Fix everything** the suite finds; never weaken a threshold to pass. Record the final numbers in `docs/PERF.md` and the run instructions in `README.md`.
10. Verify lint, typecheck, build, `npm run e2e` green, and that `npm start` serves `/` on port 3000 with the stage hook off.
