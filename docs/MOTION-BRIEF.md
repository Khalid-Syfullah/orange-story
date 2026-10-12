# Motion brief: fluid paintings, a different motion for every chapter

Written after the first full build. The paintings read as flat pictures being cross-faded: several
beats were stills with a 3 to 15 px drift, and every chapter used the same slow push-in plus a cut.
Phases 17 to 21 (`prompts/17-*.md` to `prompts/21-*.md`) fix that. This file is their shared brief.

## What "good" already looks like

- **The Work:** the plate scrolls through its height at a real, eased speed, with a creep push-in, a
  halftone print-in front, clouds in plate coordinates and parallax cards at 0.6x.
- **The Model, grove and share:** a constant-speed push-in, then a pull-back that decelerates onto
  the Split's first frame (`src/stage/passes/model/timeline.ts`: `groveCamera`, `shareCamera`).
- **Clouds** drift on their own (`cloudSway` in `src/stage/passes/clouds.ts`).
- **Questions:** the canopy scrolls vertically with the page (`canopy/timeline.ts`, `travel`).

Keep that bar and give each chapter its own motion language. Do not copy one chapter's move onto another.

| Chapter | Motion to add |
|---|---|
| Hero | Scroll-driven orbit and parallax around the orange; the pour and the glint react to scroll velocity. |
| Bridge reel | Camera speed tied to scroll speed; a slight roll and handheld sway so it feels filmed, not scrubbed. |
| Model: graft | Slow lateral dolly with depth-style parallax (foreground leaves and background at different rates). |
| Model: grove, share | Keep the existing camera move; add foreground leaf or particle layers drifting at their own speed. |
| Work | Keep it; add velocity-linked smear and cloud wind. |
| Terms (drawing, plan, panel) | Orbit with perspective, then a slow rotate and zoom on the paper; ink lines draw on with scroll. |
| Questions | Keep the vertical branch scroll; add leaf sway, a light wind shimmer, fruit that swings with scroll velocity. |
| Application, rise | The sapling grows with an overshoot and settle, not a linear print; branches sway. |
| Finale | Camera craning up the tree, then a settling breath; the pour gets droplet motion. |

## Rules

1. All motion is a pure function of scroll position, so scrubbing forward and backward gives
   identical frames. Ambient motion (clouds, wind, breath) may use time but never scroll history.
2. No hard edges and no linear cross-fades. Use the printed and halftone gestures in
   `src/stage/gl/lib.glsl.ts`. Ease velocity in and out (`docs/MOTION-RULES.md`). Keep every
   continuity already guaranteed (Split t=0 is the Model's last frame, moire t=1 is application t=0,
   and so on).
3. Never show a painting's edge: camera travel stays inside the slack `(1 - 1/zoom) / 2`, with room
   for breath and pointer parallax (`src/stage/passes/rest.ts`).
4. Respect reduced motion (`uStill`, the reduced-motion path in `src/stage/script.ts`, the e2e
   reduced-motion spec) and the phone band layout (`src/stage/band.ts`, `phonePan`).
5. Stay inside the frame-time budget in `docs/PERF.md`; keep the fast paths.
6. Tunable numbers live in `src/content/art.ts` or the pass's `timeline.ts`, with a one-line comment,
   never hard-coded in GLSL.

## The paintings

The real paintings are in `public/art` (see `art/imported.json`). For each chapter look at the actual
image, then find anything flat or pasted-on (hard sky/leaf edges, banding, a sky that never changes,
stiff figures) and fix it in the shader: painted turbulence in skies, soft light shifts, leaf and
cloth sway masks driven by luminance or colour, depth parallax from a colour or edge mask. If the
asset itself is the problem, say so and write the replacement prompt in `art/briefs/<id>.txt`; do not
generate images.
