# Orange: design system

How orange.io looks and moves. The storyboard (`docs/STORYBOARD.md`) says what happens; this file says how it should look while it happens. Every value below exists in code:

| What | Where |
| --- | --- |
| Raw tokens (CSS variables), Tailwind theme, shadcn theme, type and shape utilities | `src/app/globals.css` |
| Fonts (the only place they are chosen) | `src/styles/fonts.ts` |
| Tokens for canvas, three.js, GSAP and motion (hex colors, `mixColors`, easing tuple, grid fractions) | `src/styles/tokens.ts` |
| These rules, checked (contrast, no raw colors) | `src/styles/design.test.ts`; fonts and layout shift in `e2e/story.spec.ts` |
| Class merging that understands the custom type scale | `src/lib/utils.ts` (`cn`) |
| Every on-screen string | `src/content/copy.ts` |
| Live reference sheet (dev only, not linked, 404 in production) | `/design` |

## Look in one paragraph

A painted, sunlit classical world under a deep blue sky, laid out like a precise technical drawing. Light serif headlines, small monospace capitals, hairline grid lines with tiny four-point stars where they cross. Milk-white pages for calm moments. Oranges are the only loud color, and they are loud because nothing else is.

## Color

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| `--sky` | `#1F4E9C` | `bg-sky`, `text-sky` | Deep blue sky, the default stage ground |
| `--sky-soft` | `#6F9BD6` | `bg-sky-soft` | Haze, distant sky, clouds in shadow |
| `--milk` | `#F6F3EC` | `bg-milk`, `text-milk` | Pages, panels, secondary text on sky |
| `--ink` | `#15130F` | `bg-ink`, `text-ink` | Text on milk |
| `--press` | `#0E0C0A` | `bg-press` | Pill buttons on light grounds, the rare dark panel |
| `--orange` | `#FF7A00` | `bg-orange`, `text-orange` | The single accent |
| `--leaf` | `#476B35` | `bg-leaf` | Foliage in art and placeholders |
| `--marble` | `#ECE7DD` | `bg-marble` | Marble, stone, quiet surfaces |

- Text on sky is white or `--milk`. Never ink on sky.
- Every color in the code is a token, or a mix of two tokens (`mixColors(a, b, t)` in `tokens.ts`; `color-mix()` with `var(--token)` in CSS). The unit test fails on a raw hex or rgb color anywhere outside the token files.
- Hairlines are 1px at 20% of the current text color: `var(--hairline)`, or the `hairline-x` / `hairline-y` utilities.
- shadcn semantic colors (`background`, `foreground`, `primary`, `border`, `ring`, ...) map onto this palette. Three surface scopes:
  - default (`:root`): milk ground, ink text
  - `.theme-sky` (also `.dark`): sky ground, white text, milk secondary text
  - `.theme-press`: near-black ground, milk text
  Each scope also sets `color`, so text inside it switches without extra classes. shadcn `dark:` variants apply inside sky and press scopes.

### Contrast (WCAG AA)

Body text needs 4.5:1, large text (24px and up) 3:1. Measured:

| Text | Ground | Ratio |
| --- | --- | --- |
| White | `--sky` | 7.99 |
| Milk (secondary lines on sky) | `--sky` | 7.21 |
| White / milk | The lightest row of the painted sky (`#416EB4`, its bottom) | 5.10 / 4.61 |
| Ink | `--milk` | 16.74 |
| Softened ink (74%, secondary lines on milk) | `--milk` | 7.58 |
| White on a `chrome-chip` | over a white robe or cloud | 5.51 |
| White on the Apply pill on sky (80% sky fill) | over a white cloud | 4.87 |

The painted sky is part of this: behind text it must never get lighter than `#416EB4` (a 42% mix of sky toward sky-soft). The first placeholder faded to sky-soft at the bottom, where milk text fell to 2.58:1; `design.test.ts` now reads the sky plate's lightest row and checks it, so final art is held to the same line.

## How figures are rendered

The people are paintings, not drawings: an academic neoclassical oil-painting look in one shared light (warm sun from the upper left, cool sky fill, a thin warm rim on the right), described with the cast in `docs/ART-DIRECTION.md`. Each figure is a plate in the manifest (`docs/ART-PLATES.md`), and the final paintings come from an artist or an image model, briefed by `docs/ART-BRIEFS.md` and brought in by `npm run art:import`.

