# Transitions

Every cut on the page is the same gesture: a front bitten by noise, something happening at the crest, the new picture still moving when it is uncovered. There are no crossfades and no straight-edged wipes anywhere. All cuts obey `docs/MOTION-RULES.md`.

## The cuts

| Cut | p | What happens | Crest |
| --- | --- | --- | --- |
| Hero → Model | 0.04–0.07 | Not a shader cut: the bridge is a 121-frame morph scrubbed by scroll, and it transforms the scene in place (the camera tilts up, the plinth turns to bark from the bottom up, its top slab lifts away like a cap, leaves sprout, a knife falls past the lens, the ground goes paper-white). The hero's dotted rings keep pulsing across the sky while it plays, their dots shifting from milk to ink as the ground whitens, and are gone by the time the knife is at rest. The shader hands film to reel through the static treatment: a diagonal wave from the bottom-right corner (`d = ((1-x)*aspect + y)/(aspect+1)`, bent by slow noise); ahead of it the film, behind it the reel; at the crest a horizontal tear with hashed row shifts, a mosaic that starts coarse and resolves as the crest passes, a chroma split of ±0.006 along x, and a 5x5 bitmap-font ASCII rubbing of the luminance inside the crest band only. The pan is keyed to the reel's frames so the orange never jumps. | Tear, mosaic, chroma split, glyphs |
| Graft → grove → share (inside The Model) | 0.07–0.19 | Push-through: leaves from the scion sweep across the lens (procedural leaf shapes with their own seeds and speeds, smeared along the push) and the static treatment at a quarter of its amplitude takes graft to canopy underneath them. Grove to share is a match cut on the gilded orange (same screen position and scale on both sides, so the fruit does not move while everything around it changes). Inside `share`, the slice is a thin front along the knife's line, bitten by noise, not a crossfade. | Leaves, tear at quarter amplitude, knife-line front |
| Model → Work | 0.19–0.22 | The Split, below. | Pith, zest, stipple, bleeding dots |
| Work → sheet | 0.37–0.40 | The camera pushes into the parchment the figure holds (cover-fit the parchment region of the plate with its own zoom and centre) while `uFlat` takes the whole frame to the paper colour; pulp, fibre and tooth are multiplied by the same `uFlat`, so the paper arrives as the colour arrives. A faint shadow of the orange survives in the sheet for the first half of the fill. | None: a push and a colour |
| Sheet → drawing | 0.42–0.44 | The drawing soaks in from the middle on a radius bitten by two scales of noise, holding the whole frame, as a smudge that resolves into line. `coverage = clamp(t*4.2 - dist*1.9 + (fbm(uv*3)-0.5)*0.7, 0, 1)`. | Ink patches spreading and joining |
| Drawing → panel | 0.42–0.48 | As the orbit turns to plan, the window draws back from full frame to a square panel in the left margin, one rect interpolated with the sampling following it; its edge is brushed by a broad tear and a finer fray across a wide band. The picture zooms inside the cutout, not with it. Size eases with `t*(0.6 + 0.4*t*t)` behind a smoothstep ramp over the first 15% (rule 4: the window leaves the full frame from rest); the centre follows the size with a 220 ms lag so the panel settles after it shrinks. | Frayed edge |
| Sheet → blue | 0.50–0.53 | The sheet burns from the bottom left. Two decorrelated fbm fields bend the front; ordered dither and hash stipple print its boundary; the side about to go carbonises in a band that travels with the front (scorch multiplied into the sheet, so the paper keeps reading through the char); an ember glow sits on the cut; the blue coda arrives offset in the direction of travel with `lag = exp(-distBehindCut/0.12)` and settles. The stipple is gated on coverage so nothing speckles ahead of the front. | Char, ember, stipple |
| Halo → canopy | 0.58–0.59 | Match cut on the fruit: the picked orange's screen position and scale are driven to the nearest orange of the canopy (located once with `uncover()` on the canopy's first frame) while its halo opens outward as a ring front and the canopy is inside it. The copy fades out underneath. | Halo breath, chroma split |
| Questions → Application | 0.76–0.79 | The sky gap takes a coarse halftone screen (cell 10px × dpr, laid at 15° so it moirés against the pixel grid); the branches dissolve from their inner edges outward through the same screen; the next painting's clouds arrive first as giant dot-screen clouds whose dots grow until they merge into paint, and the figure resolves last. | Growing dots, moiré |
| Application → finale | 0.90–0.98 | The rise: the sapling prints in from its base upward, the constellation retracts to the fingertip one line at a time with a `0.62/(n-1)` stagger, and the finale loop takes the frame on a colour already on screen. | Retracting hairlines |

