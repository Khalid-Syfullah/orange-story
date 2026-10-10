#!/usr/bin/env node
/**
 * Writes `docs/ART-BRIEFS.md`: a generation brief for every character plate, built from the art
 * manifest (sizes, anchors, points) and the cast (`scripts/art/cast.mjs`), so the briefs never
 * drift from either. Run it again after changing either: `npm run art:briefs`.
 *
 * Each brief: the file to save, the size to ask for, the key colour, a ready-to-paste prompt (the
 * style bible of docs/ART-DIRECTION.md, the character, the pose and framing), a negative prompt,
 * the sidecar to write, what it must match, and what to check afterwards. The document opens with
 * the generation order: one reference sheet per recurring character first, then the plates; then
 * the plates whose paintings are too small for how large the story now draws them ("Regenerate at
 * higher resolution", from the framing: `scripts/framing/core.mjs`).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CAST, LIGHT } from "./art/cast.mjs";
import { parseKey } from "./art/import-core.mjs";
import { figureBoxes, loadStory, MAX_SIDE, resolutionNeeds, sizeWithLong } from "./framing/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/ART-BRIEFS.md");

const STYLE = {
  medium: "An academic neoclassical oil painting in the spirit of the 1860 to 1900 salon, high finish: smooth, blended transitions in the skin and drapery, a fine canvas weave and a faint network of craquelure visible over the paint.",
  figures: "Realistic anatomy, especially hands, necks and wrists; a calm, idealised face; warm blush on cheeks, nose, ears and knuckles; cool grey half-tones; soft lost-and-found edges; no black outlines.",
  marble: "Carved marble, not a living person: warm ivory stone with faint grey veining, warm translucent light in the thin edges, crisp carved folds; blank carved eyes.",
  cloth: "Heavy wool falls in deep, weighty folds with a soft sheen; light linen in fine pleats, crisp creases and translucent thin edges; metal takes warm specular glints.",
  light: `One light for the whole story: ${LIGHT.key}, ${LIGHT.fill}, and ${LIGHT.rim}.`,
};

const NEGATIVE = "cartoon, anime, illustration, vector art, flat colours, cel shading, 3D render, CGI, plastic skin, photograph, extra fingers, missing fingers, fused fingers, deformed hands, extra limbs, black outlines, contour lines, text, letters, signature, watermark, frame, border, vignette, cast shadow on the ground, floor, horizon, gradient background, busy background, cropped limbs";

/** What each anchor is on the figure, for plates not standing on their foot: the importer lands the sidecar's `anchor` point on it. */
const ANCHORS = {
  "hero/statue-orange": "the centre of the fruit",
  "graft/hand-left": "the pinch between thumb and fingers",
  "graft/hand-right": "the pinch between thumb and index finger",
  "pluck/hand": "the tip of the middle finger",
  "pluck/harvester-arm": "the shoulder joint",
  "pluck/harvester-head": "the base of the neck, at the front of the collar",
  "share/arm-open": "the shoulder joint",
  "share/knife-hand": "the very tip of the blade",
  "share/second-hand": "the tip of the middle finger",
  "prune/gardener-arms-1": "his near shoulder joint",
  "prune/gardener-arms-2": "his near shoulder joint",
  "finale/woman-arm": "her shoulder joint",
  "finale/man-arms-1": "his near shoulder joint",
  "finale/man-arms-2": "his near shoulder joint",
};

/**
 * Parts of a figure that turn on a joint (a head on its neck, an arm on its shoulder): the plate each
 * meets and what must overlap there, so no gap shows when the part turns. The stage turns parts by a
 * few degrees (`docs/ART-PLATES.md`, "Rig"); paint past the joint on both sides.
 */
const JOINTS = {
  "pluck/harvester-head": { meets: "pluck/harvester-body", part: "paint the neck on down past the anchor, about a quarter of a head into the collar" },
  "pluck/harvester-arm": { meets: "pluck/harvester-body", part: "paint the sleeve on past the shoulder joint, about a quarter of a head into the body's sleeve cap" },
  "share/arm-open": { meets: "pluck/harvester-body", part: "paint the sleeve on past the shoulder joint, about a quarter of a head into the body's sleeve cap" },
  "prune/gardener-arms-1": { meets: "prune/gardener", part: "paint both sleeves on past the shoulders, about a quarter of a head into the body's sleeve caps" },
  "prune/gardener-arms-2": { meets: "prune/gardener", part: "paint both sleeves on past the shoulders, about a quarter of a head into the body's sleeve caps" },
  "finale/woman-arm": { meets: "finale/woman-body", part: "paint the sleeve on past the shoulder joint, about a quarter of a head into the body" },
  "finale/man-arms-1": { meets: "finale/man-body", part: "paint both sleeves on past the shoulders, about a quarter of a head into the body's sleeve caps" },
  "finale/man-arms-2": { meets: "finale/man-body", part: "paint both sleeves on past the shoulders, about a quarter of a head into the body's sleeve caps" },
};