Until then a procedural painter (`scripts/art/`) stands in: each character is built from rounded forms (turned heads, tapered limbs, grouped fingers, drapery hanging from points of tension), lit with five values and cast shadows, and painted with seeded brush strokes over a canvas weave and a faint craquelure. The props share the same light. A texture guard fails any character plate that turns out flat. Nothing in the interface changes for this: the plates are images, and where code ties something to a figure (a fruit in a hand, a fingertip, a blade) it reads a named point on the plate, never a constant.

Figures are painted at one world scale (an adult 1.75 world units tall, a head 0.23, a hand 0.19) and framed like a painting seen up close: large and confident, cropped by the frame's edge, faces and hands big enough to read, the sky around them left as room for the words (the framing table, `docs/ART-PLATES.md`). Only the orange is ever heroically large.

## The living, painted stage

The stage reads as one oil painting on canvas with a graphic layer drawn over it (`src/components/stage/paint.ts`, `materials.ts`; numbers in `SCROLL.md`):

- **The canvas.** The sky is painted cobalt: a soft value shift toward the horizon, large soft mottling, cloudy brushing and a few faint strokes, calmer behind the left column of text and never lighter than the 42% mix. Over it and over every stand-in plate lies a fine canvas weave and paint tooth, and a fainter craquelure (strongest on the paper-cream building site): two small shared tileable textures read in each plate's own UV space, so they move and scale with the art and never crawl or shimmer as the camera moves (mipmaps fade them where they would be finer than a pixel). A finished painting carries its own surface and gets none.
- **Figures in the same air.** Every figure plate takes the scene's colour grade (warm highlights, cool shadows, a small saturation trim: `SCENE_PAINT` in the script), a soft sky-blue rim on its shadow edge (from the alpha falling away toward the lower right) and, standing, a faint warm bounce from the ground on its lower part and a soft contact shadow under its feet (a plate of its own). Subtle on paintings, a little stronger on stand-ins.
- **Figures that live.** People breathe (the chest and shoulders rise a little under 1% of their height, about every five seconds), the hems of their robes ripple, and every few seconds their heads and their weight shift a little, each on their own phase so a crowd never moves in unison. A rig of rectangles in the manifest (chest, hem, head, the feet) becomes a soft weight texture that bends a subdivided plate in the vertex shader; heads and arms on their own plates ride their bodies and turn on their joints, and things in a hand move with the hand. On top, scrubbed by scroll and so exactly reversible: the onlookers' heads tip up as the orange brightens, the harvester turns his head to the fruit as he takes it, the architect leans in and bows her head as the plan opens, the gardener's body follows each snip, the astronomer's arm settles into the point, the orchard keepers shift their weight with their loop. Idle life runs on the stage's idle clock: it stops offscreen, in a hidden tab and with reduced motion.
- **The halftone layer.** Clouds, the water from the jug and the ripple rings around the hero's orange are dots, not soft paint: a grid at 45 degrees in plate space (the same dot size on any screen, moving with its object), each dot's area following a soft tone through a smooth threshold, so dots grow and shrink without popping; dense on a cloud's shadow side, its soft edge breaking into dots. The glow's droplets are crisp dots whose size carries their brightness. Only in the palette: milk and white, the cool sky, a touch of orange. Never behind body text (the clouds part around the cards).
- **Quality tiers.** On a device that cannot keep up (`quality.ts`), the canvas goes first, then the rim, the bounce and the halftone, which falls back to the soft painted version; `?quality=low` shows the lowest tier anywhere.

## Text over the painting

Text sits on painted plates, not on flat color, so where the painting runs behind words it gives way while the words are up (`useTextHaze`, see `SCROLL.md`):

