# Cuts review (phase 15)

A pass over every cut in `docs/TRANSITIONS.md` and every rest state against the fifteen rules of
`docs/MOTION-RULES.md`, done before any fix. Method: the dev scrub (`/stage-test?<segment>=<t>&hud&clock=12`,
the shader clock fixed so frames are reproducible) driven through headless Chrome (Metal GPU, 1440x900, dpr 2)
by a small CDP script; each cut held at local t = 0.2, 0.5 and 0.8 and judged as a still (rule 15), the
crests cut out at 400% (the edge test), the frames at every segment boundary diffed against each other
(continuity), then each cut stepped across in 40 increments forward and back (the scrub and pop tests),
and every position profiled with `?finish`. The art is still the painted placeholders, so anything that is
the placeholder's own content (the bridge reel's bottom-up morph edge, the coda's flat blue) is not a tell
and is not listed.

Severity: **tell** = reads as mechanical and is fixed in this phase; **note** = within the rules, recorded
so the next reader does not re-open it; **latent** = invisible with the placeholders, fixed anyway.

## Findings, one line per tell (rule in brackets)

### Model -> Work, The Split (p 0.19–0.22)

- **tell [8, 15]** The pith band (`smoothstep(0,-0.07,edge)·smoothstep(-0.24,-0.09,edge)`, 0.24 wide) is measured
  in the seam's anisotropic metric (`length(q·(1, 0.38))`), so along the seam it is 1/0.38 = 2.6x taller than it is
  wide: at t 0.3–0.5 it is a cream column ~100 px wide running the height of the frame on both sides of the cut,
  a band, not the rim of a cut face (confirms the carry-over note; `split-0.5` still).
- **tell [8, 15]** The rind band ahead of the cut (`smoothstep(0.18, 0, edge)`, desaturate 30%, darken 25%) has the
  same stretch: at t 0.2 it darkens the pale ground between the halves into a grey smoke column the height of the
  frame (`split-0.2` still, `split-0.2-seam` crop). The rind should hug the opening as a thin dark edge.
- **note [5]** The plate's lag (`exp(-distBehind/0.12)`) is in the same metric, so the plate settles 2.6x further
  behind the cut vertically than horizontally; made uniform with the bands.
- **pass [1, 2, 6, 10, 11]** The boundary at 400% is Bayer dots and hash stipple over the bitten front; the zest is
  hashed per cell and per sixth of a second; the halves smear along x; t = 0 is the model's last frame to the pixel
  (boundary diff 0.000) and t = 1 the Work's first (0.000).

### Hero -> Model, the static handover (p 0.04–0.07) and the Model's beat cuts

- **pass [1, 2, 3, 4, 14]** The crest crosses the frame between t ~0.25 and ~0.45 (c = -0.04 at t 0.2, 1.08 at 0.5),
  bitten by two fields, printed, with the tear, mosaic, chroma split and glyph rubbing all bells in the front
  distance; the fast paths cover the frame on both sides. The mid-frame boundary and the white line through the
  orange in the t = 0.5 still are the reel placeholder's own morph (frame 60), not the shader.
- **note [10]** The mosaic cell is quantised to whole device pixels (24 -> 1 as the crest passes), so two or three
  block sizes sit side by side in the lead band; it reads as a mosaic resolving, which is the intent.
