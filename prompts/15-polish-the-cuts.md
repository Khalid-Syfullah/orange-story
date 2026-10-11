# Phase 15 of 16: Polish every cut until nothing reads as mechanical

You are building orange.io. Every section and every transition exists (phases 4 to 14). This phase is a single pass by the strongest model over the hardest material: scrub every cut and every rest state, find each remaining mechanical tell, and remove it by tuning or rewriting the shader, not by adding effects. You are the last eye before the automated checks.

## Rules

- **Source of truth:** `docs/MOTION-RULES.md` (the fifteen rules are the review checklist; read all of them first), `docs/TRANSITIONS.md` (every cut and its parameters), `docs/CHECKS.md` (the still-frame, pop, edge and speed tests, done by hand here), `docs/STORY.md`, `src/stage/`.
- **One stage, one canvas:** raw WebGL 1. You may restructure shader code for clarity and speed; you may not change what any cut is (no new transitions, no crossfades, no straight edges).
- **Scroll is the clock:** everything scroll-driven stays a pure function of smoothed `p`, reversible.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Review method.** For each cut in `docs/TRANSITIONS.md` and each rest state (hero, plate, sheet, coda, canopy, application, finale): hold it at local t = 0.2, 0.5 and 0.8 with the dev scrub (`/stage-test` or the HUD), save the frames, and judge each as a still against rule 15; then scrub it forward and back at three speeds and judge it against rules 1 to 14. Write the findings, one line per tell, to `docs/CUTS-REVIEW.md` before fixing anything, with the rule number each tell breaks.
2. **The usual tells, in the order they usually appear:** a front with a straight stretch (rule 1); an edge that is an alpha ramp (rule 2); a texture, scrim or glow that is visible switching on (rule 3); ease-in-out on something that should accelerate, or a pass that starts with an edge (rule 4); a revealed picture that sits still under the hole (rule 5); sharp pixels moving fast (rule 6); a zoom about the frame centre (rule 7); a band that saturates everywhere behind the front (rule 8); a lone sine (rule 9); a repeat that lines up (rule 10); a pop on reversal (rule 11); a mirror at a seam (rule 12); clouds, dots or stars that are evenly spaced or share a phase (rule 13); a frame-time spike at a cut (rule 14).
3. **Fix every finding.** Tune in the order each cut's parameter table gives (front speed, bite, band widths, lag distance, smear length), then easing, then hashing. Where two sections implement the same gesture differently (halftone pitch, cloud code, breath, print-in fronts, ring fronts), unify them into one shared GLSL function with per-section parameters, so the whole page reads as one hand. Keep the parameter tables in `docs/TRANSITIONS.md` in sync with the final values.
4. **Continuity.** Check that every segment boundary hands over without a visible seam: the pan and scale at the end of one pass equal those at the start of the next; `uVel`-driven effects decay to zero at rest; breath never resets at a boundary; the rail, chrome and copy colours change on the same ramp as the picture.
5. **Performance.** Profile every cut with the HUD; where a pass exceeds budget, add or widen fast paths and gate dead work rather than reducing quality; record before and after frame times in `docs/CUTS-REVIEW.md`.
6. **Second look.** After the fixes, repeat step 1 for every cut you touched and append the result; a cut is finished only when all three stills pass and the scrub shows no tell at any of the three speeds.
7. Verify lint, typecheck and build; the final stills go in `docs/screenshots/cuts/` with the cut name and t in the file name.
