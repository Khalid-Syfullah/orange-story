# Motion rules

The mechanical feel comes from four things: straight edges, things switching on, symmetric easing, and pixels that stay sharp while they move. These rules remove all four. Every effect, transition and rest state on the site follows them; every phase prompt points here.

1. **No straight fronts.** Every wipe or reveal is a distance field bitten by two decorrelated fbm fields at different scales: `front = d - t + n1*0.30 + n2*0.10`. A straight line reads as a wipe; a bitten one reads as something happening to the picture.
2. **Edges are printed, not faded.** Add a 4x4 Bayer threshold and a hash stipple at every boundary before the smoothstep, so breakup is a print screen, not an alpha ramp or flat bands.
3. **Nothing switches on.** Every treatment (texture, vignette, char, grain) is multiplied by the same driver that brings its colour in. There is never a frame where a texture appears over what was a clean frame.
4. **Ease into every pass.** The first 10–15% of any travelling effect ramps with smoothstep, so there is no edge to the effect starting. Use accelerating curves for things that fall or push in (`t*(lin + (1-lin)*t*t)`, lin 0.4–0.9) and keep ease-in-out for the few things that settle. Ease-in-out on everything is the metronome feel.
5. **The revealed picture arrives moving.** The new layer is offset in the direction the front travels by `lag = exp(-distBehindCut / d)` and settles as the front leaves it. A static image under a hole is a wipe; a picture still catching up with its edge is a reveal.
6. **Smear along motion.** Anything displaced is sampled with 5 taps along its displacement direction, signed the way it moves. Perfectly sharp pixels moving fast are the plainest tell of a wipe.
7. **Dolly, not scale.** A push-in is about the cut's own point, not the frame centre, and that point drifts a few percent sideways as the push accelerates. Soften radially from that point in the last stretch, the way things go soft near a lens.
8. **Bands travel with the front.** Char, ember, pith, glow exist only inside a band that moves with the cut: saturate a little way back, release further back. A term that saturates everywhere behind the front chars the whole frame on the first scroll tick.
9. **Breath is not a sine.** Rest states move by a sum of 2–3 incommensurate sines (periods like 5.3 s, 7.9 s, 11.4 s) plus an exp decay from the last event, at amplitudes of a few percent. One sine at a sixth of the value reads as the screen dimming.
10. **Hash, never period.** Slips, flickers, dot thresholds and speckles use `hash(band, floor(time*k))`, so no two repeats align. `fract(time/period)` on its own is a metronome.
11. **Scrub-safe by construction.** Every state is a function of smoothed progress `p`; scrolling backwards plays the transition in reverse with no pops. Frame sequences take the nearest decoded frame and decode ahead both ways.
12. **Seams get a mass.** A straight join between two halves reads as a mirror. Cover it with a soft anisotropic mass bitten by fbm, placed under the reveal rather than over it; ramp the displacement sign through zero across the seam so there is no discontinuity.
13. **Instances differ.** Clouds, dots and flecks have their own size, seed, drift speed (slower when larger) and phase; nothing is centred or evenly spaced.
14. **Even frame time.** Gate dead work: a front that has passed every pixel is identity, so skip it. A dropped frame mid-transition reads as mechanical too.
15. **Hold the still.** At any `p` the frame must be a picture someone would hang. If a mid-transition frame only makes sense as motion, the transition is a wipe.

## Scroll smoothing

- Intercept wheel (`preventDefault` unless `ctrlKey`), accumulate into `target`. Each frame: `current += (target - current) * (1 - exp(-dt / 180ms))`; snap when `|target - current| < 0.08px`. `velocity = current - previous`, exposed to the shader as `uVel` so smear and tilt follow the scroll's speed.
- On `pointer: coarse` or `prefers-reduced-motion`, leave native scroll on and smooth with a 60 ms constant.
- Keyboard and anchor jumps set `target`, never `current`.

## Rest states

- Pointer parallax 0.45% x / 0.32% y, approached with `current += (target - current) * 0.06` per frame; ambient drift 0.22% from two sines (0.17 Hz, 0.13 Hz).
- A scroll stop adds an exp-decay kick of about 1.5% to whatever breathes, dying in 1.2 s.
