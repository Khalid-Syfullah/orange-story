#!/usr/bin/env node
/**
 * The motion capture (`npm run motion:capture`): scrubs every scene of the story in small steps in
 * Chromium (the production build, 1440 x 900), saves the frames, and builds a contact sheet and a
 * short animated preview per scene, so the movement on the stage can be watched, listed and
 * compared before and after a change (`test-results/motion/issues.md` is the list).
 *
 *   npm run motion:capture                            capture into test-results/motion/after/
 *   npm run motion:capture -- --save before           ... into test-results/motion/before/
 *   npm run motion:capture -- --out test-results/x    ... into any folder
 *   npm run motion:capture -- --scenes graft,pluck    only those scenes
 *   npm run motion:capture -- --range 0.18:0.21:cut   any stretch of progress instead (repeatable; the name is optional)
 *   npm run motion:capture -- --steps 60              frames per scene or stretch (default 60)
 *   npm run motion:capture -- --reverse               also scrub each one back up and compare: exact reversal
 *   npm run motion:capture -- --url http://host:port  film a server that is already running (default: build, then serve on 3200)
 *   npm run motion:capture -- --no-build              serve the build that is there
 *
 * Idle time is held still (`?idle=off`): breathing, sway, the glow and the transitions' drift stop,
 * and the page's CSS animations and transitions are frozen, so every frame is a function of progress
 * alone and the way back must match the way down pixel for pixel. The finale's loop runs on idle
 * time, so it is filmed on its own (`14-finale-loop`) by stepping the held idle time
 * (`stage:idle-time`, see `src/components/stage/idle.tsx`).
 *
 * Per scene, in the output folder: `NN-scene/frame-NNN.jpg` (720 x 450), `NN-scene.png` (the contact
 * sheet, frames left to right, top to bottom, each with its progress) and `NN-scene.webp` (an
 * animated preview at 12 frames a second). With `--reverse`, `reversal.md` says how far each frame on
 * the way back differs from the one on the way down (the stage alone: the text, hairlines and chrome
 * are the scroll test's to check), and any frame that differs is kept, both ways, as `down-NNN.jpg`
 * and `back-NNN.jpg`.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const options = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith("--") ? [args[i + 1]] : []));
const SAVE = option("save", "after");
const OUT = path.resolve(ROOT, option("out", path.join("test-results/motion", SAVE)));
const STEPS = Math.max(2, Number(option("steps", "60")));
const ONLY = option("scenes", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RANGES = options("range");
const REVERSE = args.includes("--reverse");
const BUILD = !args.includes("--no-build");
const PORT = Number(option("port", "3200"));
const GIVEN_URL = option("url", "");

const VIEWPORT = { width: 1440, height: 900 };
const FRAME = { width: 720, height: 450 };
const THUMB = { width: 288, height: 180 };
const PREVIEW = { width: 480, height: 300 };
const PREVIEW_FPS = 12;
const LOOP_SECONDS = 13;
/** Long enough for the hero's intro (`INTRO.total` in `hero-intro.ts`) to have played. */
const INTRO_SECONDS = 4.5;
/** A frame on the way back that differs from its twin by more than this (0 to 255) is kept for a look. */
const KEEP_DIFFERENT = 8;

/** Freezes the page's own CSS animations and transitions (a blinking caret, a fading colour): time, not progress. */
const FREEZE_CSS = "*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-play-state: paused !important; animation-delay: 0s !important; }";
/**
 * For the reversal check: the stage alone (the painted canvas, the transitions, the site's milk panel),
 * without the text, the hairlines and the chrome, whose own reversal the scroll test checks element by
 * element (their glyphs can rasterize a hair differently on the way back).
 */
const STAGE_ONLY_CSS = ['[data-layer="text"]', '[data-layer="hairlines"]', "[data-chrome]"].map((layer) => `html[data-capture-stage] [data-stage] ${layer}, html[data-capture-stage] [data-stage] ${layer} *`).join(", ") + " { visibility: hidden !important; }";

/** The story script, read from the TypeScript source (the same numbers the stage plays). */
async function loadScript() {
  const require = createRequire(path.join(ROOT, "package.json"));
  const { createJiti } = require("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": SRC } });
  return jiti.import(path.join(SRC, "scroll/script.ts"));
}

