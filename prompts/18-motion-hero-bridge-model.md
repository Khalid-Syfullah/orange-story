# Phase 18 of 24: Motion: hero, bridge and the model

You are improving orange.io. Phase 17 built the toolkit and the audit. Give the opening chapters their own motion.

## Rules

- **Source of truth:** `docs/MOTION-BRIEF.md` (the brief and its six rules), `docs/MOTION-RULES.md`, `docs/STORY.md`, `docs/TRANSITIONS.md`, `docs/PERF.md`, `docs/CHECKS.md`, `src/content/art.ts`, `src/stage/`.
- **Extend, never rewrite:** keep every existing continuity, fast path, scrub-safety and reduced-motion behaviour. Numbers go in `art.ts` or the pass's `timeline.ts`.
- **Look at the real paintings** in `public/art` before changing a shader; screenshot before and after at 1440x900 and 390x844 (`npm run build && npx next start -p 3300`, then `?p=<value>&clock=5`) into `docs/screenshots/motion-*.png`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Hero:** scroll-driven orbit and parallax around the orange (depth layers from the mask helper), and the pour and glint reacting to scroll velocity, bounded. The dotted rings ripple outward from the crown like a signal (their own phase per ring, slower when larger) and keep their rhythm into the bridge. Keep the print-in and ring.
2. **Bridge reel (the scene transforms in place):** tie the camera speed to the scroll speed, carry the upward tilt, and add a slight roll and handheld sway (a pure function of the reel's local progress plus the wind field), so it reads as filmed, not scrubbed. Give the falling grafting knife and the raffia a foreground layer with its own parallax and a little spin and smear, so they pass the lens at a different rate from the bark. The rings keep pulsing until the ground is white, shifting from milk to ink. Keep the hero-to-reel handover exact, and the plinth-to-bark change reading as one continuous transformation (the top slab staying put, then lifting away like a cap).
3. **The Model:** **graft:** a slow lateral dolly with depth parallax (foreground leaves and background at different rates), ending in the push-through: leaf shapes sweep across the lens (own seeds and speeds, smeared along the push) as the canopy arrives. **Canopy and picking (grove):** keep `groveCamera`, holding the upper canopy for "We build it." and then dropping to the picking hand for "We rank it."; add foreground leaf or particle layers drifting at their own speed. **Share:** the match cut on the gilded orange holds the fruit still while everything around it changes; the slice runs as a thin noisy front along the knife's line. The share beat must still end at rest exactly on `art.share.lastFraming` (Split t=0 diffs 0). Every beat's copy still fades in only after its painting has settled.
4. Fix anything flat in these three real paintings (see the brief); note any asset that needs replacing in `art/briefs/<id>.txt`.
5. Phone band and reduced motion still behave; verify lint, typecheck, build, and the hero/bridge/model/split cut tests in `npm run e2e`.
