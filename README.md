# orange-story

The orange.io site: one continuous scroll story in four chapters (The Model, The Work, The Terms, Questions) with a hero before them and an application and finale after, drawn by one raw WebGL canvas and scrolled as a clock. Every chapter, transition and camera move is a pure function of smoothed scroll progress `p` (0 to 1), so scrolling up plays everything backwards. The structure and cuts follow pear.no; every painting, line of copy and shader is Orange's own.

## Stack

- Next.js (App Router, TypeScript), React, plain CSS (tokens in `src/app/globals.css`, CSS modules per page). No Tailwind, no component library.
- Fonts through `next/font/google` in `src/app/fonts.ts`: Newsreader (display), Geist (text), Geist Mono (labels).
- The stage (from phase 2): raw WebGL 1 in `src/stage/`. No Three.js, no GSAP, no Lenis, no animation library.
- ESLint with `eslint-config-next` (flat config in `eslint.config.mjs`).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Serves the production build on port 3000 |
| `npm run lint` | ESLint with the Next.js config (Next.js 16 removed `next lint`, so this runs `eslint .`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run art:import` | Imports `art/source/` into `public/art/` and paints a placeholder for anything missing (see `art/briefs/README.md`) |
| `npm run art:placeholders` | Repaints the placeholders for ids with no source (`-- --preview DIR` writes sample frames elsewhere) |
| `npm run art:briefs` | Regenerates `art/briefs/<id>.txt` from `docs/PAINTINGS.md` |

Node 20.9 or newer (CI and the server use Node 22).

## Where things live

- `src/content/copy.ts`: every on-screen string, grouped by chapter (wording from `docs/COPY.md`). Components never type copy.
- `src/content/art.ts`: the art manifest, one typed entry per painting with its kind, aspect, file paths and anchor points.
- `src/app/globals.css`: colour, type, shape and layout tokens.
- `src/ui/primitives.tsx`: pill button, tag, hairline and star mark.
- `src/stage/`: the engine (phase 2). `Stage.tsx` is the one client component that owns the frame loop; `script.ts` is the single source of segment ranges (`local`, `active`, `nearby`); `scroll.ts` the smoothed scroll clock; `gl/` the WebGL 1 core (context, program builder, `lib.glsl.ts`, texture manager, pass manager); `passes/` the story's passes; `Chrome.tsx` the hairline frame, mark, menu, Apply pill, rail and percentage; `hub.ts` the subscribe API DOM layers use (`useFrame`), never React state per frame.
- `/design` (development only, not linked): the type scale, swatches, buttons, tags and hairlines.
- `/stage-test` (development only, not linked): a checkerboard drawn through `cover()` with GLSL rings and DOM labels at `uncover()` of the same points, for checking the painting-to-screen mapping by eye (`?pan=0.1,-0.05&zoom=1.3&aspect=9:16`).

URL flags on any stage page: `?hud` shows p, segment, local t, frame time and texture uploads per second; `?nogl` hides the canvas and runs the DOM layers alone; `?p=0.42` lands on that progress; `?split=0.5` (any segment id with a local t) lands inside that segment so a cut can be held at any t (on `/stage-test` it swaps in the story's passes with the chrome off, for bare stills); `?clock=12` fixes the shader clock so frames are reproducible; `?finish` waits for the GPU after each draw so the HUD's frame time is the pass's real cost (`?repeat=8` draws the pass that many times a frame, for costs under the sync's noise); `?tune=rindWidth:0.22,lagDist:0.15` retunes The Split's numbers live (the HUD lists them over the cut); `#model`, `#work`, `#terms`, `#questions` and `#apply` land on their segments.

## The pack

- `docs/STORY.md`: the sections, their scroll ranges, what is on screen, and which asset each uses.
- `docs/COPY.md`: every on-screen string.
- `docs/PAINTINGS.md`: the style preamble and one prompt per painting, loop or frame sequence.
- `docs/TRANSITIONS.md`: every cut on the page, with The Split (Chapter 1 to 2) specified in full.
- `docs/MOTION-RULES.md`: the rules that keep the motion from feeling mechanical, plus the scroll smoothing.
- `docs/CHECKS.md`: what passing means for a cut.
- `prompts/NN-name.md`: sixteen phases, each a complete instruction for one subagent; `prompts/NN-name.commit` is that phase's commit message; `prompts/models.conf` assigns the model and effort.

## Building it

In Claude Code, from the repo root: `/build-orange` runs every remaining phase in order (`next` runs one, `status` shows progress, `reset` clears it, `art` only generates missing paintings). Each phase is built by a subagent, gated on `npm run build`, committed and pushed. Every push to `main` deploys to production, so set `GIT_PUSH=0` in `.claude/skills/build-orange/config.env` or work on a branch while building.

## Art

The paintings and their prompts are listed in `docs/PAINTINGS.md`. Drop finished sources in `art/source/<id>.png|mp4` (gitignored); `npm run art:import` (from phase 3) turns them into tiers under `public/art/`. Missing paintings get painted placeholders, so the build never waits for art. The anchor points in `src/content/art.ts` are the numbers to retune when real art replaces a placeholder.

## Deploy

Push to `main`, then CI (`lint`, `typecheck`, `test` if present, `build`), then `deploy/orange-deploy.sh` runs on the EC2 instance over AWS Systems Manager: `npm ci`, `npm run build`, and `npm start` on port 3000 under pm2 behind nginx at https://production.khalidsyfullah.com. Details and rollback in [`deploy/README.md`](deploy/README.md).