- **Haze.** Inside a soft rectangle around the words, foliage, fruit and figures recede toward the sky's color (the pluck's foliage behind its two beats, the gardener's young tree behind "The Terms" and the fit text, the orchard's fruit behind "Questions worth asking first.", the tree behind the finale's wordmark). It reads as atmosphere, not as a panel.
- **Parting.** Clouds thin out of the card column instead (the work scene) and re-form beyond it, so they pass on both sides of the cards.
- **Composition first.** Where the art can simply stand aside it does: the statue, the harvester, the builder and the astronomer are framed beside the words (the framing table); the gardener stands on the right, and only his tree reaches behind the words; the astronomer steps down the sky, and sinks out of a phone's frame, before the form arrives.
- **Glass with a tint.** The question cards are glass with a 45% sky fill (not a white one), so their answers keep 4.5:1 over the orchard's fruit.
- **Chrome chips.** The percent counter and the ruler's active entry sit on a `chrome-chip`: a 4px chip of the ground's own color (`--chrome-ground`, sky or milk) at 85%. On plain sky it all but disappears; over a robe or a cloud in that corner it keeps the readout legible. The ghost Apply pill takes an 80% sky fill for the same reason.

## Type

Three families, all variable fonts loaded with `next/font/google` (`display: swap`, size-adjusted local fallbacks generated automatically, so nothing shifts when they arrive: the scroll test measures a cumulative layout shift under 0.02 while the page and its fonts load):

| Family | Role | CSS variable | Tailwind |
| --- | --- | --- | --- |
| Newsreader | Display: headlines, card titles, the wordmark. Weight 300; italic available; 600 only for the wordmark. | `--font-display` | `font-display` (also `font-heading`) |
| Geist | Text: body, leads, form input | `--font-text` | `font-text` (also `font-sans`, the page default) |
| Geist Mono | Labels: buttons, tags, ruler, meta readouts | `--font-mono` | `font-mono` |

Scale. Each step is a Tailwind size (`text-display-xl` sets size, leading, tracking and weight) and a composite utility (`type-display-xl` also sets the family and case). Prefer the `type-*` utilities.

| Step | Size | Family and setting | Where |
| --- | --- | --- | --- |
| `display-xxl` | `clamp(4rem, 2rem + 9vw, 11rem)` | Newsreader **600**, leading 0.85, tracking -0.03em | Finale wordmark only; the boldest type on the site |
| `display-xl` | `clamp(2.75rem, 1rem + 5.3vw, 5.5rem)` | Newsreader 300, leading 0.9, tracking -0.02em | Hero title, beat titles, "The Terms" chapter title |
| `display-l` | `clamp(2rem, 1rem + 2.6vw, 3.25rem)` | Newsreader 300, leading 0.95 | Section titles, terms title, application title |
| `title` | `1.625rem` | Newsreader 400, leading 1.1 | Service card and question titles |
| `lead` | `1.25rem` | Geist, leading 1.4 | Hero subtitle, beat subtitles |
| `body` | `0.8125rem` to `0.9375rem` (fluid) | Geist, leading 1.55 | Paragraphs, card bodies, answers |
| `label` | `0.6875rem` | Geist Mono 500, uppercase, tracking 0.18em | Buttons, ruler names, section labels |
| `meta` | `0.75rem` | Geist Mono, uppercase, tracking 0.04em, tabular figures | Percent counter, "Ch. 1", small readouts |
| `tag` | `0.5rem` to `0.5625rem` | Geist Mono 500, uppercase, tracking 0.14em | Tags only |

## Shapes

- **Pill button** (`pill` + `pill-chip`): radius 999px, 1px border at 20% of the text color, an inset top highlight, a mono `label` caption, and an arrow in a small round chip at the end. Dark pill on light grounds (`bg-press text-milk`), transparent pill on sky. The chip nudges right on hover. Buttons are the only rounded-full controls.
- **Tag** (`tag`): radius 4px, 10% tint of the text color, mono caps at 8 to 9px. Decorative: render a `span`, never focusable, `pointer-events: none`. It looks a little like a button and must never act like one.
- **Chrome chip** (`chrome-chip`): radius 4px, the ground's own color at 85%, behind chrome readouts (the percent counter, the ruler's active entry). Not a tag: it carries no label style of its own.
- **Glass**: question cards and form fields. A hairline border, a backdrop blur, no shadow; the cards are tinted with 45% sky, the fields stay almost clear (5% white) with a soft orb behind the form.
- **Hairlines** (`hairline-x`, `hairline-y`, `--hairline`): 1px at 20% of the text color, with a slight hand-drawn wobble when drawn as SVG paths, and small four-point star marks where they cross.
- **Radius**: `rounded-pill` (999px), `rounded-tag` (4px); shadcn's own scale derives from `--radius` (0.375rem).
- **No shadows on cards or panels.** Depth comes from the painted plates, blur and layering, not drop shadows.