async function waitForServer(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`The server at ${url} did not answer`);
}

async function startServer() {
  if (BUILD) {
    console.log("Building (npm run build)...");
    const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
    if (build.status !== 0) throw new Error("npm run build failed");
  } else if (!existsSync(path.join(ROOT, ".next/BUILD_ID"))) throw new Error("No production build: run without --no-build");
  const server = spawn("npx", ["next", "start", "--port", String(PORT)], { cwd: ROOT, stdio: "ignore", detached: true });
  const url = `http://127.0.0.1:${PORT}`;
  await waitForServer(url);
  return { url, stop: () => process.kill(-server.pid, "SIGTERM") };
}

/** Lets the stage draw the new progress: two animation frames and a moment. */
const settle = (page, ms = 60) => page.evaluate((wait) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, wait)))), ms);

/** Waits until nothing has been loading for a moment (the art of a scene arriving). */
async function quiet(page, pending, ms = 250, limit = 8000) {
  const until = Date.now() + limit;
  let calm = Date.now();
  while (Date.now() < until) {
    if (pending.size > 0) calm = Date.now();
    else if (Date.now() - calm >= ms) return;
    await page.waitForTimeout(40);
  }
}

async function geometry(page) {
  return page.evaluate(() => {
    const section = document.querySelector("[data-stage]");
    const frame = section.firstElementChild;
    return { top: section.getBoundingClientRect().top + window.scrollY, span: section.offsetHeight - frame.offsetHeight };
  });
}

/** Scrolls the window so the story sits at progress p (desktop: scroll and progress are the same number). */
async function scrollTo(page, g, p) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(g.top + p * g.span));
}

/** One frame: a screenshot, downscaled to `FRAME`, as JPEG. */
async function grab(page) {
  const shot = await page.screenshot({ type: "png" });
  return { jpeg: await sharp(shot).resize(FRAME.width, FRAME.height).jpeg({ quality: 82 }).toBuffer() };
}

/** The stage alone at this moment (`STAGE_ONLY_CSS`), as raw RGB at `FRAME` size, for comparing; and as JPEG. */
async function grabStage(page) {
  await page.evaluate(() => document.documentElement.setAttribute("data-capture-stage", ""));
  const shot = await page.screenshot({ type: "png" });
  await page.evaluate(() => document.documentElement.removeAttribute("data-capture-stage"));
  const resized = sharp(shot).resize(FRAME.width, FRAME.height);
  const [jpeg, raw] = await Promise.all([resized.clone().jpeg({ quality: 82 }).toBuffer(), resized.clone().removeAlpha().raw().toBuffer()]);
  return { jpeg, raw };
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function label(text, width, height) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${height - 18}" width="${width}" height="18" fill="black" fill-opacity="0.55"/><text x="6" y="${height - 5}" font-family="Menlo, monospace" font-size="11" fill="white">${escape(text)}</text></svg>`,
  );
}

/** The contact sheet: the frames in rows of ten, each with its number and progress. */
async function contactSheet(frames, title, file) {
  const cols = 10;
  const rows = Math.ceil(frames.length / cols);
  const head = 34;
  const width = cols * THUMB.width;
  const height = head + rows * THUMB.height;
  const tiles = await Promise.all(
    frames.map(async (f, i) => ({
      input: await sharp(f.jpeg)
        .resize(THUMB.width, THUMB.height)
        .composite([{ input: label(`${String(i).padStart(2, "0")}  ${f.p.toFixed(4)}`, THUMB.width, THUMB.height) }])
        .png()
        .toBuffer(),
      left: (i % cols) * THUMB.width,
      top: head + Math.floor(i / cols) * THUMB.height,
    })),
  );
  const heading = Buffer.from(
    `<svg width="${width}" height="${head}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#15130F"/><text x="12" y="23" font-family="Menlo, monospace" font-size="15" fill="#F6F3EC">${escape(title)}</text></svg>`,
  );
  await sharp({ create: { width, height, channels: 3, background: "#15130F" } })
    .composite([{ input: heading, left: 0, top: 0 }, ...tiles])
    .png()
    .toFile(file);
}

