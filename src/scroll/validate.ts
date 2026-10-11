import { copyAtUnchecked } from "./copy-path";
import { SCRIPT } from "./script";
import type { BeatDef, CameraMove, SceneId, SlotId, StoryScript, TransitionKind } from "./types";

/**
 * Checks the story script. `validateScript()` throws a `ScriptError` listing every problem; it runs
 * in development (when the stage loads) and in the unit test. The rules:
 * - scenes tile 0 to 1 in order, with no gaps or overlaps;
 * - beats in the same slot never overlap, and every beat lasts at least one screen;
 * - every beat's copy key exists in `src/content/copy.ts`;
 * - chapters, transitions, camera keys, cues and anchors are inside 0 to 1 and in order;
 * - transitions on the one transition canvas never overlap.
 */

/** Two positions closer than this are equal (positions are rounded to 6 decimals). */
const EPSILON = 1e-6;

const SCENE_ORDER: readonly SceneId[] = [
  "hero",
  "ascent",
  "graft",
  "pluck",
  "share",
  "work",
  "blueprint",
  "site",
  "prune",
  "fall",
  "faq",
  "stars",
  "apply",
  "finale",
];

const SLOTS: readonly SlotId[] = ["center-left", "bottom-left", "right", "top-left", "top-center", "center"];
const MOVES: readonly CameraMove[] = ["hold", "push", "pull", "pan", "dolly-up", "dolly-down", "reframe"];
const KINDS: readonly TransitionKind[] = ["sand", "unfold", "dust", "ring", "fabric", "leaves", "cloud", "viewfinder", "smoke"];

export class ScriptError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The story script has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
    this.name = "ScriptError";
    this.problems = problems;
  }
}

const fmt = (p: number) => (Number.isFinite(p) ? p.toFixed(4) : String(p));
const inUnit = (p: number) => Number.isFinite(p) && p >= -EPSILON && p <= 1 + EPSILON;

function checkScenes(script: StoryScript, problems: string[]) {
  const { scenes } = script;
  const ids = scenes.map((s) => s.id).join(",");
  if (ids !== SCENE_ORDER.join(",")) problems.push(`scenes must follow the storyboard order (${SCENE_ORDER.join(", ")}); got ${ids}`);

  if (scenes.length === 0) return;
  if (Math.abs(scenes[0].start) > EPSILON) problems.push(`scenes must start at 0; "${scenes[0].id}" starts at ${fmt(scenes[0].start)}`);
  const last = scenes[scenes.length - 1];
  if (Math.abs(last.end - 1) > EPSILON) problems.push(`scenes must end at 1; "${last.id}" ends at ${fmt(last.end)}`);

  scenes.forEach((scene, i) => {
    if (!(scene.end > scene.start)) problems.push(`scene "${scene.id}" is empty or reversed (${fmt(scene.start)} to ${fmt(scene.end)})`);
    if (Math.abs(scene.end - scene.start - scene.share) > EPSILON)
      problems.push(`scene "${scene.id}" spans ${fmt(scene.end - scene.start)} but its share is ${fmt(scene.share)}`);
    if (i > 0) {
      const prev = scenes[i - 1];
      if (scene.start > prev.end + EPSILON) problems.push(`gap between "${prev.id}" (ends ${fmt(prev.end)}) and "${scene.id}" (starts ${fmt(scene.start)})`);
      if (scene.start < prev.end - EPSILON) problems.push(`"${scene.id}" (starts ${fmt(scene.start)}) overlaps "${prev.id}" (ends ${fmt(prev.end)})`);
    }
  });
}

function checkChapters(script: StoryScript, problems: string[]) {
  const seen = new Set<string>();
  script.chapters.forEach((chapter, i) => {
    if (seen.has(chapter.id)) problems.push(`chapter "${chapter.id}" appears twice`);
    seen.add(chapter.id);
    if (!(chapter.start >= 0 && chapter.start < 1)) problems.push(`chapter "${chapter.id}" starts outside 0 to 1 (${fmt(chapter.start)})`);
    if (i > 0 && !(chapter.start > script.chapters[i - 1].start)) problems.push(`chapter "${chapter.id}" must start after "${script.chapters[i - 1].id}"`);
  });
}

