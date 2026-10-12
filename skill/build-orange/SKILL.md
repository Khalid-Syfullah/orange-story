---
name: build-orange
description: Build the orange.io scroll story by running the numbered prompt files in prompts/ one phase at a time, each phase on its assigned model (Fable 5.1 for the most demanding engine and shader phases, Opus 5.5 or Sonnet 5.5 for the rest) and effort level, with a build check and a commit and push per phase. Generates the paintings with Figma AI before the art phase when that tool is available, after quoting the credit cost. Use only when the user runs /build-orange or asks to continue the orange.io build or to run one named phase.
argument-hint: "[next | only <phase> | status | reset | art]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/phase.sh *) Bash(git status *) Bash(git log *) Bash(ls art/*) Bash(mkdir -p art/source) Bash(curl -L -o art/source/* *) Bash(node scripts/art-video.mjs) Bash(node scripts/art-video.mjs *)
---

# build-orange

You are the coordinator. You do not write site code yourself: each phase is built by a subagent running on the model assigned to that phase. Progress lives on disk (`logs/`), so the run can stop, hit a usage limit, or be compacted and still resume at the right phase.

Mode requested: `$ARGUMENTS`
- empty: run every remaining phase, in order
- `next`: run only the next unfinished phase, then stop
- `only <phase>`: run exactly the one phase named, then stop (see "Only mode" below). `<phase>` is its number (`22`), its name (`22-share-slice-and-match-cut`) or a unique part of the name (`slice`). It works on a pending phase and on a finished one (a finished phase is re-run over its existing code).
- `status`: run `phase.sh status`, show it, and stop
- `reset`: ask the user to confirm first, then run `phase.sh reset`
- `art`: run only the art step below, then stop

Helper (run from the project root, exactly as written):
`${CLAUDE_SKILL_DIR}/scripts/phase.sh <next | resolve X | begin NAME | check | finish NAME | status | reset>`

## The art step (before phase 03, and on `art`)

The paintings are specified in `docs/PAINTINGS.md`, one prompt per asset id, with a style preamble to prepend. Real art is optional: phase 03 draws painted placeholders for anything missing, and the import pipeline turns whatever is in `art/source/` into the tiers the site uses.

1. List `art/source/`. Every id in `docs/PAINTINGS.md` that has no file there is missing.
2. If an image generation tool is available in this session (for example Figma's `generate_image`, which spends the user's Figma AI credits), tell the user which assets are missing, which model you will use, and that each call spends credits, and ask for a yes before generating anything. On a yes, generate each missing still (stills only: the loops and sequences need a video model; use their first keyframe prompt as a still so the site has the right picture) with the preamble plus that asset's prompt at the size in the table, download the result into `art/source/<id>.png` with the exact id as the file name, and show the user a one-line summary per asset. Never generate an asset that already exists.
3. If no such tool is available, say so in one line and continue; the briefs in `art/briefs/` are written for any generator and the placeholders carry the build.

### The video step (loops and sequences)

The six animated assets (`hero`, `canopy`, `finale` loops; `bridge`, `drawing`, `coda` sequences) are made from the stills with Veo through the Gemini API, by `scripts/art-video.mjs`. It spends the user's Google API money, so it is always a dry run first.

1. Run it only when the stills exist in `art/source/` (hero, canopy, finale, graft, drawing, plan, coda, share-orange) and `scripts/art-video.mjs` exists. If either is missing, say which and skip.
2. Run `node scripts/art-video.mjs` (no `--yes`). It prints which clips it would make and the estimate. Show the user that and ask for a yes. If there is no key (`GEMINI_API_KEY` in the environment or in `.env.art`), tell them to copy `.env.art.example` to `.env.art` and add their key themselves; never ask for the key in chat, never read `.env.art`, never print it.
3. On a yes, generate ONE clip first: `node scripts/art-video.mjs --only hero --yes`. Report the result in one line. If it fails, show the error and stop; do not retry in a loop. If it works, ask once whether to continue with the rest, then run `node scripts/art-video.mjs --yes`.
4. A clip that already exists is never regenerated (`--force` only when the user asks). The files land in `art/source/<id>.mp4` with a `<id>.json` sidecar, and phase 03's import picks them up.

## Only mode (`only <phase>`)

Runs exactly one named phase and touches no other phase's progress. Use it to build a phase out of order or to re-run a finished one.

