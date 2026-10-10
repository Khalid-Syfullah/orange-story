#!/usr/bin/env node
/**
 * The stand-in oil study for a character plate: the cast member (`cast.mjs`) posed for the plate
 * (`poses.mjs`), built (`figure.mjs`) and painted (`paint.mjs`). Used by `npm run art:placeholders`
 * for every plate whose placeholder kind is `study`.
 *
 *   node scripts/art/study.mjs prune/gardener [out.png] [--scale 2] [--stages stages.png]
 *       one plate on the sky, to look at (default: test-results/studies/); --stages also writes
 *       its normals, height, relief, values, cast shadow and lit colour side by side
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { CAST } from "./cast.mjs";
import { buildFigure, buildHand, plateView } from "./figure.mjs";
import { paintFigure } from "./paint.mjs";
import { POSES } from "./poses.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** World position of a manifest entry's named point (as `platePoint` in src/art/manifest.ts, without z). */
export function worldPoint(entry, name) {
  const p = entry.points?.[name];
  if (!p) throw new Error(`${entry.id} has no point "${name}"`);
  const [W, H] = entry.size;
  const h = entry.height;
  const w = (h * W) / H;
  return [entry.position[0] + (p[0] - entry.anchor[0]) * w, entry.position[1] + (entry.anchor[1] - p[1]) * h];
}

function personFor(spec, entry) {
  const cast = CAST.find((c) => c.id === spec.cast);
  if (!cast) throw new Error(`${entry.id}: unknown cast "${spec.cast}"`);
  if (spec.person) return { ...cast, ...cast.people?.find((p) => p.id === spec.person) };
  return cast;
}

/** Paints one character plate: an RGBA buffer of the entry's size. */
export function renderStudy(entry, manifest) {
  const spec = POSES[entry.id];
  if (!spec) throw new Error(`${entry.id}: no pose in scripts/art/poses.mjs`);
  const byId = (id) => {
    const e = manifest.plates.find((p) => p.id === id);
    if (!e) throw new Error(`unknown plate ${id}`);
    return e;
  };
  const ctx = { entry: byId, point: (id, name) => worldPoint(byId(id), name) };
  const view = plateView(entry);
  const [W, H] = entry.size;
  const person = personFor(spec, entry);
  const seed = `${person.seed}:${spec.seedFrom ?? entry.id}`;
  let fig;
  if (spec.render === "custom") fig = spec.build({ entry, view, ctx, person, seed, W, H });
  else if (spec.render === "hand") fig = buildHand({ person, view, seed, ...spec.pose(ctx, view) });
  else fig = buildFigure({ person, pose: spec.pose(ctx, view), view, show: spec.show, seed });
  const { rgba } = paintFigure(fig, W, H, { seed, hu: fig.hu, edgeFade: spec.edgeFade, haze: spec.haze, density: spec.density, debug: renderStudy.debug });
  return rgba;
}

/** Writes the stages of a painting (form, relief, light, shadow) side by side, for tuning. */
async function dumpStages(file, { img, lit }) {
  const { W, H } = img;
  const tiles = [];
  const gray = (f, lo, hi) => {
    const out = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      const v = img.owner[i] < 0 ? 0 : Math.round(Math.max(0, Math.min(1, (f(i) - lo) / (hi - lo))) * 255);
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = v;
    }
    return out;
  };
  const normals = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) normals[i * 3 + c] = img.owner[i] < 0 ? 0 : Math.round((img.normal[i * 3 + c] * 0.5 + 0.5) * 255);
  const target = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) target[i] = Math.round(lit.target[i] * 255);
  let maxH = 1;
  for (let i = 0; i < W * H; i++) if (img.owner[i] >= 0) maxH = Math.max(maxH, Math.abs(img.height[i]));
  tiles.push(normals, gray((i) => img.height[i], -maxH, maxH), gray((i) => img.relief[i], -8, 8), gray((i) => lit.valueMap[i], 0, 1), gray((i) => lit.shadow[i], 0, 1), target);
  const composite = await sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: "#000" } })
    .composite(tiles.map((t, k) => ({ input: t, raw: { width: W, height: H, channels: 3 }, left: k * W, top: 0 })))
    .png()
    .toBuffer();
  await sharp(composite).toFile(file);
}

async function main() {
  const args = process.argv.slice(2);
  const id = args[0];
  const out = args[1] && !args[1].startsWith("--") ? args[1] : path.join(ROOT, "test-results/studies", `${id.replace("/", "--")}.png`);
  await mkdir(path.dirname(out), { recursive: true });
  const scaleIndex = args.indexOf("--scale");
  const scale = scaleIndex >= 0 ? Number(args[scaleIndex + 1]) : 1;
  const manifest = JSON.parse(await readFile(path.join(ROOT, "public/art/manifest.json"), "utf8"));
  const entry = manifest.plates.find((p) => p.id === id);
  if (!entry) throw new Error(`unknown plate ${id}`);
  const stagesIndex = args.indexOf("--stages");
  let stages = null;
  if (stagesIndex >= 0) renderStudy.debug = (d) => (stages = d);
  const t0 = performance.now();
  const rgba = renderStudy(entry, manifest);
  if (stages) await dumpStages(args[stagesIndex + 1], stages);
  const ms = performance.now() - t0;
  const [W, H] = entry.size;
  await sharp(Buffer.from(rgba.buffer), { raw: { width: W, height: H, channels: 4 } })
    .resize(Math.round(W * scale), Math.round(H * scale), { kernel: scale >= 1 ? "nearest" : "lanczos3" })
    .flatten({ background: "#1f4e9c" })
    .png()
    .toFile(out);
  console.log(`${id}: ${W}x${H} in ${ms.toFixed(0)} ms -> ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