## The Split in full (Model → Work)

The cut is the cut in the picture. The last reel frame is two hands holding the halves of the orange apart, and the picture opens exactly there, as a vertical seam that widens; the halves are pushed off the frame, smeared the way they go, and the plate's sky with its halftone cloud is already drifting underneath. The cobalt does not wipe in: it bleeds outward from the seam as a coarse halftone, dots that grow until they merge, with a grainy stipple at the edge; and the halves and hands that are pushed aside smear and then pixelate into chunky dots as they leave. The cut face has a rim of white pith, so the seam's edge is pith, and the rind sprays zest where it tears. The page settles on flat cobalt with one small halftone cloud, ready for the first Work card. It runs over p 0.19–0.22, local t 0→1, and every term is a function of t, so scrubbing back closes the fruit again.

| Phase | t | Film A (the halves) | Plate B (sky of the scaffold painting) | Crest |
| --- | --- | --- | --- | --- |
| Rest | 0.00–0.10 | Untouched | Not drawn (fast path) | None |
| Part | 0.10–0.75 | A narrow tall front opens from the seam point and widens; the halves are displaced apart along x with the sign ramped through zero across the seam, smeared along x, and the frame pushes in about the seam point; a rind band ahead of the cut desaturates and darkens; within 0.30 frame heights of the front the halves and hands pixelate into dots whose cells grow as they are pushed out | Appears behind the cut offset toward the seam by lag, settling as the front leaves; arrives as a halftone screen whose dots grow until they merge into flat cobalt; held at scale 1.18 about the seam point; its single small halftone cloud already drifting | A pith rim 0.07 deep behind the cut, the same width all round the opening; zest specks on the cut, denser when the scroll is fast |
| Settle | 0.65–1.00 | Softens radially from the seam point in the last quarter as the halves reach the frame edges, then gone | Eases back from 1.18 to 1.00 with the seam point drifting 3% right and 1% down; lag decays to 0 | Pith thins to nothing by t = 1 |

Parameters, in tuning order (front speed, bite, rind width, lag distance). Band widths are in frame
heights across the front (phase 15): the printed front distance is divided by the metric's gradient
before any band reads it, so a rim is the same width along the seam as across it.

| Name | Value | What it does |
| --- | --- | --- |
| origin | `uncover(seam)` | The gap between the halves in the reel's last frame, mapped to screen uv |
| metric | `r = length(q * (1.0, 0.38))` | Narrow in x, tall in y: a vertical seam widening, not a horizontal wipe |
| front | `r − R(t) + bite2(q, 2.2, 0.30, 5.1, 0.10)` | Two decorrelated fbm fields, 4 octaves; the finer one drifts with 0.4t + 0.02·time |
| R(t) | `tt·(0.55 + 0.45·tt²)·1.6 − 0.10`, tt = (t−0.10)/0.65 | Accelerates; clears the side edges by t = 0.75 |
| edge | `front + printEdge(frag, 0.03, 0.02)` | The printed boundary: Bayer 0.03 and hash stipple 0.02 |
| open | `1 − smoothstep(−0.004, 0.004, edge)` | Narrow against the print's ±0.024, so every boundary pixel is one picture or the other: dots and stipple, not an alpha ramp (at ±0.02 it was a dithered ramp, phase 16) |
| edgeS | `edge / ‖∇r‖`, `‖∇r‖ = length(q.x, 0.38²·q.y) / r` | The front's distance in frame heights: 1 across the seam, 0.38 along it; every band below reads this |
| sgn | `clamp(q.x / 0.06, −1, 1)` | Which half a pixel belongs to, ramped through zero at the seam |
| parting | `sgn · smoothstep(0, 0.6, tt) · 0.09` | How far each half has left, along x |
| rind band | `smoothstep(0.09, 0, edgeS)` | Ahead of the cut only: A desaturates 30% and darkens 25% |
| pith rim | `smoothstep(0,−0.012,edgeS)·smoothstep(−0.07,−0.024,edgeS)` | Saturated 0.012–0.024 inside the opening, released by 0.07; fades over t 0.75→1; fibre runs along the seam |
| lag | `exp(−max(−edgeS,0)/0.12) · (1 − smoothstep(0.7,1,t))` | 1 at the cut, gone 0.12 past it, all the way round |
| plate scale | `mix(1.18, 1.0, smoothstep(0.55, 1, t))` about origin | The arrival into the plate |
| zest | `step(0.985, hash(cell3px, floor(time·6))) · smoothstep(0.03, 0, |edgeS|) · (0.6 + 0.4v)` | Oil specks, additive warm white; v = clamp(|uVel|/40, 0, 1) |
| chunk | `smoothstep(0.30, 0, edgeS) · (1 − pass) · smoothstep(0.05, 0.25, tt)` | Ahead of the front only: A is re-sampled at the centre of coarse rotated cells (4 px growing to 18 px × dpr with chunk) and drawn as a halftone dot screen at 15°, dot radius from luminance, on the paper colour |
| bleed | `depth = clamp(−edgeS / 0.12, 0, 1)`, dot radius `√depth · 0.72 · cell` | Behind the front only: B shows through the same screen, 10 px cells at 15°, dots growing until they merge at depth 1; outside a dot the pixel stays A, so every pixel is still one picture or the other |
| fast paths | `r > R + 0.40` → A only; `r < R − 0.95` → B only | Most of the frame at rest costs two taps |