function beatProblems(beat: BeatDef, script: StoryScript): string[] {
  const problems: string[] = [];
  const name = `beat "${beat.id}"`;
  const scene = script.scenes.find((s) => s.id === beat.scene);
  if (!SLOTS.includes(beat.slot)) problems.push(`${name} has an unknown slot "${beat.slot}"`);
  if (!scene) problems.push(`${name} names an unknown scene "${beat.scene}"`);
  if (!inUnit(beat.in) || !inUnit(beat.out)) problems.push(`${name} runs outside 0 to 1 (${fmt(beat.in)} to ${fmt(beat.out)})`);
  if (!(beat.out > beat.in)) problems.push(`${name} ends before it starts (${fmt(beat.in)} to ${fmt(beat.out)})`);
  if (beat.out - beat.in < script.screen - EPSILON)
    problems.push(`${name} lasts ${((beat.out - beat.in) / script.screen).toFixed(2)} screens; a beat must last at least one screen`);
  const [holdStart, holdEnd] = beat.hold;
  if (!(beat.in - EPSILON <= holdStart && holdStart <= holdEnd + EPSILON && holdEnd <= beat.out + EPSILON))
    problems.push(`${name} has its hold (${fmt(holdStart)} to ${fmt(holdEnd)}) outside its range or reversed`);
  if (scene && !(beat.in >= scene.start - EPSILON && (beat.in < scene.end || scene.end >= 1)))
    problems.push(`${name} starts at ${fmt(beat.in)}, outside its scene "${scene.id}" (${fmt(scene.start)} to ${fmt(scene.end)})`);
  if (beat.leave === "hold" && beat.out < 1 - EPSILON) problems.push(`${name} never leaves, so it must run to 1 (ends ${fmt(beat.out)})`);

  const node = copyAtUnchecked(beat.copy);
  if (node === undefined || node === null || node === "") problems.push(`${name} copy key "${beat.copy}" is not in src/content/copy.ts`);
  else if (beat.parts) {
    if (typeof node !== "object") problems.push(`${name} lists parts, but "${beat.copy}" is a single string`);
    else for (const part of beat.parts) if (!(part in node)) problems.push(`${name} part "${part}" is not in "${beat.copy}"`);
  }
  return problems;
}

function checkBeats(script: StoryScript, problems: string[]) {
  const seen = new Set<string>();
  for (const beat of script.beats) {
    if (seen.has(beat.id)) problems.push(`beat "${beat.id}" appears twice`);
    seen.add(beat.id);
    problems.push(...beatProblems(beat, script));
  }

  for (const slot of SLOTS) {
    const inSlot = script.beats.filter((b) => b.slot === slot).sort((a, b) => a.in - b.in);
    for (let i = 1; i < inSlot.length; i++) {
      const prev = inSlot[i - 1];
      const next = inSlot[i];
      if (next.in < prev.out - EPSILON)
        problems.push(`beats "${prev.id}" (to ${fmt(prev.out)}) and "${next.id}" (from ${fmt(next.in)}) overlap in the ${slot} slot`);
    }
  }
}

function checkTransitions(script: StoryScript, problems: string[]) {
  const seen = new Set<string>();
  const sceneIds = new Set(script.scenes.map((s) => s.id));
  script.transitions.forEach((t, i) => {
    const name = `transition "${t.id}"`;
    if (seen.has(t.id)) problems.push(`${name} appears twice`);
    seen.add(t.id);
    if (!KINDS.includes(t.kind)) problems.push(`${name} has an unknown kind "${t.kind}"`);
    if (!sceneIds.has(t.from) || !sceneIds.has(t.to)) problems.push(`${name} names an unknown scene`);
    if (!inUnit(t.start) || !inUnit(t.end) || !(t.end > t.start)) problems.push(`${name} has a bad range (${fmt(t.start)} to ${fmt(t.end)})`);
    if (t.peak && !(t.start - EPSILON <= t.peak[0] && t.peak[0] <= t.peak[1] + EPSILON && t.peak[1] <= t.end + EPSILON))
      problems.push(`${name} has its peak outside its range`);
    if (t.kind === "viewfinder" && !t.target) problems.push(`${name} needs a target`);
    if (i > 0 && t.start < script.transitions[i - 1].start) problems.push(`${name} is out of order (sort transitions by start)`);
    if (t.from !== t.to) {
      const next = script.scenes.find((s) => s.id === t.to);
      if (next && !(t.start < next.start && next.start < t.end))
        problems.push(`${name} hands "${t.from}" to "${t.to}" but does not straddle their boundary (${fmt(next.start)})`);
      if (next && t.peak && !(t.peak[0] - EPSILON <= next.start && next.start <= t.peak[1] + EPSILON))
        problems.push(`${name} must fully cover the screen at the scene boundary (${fmt(next.start)})`);
    }
    for (const id of t.beats ?? []) if (!script.beats.some((b) => b.id === id)) problems.push(`${name} names an unknown beat "${id}"`);
    if (t.swapAt !== undefined && !(t.swapAt >= t.start && t.swapAt <= t.end)) problems.push(`${name} swaps its scenes outside its own range (${fmt(t.swapAt)})`);
    if (t.origin && !t.origin.every((v) => inUnit(v))) problems.push(`${name} starts outside the stage (origin ${t.origin.join(", ")})`);
  });
  // One transition canvas: its transitions take turns.
  const canvas = script.transitions.filter((t) => t.layer === "canvas");
  for (let i = 1; i < canvas.length; i++)
    if (canvas[i].start < canvas[i - 1].end - EPSILON)
      problems.push(`transitions "${canvas[i - 1].id}" and "${canvas[i].id}" overlap on the transition canvas (${fmt(canvas[i].start)} < ${fmt(canvas[i - 1].end)})`);
}

