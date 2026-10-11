# Phase 14 of 16: Phones, reduced motion, accessibility and performance

You are building orange.io. Every section exists (phases 4 to 13). This phase makes the whole story hold on phones, under reduced motion and with a keyboard, and makes frame time even.

## Rules

- **Source of truth:** `docs/CHECKS.md` (phone, frame-time and reduced-motion tests), `docs/MOTION-RULES.md` (rules 11 and 14, the scroll smoothing section), `docs/STORY.md`, `src/stage/`.
- **One stage, one canvas:** raw WebGL 1; nothing changes in what the story is, only in how it survives small screens, slow devices and reduced motion.
- **Deploy contract:** lint, typecheck, build green. **Git:** do not commit or push. **Finish** with 3 to 6 lines.

## Task

1. **Phone framing:** a `uBand` uniform (1 on landscape, down to 0.6 on tall phones) that hangs each painting from the top of the viewport and fades its base into the page colour over the lower 34% of the band, so copy stacks under the picture instead of over it; per-shot phone pans in `art.ts` that keep the key action in frame (the orange, the hands, the figure); the third hero cloud and the margin orange off on phones; cards and the form in one column with a 16px gutter and no horizontal overflow at 390×844 and 360×780.
2. **Touch scroll:** native scrolling on `pointer: coarse` with the 60 ms smoothing; momentum scrolling must not overshoot past `p = 1`; the HUD confirms `p` tracks touch without lag.
3. **Octaves and resolution:** texture fields at 2 octaves on phones (`uOctaves`), motion fields at 4 everywhere; `devicePixelRatio` capped at 2 and 3.4 Mpx total; texture uploads only when the chosen frame changes; sequences keep at most 24 decoded frames; video uploads pause when their segment is not near.
4. **Fast paths and gating:** every pass skips work that is provably identity (fronts that have passed every pixel, chapters not near `p`); at-rest frames under 4 ms on the dev machine and the whole story under 16.7 ms per frame on a throttled profile (Chrome's 4× CPU slowdown as the stand-in for a mid-range phone). Record the measurements in `docs/PERF.md`.
5. **Reduced motion:** with `prefers-reduced-motion`, every transition collapses to its end frame with a 300 ms dissolve, breath and parallax stop (`uStill = 1`), the handwritten title appears complete, the loops still play (they are content), and nothing else moves.
6. **Accessibility:** the stage canvas has a `role="img"` with a description per section updated from the segment; all copy is real DOM text in reading order; the menu, pill, cards, form and copy button are keyboard operable with visible focus; colour contrast of milk on sky and ink on paper passes AA; the page works with JavaScript disabled to the extent of showing the hero poster and all copy in order.
7. **Restoration:** reload at any scroll position lands on the same `p` with no intro; browser back/forward restores; anchors `#model`, `#work`, `#terms`, `#questions`, `#apply` set the scroll target.
8. Verify lint, typecheck and build; screenshots of every section at 390×844 into `docs/screenshots/phone-*.png`.