/** Bodies whose parts turn on them: what to paint under each joint. */
const BODY_JOINTS = {
  "pluck/harvester-body": "a neck stub up into where the head plate starts, and sleeve caps under the shoulders the arm plate covers",
  "prune/gardener": "the shoulders and sleeve caps under where the arm plates start",
  "finale/woman-body": "the shoulder and sleeve under where her arm plate starts",
  "finale/man-body": "the shoulders and sleeve caps under where his arm plates start",
};

/** Sets of frames generated from one pose sequence. */
const SEQUENCES = [
  ["prune/gardener-arms-1", "prune/gardener-arms-2"],
  ["finale/man-arms-1", "finale/man-arms-2"],
  ["pluck/harvester-arm", "share/arm-open"],
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const aspect = ([w, h]) => {
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
};

/** The size to ask the generator for: the manifest's aspect, long side 2048 or more (multiples of 64). */
function requestSize([w, h]) {
  const long = Math.max(w, h);
  const target = Math.max(2048, Math.min(3072, Math.round(long * 1.5)));
  const k = target / long;
  const r = (v) => Math.max(64, Math.round((v * k) / 64) * 64);
  return [r(w), r(h)];
}

const keyName = (key) => (key === "cyan" ? "cyan" : "magenta");
const keyHex = (key) => `#${parseKey(keyName(key))
  .map((v) => v.toString(16).padStart(2, "0"))
  .join("")}`;

/** The sheet a plate's character is drawn from (recurring characters only). */
function sheetFor(c) {
  if (!c.sheet) return null;
  return c.pair ? `${c.pair} reference sheet` : `${c.id} reference sheet`;
}

function describePerson(c, { face = true } = {}) {
  const w = c.words;
  const parts = face ? [w.who, w.face, w.hair, w.costume] : [w.who, w.costume];
  return parts.filter(Boolean).join("; ");
}

function promptFor(c, id, plate, entry, key) {
  const w = c.words;
  const marble = c.kind === "marble";
  const hands = c.kind === "hands";
  // Plates with no face on them (an arm, a body whose head is its own plate) leave the face out.
  const face = plate.gaze != null;
  const lines = [
    STYLE.medium,
    `Subject: ${plate.shows}.`,
    c.kind === "group" ? `The people (some of ${c.people.length} ${w.who.replace(/^ten to twelve /, "")}, spread over three plates; no two alike): ${w.face}; ${w.hair}; ${w.costume}.` : `The character: ${describePerson(c, { face })}.`,
    `Pose: ${plate.pose}.`,
    `Framing and crop: ${plate.framing}; the image is ${aspect(entry.size)} (${entry.size[0] > entry.size[1] ? "landscape" : entry.size[0] < entry.size[1] ? "portrait" : "square"}).`,
  ];
  if (face) lines.push(`Expression and gaze: ${[w.expression, plate.gaze].filter(Boolean).join("; ")}.`);
  const anatomy = "Realistic anatomy of the hand and wrist: knuckles, tendons, nails, warm blush on the knuckles, cool grey half-tones, soft lost-and-found edges, no black outlines.";
  lines.push(marble ? STYLE.marble : hands || !face ? anatomy : STYLE.figures);
  if (!hands || c.garments?.length) lines.push(STYLE.cloth);
  lines.push(STYLE.light);
  lines.push(`Palette: ${w.palette}; the story's orange is the only strong warm accent.`);
  lines.push(`Isolated on a plain, flat, even ${keyName(key)} background (${keyHex(key)}), edge to edge, with a clear margin of background on every side of the subject. No cast shadow on the ground, no text, no ${c.kind === "group" ? "other" : "extra"} people, no frame.`);
  return lines.join(" ");
}

function sheetPrompt(chars) {
  const who = chars.map((c) => `${c.name}: ${describePerson(c)}`).join(" And ");
  const marble = chars.some((c) => c.kind === "marble");
  return [
    STYLE.medium,
    `A character reference sheet for the same painter's later scenes. ${who}.`,
    `Shown full length three times (front, three-quarter from the left, profile from the right), with two head studies (three-quarter and profile) and a study of both hands, all at the same scale, in a neat row; consistent face, hair and costume in every view.`,
    marble ? STYLE.marble : STYLE.figures,
    STYLE.cloth,
    STYLE.light,
    "On a plain, flat, even light grey background. No text, no labels, no frame, no cast shadow on the ground.",
  ].join(" ");
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "public/art/manifest.json"), "utf8"));
  const byId = new Map(manifest.plates.map((p) => [p.id, p]));
  const out = [];
  out.push("# Art briefs");
  out.push("");
  out.push("Generated by `npm run art:briefs` from `public/art/manifest.json` and `scripts/art/cast.mjs`: edit those, not this file. The look is `docs/ART-DIRECTION.md`; how a finished painting becomes a plate is `docs/ART-PLATES.md` (\"Replacing the art\").");
  out.push("");
  out.push("Every character is an original design for this story. Never attach, describe or imitate another site's figures or paintings.");
  out.push("");
  out.push("## Generation order");
  out.push("");
  out.push("1. **Reference sheets first**, one per recurring character (below). Generate each until the face, hair and costume are right; keep the best as the reference for every plate of that character.");
  const sheets = [];
  for (const c of CAST.filter((x) => x.sheet)) {
    const name = sheetFor(c);
    if (!sheets.some((s) => s.name === name)) sheets.push({ name, chars: CAST.filter((x) => sheetFor(x) === name) });
  }
  for (const s of sheets) out.push(`   - \`${s.name}\`: ${s.chars.map((c) => c.name).join(" and ")}`);
  out.push("2. **Then the plates**, character by character in the order below, attaching the character's sheet as the image or character reference each time.");
  out.push(`3. **Sets of frames come from one pose sequence**: generate the first frame, then edit it (same seed, same image) for the next, changing only what the brief says: ${SEQUENCES.map((s) => s.map((id) => `\`${id}\``).join(" then ")).join("; ")}.`);
  out.push("4. **Parts overlap at their joints.** A head and an arm are their own plates and the stage turns them a few degrees on their joint (the head bows, the arm settles, the body leans with a snip): paint each part on past its joint, about a quarter of a head into the body plate, and paint the body under it (the neck stub, the shoulder under the sleeve), so no gap ever shows when a part turns.");
  out.push("5. Save each painting at `art/source/<scene>/<name>.png` (not committed), write its sidecar at `art/rig/<scene>/<name>.json` (committed) with its points and its rig (the chest, hem and head rectangles and the pivots the stage moves it by; see `docs/ART-PLATES.md`), run `npm run art:import`, and calibrate the points in the plate lab (`/design`, points mode) if they are off.");
  out.push("");
  // The paintings the framing draws larger than they are.
  const story = await loadStory();
  const needs = resolutionNeeds(story, await figureBoxes(story.art.PLATES)).filter((n) => n.neededLong > Math.max(...n.size));
  if (needs.length) {
    out.push("## Regenerate at higher resolution");
    out.push("");
    out.push(`The framing (phase 24, \`npm run framing\`) draws these figures larger than their paintings: on a 2x display each needs the long side below (capped at ${MAX_SIDE}). Ask for at least that size, same aspect, and import as usual; raise the plate's manifest \`size\` to the new painting's (the importer fits the painting to it). Until a larger painting exists the current import stays: the stage scales it up.`);
    out.push("");
    out.push("| Plate | Now | Ask for | Drawn up to (CSS px) |");
    out.push("| --- | --- | --- | --- |");
    for (const n of needs) out.push(`| \`${n.id}\` | ${n.size.join(" x ")} | ${sizeWithLong(n.size, n.neededLong).join(" x ")} | ${n.drawnPx} (${n.where}) |`);
    out.push("");
  }
  out.push("## Reference sheets");
  out.push("");
  for (const s of sheets) {
    out.push(`### ${s.name}`);
    out.push("");
    out.push("Save as `art/source/sheets/" + s.name.replace(/ reference sheet$/, "") + ".png` (kept out of the manifest; the importer skips it). Ask for 3072 x 1536.");
    out.push("");
    out.push("```text");
    out.push(sheetPrompt(s.chars));
    out.push("```");
    out.push("");
    out.push(`Recognise them by: ${s.chars.flatMap((c) => c.words.recognise).join("; ")}.`);
    out.push("");
  }
  out.push("## Plates");
  out.push("");
  for (const c of CAST) {
    out.push(`### ${c.name}`);
    out.push("");
    if (c.kind === "group") out.push(`${c.people.length} people over ${Object.keys(c.plates).length} plates: ${c.people.map((p) => `${p.id} (${p.plate.split("/")[1]})`).join(", ")}.`);
    else out.push(`${describePerson(c)}. Palette: ${c.words.palette}.`);
    out.push("");
    for (const [id, plate] of Object.entries(c.plates)) {
      const entry = byId.get(id);
      if (!entry) throw new Error(`cast plate ${id} is not in the manifest`);
      const key = plate.key ?? "magenta";
      const [rw, rh] = requestSize(entry.size);
      const standing = entry.anchor[1] >= 0.999;
      const points = Object.entries(entry.points ?? {});
      out.push(`#### \`${id}\``);
      out.push("");
      out.push(`- **Save as** \`art/source/${id}.png\`; sidecar \`art/rig/${id}.json\`.`);
      out.push(`- **Manifest** ${entry.size[0]} x ${entry.size[1]} px (${aspect(entry.size)}), anchor [${entry.anchor.join(", ")}], depth ${entry.depth}. **Ask for** ${rw} x ${rh} px (same aspect); the importer fits it down.`);
      out.push(`- **Key colour** ${keyName(key)} \`${keyHex(key)}\`${key === "cyan" ? " (skin, red or terracotta dominate this plate)" : ""}.`);
      out.push(`- **Placement** ${standing ? "the figure stands on the bottom edge (the importer stands it there)" : `the sidecar's \`anchor\` point, ${ANCHORS[id] ?? "the anchor"}, lands on the manifest anchor`}.`);
      if (points.length) out.push(`- **Points** (the story ties things to them): ${points.map(([name, at]) => `\`${name}\`: ${plate.points?.[name] ?? "see the note"} (stand-in at [${at.join(", ")}])`).join("; ")}.`);
      if (JOINTS[id]) out.push(`- **Joint** (it turns here, on \`${JOINTS[id].meets}\`): ${JOINTS[id].part}, so no gap shows when it turns.`);
      if (BODY_JOINTS[id]) out.push(`- **Joints** (parts turn on this body): paint ${BODY_JOINTS[id]}, so no gap shows when a part turns.`);
      out.push("");
      out.push("Prompt:");
      out.push("");
      out.push("```text");
      out.push(promptFor(c, id, plate, entry, key));
      out.push("```");
      out.push("");
      out.push("Negative prompt:");
      out.push("");
      out.push("```text");
      out.push(NEGATIVE);
      out.push("```");
      out.push("");
      const sheet = sheetFor(c);
      const sequence = SEQUENCES.find((s) => s.includes(id));
      const consistency = [];
      if (sheet) consistency.push(`attach \`${sheet}\``);
      if (plate.matches?.length) consistency.push(`must match ${plate.matches.map((m) => `\`${m}\``).join(", ")} (${c.kind === "group" ? "same scale, light and palette, different people" : "same person, costume, scale and light"}${plate.matches.some((m) => m.endsWith("-body") || m.endsWith("/gardener")) ? "; the sleeve and shoulder meet the body plate exactly" : ""})`);
      if (sequence && sequence[0] !== id) consistency.push(`edit \`${sequence[sequence.indexOf(id) - 1]}\`, do not generate afresh`);
      if (consistency.length) out.push(`Consistency: ${consistency.join("; ")}.`);
      out.push("");
      const sidecar = { key: keyName(key), points: Object.fromEntries([...(standing ? [] : [["anchor", "[u, v]"]]), ...points.map(([name]) => [name, "[u, v]"])]) };
      const rig = entry.rig;
      if (rig) {
        const box = (name) => (rig[name] ? [[name, "[l, t, r, b]"]] : []);
        const point = (name) => (rig[name] ? [[name, "[u, v]"]] : []);
        sidecar.rig = rig.figures ? { figures: "[{ chest, hem, head, pivot, neck } for each person, left to right]" } : Object.fromEntries([...box("chest"), ...box("hem"), ...box("head"), ...box("arm"), ...point("pivot"), ...point("neck"), ...point("shoulder")]);
      }
      out.push(`Sidecar (fractions of your painting, from its left and top; the plate lab can place the points for you): \`${JSON.stringify(sidecar).replace(/"\[u, v\]"/g, "[u, v]").replace(/"\[l, t, r, b\]"/g, "[l, t, r, b]")}\``);
      out.push("");
      out.push("Check afterwards:");
      out.push("");
      const joint = JOINTS[id] ? ["the part runs on past its joint, overlapping the body plate"] : BODY_JOINTS[id] ? ["the body is painted under each part's joint (no hole where a part meets it)"] : [];
      for (const check of [...plate.check, ...joint, "five fingers on every hand, believable wrists and necks", "no outline, no ground shadow, the background one flat key colour", "nothing touches the edge of the image"]) out.push(`- [ ] ${check}`);
      out.push("");
    }
  }
  await writeFile(OUT, `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${sheets.length} reference sheets, ${CAST.reduce((n, c) => n + Object.keys(c.plates).length, 0)} plate briefs.`);
}

await main();
