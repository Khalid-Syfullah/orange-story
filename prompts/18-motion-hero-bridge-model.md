# Phase 18 of 21: Motion: hero, bridge and the model

You are improving orange.io. Phase 17 built the toolkit and the audit. Give the opening chapters their own motion.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Hero:** scroll-driven orbit and parallax around the orange (depth layers from the mask helper), and the pour and glint reacting to scroll velocity, bounded. Keep the print-in and ring.
2. **Bridge reel:** tie the camera speed to the scroll speed and add a slight roll and handheld sway (a pure function of the reel's local progress plus the wind field), so it reads as filmed, not scrubbed. Keep the hero-to-reel handover exact.
3. **Model graft:** a slow lateral dolly with depth parallax (foreground leaves and background at different rates). **Grove and share:** keep the camera moves from `groveCamera` and `shareCamera`; add foreground leaf or particle layers drifting at their own speed. The share beat must still end at rest exactly on `art.share.lastFraming` (Split t=0 diffs 0).
4. Fix anything flat in these three real paintings (see the brief); note any asset that needs replacing in `art/briefs/<id>.txt`.
5. Phone band and reduced motion still behave; verify lint, typecheck, build, and the hero/bridge/model/split cut tests in `npm run e2e`.