1. Run `phase.sh resolve <phase>` with the text after `only`. It prints `PHASE n/total NAME FILE MODEL EFFORT`, then `STATE pending` or `STATE done (it will be re-run over the existing code)`, then, when earlier phases are unfinished, `NOTE earlier phases not done: ...`.
   - If it exits with `NO SUCH PHASE` or `AMBIGUOUS`, show its list and ask the user which phase they mean (AskUserQuestion with the candidates, or plain text). Do not guess.
   - With no `<phase>` given, ask which phase, showing `phase.sh status`.
2. Tell the user in one line what will run: the phase, its model and effort, and whether it is new or a re-run. If a NOTE lists earlier unfinished phases, say so in the same line (later phases build on earlier ones, so this one may rely on code that is not there yet); the user asked for this phase by name, so continue without asking.
3. Do steps 2 to 6 of "For each phase" below for that NAME, using the model and effort `resolve` printed. If STATE is `done`, or the begin banner says it is re-running a finished phase, add to the subagent's prompt: `This phase was built before and its code is in the repo. Compare the repo with the prompt and change only what differs; do not duplicate or rewrite parts that already match.` (This is how the 21 to 23 rebuilds of earlier chapters are meant to run.)
4. Stop after `phase.sh finish`. Do not go on to another phase. Say which phase `phase.sh next` would run now, and end with the latest `phase.sh status`.
5. If the phase fails or is stopped, report it as in "For each phase" step 5 and stop. A re-run that fails leaves the phase unfinished (begin re-opens it), so the next `/build-orange` run picks it up again.

## For each phase

1. Run `phase.sh next`. It prints `PHASE n/total NAME FILE MODEL EFFORT` (MODEL is `fable`, `opus` or `sonnet`, EFFORT is `low`, `medium`, `high`, `xhigh` or `max`, both from `prompts/models.conf`), or `ALL DONE`. On `ALL DONE`, run `phase.sh status`, show it, and finish.
2. If NAME starts with `03-`, do the art step first.
3. Run `phase.sh begin NAME` and show its banner. Keep a visible task list with one item per phase; mark this one in progress. (`begin` on a finished phase re-opens it; only `only` mode does that.)
4. Delegate the phase with the Agent tool:
   - `subagent_type`: `orange-phase-fable` when MODEL is `fable`, `orange-phase-opus` when MODEL is `opus`, `orange-phase-sonnet` when MODEL is `sonnet`. Never build the phase yourself, and never swap the model. If `orange-phase-fable` is rejected because Fable is not available on this account, stop and tell the user, who can change that phase's line in `prompts/models.conf` to `opus max`.
   - `effort`: EFFORT exactly as printed. If the call is rejected because that level is not available for the model, retry once with `high` and tell the user which phase fell back.
   - prompt: `Build phase NAME. Prompt file: FILE.` Add `This phase is resuming; check what already exists.` if the begin banner said so (for a re-run of a finished phase, use the wording given in "Only mode").
   - Wait for the result.
5. Read the subagent's reply. If it starts with `RESULT: FAILED`, or it mentions `STOP`, do not finish: show the user its report and stop.
6. Run `phase.sh finish NAME`. It refuses unless the check passed, then commits using `prompts/NAME.commit` (title and description), pushes, marks the phase done, and prints progress. Show the subagent's 3 to 6 line summary plus the commit and push lines. Mark the task completed.
   - If finish prints `REFUSED`, send the same subagent type the task again with `The build check has not passed yet; fix it and run phase.sh check.` One retry only, then stop and report.
   - If it prints `PUSH FAILED` or `STOP`, stop and show the error.
7. With no argument, go back to step 1. With `next`, stop and say which phase, model and effort come next.

## Rules

- Outside `only` mode, phases are strictly sequential; `phase.sh next` decides the order and the model. In `only` mode the user names the phase and `phase.sh resolve` gives its model and effort; never change either.
- A phase is done only after `phase.sh finish` succeeds.
- Every push to `main` deploys to production (see `deploy/README.md`). To build without deploying each phase, set `GIT_PUSH=0` in `config.env` or work on a branch, and say so to the user at the start of a run.
- Do not invent results. Report what the commands and subagents actually returned.
- If the subagents are missing (`orange-phase-fable` / `orange-phase-opus` / `orange-phase-sonnet` not found), stop and tell the user to copy the skill's `agents/` files into `.claude/agents/`.
- End every run with the latest `phase.sh status` output.
