// Encoding helpers for the art scripts: JPEG tiers through sharp, H.264 loops through ffmpeg (or,
// when ffmpeg is not on PATH, through AVFoundation on macOS), and ffmpeg frame access for real videos.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import sharp from "sharp";
import { JPEG_QUALITY, ROOT } from "./art-manifest.mjs";

sharp.cache(false);

// ---------------------------------------------------------------------------------------------
// Tools on this machine
// ---------------------------------------------------------------------------------------------

const has = (cmd, args = ["-version"]) => {
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  return !r.error && r.status === 0;
};

let tools = null;
/** `{ ffmpeg, ffprobe, swift }`: what is available for video work. */
export function videoTools() {
  if (!tools) {
    tools = {
      ffmpeg: has("ffmpeg"),
      ffprobe: has("ffprobe"),
      swift: process.platform === "darwin" && has("swiftc", ["--version"]),
    };
  }
  return tools;
}

/** Which encoder writes loops: "ffmpeg", "avfoundation" or null. */
export function loopEncoder() {
  const t = videoTools();
  return t.ffmpeg ? "ffmpeg" : t.swift ? "avfoundation" : null;
}

// ---------------------------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------------------------

const ensureDir = (file) => mkdirSync(dirname(file), { recursive: true });

/** Raw RGBA (or RGB) pixels -> JPEG file. */
export async function writeJpegRaw(pixels, width, height, file, { channels = 4, quality = JPEG_QUALITY } = {}) {
  ensureDir(file);
  await sharp(pixels, { raw: { width, height, channels } })
    .removeAlpha()
    .jpeg({ quality, mozjpeg: true })
    .toFile(file);
}

/**
 * Write the two tiers of one picture: the large tier as given (raw pixels at its exact size) and
 * every smaller tier resized from it. `targets` = [{ file, width, height }], largest first.
 */
export async function writeTiersRaw(pixels, width, height, targets, { channels = 4, quality = JPEG_QUALITY } = {}) {
  for (const t of targets) {
    ensureDir(t.file);
    let img = sharp(pixels, { raw: { width, height, channels } }).removeAlpha();
    if (t.width !== width || t.height !== height) img = img.resize(t.width, t.height, { fit: "cover", kernel: "lanczos3" });
    await img.jpeg({ quality, mozjpeg: true }).toFile(t.file);
  }
}