/** The animated preview: the frames in order at `PREVIEW_FPS`, looping. */
async function preview(frames, file) {
  const small = await Promise.all(frames.map((f) => sharp(f.jpeg).resize(PREVIEW.width, PREVIEW.height).png().toBuffer()));
  await sharp(small, { join: { animated: true } })
    .webp({ quality: 70, loop: 0, delay: small.map(() => Math.round(1000 / PREVIEW_FPS)) })
    .toFile(file);
}

/** How far two raw frames differ: the largest channel difference, the share of pixels off by more than 8 levels, and where they are (a box, in frame pixels). */
function difference(a, b) {
  let max = 0;
  let off = 0;
  const box = [FRAME.width, FRAME.height, -1, -1];
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > max) max = d;
    if (d > 8) {
      off++;
      const k = i / 3;
      const x = k % FRAME.width;
      const y = Math.floor(k / FRAME.width);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return { max, share: off / (a.length / 3), box: off ? box : null };
}

/** The progress of each step through a stretch, just inside both ends. */
function stepsThrough(start, end) {
  const inset = Math.min(0.002, (end - start) * 0.01);
  const a = start + inset;
  const b = Math.min(end, 1) - inset;
  return Array.from({ length: STEPS }, (_, i) => a + ((b - a) * i) / (STEPS - 1));
}

