#!/usr/bin/env node
// Imports the paintings into public/art/, painting a placeholder for every asset whose source is
// missing, so every path in src/content/art.ts exists after one run.
//
//   npm run art:import                      import or paint every id in the manifest
//   npm run art:import -- --only hero,coda  just these ids (the check at the end still covers all)
//   npm run art:import -- --force           redo ids that are already up to date
//
// Sources live in art/source/ (gitignored); see art/briefs/README.md for what to drop where:
//   stills      <id>.png|jpg|jpeg|webp            -> public/art/<id>/1440.jpg, 768.jpg (cover-resized)
//               share also takes share-last.png (the halves held apart) -> public/art/share/last/...
//               graft, grove and share may be a 5 s <id>.mp4 instead (a frame is taken from it)
//   loops       hero, canopy, finale: <id>.mp4    -> public/art/<id>.mp4 (H.264 1920x1080, CRF 22,
//               +faststart, no audio, source length, last 0.4 s crossfaded into the first when the
//               ends differ) and public/art/<id>-poster.jpg; a still source makes a static loop
//   sequences   bridge, drawing, coda: <id>.mp4   -> public/art/<id>/1440/f_000.jpg ..., 768/...,
//               manifest.json; frames sampled evenly across the clip at the counts in art.ts
//               (121, 121, 89); <id>.json {"cropSquare": true} crops to the centre square first;
//               a still source fills every frame
//
// Video work needs ffmpeg on PATH (brew install ffmpeg). Without it, stills still import and the
// placeholder loops are encoded with AVFoundation on macOS. Nothing is fetched from the network.
//
// The record of what each id is (real or placeholder, from which files) is art/imported.json;
// an id whose inputs have not changed is skipped. public/art is kept under 70 MB: if it grows past
// that, the sequence frames are re-encoded at lower JPEG quality until it fits.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import sharp from "sharp";
import { paintPlaceholder } from "./art-placeholders.mjs";
import {
  countFrames,
  eachFrame,
  ffmpegSync,
  frameFilter,
  grabFrame,
  LOOP_COLOR_TAGS,
  loopEncoder,
  openLoopEncoder,
  probeVideo,
  videoTools,
  writeTiersFrom,
  writeTiersRaw,
} from "./lib/art-encode.mjs";
import {
  ART_OUT,
  BUDGET_BYTES,
  dirSize,
  entrySize,
  findSource,
  formatBytes,
  frameManifestText,
  framePathFor,
  JPEG_QUALITY,
  listSources,
  loadArt,
  LOOP_SIZE,
  outputsFor,
  publicPath,
  readFrameManifest,
  readState,
  ROOT,
  STATE_FILE,
  tierSize,
} from "./lib/art-manifest.mjs";

/** Which frame of a video stands in for a still (graft opens where the bridge ends). */
const STILL_FROM_VIDEO = { graft: "first", grove: "last", share: "first" };
/** JPEG quality for sequence frames. Real paintings carry paper grain, so 82 would put `drawing` alone near 45 MB. */
const SEQUENCE_QUALITY = 56;

/** A still source for a loop becomes a static loop this long. */
const STATIC_LOOP_SECONDS = 4;
const LOOP_FPS = 24;
const CROSSFADE = 0.4;
/** Mean per-channel difference (0..1) above which a loop's first and last frames "differ visibly". */
const SEAM_THRESHOLD = 0.035;

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const force = argv.includes("--force");
const only = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

// ---------------------------------------------------------------------------------------------
// Fingerprints: an id is redone only when what it is made from changes
// ---------------------------------------------------------------------------------------------

const hashFiles = (files) => {
  const h = createHash("sha1");
  for (const f of files) h.update(readFileSync(join(ROOT, f)));
  return h.digest("hex").slice(0, 12);
};
const PAINTER_HASH = hashFiles(["scripts/art-placeholders.mjs", "scripts/lib/paint.mjs", "scripts/lib/art-encode.mjs", "scripts/lib/mp4-encode.swift"]);
const IMPORT_HASH = hashFiles(["scripts/art-import.mjs", "scripts/lib/art-encode.mjs", "scripts/lib/art-manifest.mjs", "scripts/lib/mp4-encode.swift"]);