/** Any image file or buffer -> cover-resized JPEG tiers. */
export async function writeTiersFrom(input, targets, { quality = JPEG_QUALITY, position = "centre" } = {}) {
  for (const t of targets) {
    ensureDir(t.file);
    await sharp(input, { failOn: "none" })
      .rotate()
      .resize(t.width, t.height, { fit: "cover", position, kernel: "lanczos3" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toFile(t.file);
  }
}

// ---------------------------------------------------------------------------------------------
// Loop encoder: raw RGBA frames in, H.264 mp4 out
// ---------------------------------------------------------------------------------------------

const SWIFT_SOURCE = join(ROOT, "scripts", "lib", "mp4-encode.swift");

/**
 * Colour tags for every loop: BT.709 matrix and primaries with the sRGB transfer function, so a
 * browser decodes the video to the same values as the JPEG posters and frame sequences it is cut
 * against (a BT.709 transfer tag makes players show it about 5% brighter than the stills).
 */
export const LOOP_COLOR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1"];

/** Compile the AVFoundation encoder once into node_modules/.cache (keyed by its source hash). */
function swiftEncoder() {
  const src = readFileSync(SWIFT_SOURCE);
  const hash = createHash("sha1").update(src).digest("hex").slice(0, 10);
  const bin = join(ROOT, "node_modules", ".cache", "orange-art", `mp4-encode-${hash}`);
  if (existsSync(bin)) return bin;
  mkdirSync(dirname(bin), { recursive: true });
  const r = spawnSync("swiftc", ["-O", SWIFT_SOURCE, "-o", bin], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`could not compile the AVFoundation encoder: ${r.stderr || r.error}`);
  return bin;
}

/**
 * Open an H.264 encoder for `frames` RGBA frames of width x height at fps.
 * ffmpeg: libx264 CRF 22, yuv420p, BT.709 matrix and primaries, +faststart, no audio.
 * Both encoders tag the sRGB transfer function (see LOOP_COLOR_TAGS).
 * AVFoundation (macOS without ffmpeg): hardware H.264 High at `kbps`, BT.709, moov up front, no audio.
 * Returns `{ via, write(rgba), close() }`; write() resolves when the pipe can take more.
 */
export function openLoopEncoder(file, { width, height, fps, frames, kbps = 2400 }) {
  const via = loopEncoder();
  if (!via) throw new Error("no H.264 encoder: install ffmpeg (brew install ffmpeg / apt install ffmpeg)");
  ensureDir(file);
  // encode into a scratch directory outside public/ (AVAssetWriter leaves side files next to its
  // output), then copy the finished file into place
  const scratch = join(ROOT, "node_modules", ".cache", "orange-art", "tmp");
  mkdirSync(scratch, { recursive: true });
  const part = join(scratch, `${basename(file)}.part.mp4`);
  const clean = () => {
    for (const f of readdirSync(scratch)) if (f.startsWith(basename(part))) rmSync(join(scratch, f), { force: true });
  };
  clean();
  let child;
  if (via === "ffmpeg") {
    child = spawn(
      "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-profile:v", "high",
        ...LOOP_COLOR_TAGS, "-color_range", "tv",
        "-movflags", "+faststart", "-an", part,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
  } else {
    child = spawn(swiftEncoder(), [part, width, height, fps, frames, kbps].map(String), {
      stdio: ["pipe", "ignore", "pipe"],
    });
  }
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const exited = new Promise((res) => child.on("close", (code) => res(code)));
  const bgra = via === "avfoundation";
  return {
    via,
    async write(rgba) {
      let buf = rgba;
      if (bgra) {
        buf = Buffer.from(rgba);
        for (let i = 0; i < buf.length; i += 4) {
          const r = buf[i];
          buf[i] = buf[i + 2];
          buf[i + 2] = r;
        }
      }
      if (!child.stdin.write(buf)) await new Promise((r) => child.stdin.once("drain", r));
    },
    async close() {
      child.stdin.end();
      const code = await exited;
      if (code !== 0) {
        clean();
        throw new Error(`${via} encoder failed (${code}): ${stderr.trim()}`);
      }
      copyFileSync(part, file);
      clean();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// ffmpeg access to real videos
// ---------------------------------------------------------------------------------------------

/** Run ffmpeg to completion; returns stdout as a Buffer. */
export function ffmpegSync(args, { input } = {}) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { input, maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg failed: ${(r.error && r.error.message) || String(r.stderr)}`);
  return r.stdout;
}

/** `{ frames, fps, duration }` of a video's first video stream. */
export function probeVideo(file) {
  let fps = 24;
  let frames = 0;
  let duration = 0;
  if (videoTools().ffprobe) {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
        "stream=nb_read_frames,r_frame_rate,duration", "-of", "json", file],
      { encoding: "utf8", maxBuffer: 1 << 24 },
    );
    if (!r.error && r.status === 0) {
      const s = JSON.parse(r.stdout).streams?.[0] ?? {};
      const [a, b] = String(s.r_frame_rate ?? "24/1").split("/").map(Number);
      if (a > 0 && b > 0) fps = a / b;
      frames = Number(s.nb_read_frames) || 0;
      duration = Number(s.duration) || 0;
    }
  }
  if (!frames) {
    // No ffprobe: decode to null and read the frame counter.
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-map", "0:v:0", "-f", "null", "-"], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
    });
    const err = String(r.stderr);
    const all = [...err.matchAll(/frame=\s*(\d+)/g)];
    if (all.length) frames = Number(all[all.length - 1][1]);
    const rate = /, ([\d.]+) fps,/.exec(err);
    if (rate) fps = Number(rate[1]);
  }
  if (!duration && frames) duration = frames / fps;
  if (!frames) throw new Error(`could not read frames from ${file}`);
  return { frames, fps, duration };
}

/** The filter chain that conforms a video's frames: optional centre square, then cover to w x h. */
export function frameFilter({ width, height, cropSquare = false }) {
  return [
    cropSquare ? "crop='min(iw,ih)':'min(iw,ih)'" : null,
    `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${width}:${height}`,
    "setsar=1",
  ]
    .filter(Boolean)
    .join(",");
}

/** Frames ffmpeg delivers through a filter chain (the same count eachFrame() will see). */
export function countFrames(file, vf) {
  const out = ffmpegSync(["-nostats", "-progress", "pipe:1", "-i", file, "-map", "0:v:0", "-an", "-vf", vf, "-f", "null", "-"]);
  const all = [...String(out).matchAll(/^frame=(\d+)/gm)];
  const n = all.length ? Number(all[all.length - 1][1]) : 0;
  if (!n) throw new Error(`no frames decoded from ${file}`);
  return n;
}

/**
 * Stream a video's frames as raw RGB at width x height (cover crop, optional centre-square crop
 * first) and hand the ones whose 0-based index is in `wanted` to `onFrame(index, rgb)`.
 */
export async function eachFrame(file, { width, height, cropSquare = false, wanted, onFrame }) {
  const vf = frameFilter({ width, height, cropSquare });
  const child = spawn(
    "ffmpeg",
    ["-loglevel", "error", "-i", file, "-map", "0:v:0", "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const size = width * height * 3;
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  let index = 0;
  let pending = Buffer.alloc(0);
  const jobs = [];
  for await (const chunk of child.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length >= size) {
      const frame = Buffer.from(pending.subarray(0, size));
      pending = pending.subarray(size);
      if (wanted.has(index)) jobs.push(onFrame(index, frame));
      index++;
    }
  }
  const code = await new Promise((res) => (child.exitCode !== null ? res(child.exitCode) : child.on("close", res)));
  if (code !== 0) throw new Error(`ffmpeg failed reading ${file}: ${stderr.trim()}`);
  await Promise.all(jobs);
  return index;
}

/** One frame of a video ("first" or "last") as a PNG buffer at its own size. */
export function grabFrame(file, which) {
  if (which === "first") {
    return ffmpegSync(["-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
  }
  // The last decodable frame: seek to the final half second and take it reversed.
  return ffmpegSync([
    "-sseof", "-0.5", "-i", file, "-map", "0:v:0", "-vf", "reverse", "-frames:v", "1",
    "-f", "image2pipe", "-vcodec", "png", "-",
  ]);
}
