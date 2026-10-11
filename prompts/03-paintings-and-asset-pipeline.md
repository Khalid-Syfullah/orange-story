# Phase 3 of 16: Paintings, placeholders and the asset pipeline

You are building orange.io. Phases 1 and 2 built the app and the WebGL engine. This phase makes every asset in `docs/PAINTINGS.md` exist on disk, as the real painting when a source file is present and as a painted placeholder when it is not, so no later phase ever waits for art.

## Rules

- **Source of truth:** `docs/PAINTINGS.md` (ids, kinds, sizes, where each is used), `src/content/art.ts` (the manifest, extend it rather than duplicating it), `docs/STORY.md`.
- **Art:** sources live in `art/source/<id>.<png|jpg|mp4>` (gitignored, large). Imported assets live in `public/art/` and are committed.
- **Deploy contract:** `npm run lint`, `npm run typecheck`, `npm run build` stay green; keep `public/art` under 60 MB in total (JPEG quality 82, two tiers).
- **Git:** do not commit or push; the skill does.
- **Finish** with 3 to 6 lines: which assets are real and which are placeholders, and anything you could not verify.

## Task

1. **Briefs:** write `art/briefs/<id>.txt` for every asset, each containing the style preamble followed by that asset's prompt and motion line from `docs/PAINTINGS.md`, so any image or video model can be fed them one at a time. Add `art/briefs/README.md` saying which file to drop where (`art/source/<id>.png` for stills, `.mp4` for loops and sequences, with the expected aspect and the keyframe order for `share`, `drawing` and `coda`).
2. **Import script** `scripts/art-import.mjs` (`npm run art:import`), using `sharp` (add it as a dev dependency) and `ffmpeg` when present on PATH:
   - stills: `public/art/<id>/1440.jpg` and `768.jpg`, cover-resized to the asset's aspect;
   - loops (`hero`, `canopy`, `finale`): `public/art/<id>.mp4` re-encoded to H.264 1920x1080 at CRF 22 with `+faststart`, 10 s, plus `public/art/<id>-poster.jpg`;
   - sequences (`bridge`, `drawing`, `coda`): frames extracted at the counts in `docs/PAINTINGS.md` (121, 121, 89), written as `public/art/<id>/1440/f_000.jpg …` and `768/…`, plus `manifest.json` `{"tiers":{"1440":{"count":N},"768":{"count":N}}}`; when the source is a still rather than a video, every frame is that still;
   - a `--only <id>` flag and a summary table at the end (asset, source found or placeholder, output size).
3. **Placeholders** `scripts/art-placeholders.mjs` (`npm run art:placeholders`, also run by the import for any missing source): painted-looking stand-ins in the right palette and aspect, drawn with `sharp` composites or an SVG rendered through `sharp`: a cobalt field with a soft vignette, a large orange disc with a darker lower half and a small highlight where the orange sits in that painting, cream and ochre silhouettes where figures stand, marble blocks where the plinth is, a paper field for `plan` and `drawing`, a canopy of leaf shapes for `canopy`. Each carries a faint mono label of its id in a corner. Sequences get frames that actually change (the orange drifts or the plinth darkens) so scrubbing is visible.
4. **Anchors:** for each anchor point listed in `src/content/art.ts` (hero glint, can spout, `share` seam, canopy nearest orange, application fingertip), place the placeholder's feature at that point so later phases can be built against placeholders and real art drops in without code changes. Document in `art/briefs/README.md` that the anchors in `art.ts` are the numbers to retune when real art arrives.
5. **Real art:** if `art/source/` already holds files, import them now. Do not fetch anything from the network.
6. Run `npm run art:import`, confirm every id in the manifest resolves to files on disk, and verify lint, typecheck and build.