function fingerprint(entry, plan, art) {
  const h = createHash("sha1");
  h.update(JSON.stringify({ kind: entry.kind, aspect: entry.aspect, count: entry.expectedCount ?? null }));
  for (const part of plan.parts) {
    if (part.file) {
      const st = statSync(part.file);
      h.update(`${part.name}:${basename(part.file)}:${st.size}:${Math.round(st.mtimeMs)}:${JSON.stringify(part.sidecar ?? null)}:${IMPORT_HASH}`);
    } else {
      // placeholders depend on the painter and on every anchor (the bridge and coda borrow others')
      const anchors = Object.fromEntries(Object.entries(art).map(([id, e]) => [id, [e.anchors ?? null, e.radii ?? null]]));
      h.update(`${part.name}:placeholder:${PAINTER_HASH}:${JSON.stringify(anchors)}`);
    }
  }
  return h.digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------------------------
// Planning: which source feeds which output
// ---------------------------------------------------------------------------------------------

/**
 * For each output part of an entry: the source file and how to read it, or null (placeholder).
 * Parts: still -> "main" (and "last" for share); loop -> "loop"; frames -> "frames".
 */
function planFor(id, entry) {
  const src = findSource(id);
  const ff = videoTools().ffmpeg;
  const notes = [];
  const usable = (video) => {
    if (video && !ff) notes.push(`${basename(video)} needs ffmpeg on PATH (brew install ffmpeg)`);
    return video && ff ? video : null;
  };
  const parts = [];
  if (entry.kind === "still") {
    const video = usable(src.still ? null : src.video);
    parts.push(
      src.still
        ? { name: "main", file: src.still, read: "still" }
        : video
          ? { name: "main", file: video, read: STILL_FROM_VIDEO[id] ?? "first" }
          : { name: "main", file: null },
    );
    if (entry.last) {
      const last = findSource(`${id}-last`);
      const lastVideo = src.video && ff ? src.video : null;
      parts.push(
        last.still
          ? { name: "last", file: last.still, read: "still" }
          : lastVideo
            ? { name: "last", file: lastVideo, read: "last" }
            : { name: "last", file: null },
      );
    }
  } else if (entry.kind === "loop") {
    const video = usable(src.video);
    parts.push(
      video
        ? { name: "loop", file: video, read: "video" }
        : src.still && loopEncoder()
          ? { name: "loop", file: src.still, read: "still" }
          : { name: "loop", file: null },
    );
  } else {
    const video = usable(src.video);
    parts.push(
      video
        ? { name: "frames", file: video, read: "video", sidecar: src.sidecar }
        : src.still
          ? { name: "frames", file: src.still, read: "still" }
          : { name: "frames", file: null },
    );
  }
  return { parts, notes };
}

// ---------------------------------------------------------------------------------------------
// Real imports
// ---------------------------------------------------------------------------------------------

const targetsFor = (entry, tiers, tierPaths) =>
  tiers.map((t) => {
    const [width, height] = tierSize(t, entry.aspect);
    return { file: publicPath(tierPaths[t]), width, height };
  });

async function importStillPart(entry, tiers, part) {
  const paths = part.name === "last" ? entry.last : entry.tiers;
  const input = part.read === "still" ? part.file : grabFrame(part.file, part.read);
  await writeTiersFrom(input, targetsFor(entry, tiers, paths));
}

/** Mean absolute difference (0..1) between two pictures, compared small. */
async function pictureDiff(a, b) {
  const small = (x) => sharp(x).resize(64, 36, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [pa, pb] = await Promise.all([small(a), small(b)]);
  let sum = 0;
  for (let i = 0; i < pa.length; i++) sum += Math.abs(pa[i] - pb[i]);
  return sum / pa.length / 255;
}

async function importLoop(entry, part, log) {
  const [W, H] = LOOP_SIZE;
  const out = publicPath(entry.src);
  const part0 = `${out}.part.mp4`;
  mkdirSync(join(out, ".."), { recursive: true });
  if (part.read === "still") {
    // a still makes a static loop (the shader moves the picture); poster = the still
    const frame = await sharp(part.file).rotate().resize(W, H, { fit: "cover", kernel: "lanczos3" }).flatten({ background: "#000" }).ensureAlpha().raw().toBuffer();
    const frames = STATIC_LOOP_SECONDS * LOOP_FPS;
    const enc = openLoopEncoder(out, { width: W, height: H, fps: LOOP_FPS, frames, kbps: 1200 });
    for (let i = 0; i < frames; i++) await enc.write(frame);
    await enc.close();
    await writeTiersRaw(frame, W, H, [{ file: publicPath(entry.poster), width: W, height: H }]);
    log(`static ${STATIC_LOOP_SECONDS} s loop from ${basename(part.file)} (${enc.via})`);
    return;
  }
  const { fps, duration } = probeVideo(part.file);
  const rate = Math.max(1, Math.round(fps * 1000) / 1000);
  const seam = await pictureDiff(grabFrame(part.file, "first"), grabFrame(part.file, "last"));
  const xfade = seam > SEAM_THRESHOLD && duration > CROSSFADE * 3;
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=${rate}`;
  const encode = [
    "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-profile:v", "high", "-pix_fmt", "yuv420p",
    ...LOOP_COLOR_TAGS, "-movflags", "+faststart", part0,
  ];
  if (xfade) {
    // play from 0.4 s to the end, crossfading the last 0.4 s into the first 0.4 s: the loop
    // point then lands on the frame the clip started from, with no jump
    const graph =
      `[0:v]${vf},split[a][b];[a]trim=start=${CROSSFADE},setpts=PTS-STARTPTS[main];` +
      `[b]trim=end=${CROSSFADE},setpts=PTS-STARTPTS[head];` +
      `[main][head]xfade=transition=fade:duration=${CROSSFADE}:offset=${(duration - 2 * CROSSFADE).toFixed(3)},format=yuv420p[v]`;
    ffmpegSync(["-i", part.file, "-filter_complex", graph, "-map", "[v]", ...encode]);
  } else {
    ffmpegSync(["-i", part.file, "-map", "0:v:0", "-vf", `${vf},format=yuv420p`, ...encode]);
  }
  renameSync(part0, out);
  await writeTiersFrom(grabFrame(out, "first"), [{ file: publicPath(entry.poster), width: W, height: H }]);
  log(`${duration.toFixed(1)} s at ${rate} fps${xfade ? `, ends differed (${(seam * 100).toFixed(1)}%): last ${CROSSFADE} s crossfaded into the first` : ", seamless ends"}`);
}

async function importFrames(entry, tiers, part, log) {
  const n = entry.expectedCount;
  const [W, H] = tierSize(tiers[0], entry.aspect);
  for (const t of tiers) rmSync(publicPath(entry.tierDirs[t]), { recursive: true, force: true });
  const smaller = tiers.slice(1).map((t) => {
    const [width, height] = tierSize(t, entry.aspect);
    return { t, width, height };
  });
  if (part.read === "still") {
    // every frame is the still: write frame 0 once, copy it to the rest
    const first = tiers.map((t) => {
      const [width, height] = tierSize(t, entry.aspect);
      return { file: framePathFor(entry, t, 0), width, height };
    });
    await writeTiersFrom(part.file, first);
    for (const t of tiers) for (let i = 1; i < n; i++) copyFileSync(framePathFor(entry, t, 0), framePathFor(entry, t, i));
    log(`${n} frames, all ${basename(part.file)}`);
  } else {
    const cropSquare = !!part.sidecar?.cropSquare;
    const total = countFrames(part.file, frameFilter({ width: W, height: H, cropSquare }));
    // sample evenly across the whole clip: first frame to last frame
    const pick = Array.from({ length: n }, (_, k) => Math.round((k * (total - 1)) / Math.max(1, n - 1)));
    const wanted = new Map();
    pick.forEach((src, k) => {
      if (!wanted.has(src)) wanted.set(src, []);
      wanted.get(src).push(k);
    });
    const written = new Set();
    await eachFrame(part.file, {
      width: W,
      height: H,
      cropSquare,
      wanted: new Set(wanted.keys()),
      onFrame: async (index, rgb) => {
        const ks = wanted.get(index);
        const k0 = ks[0];
        const targets = [{ file: framePathFor(entry, tiers[0], k0), width: W, height: H }, ...smaller.map((s) => ({ file: framePathFor(entry, s.t, k0), width: s.width, height: s.height }))];
        await writeTiersRaw(rgb, W, H, targets, { channels: 3, quality: SEQUENCE_QUALITY });
        for (const k of ks.slice(1)) for (const t of tiers) copyFileSync(framePathFor(entry, t, k0), framePathFor(entry, t, k));
        for (const k of ks) written.add(k);
      },
    });
    if (written.size !== n) throw new Error(`${entry.id}: wrote ${written.size} of ${n} frames from ${basename(part.file)}`);
    log(`${n} of ${total} frames sampled evenly${cropSquare ? ", centre square" : ""}`);
  }
  writeFileSync(publicPath(entry.manifest), frameManifestText(tiers, n));
}

// ---------------------------------------------------------------------------------------------
// Verification and the size budget
// ---------------------------------------------------------------------------------------------

function missingFor(entry, tiers) {
  const counts = entry.kind === "frames" ? readFrameManifest(entry) : null;
  const want = entry.kind === "frames" && counts ? Object.fromEntries(tiers.map((t) => [t, counts[t]?.count ?? 0])) : null;
  const files = outputsFor(entry, tiers, want);
  const missing = files.filter((f) => !existsSync(f) || statSync(f).size === 0);
  if (entry.kind === "frames" && counts) {
    for (const t of tiers) if (!(counts[t]?.count > 0)) missing.push(`${publicPath(entry.manifest)} (no ${t} count)`);
  }
  return missing;
}

/** Re-encode sequence frames at lower JPEG quality until public/art fits the budget. */
async function enforceBudget(art, tiers, log) {
  let total = dirSize(ART_OUT);
  if (total <= BUDGET_BYTES) return { total, quality: null };
  const sequences = Object.values(art).filter((e) => e.kind === "frames").sort((a, b) => entrySize(b) - entrySize(a));
  for (let q = JPEG_QUALITY - 4; q >= 62 && total > BUDGET_BYTES; q -= 4) {
    for (const entry of sequences) {
      for (const t of tiers) {
        const dir = publicPath(entry.tierDirs[t]);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir).filter((x) => x.endsWith(".jpg"))) {
          const p = join(dir, f);
          const buf = await sharp(p).jpeg({ quality: q, mozjpeg: true }).toBuffer();
          writeFileSync(p, buf);
        }
      }
    }
    total = dirSize(ART_OUT);
    log(`public/art over ${formatBytes(BUDGET_BYTES)}: sequence frames re-encoded at quality ${q} -> ${formatBytes(total)}`);
    if (total <= BUDGET_BYTES) return { total, quality: q };
  }
  return { total, quality: null };
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const { art, ids, tiers } = await loadArt();
  for (const id of only ?? []) if (!ids.includes(id)) throw new Error(`unknown id "${id}" (ids: ${ids.join(", ")})`);
  const tools = videoTools();
  const sources = listSources();
  console.log(`art:import  ${ids.length} assets in src/content/art.ts; art/source/ holds ${sources.length} file(s)${sources.length ? `: ${sources.join(", ")}` : ""}`);
  console.log(`video tools ffmpeg ${tools.ffmpeg ? "yes" : "no"}, loop encoder ${loopEncoder() ?? "none"}\n`);
  mkdirSync(ART_OUT, { recursive: true });

  const state = readState();
  const rows = [];
  const warnings = [];
  const isTTY = process.stdout.isTTY;

  for (const id of ids) {
    const entry = art[id];
    const plan = planFor(id, entry);
    warnings.push(...plan.notes.map((m) => `${id}: ${m}`));
    const real = plan.parts.filter((p) => p.file);
    const source = real.length === plan.parts.length ? "real" : real.length ? "mixed" : "placeholder";
    const from = real.map((p) => basename(p.file)).filter((v, i, a) => a.indexOf(v) === i);
    const fp = fingerprint(entry, plan, art);
    const skip = only && !only.includes(id);
    const fresh = state[id]?.fingerprint === fp && missingFor(entry, tiers).length === 0;
    let status;
    if (skip) {
      status = "not in --only";
    } else if (fresh && !force) {
      status = "up to date";
    } else {
      const started = Date.now();
      const notes = [];
      const log = (m) => notes.push(m);
      const progress = isTTY ? (i, n) => process.stdout.write(`\r  ${id} ${i}/${n}   `) : null;
      const painted = plan.parts.filter((p) => !p.file).map((p) => p.name);
      if (painted.length) {
        await paintPlaceholder(id, { art, tiers, parts: painted, warn: (m) => warnings.push(m), progress });
      }
      for (const part of real) {
        if (entry.kind === "still") await importStillPart(entry, tiers, part);
        else if (entry.kind === "loop") await importLoop(entry, part, log);
        else await importFrames(entry, tiers, part, log);
      }
      if (isTTY) process.stdout.write("\r\x1b[K");
      status = `${source === "placeholder" ? "painted" : source === "mixed" ? "imported + painted" : "imported"} in ${((Date.now() - started) / 1000).toFixed(1)} s${notes.length ? `; ${notes.join("; ")}` : ""}`;
      state[id] = { source, from, fingerprint: fp, updated: new Date().toISOString() };
      console.log(`${id.padEnd(13)} ${status}`);
    }
    rows.push({ id, kind: entry.kind, source: state[id]?.source ?? source, from: state[id]?.from ?? from, status });
  }

  // keep the record in manifest order
  const ordered = Object.fromEntries(ids.filter((id) => state[id]).map((id) => [id, state[id]]));
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(ordered, null, 2)}\n`);

  const budget = await enforceBudget(art, tiers, (m) => warnings.push(m));

  // every id in the manifest must resolve to files on disk
  const missing = [];
  for (const id of ids) for (const f of missingFor(art[id], tiers)) missing.push(`${id}: ${f.replace(`${ROOT}/`, "")}`);

  // summary
  const head = ["asset", "kind", "source", "output", "status"];
  const table = rows.map((r) => [
    r.id,
    r.kind,
    r.source === "placeholder" ? "placeholder" : `${r.source}: ${r.from.join(", ")}`,
    formatBytes(entrySize(art[r.id])),
    r.status,
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(`\n${line(head)}\n${widths.map((w) => "-".repeat(w)).join("  ")}`);
  for (const row of table) console.log(line(row));
  const real = rows.filter((r) => r.source !== "placeholder").length;
  console.log(
    `\n${real} real, ${rows.length - real} placeholder. public/art ${formatBytes(budget.total)} of ${formatBytes(BUDGET_BYTES)}` +
      `${budget.quality ? ` (sequence frames at quality ${budget.quality})` : ""}. ${((Date.now() - t0) / 1000).toFixed(1)} s.`,
  );
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (budget.total > BUDGET_BYTES) console.error(`OVER BUDGET: public/art is ${formatBytes(budget.total)}, the deploy contract allows ${formatBytes(BUDGET_BYTES)}.`);
  if (missing.length) {
    console.error(`\nMISSING ${missing.length} file(s):\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? "\n  ..." : ""}`);
    process.exit(1);
  }
  console.log(`All ${ids.length} ids resolve to files on disk.`);
  if (budget.total > BUDGET_BYTES) process.exit(1);
}

main().catch((err) => {
  console.error(`art:import: ${err.stack || err.message}`);
  process.exit(1);
});
