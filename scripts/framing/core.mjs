/**
 * The measuring side of the framing (`npm run framing`, `npm run art:briefs`): loads the story's own
 * TypeScript (the script, the camera path, the text slots, the framing table, the manifest) through
 * jiti, measures every figure plate's visible box from its image, and works out where each figure
 * lands on a laptop and on a phone at every camera key, along every move, and how many pixels it
 * needs there. Nothing here is a second copy of the stage's math: the projection, the camera path
 * and the fit to a tall screen are the stage's own functions.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { trimBox } from "../art/import-core.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");

/** The stage camera's near plane (`stage-canvas.tsx`): anything nearer is cut away. */
export const NEAR = 0.1;
/** A figure nearer the camera than this, while on screen, is flagged in the move check. */
export const NEAR_MARGIN = 0.35;
/** A change of a figure's screen height share larger than this between two samples of a move (1/48 of it) reads as a pop. */
export const POP_STEP = 0.06;
/** Pixel density the plates are sized for: a 2x display. */
export const DISPLAY_SCALE = 2;
/** The longest side a plate may have. */
export const MAX_SIDE = 2560;

let story = null;

/** The story's modules, loaded once. */
export async function loadStory() {
  if (story) return story;
  const require = createRequire(path.join(ROOT, "package.json"));
  const { createJiti } = require("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": SRC } });
  const load = (file) => jiti.import(path.join(SRC, file));
  const [script, camera, haze, helpers, art, framing] = await Promise.all([
    load("scroll/script.ts"),
    load("components/stage/camera-path.ts"),
    load("components/stage/text-haze.ts"),
    load("scroll/helpers.ts"),
    load("art/manifest.ts"),
    load("scroll/framing.ts"),
  ]);
  story = { script, camera, haze, helpers, art, framing };
  return story;
}

/** The visible (alpha) box of a plate's image, [l, t, r, b] fractions, measured from the file. */
export async function measureBox(entry) {
  const file = path.join(ROOT, "public", entry.src);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = trimBox(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, 24);
  if (!box) return [0, 0, 1, 1];
  const r = (v) => Math.round(v * 1e4) / 1e4;
  return [r(box.x0 / info.width), r(box.y0 / info.height), r(box.x1 / info.width), r(box.y1 / info.height)];
}

/** Figure plates (drawn people and their parts): placed plates with the figure treatment. */
export const isFigure = (entry) => entry.role === "plate" && entry.paint?.figure === true;

/** Visible boxes of every figure plate, measured from the files. */
export async function figureBoxes(plates) {
  const out = new Map();
  for (const entry of plates.filter(isFigure)) out.set(entry.id, await measureBox(entry));
  return out;
}

export const VIEWPORTS = {
  desktop: { name: "desktop", width: 1440, height: 900, stacked: false },
  phone: { name: "phone", width: 390, height: 844, stacked: true },
};

/** The camera path, fitted to a viewport. One path; the aspect is set before each seek. */
export function cameraFor(s) {
  const path = s.camera.createCameraPath(s.script.CAMERA);
  return {
    pose(p, viewport) {
      s.camera.setStageAspect(viewport.width / viewport.height);
      return { ...path.seek(p) };
    },
    kill: () => path.kill(),
  };
}

/** A world box projected to a viewport: its screen rectangle (px), clipped part, and nearest depth. */
export function projectBox(s, pose, box, viewport) {
  const { width: W, height: H } = viewport;
  const corners = [
    [box.x0, box.y0, box.z],
    [box.x1, box.y0, box.z],
    [box.x0, box.y1, box.z],
    [box.x1, box.y1, box.z],
  ].map((c) => s.camera.projectPoint(pose, c, W, H));
  const depth = Math.min(...corners.map((c) => c.depth));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const rect = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  const clip = { left: Math.max(0, rect.left), right: Math.min(W, rect.right), top: Math.max(0, rect.top), bottom: Math.min(H, rect.bottom) };
  const onScreen = depth > 0 && clip.right > clip.left && clip.bottom > clip.top;
  return {
    rect,
    clip: onScreen ? clip : null,
    depth,
    onScreen,
    heightShare: (rect.bottom - rect.top) / H,
    widthShare: (rect.right - rect.left) / W,
    visibleHeightShare: onScreen ? (clip.bottom - clip.top) / H : 0,
    visibleWidthShare: onScreen ? (clip.right - clip.left) / W : 0,
  };
}

/** A world point on screen as fractions of the viewport (null behind the camera). */
export function projectFraction(s, pose, point, viewport) {
  const at = s.camera.projectPoint(pose, point, viewport.width, viewport.height);
  return at.depth > 0 ? { x: at.x / viewport.width, y: at.y / viewport.height } : null;
}

