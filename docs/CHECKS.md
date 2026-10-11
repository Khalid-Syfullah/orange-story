# Checks

Run these on every cut, in a headless browser with a fixed clock so the frames are reproducible (`npm run e2e` drives them with Playwright against a production build). A cut that fails one of them is the one that will read as mechanical.

- [ ] **Scrub test:** step `p` across the cut in 40 increments forward, then backward. No frame may differ between the two directions by more than the time-driven breath.
- [ ] **Still-frame test:** save frames at t = 0.2, 0.5, 0.8 and look at each as a picture. Each must read as a thing happening to the image, not as a hole with another image in it.
- [ ] **Pop test:** diff consecutive frames; the largest per-frame change must be at the crest, never at a texture or a scrim switching on.
- [ ] **Edge test:** zoom to 400% on the crest; the boundary must be dots and stipple, not an alpha ramp or a straight line.
- [ ] **Speed test:** scroll the cut at three speeds (trackpad flick, slow wheel, keyboard page). Crest effects must scale with velocity and the settle must take the same time at all three.
- [ ] **Phone test:** at 390x844 with 2 noise octaves on texture fields, the cut must look the same as desktop at arm's length; motion fields keep 4 octaves.
- [ ] **Frame-time test:** 16.7 ms budget through the whole cut on a mid-range phone; the fast paths must leave at-rest frames under 4 ms.
- [ ] **Reduced-motion test:** with `prefers-reduced-motion`, the cut collapses to its t = 1 frame with a 300 ms dissolve and nothing else moves.
- [ ] **Build test:** `npm run lint`, `npm run typecheck` and `npm run build` pass; the page serves on port 3000 with `npm start` (the EC2 deploy depends on this).
