# orange-story

The orange.io site: one continuous scroll story in four chapters (The Model, The Work, The Terms, Questions) with a hero before them and an application and finale after, drawn by one raw WebGL canvas and scrolled as a clock. The structure and cuts follow pear.no; every painting, line of copy and shader is Orange's own.

The repo is currently reset to its specification. The site is rebuilt phase by phase by the `build-orange` skill from the prompt pack; nothing under `src/` exists until phase 1 runs.

## The pack

- `docs/STORY.md`: the sections, their scroll ranges, what is on screen, and which asset each uses.
- `docs/COPY.md`: every on-screen string.
- `docs/PAINTINGS.md`: the style preamble and one prompt per painting, loop or frame sequence.
- `docs/TRANSITIONS.md`: every cut on the page, with The Split (Chapter 1 → 2) specified in full.
- `docs/MOTION-RULES.md`: the fifteen rules that keep the motion from feeling mechanical, plus the scroll smoothing.
- `docs/CHECKS.md`: what passing means for a cut.
- `prompts/NN-name.md`: sixteen phases, each a complete instruction for one subagent; `prompts/NN-name.commit` is that phase's commit message; `prompts/models.conf` assigns the model and effort. Fable 5.1 takes the engine, The Split, the burn and the final polish of every cut; Opus 5.5 and Sonnet 5.5 take the rest.

## Building it

In Claude Code, from the repo root: `/build-orange` runs every remaining phase in order (`next` runs one, `status` shows progress, `reset` clears it, `art` only generates missing paintings). Each phase is built by a subagent, gated on `npm run build`, committed and pushed. Every push to `main` deploys to production, so set `GIT_PUSH=0` in `.claude/skills/build-orange/config.env` or work on a branch while building.

Paintings go in `art/source/<id>.png|mp4` (gitignored); `npm run art:import` (phase 3) turns them into `public/art/`. Missing paintings get painted placeholders, so the build never waits for art.

## Deploy

Push to `main` → CI (`lint`, `typecheck`, `build`) → `deploy/orange-deploy.sh` runs on the EC2 instance over AWS Systems Manager, builds the commit, serves it with `npm start` on port 3000 under pm2 behind nginx at https://production.khalidsyfullah.com. Details and rollback in `deploy/README.md`.
