# Art briefs

One brief per asset id in `src/content/art.ts`: `art/briefs/<id>.txt` is the style preamble followed by that asset's prompt and motion line from `docs/PAINTINGS.md`, so any image or video model can be fed one file at a time. The briefs are generated: after editing `docs/PAINTINGS.md`, run `npm run art:briefs`.

`drawing` and `plan` are ink-and-watercolour drawings on cream paper, not oil paintings. Their briefs keep the preamble for the palette and light, but where the preamble and the prompt disagree (oil paint, the cobalt sky), the prompt wins. `scripts/art-video.mjs` leaves the preamble out for the `drawing` clip for the same reason.

## Where to drop finished art

Put finished files in `art/source/` (gitignored, so large sources stay out of git), named with the exact id, then run `npm run art:import`. Stills can be `.png`, `.jpg`, `.jpeg` or `.webp`; videos can be `.mp4`, `.mov`, `.m4v` or `.webm`. The import writes everything under `public/art/` (committed) and paints a placeholder for anything still missing. Nothing is fetched from the network.

| id | Kind | Drop as | Aspect, size | Keyframes and notes |
| --- | --- | --- | --- | --- |
| `hero` | loop | `hero.mp4` (or `hero.png`, which becomes a static loop) | 16:9, 2048x1152; 10 s (8 s from Veo) | Seamless loop: the same still as the first and the last frame. |
| `bridge` | 121 frames | `bridge.mp4` | 16:9 | First frame = the last frame of `hero`; last frame = the first frame of `graft`. The orange stays in exactly the same place in both. |
| `graft` | still | `graft.png`, or a 5 s `graft.mp4` (its first frame is used) | 16:9 | Its first frame is the bridge's last frame. |
| `grove` | still | `grove.png`, or a 5 s `grove.mp4` (its last frame is used: the hand round the orange) | 16:9 | |
| `share` | two keyframes | `share.png` (keyframe 1: he studies the orange) and `share-last.png` (keyframe 2: the halves held apart); or a 5 s `share.mp4` (first frame -> keyframe 1, last frame -> keyframe 2) | 16:9 | Keyframe 2 is the frame The Split opens: the gap between the halves sits on the `seam` anchor. |
| `plate` | still | `plate.png` | 9:16, 1152x2048 | Keep the left 35% of the middle and lower thirds quiet. |
| `drawing` | 121 frames | `drawing.mp4` | 1:1 | Keyframes: `drawing.png` (first frame, eye-level three-quarter view), then `plan.png` (last frame). Veo has no 1:1, so the clip is made inside a 16:9 frame with cream bars; `art/source/drawing.json` with `{"cropSquare": true}` (written by `art-video.mjs`) makes the import crop each frame to its centre square. |
| `plan` | still | `plan.png` | 1:1, 1536x1536 | Generate it first: it is the drawing's last frame. |
| `coda` | 89 frames | `coda.mp4` | 16:9 | Keyframes: `coda.png` (first frame), then `share-orange.png` (last frame, cover-fitted to 16:9). |
| `share-orange` | still | `share-orange.png` | 1:1 | Generate it first: it is the coda's last frame. |
| `canopy` | loop | `canopy.mp4` | 16:9, 10 s (8 s from Veo) | Seamless loop; the centre half of the frame stays clear sky. |
| `application` | still | `application.png` | 16:9 | |
| `sapling` | still | `sapling.png` | 16:9 | |
| `finale` | loop | `finale.mp4` | 16:9, 10 s (8 s from Veo) | Seamless loop; open sky above the tree for the wordmark. |

A good order: the stills first (`hero`, `graft`, `grove`, `share`, `share-last`, `plate`, `drawing`, `plan`, `coda`, `share-orange`, `canopy`, `application`, `sapling`, `finale`), then the videos made from them. `node scripts/art-video.mjs` makes the six videos with Veo from those stills (a dry run first; see `docs/PAINTINGS.md`, "Video generation").

## What the import makes

