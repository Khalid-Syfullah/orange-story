#!/usr/bin/env node
/**
 * Placeholder art: writes an image for every entry of `public/art/manifest.json` that still carries
 * a `placeholder` spec, at the entry's path and pixel size, so the story is complete before the
 * painted plates exist. Character plates (`kind: "study"`) are painted as small oil studies by the
 * stand-in painter in `scripts/art/` (the cast in `cast.mjs`, posed in `poses.mjs`); props are drawn
 * and given the same light and surface; skies, masks and sprites stay simple (see
 * `scripts/art/plates.mjs`). Plates render in parallel on worker threads.
 *
 * Final art replaces a file in place: `npm run art:import` writes the painting at the same path,
 * deletes the entry's `placeholder` spec and sets `painted: true`, so this script never overwrites it.
 *
 *   npm run art:placeholders                  regenerate every placeholder
 *   npm run art:placeholders -- --only hero   only entries whose id starts with "hero"
 *   npm run art:placeholders -- --jobs 4      worker threads (default: cores - 1, at most 8)
 *   npm run art:placeholders -- --check       verify every entry has a WebP file of its size, and
 *                                             that no character plate is flat (texture guard)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import sharp from "sharp";

import { isFigurePlate } from "./art/cast.mjs";
import { formatMetrics, judgeTexture, measureFile } from "./art/guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "public/art/manifest.json");

/** Every entry has a WebP file of its listed size; every figure plate passes the texture guard. */
export async function check(entries, { quiet = false } = {}) {
  const problems = [];
  const rows = [];
  for (const entry of entries) {
    const file = path.join(ROOT, "public", entry.src);
    try {
      const meta = await sharp(file).metadata();
      if (meta.width !== entry.size[0] || meta.height !== entry.size[1]) problems.push(`${entry.src} is ${meta.width}x${meta.height}, the manifest says ${entry.size.join("x")}`);
      if (meta.format !== "webp") problems.push(`${entry.src} is ${meta.format}, not webp`);
    } catch {
      problems.push(`${entry.src} is missing`);
      continue;
    }
    if (isFigurePlate(entry.id)) {
      const m = await measureFile(file);
      const verdict = judgeTexture(m);
      rows.push(`  ${verdict.ok ? "ok  " : "FLAT"} ${entry.id.padEnd(26)} ${formatMetrics(m)}${entry.painted ? "  (painted)" : ""}`);
      if (!verdict.ok) problems.push(`${entry.id} is flat: ${verdict.reasons.join(", ")}`);
    }
  }
  if (!quiet && rows.length) console.log(`Texture guard (figure plates):\n${rows.join("\n")}`);
  return problems;
}

/** Renders entries on a pool of worker threads; resolves to { id, buffer, ms } results. */
function renderAll(entries, manifest, jobs) {
  return new Promise((resolve, reject) => {
    const queue = entries.map((e) => e.id).sort((a, b) => cost(manifest, b) - cost(manifest, a));
    const results = [];
    const workers = [];
    let busy = 0;
    const done = () => {
      for (const w of workers) w.terminate();
      resolve(results);
    };
    const feed = (worker) => {
      const id = queue.shift();
      if (!id) {
        if (busy === 0) done();
        return;
      }
      busy++;
      worker.postMessage({ id });
    };
    const count = Math.max(1, Math.min(jobs, entries.length));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL("./art/plate-worker.mjs", import.meta.url), { workerData: { manifest } });
      worker.on("message", (msg) => {
        busy--;
        if (msg.error) {
          for (const w of workers) w.terminate();
          reject(new Error(`${msg.id}: ${msg.error}`));
          return;
        }
        results.push({ ...msg, buffer: Buffer.from(msg.buffer) });
        feed(worker);
      });
      worker.on("error", reject);
      workers.push(worker);
    }
    for (const w of workers) feed(w);
  });
}

/** Rough cost, so the slowest plates start first. */
function cost(manifest, id) {
  const e = manifest.plates.find((p) => p.id === id);
  const px = e.size[0] * e.size[1];
  return e.placeholder?.kind === "study" ? px * 4 : px;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
  const jobsIndex = args.indexOf("--jobs");
  const jobs = jobsIndex >= 0 ? Number(args[jobsIndex + 1]) : Math.min(8, Math.max(1, os.cpus().length - 1));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const entries = manifest.plates.filter((e) => !only || e.id.startsWith(only));

  if (args.includes("--check")) {
    const problems = await check(entries);
    if (problems.length) {
      console.error(`Art check failed:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`Art check passed: ${entries.length} files match the manifest; no figure plate is flat.`);
    return;
  }

  const todo = entries.filter((e) => e.placeholder && !e.painted);
  const kept = entries.length - todo.length;
  const t0 = performance.now();
  const results = await renderAll(todo, manifest, jobs);
  let bytes = 0;
  for (const { id, buffer } of results) {
    const entry = manifest.plates.find((p) => p.id === id);
    const file = path.join(ROOT, "public", entry.src);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);
    bytes += buffer.length;
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`Wrote ${results.length} placeholder${results.length === 1 ? "" : "s"} (${(bytes / 1024).toFixed(0)} KB) in ${secs} s on ${Math.min(jobs, todo.length)} threads${kept ? `, kept ${kept} final art file${kept === 1 ? "" : "s"}` : ""}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
