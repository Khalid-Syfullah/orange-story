#!/usr/bin/env node
// Generates the animated assets (loops and sequences) with Veo through the Gemini API.
//
//   node scripts/art-video.mjs                    dry run: prints what would be made and what it costs
//   node scripts/art-video.mjs --only hero --yes  generate one clip (do this first)
//   node scripts/art-video.mjs --yes              generate every clip that has its stills and no mp4 yet
//
// Options
//   --only id,id         limit to these asset ids
//   --model fast|lite|standard   default fast
//   --resolution 720p|1080p      default 1080p (1080p needs 8 s clips, which is what every clip here uses)
//   --max-usd N          refuse to run when the estimate is higher (default 10)
//   --force              regenerate even when art/source/<id>.mp4 exists
//   --show-prompts       print the exact prompt for each clip (still a dry run without --yes)
//   --yes                actually spend money (without it nothing is sent)
//
// Key: GEMINI_API_KEY in the environment or in .env.art (gitignored). Never printed, never committed.
// Needs Node 18+ and ffmpeg on PATH. No npm dependencies.
//
// Inputs are the stills in art/source/ (png): they are the first and last keyframes. Output goes to
// art/source/<id>.mp4 (audio stripped) and `npm run art:import` takes it from there.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'art', 'source');
const TMP = join(SRC, '.tmp');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Prices per second of video, USD, from ai.google.dev/gemini-api/docs/pricing (checked 2026-10-11).
// Check the page again before a big run: these are previews and change.
const MODELS = {
  fast: { id: 'veo-3.1-fast-generate-preview', usd: { '720p': 0.1, '1080p': 0.12 } },
  lite: { id: 'veo-3.1-lite-generate-preview', usd: { '720p': 0.05, '1080p': 0.08 } },
  standard: { id: 'veo-3.1-generate-preview', usd: { '720p': 0.4, '1080p': 0.4 } },
};

// Veo clips are 4, 6 or 8 s and 16:9 or 9:16 only, so the site's 10 s loops are 8 s and the square
// `drawing` is made inside a 16:9 frame and cropped to its centre square by the import (see the .json sidecar).
// fit: how a still is conformed to 16:9 before it is sent: cover (crop) or pad (cream bars).
const CLIPS = [
  { id: 'hero', heading: 'hero', first: { src: 'hero.png' }, last: { src: 'hero.png' }, loop: true, scene: true },
  { id: 'canopy', heading: 'canopy', first: { src: 'canopy.png' }, last: { src: 'canopy.png' }, loop: true, scene: true },
  { id: 'finale', heading: 'finale', first: { src: 'finale.png' }, last: { src: 'finale.png' }, loop: true, scene: true },
  { id: 'bridge', heading: 'bridge', first: { src: 'hero.mp4:last', fallback: 'hero.png' }, last: { src: 'graft.png' }, scene: false },
  {
    id: 'drawing', heading: 'drawing and plan', first: { src: 'drawing.png', fit: 'pad', pad: '0xEFE6D0' },
    last: { src: 'plan.png', fit: 'pad', pad: '0xEFE6D0' }, scene: true, cropSquare: true, plainStyle: true, // an ink drawing, not an oil painting: no painting preamble
  },
  { id: 'coda', heading: 'coda and share-orange', first: { src: 'coda.png' }, last: { src: 'share-orange.png', fit: 'cover' }, scene: true },
];
const SECONDS = 8;

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const model = MODELS[opt('model', 'fast')];
if (!model) die('--model must be fast, lite or standard');
const resolution = opt('resolution', '1080p');
if (!model.usd[resolution]) die('--resolution must be 720p or 1080p');
const maxUsd = Number(opt('max-usd', '10'));
const only = opt('only', '') ? opt('only', '').split(',') : null;
const yes = flag('yes');
const force = flag('force');

