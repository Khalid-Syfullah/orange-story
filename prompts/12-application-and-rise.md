# Phase 12 of 16: The application and the rise

You are building orange.io. Questions (phase 11) sits in the canopy. This phase dissolves the canopy into the application painting through moiré halftone, builds the form as stars in a constellation, and rises the sapling.

## Rules

- **Source of truth:** `docs/TRANSITIONS.md` (rows Questions → Application and Application → finale), `docs/STORY.md` (rows 4 → application, Application, The rise), `docs/MOTION-RULES.md`, `docs/COPY.md` (Application), `.env.example` (`NEXT_PUBLIC_APPLY_ENDPOINT`), `src/stage/`.
- **One stage, one canvas:** raw WebGL 1 for the picture; the form and constellation are DOM and SVG driven by `p`.
- **Copy** from `src/content/copy.ts`; **art** through `src/content/art.ts` (`application` still with its fingertip anchor, `sapling` still).
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Moiré print-in** (`moire` segment): the canopy's sky gap takes a coarse halftone screen (cell 10px × dpr, laid at 15° so it moirés against the pixel grid); the branches dissolve from their inner edges outward through the same screen; the `application` painting's clouds arrive first as giant dot-screen clouds whose dots grow until they merge into paint, and the figure resolves last. The Questions cloud rides the band.
2. **Application** (`application` segment): the painting cover-fitted with the figure pinned left (its own pan). The form (tag, title, subtitle, three fields, submit button from `copy.ts`) is DOM in the sky on the right. Each field is a star in the constellation: an SVG circle with a four-point flare at the field's label position, hairlines joining field to field and the first field to the figure's fingertip (`uncover(art.application.fingertip)` every frame so it holds at any viewport). Stars and lines breathe with the Questions term.
3. **Form behaviour:** client-side validation (name required, email format, grow required); on submit, POST JSON `{name, email, grow}` to `NEXT_PUBLIC_APPLY_ENDPOINT` when set, otherwise skip the request; show the success message in place of the form on success and a plain inline error on failure; fields keep stable ids and labels; keyboard and screen-reader accessible; the Apply pill and the hero button scroll here.
4. **The rise** (`rise` segment): the `sapling` still prints in from its base upward (print-in front measured from the trunk foot, led by fbm) at the bottom centre while the halftone cloud crosses behind it; the constellation lines retract toward the fingertip one by one with a `0.62/(n − 1)` stagger; the form fades out before the lines go.
5. **Rail:** Questions until the end of `application`; nothing highlighted during `rise`.
6. Verify lint, typecheck and build; test the form with and without the endpoint set; screenshots into `docs/screenshots/apply-*.png`.
