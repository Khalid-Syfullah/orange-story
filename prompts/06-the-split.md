# Phase 6 of 16: The Split (Chapter 1 → Chapter 2)

You are building orange.io. The Model (phase 5) ends on two hands holding the halves of an orange apart. This phase builds the page's signature cut: the cut in the orange becomes the cut in the picture, and the plate of The Work is underneath. It is specified in full in `docs/TRANSITIONS.md`; build exactly that, then tune by eye in the order the parameter table gives.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (The Split in full: phases, parameters, shader skeleton), `docs/MOTION-RULES.md` (every rule applies; the closing paragraph of the spec maps each one), `docs/STORY.md` (row 1 → 2), `src/stage/` (extend the engine; use its `fbm`, `bayer4`, `hash`, `smear5`, `blur`, `cover`, `uncover`, `dollyAbout`).
- **One stage, one canvas:** raw WebGL 1; the cut is a pure function of local `t` in the `split` segment and plays backwards exactly.
- **Art** through `src/content/art.ts` (`share` last keyframe as A, `plate` as B); the seam anchor comes from `art.ts`.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Split pass** for the `split` segment, from the skeleton in `docs/TRANSITIONS.md`: A is `textures.shareLast` through the share beat's `cover()` mapping; B is the top of the `plate` (sky only at this point: the plate's y offset is 0) through the plate's width-fit mapping at scale 1.18 about the seam point, easing to 1.0 as the table says. The seam origin is `uncover(art.share.seam)`.
2. **Every term in the table**, with the values given: the anisotropic metric, the two-noise front, the dithered edge, the sign ramped through zero, the parting displacement with 5-tap smear, the rind band (desaturate and darken ahead of the cut), the radial softening in the last quarter, the lagged and smeared plate, the pith band with fibre running along the seam, the hashed zest specks scaled by `|uVel|`, and both fast paths. Expose every number as a uniform behind a `tune` object so the HUD can show them, and keep the defaults from the table.
3. **Plate sky:** the halftone clouds from the hero code are already drifting in B before the halves have left; they are drawn in plate coordinates (phase 7 reuses the same code for the whole plate), so write the cloud drawing as a shared GLSL function now.
4. **Copy:** nothing arrives during the split; the share beat's copy has finished leaving before `t = 0.10`.
5. **Dev scrub:** add `?split=<t>` to `/stage-test` (or the HUD) to hold the cut at any `t` for screenshots; run the scrub test from `docs/CHECKS.md` by hand (40 steps forward, 40 back) and the still-frame test at t = 0.2, 0.5, 0.8; save those three frames to `docs/screenshots/split-*.png`.
6. Verify lint, typecheck and build, and that the split pass costs under 8 ms at 1440×900 on the dev machine with the fast paths on.
