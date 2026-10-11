// The art manifest for the Node scripts, read straight from src/content/art.ts.
//
// art.ts is the single source of truth (ids, kinds, aspects, frame counts, paths, anchors). The
// scripts never copy it: the file is transpiled in memory with the project's TypeScript and imported
// as a module, so retuning an anchor in art.ts moves the placeholder's feature on the next run.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOURCE_DIR = join(ROOT, "art", "source");
export const PUBLIC_DIR = join(ROOT, "public");
export const ART_OUT = join(PUBLIC_DIR, "art");
export const STATE_FILE = join(ROOT, "art", "imported.json");

/** Long edge of the encoded loops. */
export const LOOP_SIZE = [1920, 1080];
/** Deploy contract: public/art stays under this many bytes. */
export const BUDGET_BYTES = 60 * 1024 * 1024;
export const JPEG_QUALITY = 82;

export const STILL_EXT = ["png", "jpg", "jpeg", "webp"];
export const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];

/** Load the manifest from src/content/art.ts: `{ art, ids, tiers }`. */
export async function loadArt() {
  const file = join(ROOT, "src", "content", "art.ts");
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: "art.ts",
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const url = `data:text/javascript;base64,${Buffer.from(out.outputText).toString("base64")}`;
  const mod = await import(url);
  return { art: mod.art, ids: mod.ART_IDS, tiers: mod.TIERS };
}

/** `/art/hero/1440.jpg` -> absolute path under public/. */
export const publicPath = (url) => join(PUBLIC_DIR, ...url.split("/").filter(Boolean));

/** Pixel size of a tier for an aspect: the tier is the width (1440 or 768). */
export function tierSize(tier, aspect) {
  const w = Number(tier);
  return [w, Math.round(w / aspect)];
}

/** Every output file an entry needs once imported (frames listed from its manifest when known). */
export function outputsFor(entry, tiers, counts = null) {
  const files = [];
  if (entry.kind === "still") {
    for (const t of tiers) files.push(publicPath(entry.tiers[t]));
    if (entry.last) for (const t of tiers) files.push(publicPath(entry.last[t]));
  } else if (entry.kind === "loop") {
    files.push(publicPath(entry.src), publicPath(entry.poster));
  } else {
    files.push(publicPath(entry.manifest));
    for (const t of tiers) {
      const n = counts?.[t] ?? entry.expectedCount;
      for (let i = 0; i < n; i++) files.push(framePathFor(entry, t, i));
    }
  }
  return files;
}

/** Absolute path of frame `i` of a sequence at a tier (same naming as framePath() in art.ts). */
export const framePathFor = (entry, tier, i) =>
  join(publicPath(entry.tierDirs[tier]), `f_${String(i).padStart(3, "0")}.jpg`);

/**
 * The text of a sequence's manifest.json, tiers in the given order (largest first):
 * {"tiers":{"1440":{"count":N},"768":{"count":N}}}. Written by hand because a JS object puts
 * integer-like keys in numeric order.
 */
export const frameManifestText = (tiers, count) =>
  `{"tiers":{${tiers.map((t) => `"${t}":{"count":${count}}`).join(",")}}}\n`;

/** Read a sequence's manifest.json counts, or null. */
export function readFrameManifest(entry) {
  try {
    return JSON.parse(readFileSync(publicPath(entry.manifest), "utf8")).tiers ?? null;
  } catch {
    return null;
  }
}

/** Find `art/source/<name>.<ext>`: `{ still, video, sidecar }` (paths or null; sidecar parsed). */
export function findSource(name) {
  const pick = (exts) => {
    for (const ext of exts) {
      for (const variant of [ext, ext.toUpperCase()]) {
        const p = join(SOURCE_DIR, `${name}.${variant}`);
        if (existsSync(p) && statSync(p).isFile() && statSync(p).size > 0) return p;
      }
    }
    return null;
  };
  let sidecar = null;
  const json = join(SOURCE_DIR, `${name}.json`);
  if (existsSync(json)) {
    try {
      sidecar = JSON.parse(readFileSync(json, "utf8"));
    } catch {
      sidecar = null;
    }
  }
  return { still: pick(STILL_EXT), video: pick(VIDEO_EXT), sidecar };
}

/** Files in art/source/ (names only), for the summary. */
export function listSources() {
  if (!existsSync(SOURCE_DIR)) return [];
  return readdirSync(SOURCE_DIR).filter((f) => !f.startsWith(".") && statSync(join(SOURCE_DIR, f)).isFile());
}

/** Total size in bytes of a directory tree. */
export function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? dirSize(p) : st.size;
  }
  return total;
}

/** Bytes written for one entry (its files and directories). */
export function entrySize(entry) {
  if (entry.kind === "loop") {
    return [entry.src, entry.poster].reduce((n, u) => n + (existsSync(publicPath(u)) ? statSync(publicPath(u)).size : 0), 0);
  }
  return dirSize(join(ART_OUT, entry.id));
}

export const formatBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

/** The import's record of what each id currently is on disk (art/imported.json). */
export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
