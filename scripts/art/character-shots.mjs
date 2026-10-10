#!/usr/bin/env node
/**
 * Before-and-after record of the painted characters (not part of the build; output under
 * `test-results/characters/`, which is not committed).
 *
 *   node scripts/art/character-shots.mjs before    copy the story screenshots that show characters
 *                                                  and crop every character plate at full size
 *   node scripts/art/character-shots.mjs after     the same, after a change
 *   node scripts/art/character-shots.mjs compare   side-by-side sheets: compare.png (overview) and
 *                                                  compare/<shot>.png, compare/plates.png
 *
 * Run `npm run test:story` first: the screenshots come from `test-results/story/`.
 */

import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { CHARACTER_PLATES } from "./cast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORY = path.join(ROOT, "test-results/story");
const OUT = path.join(ROOT, "test-results/characters");

/** Story screenshots that show a character (the faq shot has none). */
const SHOTS = ["00-opening", "01-hero", "02-ascent", "03-graft", "04-pluck", "05-share", "06-work", "07-blueprint", "08-site", "09-prune", "10-fall", "12-stars", "13-apply", "14-finale"];

const SKY = { r: 0x1f, g: 0x4e, b: 0x9c, alpha: 1 };

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );

async function record(label) {
  const dir = path.join(OUT, label);
  await mkdir(path.join(dir, "phone"), { recursive: true });
  await mkdir(path.join(dir, "plates"), { recursive: true });
  let shots = 0;
  for (const shot of SHOTS) {
    for (const sub of ["", "phone"]) {
      const from = path.join(STORY, sub, `${shot}.png`);
      if (!(await exists(from))) continue;
      await copyFile(from, path.join(dir, sub, `${shot}.png`));
      shots++;
    }
  }
  const manifest = JSON.parse(await readFile(path.join(ROOT, "public/art/manifest.json"), "utf8"));
  let plates = 0;
  for (const id of CHARACTER_PLATES) {
    const entry = manifest.plates.find((p) => p.id === id);
    if (!entry) continue;
    const file = path.join(ROOT, "public", entry.src);
    // The plate at full size, cropped to what it paints, on the sky it stands on.
    const trimmed = await sharp(file).ensureAlpha().trim({ threshold: 2 }).png().toBuffer();
    await sharp(trimmed).flatten({ background: SKY }).png().toFile(path.join(dir, "plates", `${id.replace("/", "--")}.png`));
    plates++;
  }
  console.log(`Saved ${shots} screenshots and ${plates} character plates to ${path.relative(ROOT, dir)}/.`);
}

/** A labelled pair, before on the left and after on the right, each scaled to `width`. */
async function pair(before, after, width) {
  const tiles = [];
  let height = 0;
  for (const file of [before, after]) {
    const buffer = await sharp(file).resize({ width, withoutEnlargement: false }).flatten({ background: SKY }).png().toBuffer();
    const meta = await sharp(buffer).metadata();
    tiles.push({ buffer, height: meta.height });
    height = Math.max(height, meta.height);
  }
  const gap = 8;
  return sharp({ create: { width: width * 2 + gap, height, channels: 3, background: { r: 20, g: 19, b: 15 } } })
    .composite(tiles.map((t, i) => ({ input: t.buffer, left: i * (width + gap), top: 0 })))
    .png()
    .toBuffer();
}

async function stack(buffers, file) {
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()));
  const width = Math.max(...metas.map((m) => m.width));
  const gap = 12;
  const height = metas.reduce((s, m) => s + m.height, 0) + gap * (buffers.length - 1);
  let top = 0;
  const layers = buffers.map((input, i) => {
    const layer = { input, left: 0, top };
    top += metas[i].height + gap;
    return layer;
  });
  await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 19, b: 15 } } }).composite(layers).png().toFile(file);
}

async function compare() {
  const before = path.join(OUT, "before");
  const after = path.join(OUT, "after");
  const dir = path.join(OUT, "compare");
  await mkdir(dir, { recursive: true });
  const rows = [];
  for (const shot of SHOTS) {
    for (const sub of ["", "phone"]) {
      const a = path.join(before, sub, `${shot}.png`);
      const b = path.join(after, sub, `${shot}.png`);
      if (!(await exists(a)) || !(await exists(b))) continue;
      const full = await pair(a, b, sub ? 412 : 1440);
      await sharp(full).toFile(path.join(dir, `${sub ? "phone-" : ""}${shot}.png`));
      if (!sub && ["01-hero", "03-graft", "04-pluck", "05-share", "06-work", "07-blueprint", "08-site", "09-prune", "12-stars", "14-finale"].includes(shot)) rows.push(await pair(a, b, 720));
    }
  }
  // Every character plate, before and after, at a common height.
  const plateRows = [];
  const names = (await readdir(path.join(after, "plates"))).filter((n) => n.endsWith(".png")).sort();
  for (const name of names) {
    const a = path.join(before, "plates", name);
    const b = path.join(after, "plates", name);
    if (!(await exists(a))) continue;
    plateRows.push(await pair(a, b, 360));
  }
  if (plateRows.length) {
    // Plates in a grid of three pairs per row.
    const metas = await Promise.all(plateRows.map((r) => sharp(r).metadata()));
    const cols = 3;
    const cellW = Math.max(...metas.map((m) => m.width));
    const gap = 16;
    const lines = [];
    for (let i = 0; i < plateRows.length; i += cols) lines.push(plateRows.slice(i, i + cols).map((buffer, j) => ({ buffer, meta: metas[i + j] })));
    const lineHeights = lines.map((l) => Math.max(...l.map((c) => c.meta.height)));
    const sheetH = lineHeights.reduce((s, h) => s + h + gap, 0);
    const layers = [];
    let top = 0;
    lines.forEach((line, k) => {
      line.forEach((cell, j) => layers.push({ input: cell.buffer, left: j * (cellW + gap), top }));
      top += lineHeights[k] + gap;
    });
    const sheet = await sharp({ create: { width: cols * (cellW + gap), height: sheetH, channels: 3, background: { r: 20, g: 19, b: 15 } } })
      .composite(layers)
      .png()
      .toBuffer();
    await sharp(sheet).toFile(path.join(dir, "plates.png"));
    rows.push(await sharp(sheet).resize({ width: 1448 }).png().toBuffer());
  }
  await stack(rows, path.join(OUT, "compare.png"));
  console.log(`Wrote ${path.relative(ROOT, path.join(OUT, "compare.png"))} and ${path.relative(ROOT, dir)}/.`);
}

const mode = process.argv[2];
if (mode === "before" || mode === "after") await record(mode);
else if (mode === "compare") await compare();
else {
  console.error("usage: node scripts/art/character-shots.mjs before|after|compare");
  process.exit(2);
}