function die(m) { console.error(`art-video: ${m}`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- key ----------
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = join(ROOT, '.env.art');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return '';
}

// ---------- prompts from docs/PAINTINGS.md ----------
const doc = readFileSync(join(ROOT, 'docs', 'PAINTINGS.md'), 'utf8');
const preamble = (doc.match(/STYLE PREAMBLE[^\n]*\n([\s\S]*?)```/) || [])[1]?.trim() || '';
function section(heading) {
  const re = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  const m = re.exec(doc);
  if (!m) return '';
  const rest = doc.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}
function promptFor(c) {
  const s = section(c.heading);
  if (!s) die(`no "## ${c.heading}" section in docs/PAINTINGS.md`);
  const motion = (s.match(/^MOTION[^:\n]*:\s*(.+)$/m) || [])[1];
  if (!motion) die(`no MOTION line for ${c.id} in docs/PAINTINGS.md`);
  let scene = '';
  if (c.scene) {
    const wanted = c.id === 'drawing' ? /^DRAWING/ : c.id === 'coda' ? /^CODA/ : null;
    const lines = s.split('\n').map((l) => l.trim());
    const line = wanted ? lines.find((l) => wanted.test(l)) : lines.find((l) => l && !l.startsWith('```') && !l.startsWith('MOTION'));
    scene = (line || '').replace(/^[A-Z]+ \([^)]*\):\s*/, '');
  }
  const loop = c.loop ? ' It is a seamless loop: the last frame returns exactly to the first.' : '';
  return [c.plainStyle ? '' : preamble, scene, `Motion: ${motion}${loop}`, 'One continuous shot, no cuts, no text, no captions, no music.'].filter(Boolean).join('\n\n');
}

// ---------- ffmpeg helpers ----------
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.error || r.status !== 0) die(`ffmpeg failed: ${(r.error && r.error.message) || r.stderr}`);
}
function conform(inputPath, name, ref) {
  mkdirSync(TMP, { recursive: true });
  const out = join(TMP, `${name}.png`);
  const vf = ref.fit === 'pad'
    ? `scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=${ref.pad || '0x000000'}`
    : 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
  ffmpeg(['-i', inputPath, '-vf', vf, '-frames:v', '1', out]);
  return out;
}
function resolveFrame(ref, label) {
  // "x.mp4:last" = last frame of a clip, falling back to a still
  if (ref.src.endsWith(':last')) {
    const mp4 = join(SRC, ref.src.replace(':last', ''));
    if (existsSync(mp4)) {
      mkdirSync(TMP, { recursive: true });
      const out = join(TMP, `${label}-lastframe.png`);
      ffmpeg(['-sseof', '-0.15', '-i', mp4, '-frames:v', '1', out]);
      return conform(out, label, ref);
    }
    if (ref.fallback && existsSync(join(SRC, ref.fallback))) return conform(join(SRC, ref.fallback), label, ref);
    return null;
  }
  const p = join(SRC, ref.src);
  return existsSync(p) ? conform(p, label, ref) : null;
}
const needsFrom = (c) => [c.first, c.last].map((r) => r.src.replace(':last', '')).concat(c.first.fallback ? [c.first.fallback] : []);

