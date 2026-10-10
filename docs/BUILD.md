# orange.io: the scroll story

Twenty-one Claude Code phases that build the whole orange.io site as one continuous scroll story, run one at a time by the `/build-orange` skill. After every phase the skill runs the build check, commits with a title and a description, and pushes.

| Path | What it is |
| --- | --- |
| `docs/STORYBOARD.md` | The full site, scene by scene, plus the copy deck. The source of truth. |
| `docs/ART-PLATES.md` | Every painted layer each scene needs. Placeholders are generated until real art exists. |
| `docs/REFERENCE.md` | Measured from pear.no: stage length, chapter positions, beat timing, ruler progress line, hairline moves, buttons, type, the shared FAQ connector, the form focus effect and the finale frame. Technique only. |
| `prompts/` | 21 phase prompts, each with a `.commit` file (title line, blank line, description). |
| `skill/build-orange/` | The skill that runs the phases, checks the build, commits and pushes, plus `agents/` (the Opus and Sonnet phase builders). |
| `prompts/models.conf` | Which model builds each phase. |

## The phases

**Foundation**
1. Setup, fonts and design system
2. UI kit and fixed chrome (buttons, tags, text effects, ruler, percent counter)
3. Scroll engine and the story script (every scene, beat, transition and camera move as data)
4. Painted plates and camera rig
5. Transitions (sand, paper unfold, rising dust, rainbow ring, fabric sky, viewfinder, smoke)

**Chapter 1: The Model**
6. Hero: the statue raising the glowing orange
7. Ascent: the minaret becomes a tree
8. The graft
9. The pluck and the harvester
10. The cut, the shared halves, sand transition

**Chapter 2: The Work**
11. Services in the clouds
12. The blueprint, paper unfold

**Chapter 3: The Terms**
13. The building site by the sea, top-down zoom-out, terms panel
14. The gardener, docking chapter title
15. The falling orange, rainbow ring into the orchard

**Chapter 4: Questions**
16. Question cards with connector lines
17. The stargazer and the constellation
18. The glass application form

**End**
19. The orchard-keepers finale and wordmark
20. Mobile, touch, restoration, accessibility
21. Integration, performance, Playwright scroll test, docs

## Install

From your orange.io repo root:

```bash
cp -r path/to/orange-story/docs .
cp -r path/to/orange-story/prompts .
mkdir -p .claude/skills .claude/agents
cp -r path/to/orange-story/skill/build-orange .claude/skills/
cp .claude/skills/build-orange/agents/*.md .claude/agents/
chmod +x .claude/skills/build-orange/scripts/phase.sh
```

Restart Claude Code after copying, so it picks up the skill and the two subagents.

`docs/` is committed with phase 1 (the phases read it). `prompts/`, `.claude/` and `logs/` are never committed.

## Run

Start Claude Code in the repo (auto mode recommended), then:

| Command | What it does |
| --- | --- |
| `/build-orange next` | Runs one phase, checks, commits, pushes, stops |
| `/build-orange` | Runs every unfinished phase in order |
| `/build-orange status` | Shows done / current / pending and overall progress |
| `/build-orange reset` | Clears progress (asks first) |

Hands-off:

```
/goal Use the build-orange skill to finish every phase. Done when running .claude/skills/build-orange/scripts/phase.sh status prints ALL PHASES COMPLETE. Or stop after 80 turns.
```

## Which model and effort build which phase

The skill is a coordinator. It hands each phase to a subagent pinned to a model, and passes that phase's effort level with the call. Both come from `prompts/models.conf`:

| Phase | Model | Effort |
| --- | --- | --- |
| 1 setup, 2 UI kit | Opus 5.5 | high |
| 3 scroll engine, 5 transitions, 21 integration | Opus 5.5 | max |
| 4 plates and camera, 16 question cards | Opus 5.5 | xhigh |
| 6, 7, 9, 10, 13, 15, 19, 20 (scenes with harder motion, mobile) | Sonnet 5.5 | high |
| 8, 11, 12, 14, 17, 18 (simpler scenes, form) | Sonnet 5.5 | medium |

- Edit `prompts/models.conf` to change any line, for example `11 opus xhigh`. Unlisted phases use `DEFAULT_MODEL` (sonnet) and `DEFAULT_EFFORT` (medium).
- Keep Sonnet at `high` or below; available levels depend on the model. If a level is rejected, the skill retries that phase at `high` and tells you.
- The subagent files also carry a fallback effort (`high` for Opus, `medium` for Sonnet), used if your Claude Code is too old to pass effort per call (needs v2.1.292 or later).
- If `CLAUDE_CODE_EFFORT_LEVEL` is set in your environment it overrides all of this. Unset it before running.
- `/build-orange status` lists model and effort next to every phase, and each phase banner names both.
- Your main session only coordinates, so it can stay on Sonnet at low or medium effort.
- Each subagent starts fresh, with no memory of earlier phases, and rebuilds context from the repo.

## Commits and pushes

- Every phase ends with one commit whose title and description come from its `.commit` file, for example:

  ```
  feature(scene): add the pluck and the harvester

  Animate the rising hand picking the orange, add the two beats with the
  progress line and typed line, and dolly down to the robed harvester.
  ```

  Titles use `feature(...)` written out in full. Phase 1 is `chore(setup)` and phase 21 is `chore(release)`.
- After committing, the skill pushes the current branch (setting the upstream on `origin` the first time).
- If a push fails, the commit stays local, the skill prints `PUSH FAILED` and stops. Fix access, run `git push`, then continue: the next push also sends anything left behind.
- **Pushing runs your CI/CD on every phase.** If pushes to `main` deploy to production, work on a branch first: `git checkout -b feature/scroll-story`, and merge when phase 21 is done.
- To turn pushing off: copy `config.env.example` to `config.env` in the skill folder and set `GIT_PUSH=0`.

## The build check

After each phase the skill runs `npm run build` (when `package.json` has a build script). Claude gets two attempts to fix a failure; after that the skill stops and reports. Change it with `CHECK_CMD` and `MAX_FIX` in `config.env`.

## Copy and art

- All on-screen text lives in `src/content/copy.ts`, generated from the copy deck in `docs/STORYBOARD.md`. Edit it there.
- The copy is original to Orange. Your walkthrough quotes pear.no's live text, so the storyboard keeps your structure and text slots with new wording; `docs/REFERENCE.md` borrows pear.no's pacing and interaction technique, not its words or art.
- Art is placeholder until you add painted plates at the paths in `public/art/manifest.json` (see `docs/ART-PLATES.md`). Use only artwork you have the rights to.

## Good to know

- I tested `phase.sh` against a local git remote (commit with title and description, push, failed push, recovery) and the model mapping. The skill and subagents have not been run in a live Claude Code session yet, so try `/build-orange next` first and check the banner shows `model: opus`.
- 21 phases of 3D and animation work is long and costly. Run phases 1 to 5, scroll the placeholder story end to end, then continue.