- Stills: `public/art/<id>/1440.jpg` and `768.jpg`, cover-resized to the asset's aspect (the tier is the width), JPEG quality 82. `share` also gets `public/art/share/last/1440.jpg` and `768.jpg`.
- Loops: `public/art/<id>.mp4`, H.264 1920x1080, CRF 22, `+faststart`, no audio, at the source's length (the stage loops it), and `public/art/<id>-poster.jpg`. When the first and last frames differ visibly, the last 0.4 s is crossfaded into the first so the loop does not jump.
- Sequences: `public/art/<id>/1440/f_000.jpg ...` and `768/...`, sampled evenly from the first frame of the clip to the last at the counts in `art.ts` (121, 121, 89), plus `manifest.json` (`{"tiers":{"1440":{"count":N},"768":{"count":N}}}`). A still source fills every frame.
- `art/imported.json` records what each id is now (real or placeholder, and from which files). An id whose sources, anchors and scripts have not changed is skipped; `--force` redoes it, `--only id,id` limits the run. The summary table at the end lists each asset, its source, its output size and what was done, and the run fails if any path in `art.ts` is missing on disk.
- Budget: `public/art` stays under 70 MB (raised from 60 when the real paintings arrived: the 121-frame `drawing` sequence alone is about 30 MB because of the paper grain). If real sequences push it over, the import re-encodes the sequence frames at a lower JPEG quality until it fits and says so.
- Tools: video sources need `ffmpeg` on PATH (`brew install ffmpeg`). Without it, stills still import, a video source falls back to its placeholder with a warning, and the placeholder loops are encoded with AVFoundation on macOS (`scripts/lib/mp4-encode.swift`, compiled once into `node_modules/.cache`).

## Placeholders

`npm run art:placeholders` (also run by the import for any missing source) paints a stand-in for every id with no source: the right palette and aspect, a cobalt field with a soft vignette, the orange as a disc with a darker lower half and a small highlight, cream and ochre figures, marble steps and blocks, paper for the drawings, leaves for the canopy. Each carries a faint mono label of its id in the bottom-right corner (sequences show the frame number). The sequences change from frame to frame and the loops move, so scrubbing and playback can be checked before real art exists:

- `bridge`: the hero's first frame turns into `graft` along a torn edge rising from the bottom, the marble darkening to bark ahead of it, the orange held still.
- `drawing`: the construction drawing orbits from an eye-level three-quarter view to top-down; its last frame is `plan`, exactly.
- `coda`: the rod lifts, the gilded orange comes free and floats down-left while the camera pushes in and the woman and the tree leave on the right; it hangs alone for the last 20%, and the last frame is `share-orange`'s centre band, exactly.
- Loops: the cloth circles on the peel and the can tilts (`hero`), the leaves stir and one orange sways (`canopy`), the can tilts and the knot is tied (`finale`). They are periodic, so they loop without a seam.

Run `npm run art:placeholders -- --preview /some/dir` to write a few PNG frames per id somewhere else without touching `public/art`.

## Anchors: the numbers to retune when real art arrives

The anchor points in `src/content/art.ts` are in painting coordinates (0..1 across the painting's own width and height, y down). The placeholders put their features exactly on them, so every effect built against a placeholder lines up. When a real painting replaces a placeholder, its features will sit somewhere else: retune these numbers in `art.ts` by eye (the dev HUD, `?hud`), and nothing else in the code needs to change. Values at the time of writing (`art.ts` is the source of truth):

| Asset | Anchor | Value | What it marks |
| --- | --- | --- | --- |
| `hero` | `glint` | 0.64, 0.30 | The highlight on the upper left of the giant orange, where the rainbow glint sits. |
| `hero` | `orange` | 0.70, 0.42 | Centre of the giant orange (the placeholder's radius is 0.13 of the width; the bridge and `graft` keep it in place). |
| `hero` | `spout` | 0.33, 0.70 | Tip of the brass can's spout (the lower-left attendant). |
| `hero` | `pourEnd` | 0.37, 0.86 | The step below the spout, where the pour lands. |
| `share` | `seam` | 0.50, 0.44 | The gap between the halves in the last keyframe (`share/last`), where The Split opens. |
| `share-orange` | `orange` and radius `orange` | 0.50, 0.50; 0.14 | Centre and radius (fraction of the width) of the floating orange; the coda's last frame lands on it. |
| `canopy` | `nearestOrange` and its radius | 0.34, 0.27; 0.035 | The canopy orange nearest the centre on the loop's first frame (the match cut lands here). |
| `application` | `fingertip` | 0.30, 0.20 | Tip of her raised index finger: the constellation's first line. |
| `sapling` | `trunkFoot` | 0.50, 0.90 | Foot of the trunk on the marble, where the print-in starts. |
| `finale` | `spout` | 0.30, 0.60 | Tip of the can's spout (the woman on the left). |
| `finale` | `roots` | 0.48, 0.86 | The tree's roots, where the pour lands. |

Not yet in `art.ts`: the parchment the woman holds in the `plate` placeholder is the rect x 0.50, y 0.705, w 0.20, h 0.075 (plate coordinates); phase 8 adds the parchment region to `art.ts` and should use that rect until real art arrives.

After retuning an anchor, run `npm run art:import` again: any id that is still a placeholder is repainted to the new numbers.