## Layout grid

The stage is full viewport. Positions are fractions of the stage width (top line in vw):

| Line | Value | CSS variable | Tailwind spacing |
| --- | --- | --- | --- |
| Left hairline (the ruler sits on it) | 5.3% | `--grid-left` | `left-grid-left`, `pl-grid-left` |
| Right hairline | 85.6% | `--grid-right` | `left-grid-right` |
| Top hairline | 5.3vw | `--grid-top` | `top-grid-top`, `pt-grid-top` |
| Text column A | 8% | `--col-a` | `left-col-a`, `pl-col-a` |
| Text column B | 24% | `--col-b` | `left-col-b`, `pl-col-b` |

Column A holds titles and tags; column B, one tab-width to the right, holds paragraphs and typed lines. Text never crosses the left hairline. The right column (service cards, terms panel, form) starts at about 50% and stays inside the right hairline.

## Motion language

- **One easing curve everywhere:** `cubic-bezier(0.22, 1, 0.36, 1)`. CSS: `var(--ease)`, `ease-story`, and the default for every Tailwind `transition-*`. JS: `EASE` (tuple for motion), `EASE_CSS`, and the GSAP ease `story` (`EASE_GSAP_NAME`) from `src/styles/tokens.ts`.
- **One exception: the camera.** Scrubbed by scroll, the story curve's fast start (seven times the average speed) reads as a jolt at every camera key, and its long tail as a camera that has stopped. The camera runs instead on one smooth path through its keys (a monotone cubic, `camera-path.ts`): it starts from rest after a hold, lands at rest before one, glides through a chain of moves and keeps moving through the middle of a long one. Art that travels with the camera reads that path (`cameraTravel`).
- **Scroll drives the story.** One 0 to 1 `progress` value moves everything, so every scroll-driven move plays backwards exactly when scrolling up (the scroll test checks the way back in the browser). Only idle effects (glow ripple and its rings, sway, twinkle, the clouds' drift, the sparkles, the caret, the figures' breathing and small shifts) and the finale loop run on time.
- **Per-character reveals** for headlines: each letter is its own span rising and un-blurring in a short stagger; screen readers get the whole string.
- **Blur fades** for text leaving: blur up, fade, drift a little (left for the hero copy, upward like smoke after the questions).
- **Typewriter lines** that type letter by letter as you scroll, and un-type when you scroll back, with a thin caret.
- **Slow camera moves**: long push-ins, pans and dollies through painted plates. Nothing snaps; nothing bounces.
- **Hairlines move with the chapters**: vertical lines slide out sideways, horizontal lines up or down, corner stars lock into the corners; in viewfinder moments the lines close into a square frame.
- **Transitions cover, then uncover**: blue sand blown across, a white page that unfolds like a folded sheet, blue dust rising with white specks, a cloud billowing out of a sky turned to cloth. Each starts on the untouched old scene and ends on the untouched new one; the rainbow ring is the one soft spectral color, and it sweeps instead of covering. Fronts that sweep across the screen move in step with the scroll (the hand is their pacing); fades and folds use the curve. Text leaves the questions as smoke: blur, rise, and soft holes of smoke noise. All of them play on `/design`.
- Small UI transitions (hover, focus, the form field stack) take about 0.3s on the same curve.

## Do not

- No other fonts. Newsreader, Geist and Geist Mono only (the scroll test checks every rendered text element and every loaded face).
- No card shadows, glows on panels, or gradients on UI chrome.
- No raw colors in code: tokens, or mixes of tokens.
- No text on bright paint: let the art recede or stand aside (see "Text over the painting").
- Orange is the one accent: use it for the fruit, the glow and a rare highlight. Never for large UI surfaces, body text or borders.
- No ink text on sky; no colors outside the palette.
- No copy typed into components: every string comes from `src/content/copy.ts`.
- No pear.no assets, copy, art or code. `docs/REFERENCE.md` is for pacing and technique only.
- Tags are not buttons: no hover states, no focus, no click handlers.
