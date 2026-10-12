# Phase 6 of 16: The Split (Chapter 1 → Chapter 2)

You are building orange.io. The Model (phase 5) ends on two hands holding the halves of an orange apart. This phase builds the page's signature cut: the cut in the orange becomes the cut in the picture, and the plate of The Work is underneath. It is specified in full in `docs/TRANSITIONS.md`; build exactly that, then tune by eye in the order the parameter table gives.

## What the visitor sees

With the halves held a hand's width apart, the gap between them tears open. Cobalt blue bleeds outward from the seam through a coarse, grainy halftone and stipple edge: dots that grow until they merge into flat blue. The halves and the hands are pushed aside, smearing and then pixelating into chunky dots as they leave. A white pith rim runs along the cut and a few zest specks spray from it. The page settles on a flat blue field with a single small halftone-dot cloud, and the first Work card ("Search engine optimization: Everything it takes to be found, under one roof.") is ready to arrive.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (The Split in full: phases, parameters including `chunk` and `bleed`, shader skeleton), `docs/MOTION-RULES.md` (every rule applies; the closing paragraph of the spec maps each one), `docs/STORY.md` (rows 1 → 2 and 2 · The Work), `src/stage/` (extend the engine; use its `fbm`, `bayer4`, `hash`, `smear5`, `blur`, `cover`, `uncover`, `dollyAbout`).
- **One stage, one canvas:** raw WebGL 1; the cut is a pure function of local `t` in the `split` segment and plays backwards exactly.
- **Art** through `src/content/art.ts` (`share` last keyframe as A, `plate` as B); the seam anchor comes from `art.ts`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Split pass** for the `split` segment, from the skeleton in `docs/TRANSITIONS.md`: A is `textures.shareLast` through the share beat's `cover()` mapping; B is the top of the `plate` (sky only at this point: the plate's y offset is 0) through the plate's width-fit mapping at scale 1.18 about the seam point, easing to 1.0 as the table says. The seam origin is `uncover(art.share.seam)`.
2. **Every term in the table**, with the values given: the anisotropic metric, the two-noise front, the dithered edge, the sign ramped through zero, the parting displacement with 5-tap smear, the rind band (desaturate and darken ahead of the cut), the radial softening in the last quarter, the lagged and smeared plate, the pith band with fibre running along the seam, the hashed zest specks scaled by `|uVel|`, and both fast paths. Expose every number as a uniform behind a `tune` object so the HUD can show them, and keep the defaults from the table.
3. **The two dot treatments:** add `cellCentre`, `dotShape` and `dotMask` to the engine's GLSL library (one rotated 15° halftone grid, shared with the hero's cloud code), then build `chunk` (the halves and hands pixelate into dots whose cells grow from 4 px to 18 px × dpr as they are pushed out, ahead of the front only) and `bleed` (the cobalt arrives through a 10 px × dpr dot screen whose dots grow until they merge at depth 1, behind the front only). Outside a dot the pixel stays A, so every pixel is one picture or the other. Check both at t = 0.3, 0.5 and 0.7: dots must be visible and chunky, the edge grainy, and no frame may look like an alpha ramp.
4. **The settle:** the plate's sky is flat cobalt (no gradient) with a single small halftone cloud, drawn with the shared cloud function from the hero code in plate coordinates (phase 7 reuses it for the whole plate). The cloud is already drifting in B before the halves have left. By t = 1 the frame is only that field, the cloud and the chrome; leave a slot for Work card 1, which phase 7 arrives right after the settle.
5. **Copy:** nothing arrives during the split; the share beat's copy has finished leaving before `t = 0.10`.
6. **Dev scrub:** add `?split=<t>` to `/stage-test` (or the HUD) to hold the cut at any `t` for screenshots; run the scrub test from `docs/CHECKS.md` by hand (40 steps forward, 40 back) and the still-frame test at t = 0.2, 0.5, 0.8; save those three frames to `docs/screenshots/split-*.png`.
7. Verify lint, typecheck and build, and that the split pass costs under 8 ms at 1440×900 on the dev machine with the fast paths on (the two dot treatments run only inside their bands).