function checkCamera(script: StoryScript, problems: string[]) {
  const { camera, scenes } = script;
  if (camera.length === 0) {
    problems.push("the camera has no keys");
    return;
  }
  if (Math.abs(camera[0].at) > EPSILON) problems.push(`the first camera key must be at 0 (it is at ${fmt(camera[0].at)})`);
  camera.forEach((k, i) => {
    const name = `camera key ${i} (${k.scene} at ${fmt(k.at)})`;
    const scene = scenes.find((s) => s.id === k.scene);
    if (!scene) problems.push(`${name} names an unknown scene`);
    else if (!(k.at >= scene.start - EPSILON && (k.at < scene.end || scene.end >= 1))) problems.push(`${name} is outside its scene`);
    if (!MOVES.includes(k.move)) problems.push(`${name} has an unknown move "${k.move}"`);
    if (![...k.position, ...k.target, k.fov].every(Number.isFinite)) problems.push(`${name} has a value that is not a number`);
    if (!(k.fov >= 10 && k.fov <= 90)) problems.push(`${name} has a field of view outside 10 to 90 degrees (${k.fov})`);
    if (i > 0 && !(k.at > camera[i - 1].at)) problems.push(`${name} must come after the previous key (keys never share a position)`);
  });
  for (const scene of scenes) if (!camera.some((k) => k.scene === scene.id)) problems.push(`scene "${scene.id}" has no camera key`);
  camera.forEach((k, i) => {
    if (k.move !== "reframe") return;
    const next = camera[i + 1];
    const covered = script.transitions.some(
      (t) => t.peak && k.at >= t.peak[0] - EPSILON && (!next || next.at <= t.peak[1] + EPSILON),
    );
    if (!covered) problems.push(`camera key ${i} reframes outside a fully covered transition`);
  });
}

function checkCues(script: StoryScript, problems: string[]) {
  for (const cue of script.hairlines) {
    const [a, b, c, d] = cue.at;
    if (!(a <= b && b <= c && c <= d)) problems.push(`a hairline ${cue.kind} envelope is out of order (${cue.at.map(fmt).join(", ")})`);
  }
  for (const line of script.progressLines) {
    if (!script.beats.some((b) => b.id === line.beat)) problems.push(`progress line "${line.id}" names an unknown beat`);
    if (!(line.draw[0] < line.draw[1])) problems.push(`progress line "${line.id}" has an empty draw range`);
    if (line.erase && !(line.draw[1] <= line.erase[0] && line.erase[0] < line.erase[1])) problems.push(`progress line "${line.id}" erases before it is drawn`);
  }
  for (const tone of script.tones) if (!(inUnit(tone.start) && inUnit(tone.end) && tone.start < tone.end)) problems.push(`a ${tone.tone} tone cue has a bad range`);
  for (const [id, p] of Object.entries(script.anchors)) if (!inUnit(p)) problems.push(`anchor "${id}" is outside 0 to 1 (${fmt(p)})`);
}

/** Every problem in the script, or an empty list. */
export function scriptProblems(script: StoryScript = SCRIPT): string[] {
  const problems: string[] = [];
  if (!(script.stageVh > 100)) problems.push(`the stage must be taller than one screen (STAGE_VH is ${script.stageVh})`);
  checkScenes(script, problems);
  checkChapters(script, problems);
  checkBeats(script, problems);
  checkTransitions(script, problems);
  checkCamera(script, problems);
  checkCues(script, problems);
  return problems;
}

/** Throws a `ScriptError` listing every problem in the script. */
export function validateScript(script: StoryScript = SCRIPT): void {
  const problems = scriptProblems(script);
  if (problems.length > 0) throw new ScriptError(problems);
}