/** The world point of an image point of a plate at its manifest place. */
export function imagePoint(s, entry, [u, v]) {
  const [w, h] = s.art.plateWorldSize(entry);
  return [entry.position[0] + (u - entry.anchor[0]) * w, entry.position[1] + (entry.anchor[1] - v) * h, -entry.depth];
}

/** Plates of a scene that are figures. */
export function sceneFigures(s, scene) {
  return s.art.scenePlates(scene).filter(isFigure);
}

/** Overlap of a clipped screen rectangle (px) with a text slot area (fractions): the share of the slot it covers. */
export function slotOverlap(clip, area, viewport) {
  if (!clip) return 0;
  const l = Math.max(clip.left / viewport.width, area.left);
  const r = Math.min(clip.right / viewport.width, area.right);
  const t = Math.max(clip.top / viewport.height, area.top);
  const b = Math.min(clip.bottom / viewport.height, area.bottom);
  if (r <= l || b <= t) return 0;
  return ((r - l) * (b - t)) / ((area.right - area.left) * (area.bottom - area.top));
}

/** Beats on stage anywhere in [a, b] (sampled). */
export function beatsBetween(s, a, b, samples = 16) {
  const ids = new Set();
  for (let i = 0; i <= samples; i++) for (const beat of s.helpers.visibleBeats(a + ((b - a) * i) / samples)) ids.add(beat.id);
  return [...ids].map((id) => s.helpers.beatOf(id));
}

/**
 * Scenes where a figure is drawn but has left its manifest place (the astronomer steps down the sky
 * in the application and sinks away in the finale): its size there is not a framing.
 */
const AWAY = { "stars/astronomer": ["apply", "finale"] };

/**
 * How many pixels each figure plate needs: the largest its image is drawn (its full height, at its
 * manifest place) on a laptop or a phone, anywhere in the scenes that draw it, times the display
 * scale; its long side follows its aspect, capped at `MAX_SIDE`. Not while a canvas transition runs
 * (the picture is being covered, cut away or uncovered), nor where the figure has left its place.
 */
export function resolutionNeeds(s, boxes, samplesPerScene = 90) {
  const cam = cameraFor(s);
  const needs = [];
  for (const entry of s.art.PLATES.filter(isFigure)) {
    let most = 0;
    let where = "";
    const visible = boxes.get(entry.id) ?? [0, 0, 1, 1];
    const box = s.framing.plateBoxOf(entry, visible);
    const top = imagePoint(s, entry, [entry.anchor[0], 0]);
    const bottom = imagePoint(s, entry, [entry.anchor[0], 1]);
    for (const sceneId of entry.scenes) {
      if (AWAY[entry.id]?.includes(sceneId)) continue;
      const scene = s.helpers.sceneOf(sceneId);
      for (let i = 0; i <= samplesPerScene; i++) {
        const p = scene.start + ((Math.min(scene.end, 1) - scene.start) * i) / samplesPerScene;
        if (s.script.TRANSITIONS.some((t) => t.layer === "canvas" && p >= t.start && p <= t.end)) continue;
        for (const viewport of Object.values(VIEWPORTS)) {
          const pose = cam.pose(p, viewport);
          const seen = projectBox(s, pose, box, viewport);
          if (!seen.onScreen || seen.depth < NEAR) continue;
          const a = s.camera.projectPoint(pose, top, viewport.width, viewport.height);
          const b = s.camera.projectPoint(pose, bottom, viewport.width, viewport.height);
          const px = Math.abs(b.y - a.y) * DISPLAY_SCALE;
          if (px > most) {
            most = px;
            where = `${viewport.name}, ${sceneId} at ${p.toFixed(4)}`;
          }
        }
      }
    }
    const [iw, ih] = entry.size;
    const longPerHeight = Math.max(iw, ih) / ih;
    const neededLong = Math.min(MAX_SIDE, Math.ceil((most * longPerHeight) / 64) * 64);
    needs.push({ id: entry.id, size: entry.size, neededLong, drawnPx: Math.round(most / DISPLAY_SCALE), where });
  }
  cam.kill();
  return needs;
}

/** The painting in art/source for a plate, if one is there (not committed). */
export async function sourceSize(id) {
  for (const ext of ["png", "jpg", "jpeg", "webp", "tif", "tiff"]) {
    const file = path.join(ROOT, "art/source", `${id}.${ext}`);
    if (existsSync(file)) {
      const meta = await sharp(file).metadata();
      return [meta.width, meta.height];
    }
  }
  return null;
}

/** The size (same aspect, multiples of 64) whose long side is `long`. */
export function sizeWithLong([w, h], long) {
  const k = long / Math.max(w, h);
  const r = (v) => Math.max(64, Math.round((v * k) / 64) * 64);
  return [r(w), r(h)];
}