// ---------- Veo ----------
function imagePart(path, shape) {
  const data = readFileSync(path).toString('base64');
  return shape === 'inlineData' ? { inlineData: { mimeType: 'image/png', data } } : { bytesBase64Encoded: data, mimeType: 'image/png' };
}
async function api(path, key, init = {}) {
  const res = await fetch(`${BASE}/${path}`, { ...init, headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' } });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { ok: res.ok, status: res.status, json, text };
}
async function generate(c, key) {
  const first = resolveFrame(c.first, `${c.id}-first`);
  const last = resolveFrame(c.last, `${c.id}-last`);
  if (!first || !last) throw new Error('keyframe not found');
  const prompt = promptFor(c);
  let started;
  for (const shape of ['inlineData', 'bytes']) {
    const body = {
      instances: [{ prompt, image: imagePart(first, shape), lastFrame: imagePart(last, shape) }],
      parameters: { aspectRatio: '16:9', resolution, durationSeconds: SECONDS, personGeneration: 'allow_adult' },
    };
    started = await api(`models/${model.id}:predictLongRunning`, key, { method: 'POST', body: JSON.stringify(body) });
    if (started.ok) break;
    if (started.status !== 400 || shape === 'bytes') throw new Error(`start failed (${started.status}): ${started.text.slice(0, 600)}`);
  }
  const name = started.json?.name;
  if (!name) throw new Error(`no operation name: ${started.text.slice(0, 300)}`);
  const t0 = Date.now();
  for (;;) {
    await sleep(10000);
    const op = await api(name, key);
    if (!op.ok) throw new Error(`poll failed (${op.status}): ${op.text.slice(0, 300)}`);
    if (op.json?.done) {
      if (op.json.error) throw new Error(`generation failed: ${JSON.stringify(op.json.error).slice(0, 400)}`);
      const r = op.json.response?.generateVideoResponse;
      const uri = r?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error(`no video returned${r?.raiMediaFilteredReasons ? ` (filtered: ${r.raiMediaFilteredReasons.join('; ')})` : ''}`);
      return uri;
    }
    if (Date.now() - t0 > 15 * 60 * 1000) throw new Error('timed out after 15 minutes');
    process.stdout.write('.');
  }
}
async function download(uri, key, dest) {
  const res = await fetch(uri, { headers: { 'x-goog-api-key': key }, redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ---------- run ----------
const todo = [];
for (const c of CLIPS) {
  if (only && !only.includes(c.id)) continue;
  const out = join(SRC, `${c.id}.mp4`);
  if (existsSync(out) && !force) { console.log(`skip   ${c.id}: art/source/${c.id}.mp4 exists (use --force to redo)`); continue; }
  const missing = needsFrom(c).filter((f, i, a) => a.indexOf(f) === i && !existsSync(join(SRC, f)));
  const firstOk = c.first.src.endsWith(':last') ? existsSync(join(SRC, c.first.src.replace(':last', ''))) || existsSync(join(SRC, c.first.fallback)) : existsSync(join(SRC, c.first.src));
  const lastOk = existsSync(join(SRC, c.last.src));
  if (!firstOk || !lastOk) { console.log(`skip   ${c.id}: needs ${missing.join(', ') || 'its stills'} in art/source/ first`); continue; }
  todo.push(c);
}
const rate = model.usd[resolution];
const total = todo.length * SECONDS * rate;
console.log(`\nmodel ${model.id}, ${resolution}, ${SECONDS} s per clip, $${rate.toFixed(2)}/s`);
for (const c of todo) console.log(`  ${c.id.padEnd(8)} ${SECONDS} s  $${(SECONDS * rate).toFixed(2)}`);
console.log(`estimate: ${todo.length} clip(s), $${total.toFixed(2)} (you are charged only for clips that succeed)\n`);
if (flag('show-prompts')) for (const c of todo) console.log(`--- ${c.id}\n${promptFor(c)}\n`);
if (!todo.length) process.exit(0);
if (total > maxUsd) die(`estimate $${total.toFixed(2)} is over --max-usd ${maxUsd}`);
if (!yes) { console.log('Dry run: nothing was sent. Add --yes to generate.'); process.exit(0); }

const key = loadKey();
if (!key) die('no key: set GEMINI_API_KEY or put it in .env.art (see .env.art.example)');
if (spawnSync('ffmpeg', ['-version']).error) die('ffmpeg is required on PATH');
mkdirSync(SRC, { recursive: true });

let failed = 0;
for (const c of todo) {
  process.stdout.write(`make   ${c.id} `);
  try {
    const uri = await generate(c, key);
    const part = join(SRC, `${c.id}.part.mp4`);
    await download(uri, key, part);
    ffmpeg(['-i', part, '-an', '-c:v', 'copy', join(SRC, `${c.id}.mp4`)]); // drop Veo's audio track
    rmSync(part, { force: true });
    writeFileSync(join(SRC, `${c.id}.json`), JSON.stringify({ model: model.id, resolution, seconds: SECONDS, aspect: '16:9', loop: !!c.loop, cropSquare: !!c.cropSquare }, null, 2));
    console.log(` ok -> art/source/${c.id}.mp4`);
  } catch (e) {
    failed++;
    console.log(` FAILED: ${e.message}`);
  }
}
rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} clip(s) failed; re-run to retry only those.` : '\nDone. Run: npm run art:import');
process.exit(failed ? 1 : 0);