- **pass [11]** bridge -> model boundary diff 0.000; hero -> bridge differs only by the hero loop's own motion
  (the diff image is the attendants' outlines; the loop plays on).

### Work -> sheet, the push into the parchment (p 0.37–0.40)

- **pass [3, 7, 15]** The fill is spatially ordered (far paint and light paint first, the parchment last: at t 0.5 the
  far sky is ~80% paper while the parchment is ~20%), every paper term rides `uFlat`, the push is a dolly about a
  drifting point and the grain leaves with the paint. As a still it reads as a painting fading to paper around the
  parchment, which is the row's intent ("a push and a colour", no crest).
- **note [2]** Each pixel's fill runs over 0.55 of `uFlat`; the bite and the Bayer print modulate only the delay
  (±0.08), so inside a pixel the drain is a ramp. A fill with no boundary is what the row specifies; left.

### Sheet -> drawing, drawing -> panel (p 0.40–0.50)

- **pass [1, 2, 4, 6, 8, 15]** Soak bitten at two scales with a printed boundary and a travelling tide line; the window's
  brushed edge is two fields printed; the picture zooms inside the cutout and smears along its own motion; the
  boundaries sheet -> drawing and drawing -> panel diff 0.000.
- **note** The panel's wash fringe (`PANEL_WASH`) is a slightly grey beige; it reads as the patch the drawing was laid
  on. Left.

### Sheet -> blue, the close (p 0.50–0.53)

- **pass [1, 2, 5, 8, 10, 11, 14]** The char band at 400% is a brown-to-black stipple over the Bayer grid, the ember and
  sparks are hashed per band and per ninth/eighth of a second and gated on coverage, the blue arrives offset and
  smeared; panel -> close and close -> coda boundaries diff 0.000.

### Halo -> canopy, the match cut (p 0.58–0.59)

- **pass [1, 2, 5, 6, 7, 8]** The ring front bites as it travels (clean ring at t = 0), its crest is a gaussian band
  65% printed through Bayer with the chroma split, the canopy arrives pushed in about the fruit on a drifting point,
  offset and smeared along the ring's travel; coda -> matchcut diff 0.000, matchcut -> questions differs only by the
  canopy loop's own motion (4.25 vs a same-p baseline of 3.68).
- **note [3]** The canopy inside the halo's ring prints in through a Bayer dither over the first 10% of the cut
  (`uReveal`); the annulus between peel and ring is 0.3 radii wide and mostly the canopy's own blue, so nothing is
  seen switching on. Left.

### Questions -> Application, the moire (p 0.76–0.79)

- **pass [1, 2, 4, 5, 6]** One screen carries the cut: the gap's bare screen beats against a second, the branches
  dissolve from the gap outward on a bitten distance, the dots grow and merge (400%: round dots to star-shaped gaps
  to paint), the figure resolves last; questions -> moire differs only by the loop's motion, moire -> application
  diffs 0.000.
- **tell [7]** The painting's dolly settles about the gap's centre with no sideways drift, where every other push
  on the page (the Split, the parchment, the match cut) drifts its point a few percent as it moves. Made the same.
- **note [3]** The scrim behind the form comes in over the cut's second half, with the form's own pieces (first piece
  at t ~0.55 of the cut): it is the form's ground arriving with the form. Left.

### Application -> finale, the rise and the finale (p 0.90–1.00)

- **pass [1, 2, 4, 5, 6, 13]** The sapling prints from its foot on a bitten front, displaced toward the foot and
  smeared the way it grows; the finale loop prints in from the open sky (a colour already on screen) and the
  wordmark's dots have their own sizes; application -> rise and rise -> finale diff 0.000.
- **note** The finale's bite adds `fbm4(..)·0.30 + fbm4(..)·0.10` without centring the fields (a constant 0.2
  offset the front's travel absorbs); unified with the shared bite, which is centred.

### Rest states (hero, model, plate, sheet, panel, coda, canopy, application, finale)

- **pass [9, 13, 15]** Every rest state holds as a picture; breath is the shared three-sine sum plus the kick in
  every painting pass, the paper's light is its own sum of sines, the halo breathes 0.6% by the same sines.
- **tell [13, one hand]** The hero's three clouds sway on hand-written sines (two per instance plus one in y) while
  every other cloud on the page sways through `cloudSway()` (periods from size, phase from seed). Unified.
- **latent [5]** The Work's print front starts 0.065 plate-v under the frame while its lag reaches 0.12 frame heights,
  so at t = 0 the frame's lowest rows sample the plate displaced by up to ~4 px; invisible because the plate there is
  flat sky (split -> work diff 0.000). The lag now eases in over the chapter's first 8% (rule 4).
- **note [7]** The Work's creep is a 0.6%-per-10% zoom about the frame centre over the whole chapter, as phase 7
  specified it; a chapter-long drift, not a push at a cut. Left.
- **tell [15]** (the hero at rest, on 16:9 laptops; the carry-over from phase 14) The paragraph sits under the title
  block and the block is sized by the height, so on short landscape frames the paragraph runs across the attendant
  standing lower left, whose head is at 45% of the height: at 1280x720 its last two lines cross her face (paragraph
  bottom 376 px, her head from 340), at 1366x768 its third line lies on her hair (386 against 360), at 1536x864 it
  overlaps by 11 px; at 1440x900 it clears by a few px and at 1920x1080 by 60. A still with the copy on the figure's
  face is not one to hang. Fixed in the stylesheet, below.
- **note** The chrome's ground switch at the bridge (t 0.6), the Split (0.45) and the close (0.56) is a class switch
  eased by CSS over 420 ms; inside the parchment push it follows `uFlat` exactly. The picture changes under a
  travelling front there, which no frame-wide element can follow; left.
- **tell [11]** (found by the scrub tooling, on the home page) The Questions title and the application form stayed on
  screen over the model and the hero after a fast backwards glide from the finale. Both layers gate on `near`, set
  the root `visibility: hidden` and return; a piece written at alpha 1 on the last near frame keeps its own inline
  `visibility: visible`, and CSS lets a child's explicit `visible` show through a hidden parent. A chapter-menu jump
  moves about 7% of the page in its first frame, so a reader can cross a chapter between two frames and keep its
  copy. The root's opacity now goes to 0 with its visibility (`QuestionsCopy.tsx`, `ApplicationCopy.tsx`); every
  other layer already writes its pieces to 0 when not near.

### One hand (task step 3)

Six places implemented the halftone print-in (hero, work, terms' margin orange, moire, rise, finale), in two
families (`0.76·v` dots on the orange ground; `sqrt(cov)·0.82` dots with printed gaps), at angles 15° and 17.8°;
ten passes carried their own copy of the film grain; every cut wrote its own two-field bite and its own
Bayer-plus-stipple edge; the hero's ring and the match cut's crest each wrote the gaussian band with the chroma
split. All of these now come from the GLSL library (`bite2`, `printEdge`, `printStipple`, `screenCell`, `dotGrow`,
`printIn`, `crestBand`, `filmGrain`) with per-section parameters (cell pitch, amplitudes, seeds), see "Fixes".

## Fixes

Tuned in each cut's order (front speed, bite, band widths, lag distance, smear), then easing, then hashing; no cut
changed what it is, and every scroll-driven term is still a pure function of smoothed `p`.

- **The Split's bands are measured across the front.** `src/stage/passes/split/frag.ts` divides the printed front
  distance by the metric's gradient (`gradR = |(q.x, 0.38²·q.y)| / r`: 1 across the seam, 0.38 along it) and every
  band reads that: `edgeS = edge / gradR`. The rind, pith, zest and lag are now the same width all round the
  opening. Retuned by eye (`?tune=`) and written back as the defaults in `split/tune.ts` and the table in
  `docs/TRANSITIONS.md`: rind 0.18 -> 0.09; pith in/peak/out -0.07/-0.09/-0.24 -> -0.012/-0.024/-0.07 (a rim 0.07
  deep, saturated over its first 0.024); zest 0.04 -> 0.03; the lag keeps 0.12, now uniform. The carry-over
  suggestion (`pithIn:-0.05,pithPeak:-0.07,pithOut:-0.16`) narrowed the band but left it a column; the gradient was
  the cause.
- **The Work's lag eases in** (`passes/work/frag.ts`): `lag *= smoothstep(0, 0.08, uT)`, so the first frame of the
  chapter is the Split's last to the pixel whatever the plate's top holds (rule 4; latent with the placeholders).
- **The moire's dolly point drifts** (`passes/application/frag.ts`): `o += (0.03, 0.01) · push`, where push is the
  settling dolly's remaining excess, the same gesture as the match cut's (rule 7); the end frame is unchanged.
- **The hero's clouds sway through `cloudSway()`** (`passes/hero/frag.ts`), periods from size, phase from seed,
  like every other cloud on the page (rules 9, 13).
- **Copy layers cannot be left on screen** (`QuestionsCopy.tsx`, `ApplicationCopy.tsx`): the chapter root's
  opacity goes to 0 with its visibility when the chapter is not near, so a jump or a fast glide across the chapter
  leaves nothing behind (rule 11); checked by gliding from p 0.992 to 0.0735 to 0.001 on the production build and
  reading the roots (`visibility: hidden; opacity: 0`) and the frame.
- **One library for the gestures** (`src/stage/gl/lib.glsl.ts`), each pass keeping its own numbers:
  - `bite2(q, f1, a1, f2, a2, s1, s2)`: the two-field bite, centred. Used by the static cut, the Split, the Work,
    the parchment, the soak, the burn, the match cut, the rise, the hero's and the finale's print-in fronts
    (which keep a +0.2 term so nothing is printed at a = 0, as before) and the margin orange.
  - `printEdge(frag, bayer, stipple)` and `printStipple(frag)`: the printed boundary. Used everywhere a front
    had its own Bayer-plus-hash line (the static cut, the Split, the parchment, the soak, the window, the burn,
    the match cut, every print-in's gaps).
  - `screenCell`, `dotGrow`, `printGaps`, `printMerged`, `printIn`, `printAlpha` and `PRINT_ANGLE` (15°): the
    halftone print-in. The Work, the moire and the rise are the same math as before through it; the margin
    orange, the hero's print-in (9 px cells, formerly 17.8°, coverage now read at the cell centre so every dot
    is a circle), the finale's print-in and its wordmark (6.5 px cells, formerly 17.8°) now use it too, so the
    two families are one.
  - `crestBand(edge, split, sigma2)`: the ring's gaussian crest with the chroma split (the hero's ring, the
    match cut's crest).
  - `filmGrain(frag, tm, amp)`: the grain, ±1.5% from the hero to the plate, ±1.2% from the coda on; each pass's
    `grain()` is a one-line call.
- **The hero's stack tightens on short landscape frames** (`HeroCopy.module.css`): at `(max-height: 880px) and
  (min-aspect-ratio: 3/2)` the title goes to 6.4vh, the block's gaps to 0.6rem, the button's margin to 0, the
  paragraph's leading to 1.3 and the block sits 1vh under the top rule, so the paragraph's last line clears the
  attendant's head: 1280x720 324 px against 340, 1366x768 328 against 360, 1280x800 329 against 364, 1536x864 336
  against 389 (measured on the production build with the copy on, `docs/screenshots/cuts/hero-rest-1280x720.png`);
  1440x900 (404) and 1920x1080 (422) are unchanged. The phone stack (`max-aspect-ratio: 4/5`) is untouched.
- **Two exact fast paths at the cuts that measured heaviest** (task step 5, rule 14; the numbers are under
  "Performance" below): the moire (`passes/application/frag.ts`) now reads a cell's arrival `m` first and takes
  the landed painting in one tap where `m = 1` (the lag is 0, the print-in is the painting exactly and the bare
  screen's radius is 0, so the canopy, the tone's five taps, the print-in and the second screen are skipped) and
  the canopy alone where `m = 0` (the print-in on its ground is its ground: no dot, the gaps' threshold never
  reached); the finale's print-in (`passes/finale/frag.ts`) skips both bites in a cell provably ahead of every
  possible front (`d0 >= 0.2`, the bite being within +-0.2, while the merge term is still 0). Both branches
  reproduce the full path's value, so no still changed.
- Every pass compiles and draws (`/stage-test` glided through all 17 segments with the console captured: no
  shader or runtime errors; HUD `pass` names all their own, none `fallback`).

## Scrub and pop, before the fixes

Production build of the committed tree, home page, 1440x900 at dpr 1, clock fixed, 40 steps across each cut
forward then backward (the drawing over its first 90%, the model cut over its 70 units), the DOM layers hidden
for the shots. "Scrub" is the mean per-pixel difference (0..255) between the forward and backward frame at the
same p, averaged over the steps, and the worst step; "pop" the largest change between consecutive forward
frames, with where it sits (six horizontal bands, top to bottom). The copy layers were still visible in the
frames of this run (the stuck-copy tell above was found by it), so its pops carry the copy's own ramps as well.

| Cut | Scrub mean | Scrub worst step | Largest pops at | Pop mean / median |
| --- | --- | --- | --- | --- |
| Split | 0.000 | 0.000 (every step identical) | t 0.375–0.45 (the halves parting), all bands | 23.0 / 3.8 |
| Close | 0.287 | 0.600 at t 0 | t 0.50–0.63 (the front mid-frame), top and bottom bands | 13.9 / 5.5 |
| Match cut | 1.876 | 6.93 at t 1 (the canopy loop plays on) | t 0.43–0.5 and 0.75 (the ring crossing), top band | 10.8 / – |
| Moire | 2.997 | 6.84 at t 0.05 (the canopy loop) | t 0.35–0.4 (the gap's screen), then 0.83–0.85 (the leaves, bottom band) | 9.3 / – |
| Parchment | 0.011 | 0.089 at t 0 | t 0.40–0.50 (the fill's middle), every band but the bottom | 15.1 / – |
| Drawing | 0.089 | 0.206 at t 0.72 | t 0.43–0.50 (the window's retreat), lower bands; t 0.135 (the soak) | 9.5 / – |
| Rise | 0.011 | 0.078 at t 0 | t 0.125–0.175 | – |
| Finale | 2.274 | 4.17 at t 0.925 (the finale loop) | t 0.225–0.30 (the loop printing in from the sky), middle bands | 18.9 / 3.0 |
| Bridge | 0.570 | 2.04 at t 0.075 (the hero loop) | t 0.325–0.425 (the crest crossing), lower bands | 23.8 / 3.8 |
| Model cut | 0.000 | 0.000 | the crest's 35–39 units, top band | 7.8 / 0.6 |

Reading: every cut without a playing loop is reversible to the pixel or within the breath (the sheet's light
moves at the fixed clock's frozen time, so even the paper is identical); the four cuts with a loop under them
(hero, canopy, finale) differ only by the loop's own frames, at the same level as a same-p baseline taken 0.7 s
apart (3.7 for the canopy, see the boundary table). The largest consecutive change sits at the crest in every
cut; nothing switches on away from it.

## Performance (task step 5)

Method: production builds of the phase-14 tree (A, the commit before this phase) and of the fixed tree (B) served
side by side on this machine (Apple M2 Pro, 19 GPU cores; Chrome headless on the Metal backend; 1440x900 at dpr 2,
a 2332x1458 buffer of 3.4 Mpx) and measured back to back at each position, loaded fresh with `?p=`, the clock
fixed, `?finish` so a drawn frame waits for the GPU through the one-pixel readback. At rest the engine draws on
the breath, every second frame, so the HUD's running mean is half of a drawn frame's time; the figure below is the
drawn frame itself (2 x the HUD mean, 32 readings after the page settled), the drain of the readback included,
which is twice what the phase-14 tables in `docs/PERF.md` carry. Two things to read it by:

- The floor is the readback. The application at rest, one tap and the grain, measures 3.0 ms, so about 3 ms of
  every figure is the drain plus the DOM layers' frame work, and the pass's own cost is the rest: the moire about
  6 ms, the match cut and the drawing about 5, the parchment, the close and the bridge's crest 3 to 5, the chapters
  at rest 0.3 (the model) to 3 (the hero, the panel). The same build loaded twice differs by up to 1.5 ms (the
  bridge at 0.2: 6.3 against 7.7 for a pass that did not change between A and B), and under a playing loop (the
  hero, the canopy, the finale) the uploads make the engine draw on more than every second frame, so those rows
  carry more noise still.
- `?repeat=N` cannot measure the fragment cost here: N opaque full-frame draws into one target are shaded once
  on this tile-based GPU (the slope of the frame time against N came out at 0.02-0.09 ms for every pass, the
  moire the same as the one-tap application), so the per-draw numbers that method gives are the tiler's, not the
  shader's. Noted so the next reader does not rely on it on a Mac.

Drawn frame, ms, GPU-synced, before (A) and after (B):

| Position | Pass | A | B | | Position | Pass | A | B |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bridge 0.2 | bridge | 6.34 | 7.67 | | moire 0.2 | moire | 9.37 | 9.04 |
| bridge 0.5 | bridge | 5.54 | 6.17 | | moire 0.5 | moire | 9.61 | 9.14 |
| bridge 0.8 | bridge | 5.57 | 4.00 | | moire 0.8 | moire | 9.07 | 8.41 |
| split 0.2 | split | 4.17 | 4.35 | | rise 0.2 | rise | 3.57 | 3.36 |
| split 0.5 | split | 6.48 | 6.40 | | rise 0.5 | rise | 6.13 | 5.37 |
| split 0.8 | split | 4.59 | 4.52 | | rise 0.8 | rise | 6.03 | 5.23 |
| parchment 0.2 | parchment | 6.30 | 5.67 | | finale 0.2 | finale | 8.68 | 7.61 |
| parchment 0.5 | parchment | 7.38 | 7.88 | | finale 0.5 | finale | 5.37 | 6.06 |
| parchment 0.8 | parchment | 7.32 | 7.69 | | finale 0.8 | finale | 5.15 | 6.34 |
| drawing 0.2 | terms | 8.55 | 8.02 | | model cut 0.5 | model | 8.06 | 7.74 |
| drawing 0.5 | terms | 7.57 | 7.12 | | rest hero | hero | 6.07 | 5.89 |
| drawing 0.8 | terms | 6.58 | 7.30 | | rest model | model | 3.30 | 3.05 |
| close 0.2 | close | 7.17 | 6.67 | | rest work | work | 5.36 | 5.43 |
| close 0.5 | close | 7.95 | 7.70 | | rest sheet | sheet | 5.50 | 5.72 |
| close 0.8 | close | 5.76 | 5.47 | | rest panel | terms | 6.37 | 6.61 |
| match cut 0.2 | matchcut | 7.98 | 8.28 | | rest coda | coda | 4.68 | 5.29 |
| match cut 0.5 | matchcut | 8.76 | 7.25 | | rest questions | questions | 4.94 | 5.69 |
| match cut 0.8 | matchcut | 8.20 | 8.40 | | rest application | application | 2.99 | 3.01 |
| | | | | | rest finale | finale | 5.24 | 5.08 |

Reading: no position moved outside the run-to-run spread, so the shared library, the Split's bands and the copy
layers' change cost nothing measurable; the moire is 0.3-0.7 ms lower at all three of its positions and the finale
at 0.2 (where most of the frame is ahead of the front) 1.1 ms lower with the fast paths, both at the edge of the
noise on this GPU, where they are a tenth of the frame; on a phone's GPU the same skipped work is a larger share.
Every cut frame and every rest frame is under 10 ms with the 3 ms drain in it, against the 16.7 ms budget; the
phone figures of phase 14 (0.8 to 2.4 ms at the band's 0.79 Mpx) were not re-taken, the passes' pixel work being
the same or less.

## Continuity (task step 4)

The frame at the end of each segment (p = end − 1e-6) against the frame at the start of the next (start + 1e-6),
production build of the fixed tree, dpr 1, clock fixed, DOM layers hidden; for the segments drawn over a playing
loop a second frame at the same p 0.7 s later gives the loop's own motion as a baseline.

| Boundary | Mean diff | Pixels over 8 | Loop baseline |
| --- | --- | --- | --- |
| hero -> bridge | 1.147 | 2.78% | 1.183 (the hero loop) |
| bridge -> model, model -> split, split -> work, work -> parchment, parchment -> sheet, sheet -> drawing, drawing -> panel, panel -> close, close -> coda, coda -> matchcut | 0.000 | 0.00% | – |
| matchcut -> questions | 4.179 | 16.8% | 3.605 (the canopy loop) |
| questions -> moire | 3.292 | 13.8% | 3.873 (the canopy loop) |
| moire -> application, application -> rise, rise -> finale | 0.000 | 0.00% | 0.000 |

So the pan and scale at the end of every pass equal those at the start of the next to the pixel; the `uVel`-driven
terms (the static tear, the zest, the sparks, the parchment's radial smear, the drawing's smear) are all
multiplied by a velocity that the clock snaps to zero at rest, so they are gone in every held frame; breath is
the one `restBreath` on the one `uTime` in every painting pass and the sheet's light is the paper's own sum of
sines, so no boundary resets it; the chrome's colours follow `uFlat` exactly through the parchment and switch
with the ground elsewhere (see the note above). The same boundaries on the committed tree were also 0.000 /
baseline-level before the fixes.

## Second look, stills (after the fixes)

Production build of the fixed tree, the same positions, the DOM layers hidden by opacity (`docs/screenshots/cuts/`):

- Split 0.2: the opening is a narrow stippled slit between the halves with a thin grey edge; the smoke column is
  gone. 0.5: a thin pale rim with zest specks all the way round a tall jagged opening, the plate's clouds
  drifting inside, the halves smeared outward. 0.8: the plate's sky. All three hang.
- Bridge 0.5 and the model cut: the crest band's tear, mosaic and glyph rubbing inside the band only, the reel's
  own morph behind it; unchanged by the shared bite and edge (the scrub at t 0.36 is the specified static).
- Parchment, drawing, close, match cut: unchanged to the eye (the same math through the library).
- Moire 0.5: the gap's two screens beating, the clouds merged, the branches dissolving from the gap outward;
  the settling dolly's drift is not visible as such (a few percent on a settling push), which is the point.
- Rise 0.5, finale 0.2 and 0.5: the sapling printing from its foot; the loop's dots growing in the sky above the
  figure; "Ora" with the loop under it and the pour running.
- Hero at rest, bare; the Work at rest with its print edge (round dots growing into star-shaped gaps into paint);
  the parchment at 0.2, 0.5 and 0.8 (the plate pushed in, the far paint draining to paper around the parchment,
  the ghost of the drawing on the finished sheet); the sheet, the panel, the coda, the canopy, the application and
  the finale at rest, each a picture by itself.
- The Split at t 0.325, 0.375 and 0.55 (the scrub's own frames, the carry-over's t 0.3-0.4): the opening is a
  tall jagged slit with a cream rim of one width down both sides, zest on the cut, the halves smeared outward with
  the hands still holding them; the rim reads as the cut face's pith, not as a band, so the carry-over's narrower
  `?tune=` was not needed once the bands were measured across the front.
- The hero with its copy on at 1280x720, 1366x768, 1280x800 and 1536x864 (the compact stack): the paragraph's last
  line sits in open sky above the attendant's head; at 1440x900 and 1920x1080 the frame is as before.
- The moire and the finale re-taken on the final build (the fast paths) and diffed against the run above, same
  positions, same fixed clock: moire 0.8 mean 0.73 with the four middle bands at 0.00-0.37 (the arrived cells are
  the same pixels; the bottom band, 3.3, is the leaves still dissolving over the playing loop), finale 0.2 mean
  0.14 with the three lower bands at 0.00 (everything ahead of the front is the rise's frame to the pixel; the
  0.5 in the upper middle is the loop printing in), and moire 0.2 / 0.5 and finale 0.5 / 0.8 at 3.1-4.2, the
  level of the canopy and finale loops' own motion in the boundary table. The stills read as before.

## Scrub and pop, after the fixes

The same run (production build of the fixed tree, 40 steps forward then back, dpr 1, clock fixed, DOM layers
hidden), so the two tables compare directly:

| Cut | Scrub mean | Scrub worst step | Largest pops at | Pop mean / median |
| --- | --- | --- | --- | --- |
| Split | 0.000 | 0.000 (every step identical) | t 0.325–0.375 and 0.525–0.55 (the opening widening), all bands | 13.6 / 2.2 |
| Close | 0.000 | 0.012 at t 0 | t 0.525–0.65 (the front mid-frame), top and bottom bands | 13.9 / 5.4 |
| Match cut | 1.867 | 6.89 at t 1 (the canopy loop plays on) | t 0.425–0.5 and 0.75 (the ring crossing), top band | 10.9 / 8.1 |
| Moire | 2.815 | 6.35 at t 0.275 (the canopy loop) | t 0.30–0.40 (the gap's screen), then 0.85 (the leaves, bottom band) | 9.6 / 5.6 |
| Parchment | 0.000 | 0.000 | t 0.40–0.50 (the fill's middle), every band but the bottom | 15.3 / 3.0 |
| Drawing | 0.084 | 0.195 at t 0.765 (the nearest decoded frame) | t 0.43–0.50 (the window's retreat), lower bands; t 0.135 (the soak) | 9.6 / 7.7 |
| Rise | 0.000 | 0.000 | t 0.10–0.20 | 2.3 / 1.0 |
| Finale | 2.314 | 4.12 at t 0.925 (the finale loop) | t 0.225–0.30 (the loop printing in from the sky), middle bands | 20.4 / 3.1 |
| Bridge | 0.541 | 1.85 at t 0 (the hero loop) | t 0.325–0.425 (the crest crossing), lower bands | 24.5 / 3.7 |
| Model cut | 0.000 | 0.000 | the crest's 34–39 units, top band | 7.9 / 0.6 |

The Split's largest step fell from 23.0 to 13.6 with the rim (less of the frame changes colour per step now that
the pith is a rim and the rind a thin edge); everything else is within noise of the first table, and every cut's
largest change is still at its crest.
