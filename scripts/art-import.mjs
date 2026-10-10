#!/usr/bin/env node
/**
 * Brings finished paintings in as plates, with no code changes.
 *
 * Reads every painting under `art/source/<scene>/<name>.(png|jpg|jpeg|webp)` (not committed: large
 * files) whose `<scene>/<name>` is a manifest id, and for each:
 *
 * 1. cuts the figure out: the file's own alpha if it has one, otherwise its flat key colour
 *    (magenta by default, cyan for plates the cast marks so; a sidecar can override it) with a soft
 *    matte, spill suppression and a 2 px defringe;
 * 2. trims it and fits it inside the manifest canvas (contained, standing on the bottom edge for
 *    plates anchored at the foot, or with the sidecar's `anchor` point exactly on the manifest
 *    anchor), keeping the manifest's size, anchor and depth and a transparent margin;
 * 3. reads the optional committed sidecar `art/rig/<scene>/<name>.json` (a figure whose sidecar has
 *    no rig gets a first guess from its cut-out, `guessRig`, to calibrate in the sidecar):
 *      { "key": "magenta" | "cyan" | "#rrggbb",
 *        "points": { "orange": [u, v], "anchor": [u, v], ... },   (fractions of the source image)
 *        "rig": { "hem": [l, t, r, b], "chest": [...], "head": [...], "arm": [...],
 *                 "pivot": [u, v], "neck": [u, v], "shoulder": [u, v], "figures": [{ ... }, ...] },
 *        "margin": 0.03 }
 *    and writes its points (remapped into the canvas; `anchor` only places the painting) and rig
 *    into the manifest;
 * 4. encodes WebP with alpha (quality lowered until the file is at most 600 KB), writes it at the
 *    manifest path, deletes the entry's `placeholder` spec and sets `painted: true`, so
 *    `npm run art:placeholders` never overwrites it;
 * 5. prints a table: plate, source size, output size, KB, alpha margin, warnings.
 *
 *   npm run art:import                      import everything in art/source/
 *   npm run art:import -- --only finale     only ids starting with "finale"
 *   npm run art:import -- --dry-run         everything but writing files and the manifest
 *   npm run art:import -- --rigs            write the painted plates' sidecar rigs into the manifest
 *                                           (no painting imported again); a figure without one
 *                                           gets a first guess from its cut-out
 *   npm run art:import -- --check           every painted entry has its file, at its size, with a
 *                                           clean alpha edge (and figure plates pass the texture guard)
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { castFor, isFigurePlate, rigGuessFor } from "./art/cast.mjs";
import { formatMetrics, judgeTexture, measureTexture } from "./art/guard.mjs";
import { compose, cutOut, edgeReport, formatManifest, guessRig, paintedEntry, planFit, remapPoint, remapRig, trimBox } from "./art/import-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "public/art/manifest.json");
const SOURCE = path.join(ROOT, "art/source");
const RIG = path.join(ROOT, "art/rig");
const MAX_BYTES = 600 * 1024;
const EXTENSIONS = /\.(png|jpe?g|webp|tiff?)$/i;

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );

/** Paintings under art/source, as { id, file }. */
async function findSources() {
  if (!(await exists(SOURCE))) return [];
  const out = [];
  for (const scene of await readdir(SOURCE)) {
    const dir = path.join(SOURCE, scene);
    if (!(await stat(dir)).isDirectory()) continue;
    for (const name of await readdir(dir)) if (EXTENSIONS.test(name)) out.push({ id: `${scene}/${name.replace(EXTENSIONS, "")}`, file: path.join(dir, name) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readSidecar(id) {
  const file = path.join(RIG, `${id}.json`);
  if (!(await exists(file))) return {};
  return JSON.parse(await readFile(file, "utf8"));
}

/** The key colour a plate's brief asks for (`cast.mjs`), unless the sidecar says otherwise. */
const briefKey = (id) => castFor(id)?.plates[id]?.key ?? "magenta";

/** Repeating surfaces and scene backgrounds intentionally reach the canvas edge. */
const fullBleed = (entry) => entry.tile || entry.role === "backdrop" || entry.role === "texture" || entry.id === "site/sea" || entry.id === "site/ground";

/** Cuts a painting out and works out how it fits the manifest canvas (the same for an import and for `--rigs`). */
export async function cutAndFit(entry, file, side) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const key = side.key ?? briefKey(entry.id);
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const cut = fullBleed(entry) ? pixels : cutOut(pixels, W, H, { key, ...(side.matte ?? {}) });
  const box = trimBox(cut, W, H);
  if (!box) throw new Error(`${entry.id}: nothing is left after removing the key colour ${key} (is the background another colour? set "key" in the sidecar)`);
  const registered = side.fit === "canvas";
  if (registered && W * entry.size[1] !== H * entry.size[0]) throw new Error(`${entry.id}: a canvas-registered source must have the manifest's aspect ratio`);
  const fit = registered || fullBleed(entry)
    ? { scale: entry.size[0] / W, x: 0, y: 0, rule: "canvas" }
    : planFit(box, entry.size, entry.anchor, { anchorPoint: side.points?.anchor ?? null, srcSize: [W, H], margin: side.margin ?? 0.03, base: side.base ?? 0.004 });
  return { cut, W, H, key, fit };
}

async function importOne(entry, file, side) {
  const { cut, W, H, key, fit } = await cutAndFit(entry, file, side);
  const canvas = compose(cut, W, H, fit, entry.size);
  const [CW, CH] = entry.size;
  const points = {};
  for (const [name, p] of Object.entries(side.points ?? {})) if (name !== "anchor") points[name] = remapPoint(p, fit, [W, H], entry.size);
  // The sidecar's rig; without one, a first guess from the cut-out (calibrate it in the sidecar).
  const guessed = !side.rig;
  const rig = side.rig ? remapRig(side.rig, fit, [W, H], entry.size) : guessRig(canvas, CW, CH, { ...rigGuessFor(entry.id), anchor: entry.anchor, points: { ...(entry.points ?? {}), ...points } });

  let quality = 90;
  let alphaQuality = 92;
  let buffer;
  for (;;) {
    buffer = await sharp(Buffer.from(canvas.buffer), { raw: { width: CW, height: CH, channels: 4 } })
      .webp({ quality, alphaQuality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (buffer.length <= MAX_BYTES) break;
    if (quality > 70) quality = Math.max(70, quality - 4);
    else if (!fullBleed(entry) && alphaQuality > 32) alphaQuality = Math.max(32, alphaQuality - 12);
    else if (quality > 34) quality = Math.max(34, quality - 4);
    else break;
  }

  const warnings = [];
  const edge = edgeReport(canvas, CW, CH, key);
  if (!fullBleed(entry) && edge.margin < 1) warnings.push("cut by its own image edge");
  if (edge.fringe > 0.02) warnings.push(`${(edge.fringe * 100).toFixed(1)}% of the edge still key-coloured`);
  if (buffer.length > MAX_BYTES) warnings.push("over 600 KB at minimum quality");
  for (const name of Object.keys(entry.points ?? {})) if (!(name in points)) warnings.push(`point "${name}" kept from the manifest: calibrate it (plate lab, /design)`);
  if (guessed && rig) warnings.push("rig guessed from the cut-out: check it on /design and give the sidecar its own");
  if (entry.rig && !rig) warnings.push("rig kept from the manifest (the stand-in's): give the sidecar its own");
  if (isFigurePlate(entry.id)) {
    const verdict = judgeTexture(measureTexture(canvas, CW, CH));
    if (!verdict.ok) warnings.push(`flat: ${verdict.reasons.join(", ")}`);
  }
  if (W < 1024 && H < 1024) warnings.push(`small source (${W}x${H}); ask for a long side of 2048`);
  return { buffer, points, rig, fit, warnings, row: { id: entry.id, source: `${W}x${H}`, output: `${CW}x${CH}`, kb: buffer.length / 1024, margin: edge.margin, quality, rule: fit.rule } };
}

function table(rows) {
  const head = ["plate", "source", "output", "KB", "margin", "fit", "warnings"];
  const lines = rows.map((r) => [r.id, r.source, r.output, r.kb.toFixed(0), `${r.margin}px`, r.rule, r.warnings.join("; ") || "-"]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => String(l[i]).length)));
  const fmt = (cells) => cells.map((c, i) => (i === cells.length - 1 ? String(c) : String(c).padEnd(widths[i]))).join("  ");
  return [fmt(head), fmt(widths.map((w) => "-".repeat(Math.min(w, 40)))), ...lines.map(fmt)].join("\n");
}

/** Every painted entry: its file, at its size, as WebP, with a clean alpha edge; figure plates not flat. */
export async function checkPainted(manifest, only) {
  const problems = [];
  const painted = manifest.plates.filter((e) => e.painted && (!only || e.id.startsWith(only)));
  for (const entry of painted) {
    const file = path.join(ROOT, "public", entry.src);
    if (entry.placeholder) problems.push(`${entry.id} is painted but still has a placeholder spec`);
    if (!(await exists(file))) {
      problems.push(`${entry.src} is missing`);
      continue;
    }
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const meta = await sharp(file).metadata();
    if (meta.format !== "webp") problems.push(`${entry.src} is ${meta.format}, not webp`);
    if (info.width !== entry.size[0] || info.height !== entry.size[1]) problems.push(`${entry.src} is ${info.width}x${info.height}, the manifest says ${entry.size.join("x")}`);
    const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    const edge = edgeReport(rgba, info.width, info.height, briefKey(entry.id));
    if (!fullBleed(entry) && edge.margin < 1) problems.push(`${entry.id} is cut by its own image edge`);
    if (edge.fringe > 0.02) problems.push(`${entry.id} has a key-coloured fringe (${(edge.fringe * 100).toFixed(1)}% of its edge)`);
    let line = `  ${entry.id.padEnd(26)} margin ${String(edge.margin).padStart(3)}px  fringe ${(edge.fringe * 100).toFixed(1)}%`;
    if (isFigurePlate(entry.id)) {
      const m = measureTexture(rgba, info.width, info.height);
      const verdict = judgeTexture(m);
      line += `  ${formatMetrics(m)}`;
      if (!verdict.ok) problems.push(`${entry.id} is flat: ${verdict.reasons.join(", ")}`);
    }
    console.log(line);
  }
  return { problems, count: painted.length };
}

/**
 * Writes each painted plate's sidecar rig into the manifest without importing the painting again
 * (`--rigs`): fractions of the painting become fractions of the plate through the same fit as the
 * import (the identity for a canvas-registered sidecar; the source in art/source is read otherwise).
 */
export async function importRigs(manifest, only) {
  const rows = [];
  let written = 0;
  const sources = await findSources();
  for (let i = 0; i < manifest.plates.length; i++) {
    const entry = manifest.plates[i];
    if (!entry.painted || (only && !entry.id.startsWith(only))) continue;
    const side = await readSidecar(entry.id);
    if (!side.rig) {
      // No rig of its own: a first guess from the plate's own cut-out.
      const guess = rigGuessFor(entry.id);
      if (!guess) continue;
      const { data, info } = await sharp(path.join(ROOT, "public", entry.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const rig = guessRig(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, { ...guess, anchor: entry.anchor, points: entry.points });
      if (!rig || JSON.stringify(rig) === JSON.stringify(entry.rig)) continue;
      manifest.plates[i] = paintedEntry(entry, { points: entry.points, rig });
      rows.push(`  rig  ${entry.id} (guessed from the cut-out: give its sidecar a rig to calibrate it)`);
      written++;
      continue;
    }
    let fit = null;
    let size = null;
    if (side.fit === "canvas" || fullBleed(entry)) {
      fit = { scale: 1, x: 0, y: 0 };
      size = entry.size;
    } else {
      const source = sources.find((s) => s.id === entry.id);
      if (!source) {
        rows.push(`  skip ${entry.id}: its painting is not in art/source (the rig needs its fit)`);
        continue;
      }
      const result = await cutAndFit(entry, source.file, side);
      fit = result.fit;
      size = [result.W, result.H];
    }
    const rig = remapRig(side.rig, fit, size, entry.size);
    if (JSON.stringify(rig) === JSON.stringify(entry.rig)) continue;
    manifest.plates[i] = paintedEntry(entry, { points: entry.points, rig });
    rows.push(`  rig  ${entry.id}`);
    written++;
  }
  return { rows, written };
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
  const dryRun = args.includes("--dry-run");
  const text = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(text);

  if (args.includes("--rigs")) {
    const { rows, written } = await importRigs(manifest, only);
    for (const row of rows) console.log(row);
    if (written && !dryRun) await writeFile(MANIFEST_PATH, formatManifest(manifest));
    console.log(`Rigs: ${written} painted plate${written === 1 ? "" : "s"} took the rig from ${written === 1 ? "its" : "their"} sidecar${dryRun ? " (dry run: nothing written)" : ""}.`);
    return;
  }

  if (args.includes("--check")) {
    const { problems, count } = await checkPainted(manifest, only);
    if (problems.length) {
      console.error(`Import check failed:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(count ? `Import check passed: ${count} painted plate${count === 1 ? "" : "s"}, each at its size with a clean edge.` : "Import check passed: no painted plates yet (every plate is still a stand-in).");
    return;
  }

  const sources = (await findSources()).filter((s) => !only || s.id.startsWith(only));
  const unknown = sources.filter((s) => !manifest.plates.some((p) => p.id === s.id));
  for (const s of unknown) console.warn(`skip ${path.relative(ROOT, s.file)}: no manifest entry "${s.id}"`);
  const todo = sources.filter((s) => !unknown.includes(s));
  if (!todo.length) {
    console.log(`No paintings to import in ${path.relative(ROOT, SOURCE)}/ (save them as art/source/<scene>/<name>.png; see docs/ART-BRIEFS.md).`);
    return;
  }
  const rows = [];
  for (const { id, file } of todo) {
    const index = manifest.plates.findIndex((p) => p.id === id);
    const entry = manifest.plates[index];
    const side = await readSidecar(id);
    const result = await importOne(entry, file, side);
    rows.push({ ...result.row, warnings: result.warnings });
    if (dryRun) continue;
    await writeFile(path.join(ROOT, "public", entry.src), result.buffer);
    manifest.plates[index] = paintedEntry(entry, { points: result.points, rig: result.rig });
  }
  console.log(table(rows));
  if (dryRun) {
    console.log(`\nDry run: nothing written (${rows.length} painting${rows.length === 1 ? "" : "s"}).`);
    return;
  }
  await writeFile(MANIFEST_PATH, formatManifest(manifest));
  console.log(`\nImported ${rows.length} painting${rows.length === 1 ? "" : "s"}; their manifest entries are now painted (no placeholder spec). Run npm test and npm run art:import -- --check.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
