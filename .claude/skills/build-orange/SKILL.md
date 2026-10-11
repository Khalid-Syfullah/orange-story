---
name: build-orange
description: Build the orange.io scroll story by running the numbered prompt files in prompts/ one phase at a time, each phase on its assigned model (Fable 5.1 for the most demanding engine and shader phases, Opus 5.5 or Sonnet 5.5 for the rest) and effort level, with a build check and a commit and push per phase. Generates the paintings with Figma AI before the art phase when that tool is available, after quoting the credit cost. Use only when the user runs /build-orange or asks to continue the orange.io build.
argument-hint: "[next | status | reset | art]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/phase.sh *) Bash(git status *) Bash(git log *) Bash(ls art/*) Bash(mkdir -p art/source) Bash(curl -L -o art/source/* *)
---

# build-orange

You are the coordinator. You do not write site code yourself: each phase is built by a subagent running on the model assigned to that phase. Progress lives on disk (`logs/`), so the run can stop, hit a usage limit, or be compacted and still resume at the right phase.

Mode requested: `$ARGUMENTS`
- empty: run every remaining phase, in order
- `next`: run only the next unfinished phase, then stop
- `status`: run `phase.sh status`, show it, and stop
- `reset`: ask the user to confirm first, then run `phase.sh reset`
- `art`: run only the art step below, then stop

Helper (run from the project root, exactly as written):
`${CLAUDE_SKILL_DIR}/scripts/phase.sh <next | begin NAME | check | finish NAME | status | reset>`

## The art step (before phase 03, and on `art`)

The paintings are specified in `docs/PAINTINGS.md`, one prompt per asset id, with a style preamble to prepend. Real art is optional: phase 03 draws painted placeholders for anything missing, and the import pipeline turns whatever is in `art/source/` into the tiers the site uses.

1. List `art/source/`. Every id in `docs/PAINTINGS.md` that has no file there is missing.
2. If an image generation tool is available in this session (for example Figma's `generate_image`, which spends the user's Figma AI credits), tell the user which assets are missing, which model you will use, and that each call spends credits, and ask for a yes before generating anything. On a yes, generate each missing still (stills only: the loops and sequences need a video model; use their first keyframe prompt as a still so the site has the right picture) with the preamble plus that asset's prompt at the size in the table, download the result into `art/source/<id>.png` with the exact id as the file name, and show the user a one-line summary per asset. Never generate an asset that already exists.
3. If no such tool is available, say so in one line and continue; the briefs in `art/briefs/` are written for any generator and the placeholders carry the build.

## For each phase

1. Run `phase.sh next`. It prints `PHASE n/total NAME FILE MODEL EFFORT` (MODEL is `fable`, `opus` or `sonnet`, EFFORT is `low`, `medium`, `high`, `xhigh` or `max`, both from `prompts/models.conf`), or `ALL DONE`. On `ALL DONE`, run `phase.sh status`, show it, and finish.
2. If NAME starts with `03-`, do the art step first.
3. Run `phase.sh begin NAME` and show its banner. Keep a visible task list with one item per phase; mark this one in progress.
4. Delegate the phase with the Agent tool:
   - `subagent_type`: `orange-phase-fable` when MODEL is `fable`, `orange-phase-opus` when MODEL is `opus`, `orange-phase-sonnet` when MODEL is `sonnet`. Never build the phase yourself, and never swap the model. If `orange-phase-fable` is rejected because Fable is not available on this account, stop and tell the user, who can change that phase's line in `prompts/models.conf` to `opus max`.
   - `effort`: EFFORT exactly as printed. If the call is rejected because that level is not available for the model, retry once with `high` and tell the user which phase fell back.
   - prompt: `Build phase NAME. Prompt file: FILE.` Add `This phase is resuming; check what already exists.` if the begin banner said so.
   - Wait for the result.
5. Read the subagent's reply. If it starts with `RESULT: FAILED`, or it mentions `STOP`, do not finish: show the user its report and stop.
6. Run `phase.sh finish NAME`. It refuses unless the check passed, then commits using `prompts/NAME.commit` (title and description), pushes, marks the phase done, and prints progress. Show the subagent's 3 to 6 line summary plus the commit and push lines. Mark the task completed.
   - If finish prints `REFUSED`, send the same subagent type the task again with `The build check has not passed yet; fix it and run phase.sh check.` One retry only, then stop and report.
   - If it prints `PUSH FAILED` or `STOP`, stop and show the error.
7. With no argument, go back to step 1. With `next`, stop and say which phase, model and effort come next.

## Rules

- Phases are strictly sequential; `phase.sh next` decides the order and the model.
- A phase is done only after `phase.sh finish` succeeds.
- Every push to `main` deploys to production (see `deploy/README.md`). To build without deploying each phase, set `GIT_PUSH=0` in `config.env` or work on a branch, and say so to the user at the start of a run.
- Do not invent results. Report what the commands and subagents actually returned.
- If the subagents are missing (`orange-phase-fable` / `orange-phase-opus` / `orange-phase-sonnet` not found), stop and tell the user to copy the skill's `agents/` files into `.claude/agents/`.
- End every run with the latest `phase.sh status` output.