Shader skeleton (helpers `fbm`, `bayer4`, `hash`, `smear5`, `blur`, `cover`/`uncover` and the shared
gestures `bite2`, `printEdge`, `filmGrain` come from the engine's GLSL library):

```glsl
// uT: local progress 0..1 (smoothed scroll)  uVel: scroll px/frame  uTime: seconds
// uOrigin: the seam between the halves in screen uv  uRes: pixels  A(): reel last frame  B(): plate
vec2 dollyAbout(vec2 uv, vec2 o, float s){ return o + (uv - o) / s; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float t = uT, v = clamp(abs(uVel) / 40.0, 0.0, 1.0);
  float push = t * (0.45 + 0.55 * t * t);
  vec2 o = uOrigin + vec2(0.03, 0.01) * push;                  // the seam point drifts as the push accelerates
  float ar = uRes.x / uRes.y;
  vec2 q = (uv - o) * vec2(ar, 1.0);
  float sgn = clamp(q.x / 0.06, -1.0, 1.0);                   // which half, ramped through zero at the seam

  float tt = clamp((t - 0.10) / 0.65, 0.0, 1.0);
  float R = tt * (0.55 + 0.45 * tt * tt) * 1.6 - 0.10;
  float r = length(q * vec2(1.0, 0.38));                       // vertical seam, widening
  float gradR = length(vec2(q.x, 0.38 * 0.38 * q.y)) / max(r, 1e-4);   // |grad r|: 1 across the seam, 0.38 along it

  // fast paths: provably ahead of / behind every possible front
  if (r > R + 0.40) { gl_FragColor = vec4(A(uv), 1.0); return; }
  vec2 uvB = dollyAbout(uv, o, mix(1.18, 1.0, smoothstep(0.55, 1.0, t)));
  if (r < R - 0.95) { gl_FragColor = vec4(B(uvB), 1.0); return; }

  float front = r - R + bite2(q, 2.2, 0.30, 5.1, 0.10, vec2(7.0), vec2(-3.0) + vec2(0.0, t * 0.4) + uTime * 0.02);
  float edge = front + printEdge(gl_FragCoord.xy, 0.03, 0.02);
  float pass = 1.0 - smoothstep(-0.004, 0.004, edge);            // 1 = plate shows; each pixel one or the other
  float edgeS = edge / gradR;                                     // the front's distance in frame heights, all round

  // the halves part: displaced apart along x, smeared the way they go, pushed in about the seam
  float part = smoothstep(0.0, 0.6, tt);
  vec2 dA = vec2(sgn * part * 0.09 / ar, 0.0);
  float rind = smoothstep(0.09, 0.0, edgeS) * (1.0 - pass);
  vec3 a = smear5(A, dollyAbout(uv, o, 1.0 + 0.10 * push) - dA, vec2(sgn, 0.0), part * 0.025 + rind * 0.01);
  a = mix(a, vec3(dot(a, vec3(0.30, 0.59, 0.11))), 0.30 * rind) * (1.0 - 0.25 * rind);
  float soft = smoothstep(0.7, 0.95, t) * length(q) * 0.006;    // near the lens, last quarter only
  a = mix(a, blur(A, uv - dA, soft), step(0.001, soft));

  // pushed aside, the halves and hands pixelate into chunky dots
  float chunk = smoothstep(0.30, 0.0, edgeS) * (1.0 - pass) * smoothstep(0.05, 0.25, tt);
  if (chunk > 0.001) {
    float cellA = mix(4.0, 18.0, chunk) * uDpr;
    vec2 cc = cellCentre(gl_FragCoord.xy, cellA, 0.2618);                       // 15 degrees; centre in pixels
    vec3 ac = A(dollyAbout(cc / uRes, o, 1.0 + 0.10 * push) - dA);               // the colour at the cell's centre
    a = mix(a, mix(vec3(0.94, 0.92, 0.87), ac, dotShape(gl_FragCoord.xy, cellA, 0.2618, dot(ac, vec3(0.30, 0.59, 0.11)))), chunk);
  }

  // the plate still catching up with the edge that uncovered it
  float lag = exp(-max(-edgeS, 0.0) / 0.12) * (1.0 - smoothstep(0.7, 1.0, t));
  vec2 dB = vec2(-sgn * lag * 0.05 / ar, 0.0);
  vec3 b = smear5(B, uvB + dB, vec2(sgn, 0.0), lag * 0.02);

  // the pith rim, then zest on the cut
  float pith = smoothstep(0.0, -0.012, edgeS) * smoothstep(-0.07, -0.024, edgeS) * (1.0 - smoothstep(0.75, 1.0, t));
  float fib = fbm(vec2(q.x * 40.0, q.y * 6.0));                  // fibre runs along the seam
  vec3 pithCol = mix(vec3(0.98, 0.95, 0.88), vec3(0.90, 0.83, 0.68), fib);
  float zest = step(0.985, hash(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 6.0))) * smoothstep(0.03, 0.0, abs(edgeS)) * (0.6 + 0.4 * v);

  // the cobalt bleeds in as dots that grow until they merge
  float depth = clamp(-edgeS / 0.12, 0.0, 1.0);
  float dotsB = depth >= 1.0 ? 1.0 : dotMask(gl_FragCoord.xy, 10.0 * uDpr, 0.2618, sqrt(depth) * 0.72);
  float showB = pass * dotsB;

  vec3 col = mix(a, mix(b, pithCol, pith * 0.9), showB);
  col += vec3(1.0, 0.93, 0.70) * zest + filmGrain(gl_FragCoord.xy, uTime, 0.03);
  gl_FragColor = vec4(col, 1.0);
}
```

`cellCentre(fragCoord, cell, angle)` returns the centre, in pixels, of the rotated halftone cell that contains the pixel; `dotShape(fragCoord, cell, angle, lum)` returns 1 inside the dot of that cell, radius `√lum · 0.72 · cell`, 0 outside; `dotMask(fragCoord, cell, angle, radius01)` is the same with the radius given as a fraction of the cell. All three live in the engine's GLSL library next to the hero's halftone cloud code, so the hero, the plate and the cut share one screen.

Why it is not mechanical: the cut is already in the picture (rule 15); the front is a tall narrow field bitten twice (rule 1) with a dithered boundary (rule 2); pith, rind shadow and zest are products of edge and t (rule 3); R(t) accelerates while the plate settles on a lagged centre (rule 4); the plate arrives offset and smeared (rules 5, 6); the halves push in about the seam with a drifting origin and soften as they leave (rule 7); the sign of the parting ramps through zero (rule 12); pith lives only in its rim, measured across the front so it is a rim all the way round and not a column along the seam (rule 8); zest is hashed per cell and per sixth of a second (rule 10); the halves pixelate into dots whose cells grow as they are pushed out, and the cobalt arrives as dots that grow until they merge (rules 2 and 5, and the page's own halftone print-in); everything is a function of t (rule 11).