async function saveStretch(name, title, frames, backs = []) {
  const dir = path.join(OUT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await Promise.all(frames.map((f, i) => writeFile(path.join(dir, `frame-${String(i).padStart(3, "0")}.jpg`), f.jpeg)));
  await Promise.all(backs.flatMap((b) => [writeFile(path.join(dir, `back-${String(b.i).padStart(3, "0")}.jpg`), b.jpeg), writeFile(path.join(dir, `down-${String(b.i).padStart(3, "0")}.jpg`), b.down)]));
  await contactSheet(frames, title, path.join(OUT, `${name}.png`));
  await preview(frames, path.join(OUT, `${name}.webp`));
}

/** What to film: the scenes asked for (all of them by default), or the stretches given with `--range`. */
function stretches(script) {
  if (RANGES.length) {
    return RANGES.map((r, i) => {
      const [a, b, label] = r.split(":");
      const start = Number(a);
      const end = Number(b);
      if (!(end > start)) throw new Error(`--range ${r}: expected from:to[:name]`);
      return { name: `${String(i).padStart(2, "0")}-${label ?? `${start.toFixed(4)}-${end.toFixed(4)}`}`, start, end, finale: false };
    });
  }
  const scenes = script.SCENES.map((s, i) => ({ ...s, index: i })).filter((s) => !ONLY.length || ONLY.includes(s.id));
  if (!scenes.length) throw new Error(`No scene matches --scenes ${ONLY.join(",")}`);
  return scenes.map((s) => ({ name: `${String(s.index).padStart(2, "0")}-${s.id}`, start: s.start, end: s.end, finale: s.id === "finale" }));
}

async function main() {
  const script = await loadScript();
  const plan = stretches(script);
  await mkdir(OUT, { recursive: true });

  const server = GIVEN_URL ? { url: GIVEN_URL.replace(/\/$/, ""), stop: () => {} } : await startServer();
  const browser = await chromium.launch({ channel: "chromium" });
  const reversal = [];
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const pending = new Set();
    page.on("request", (r) => pending.add(r));
    page.on("requestfinished", (r) => pending.delete(r));
    page.on("requestfailed", (r) => pending.delete(r));
    page.on("pageerror", (e) => console.warn(`page error: ${e.message}`));
    await page.goto(`${server.url}/?idle=off`, { waitUntil: "load" });
    await page.addStyleTag({ content: `${FREEZE_CSS}\n${STAGE_ONLY_CSS}` });
    await page.waitForSelector("[data-stage] canvas");
    await quiet(page, pending, 400, 15_000);
    // The hero's intro plays once per page load, on time (`hero-intro.ts`): film the story after it.
    await page.waitForTimeout(INTRO_SECONDS * 1000);
    const g = await geometry(page);

    for (const stretch of plan) {
      const points = stepsThrough(stretch.start, stretch.end);
      const started = Date.now();
      // Walk through it once first, so its art has loaded (a scene appears whole once its plates have).
      for (const p of [points[0], points[Math.floor(points.length / 2)], points[points.length - 1], points[0]]) {
        await scrollTo(page, g, p);
        await settle(page);
        await quiet(page, pending, 200);
      }
      await settle(page, 200);
      const frames = [];
      for (const p of points) {
        await scrollTo(page, g, p);
        await settle(page);
        if (pending.size) {
          await quiet(page, pending);
          await settle(page);
        }
        frames.push({ p, ...(await grab(page)), stage: REVERSE ? await grabStage(page) : null });
      }
      const backs = [];
      if (REVERSE) {
        const rows = [];
        for (let i = points.length - 1; i >= 0; i--) {
          await scrollTo(page, g, points[i]);
          await settle(page);
          const back = await grabStage(page);
          const diff = difference(frames[i].stage.raw, back.raw);
          rows.push({ i, p: points[i], ...diff });
          if (diff.max > KEEP_DIFFERENT) backs.push({ i, jpeg: back.jpeg, down: frames[i].stage.jpeg });
        }
        reversal.push({ name: stretch.name, rows: rows.reverse() });
      }
      await saveStretch(stretch.name, `${stretch.name}  ${stretch.start.toFixed(4)} to ${stretch.end.toFixed(4)}  ${STEPS} steps  (${path.basename(OUT)})`, frames, backs);
      const worst = REVERSE ? reversal[reversal.length - 1].rows.reduce((m, r) => Math.max(m, r.max), 0) : null;
      console.log(`${stretch.name}: ${frames.length} frames in ${((Date.now() - started) / 1000).toFixed(1)} s${worst === null ? "" : `, way back differs by at most ${worst} levels`}`);
    }

    // The finale's loop runs on idle time: film it at the end of the page, stepping the held clock.
    if (plan.some((s) => s.finale)) {
      await scrollTo(page, g, 1);
      await settle(page, 120);
      const frames = [];
      for (let i = 0; i < STEPS; i++) {
        const t = (LOOP_SECONDS * i) / STEPS;
        await page.evaluate((time) => window.dispatchEvent(new CustomEvent("stage:idle-time", { detail: time })), t);
        await settle(page);
        frames.push({ p: t, ...(await grab(page)) });
      }
      const name = `${String(script.SCENES.length - 1).padStart(2, "0")}-finale-loop`;
      await saveStretch(name, `${name}  idle time 0 to ${LOOP_SECONDS} s  ${STEPS} steps  (${path.basename(OUT)})`, frames);
      console.log(`${name}: ${frames.length} frames of the loop`);
    }
  } finally {
    await browser.close();
    server.stop();
  }

  if (REVERSE) {
    const lines = [
      `# The way back (${path.basename(OUT)})`,
      "",
      "Each stretch scrubbed down, then back up through the same points: how far the stage on the way back differs from the stage on the way down (the painted canvas, the transitions and the site's panel; the text, hairlines and chrome are hidden for this, the scroll test checks them element by element): the largest channel difference, 0 to 255, and the share of pixels off by more than 8 levels. A frame that differs is kept as `down-NNN.jpg` and `back-NNN.jpg` (the stage alone, on the way down and on the way back) beside `frame-NNN.jpg`.",
      "",
    ];
    for (const { name, rows } of reversal) {
      const worst = rows.reduce((m, r) => (r.max > m.max ? r : m), rows[0]);
      const off = rows.filter((r) => r.max > KEEP_DIFFERENT).length;
      const where = worst.box ? `, around x ${worst.box[0]} to ${worst.box[2]}, y ${worst.box[1]} to ${worst.box[3]} of ${FRAME.width} by ${FRAME.height}` : "";
      lines.push(`- ${name}: at most ${worst.max} levels (frame ${worst.i}, ${worst.p.toFixed(4)}, ${(worst.share * 100).toFixed(3)}% of its pixels${where}); ${off} of ${rows.length} frames differ by more than ${KEEP_DIFFERENT}`);
    }
    await writeFile(path.join(OUT, "reversal.md"), `${lines.join("\n")}\n`);
    console.log(`Saved ${path.relative(ROOT, path.join(OUT, "reversal.md"))}`);
  }
  console.log(`Saved ${path.relative(ROOT, OUT)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
