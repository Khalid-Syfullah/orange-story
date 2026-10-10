/**
 * The importer's pure parts (no files), unit-tested in `import-core.test.mjs`:
 *
 * - `cutOut`: the figure's alpha from a key colour (or the file's own alpha), with a soft matte,
 *   spill suppression and a defringe of the edge, so no coloured halo remains;
 * - `trimBox`, `planFit`, `compose`: trim to the painting, then fit it inside the manifest canvas
 *   (contained, aligned by the plate's anchor rule, with a transparent margin);
 * - `remapPoint`, `remapRig`: named points and rig regions from the source image's fractions to
 *   the manifest canvas's;
 * - `edgeReport`: the alpha margin to the image border and how much key colour is left in the edge;
 * - `formatManifest`: the manifest written back in its own layout (one key per line).
 *
 * Images are straight-alpha RGBA in Uint8 arrays (W x H x 4).
 */

/** Key colours by name. */
export const KEYS = { magenta: [255, 0, 255], cyan: [0, 255, 255], green: [0, 255, 0] };

/** A key given as a name, a hex string or [r, g, b]. */
export function parseKey(key = "magenta") {
  if (Array.isArray(key)) return key;
  if (KEYS[key]) return KEYS[key];
  const h = String(key).replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(h)) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  throw new Error(`Unknown key colour "${key}"`);
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * How much a colour leans toward the key, 0..1. For a saturated key (magenta, cyan, green) this is
 * how far its strong channels stand above its weak ones (the classic screen difference); for any
 * other key, closeness in RGB.
 */
export function keyExcess([r, g, b], key) {
  const strong = [];
  const weak = [];
  const c = [r, g, b];
  key.forEach((v, i) => (v >= 200 ? strong : v <= 55 ? weak : []).push(c[i]));
  if (strong.length && weak.length) return clamp((Math.min(...strong) - Math.max(...weak)) / 255);
  const d = Math.hypot(r - key[0], g - key[1], b - key[2]) / 441.7;
  return clamp(1 - d * 2.2);
}

/** Pulls a colour's key cast out (despill): its strong channels come down to its weak ones' level. */
export function despill([r, g, b], key, amount = 1) {
  const c = [r, g, b];
  const strong = [];
  const weak = [];
  key.forEach((v, i) => (v >= 200 ? strong : v <= 55 ? weak : null)?.push(i));
  if (!strong.length || !weak.length) return c;
  const ceiling = Math.max(...weak.map((i) => c[i]));
  const over = Math.min(...strong.map((i) => c[i])) - ceiling;
  if (over <= 0) return c;
  for (const i of strong) c[i] -= over * amount;
  return c;
}

/** Whether an image carries its own alpha (more than 1% of its pixels clearly transparent). */
export function hasAlpha(rgba) {
  let clear = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 250) clear++;
  return clear > n * 0.01;
}

/** Distance (px, up to `limit`) from each pixel to the nearest one where `isOut` holds: a cheap two-pass chamfer. */
function distanceTo(isOut, W, H, limit = 8) {
  const d = new Float32Array(W * H).fill(limit);
  for (let i = 0; i < W * H; i++) if (isOut(i)) d[i] = 0;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - W] + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - W - 1] + D);
      if (x < W - 1 && y > 0) d[i] = Math.min(d[i], d[i - W + 1] + D);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < H - 1) d[i] = Math.min(d[i], d[i + W] + 1);
      if (x < W - 1 && y < H - 1) d[i] = Math.min(d[i], d[i + W + 1] + D);
      if (x > 0 && y < H - 1) d[i] = Math.min(d[i], d[i + W - 1] + D);
    }
  return d;
}

/**
 * Cuts the figure out of a painting. Uses the file's alpha when it has one; otherwise removes the
 * key colour with a soft matte (`low`..`high` of key excess fade from opaque to clear). Then, in a
 * band `defringe` px wide along the edge, it pulls the key's cast out of the colour, takes the colour
 * of the nearest solid paint, and eases the alpha in by a pixel, so no coloured halo remains. A
 * little spill suppression runs over the whole figure too (key light bounced onto it).
 */
export function cutOut(rgba, W, H, { key = "magenta", low = 0.1, high = 0.4, defringe = 2, spill = 0.5, useAlpha = "auto" } = {}) {
  const K = parseKey(key);
  const N = W * H;
  const out = new Uint8ClampedArray(rgba.length);
  const own = useAlpha === true || (useAlpha === "auto" && hasAlpha(rgba));
  const alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
    const a = own ? rgba[i * 4 + 3] / 255 : 1 - smoothstep(low, high, keyExcess(c, K));
    alpha[i] = a;
    const s = despill(c, K, own ? 0 : spill);
    out[i * 4] = s[0];
    out[i * 4 + 1] = s[1];
    out[i * 4 + 2] = s[2];
  }
  if (defringe > 0) {
    const dist = distanceTo((i) => alpha[i] < 0.5, W, H, defringe + 2);
    // The edge band takes the colour of solid paint just inside it.
    const solid = (i) => alpha[i] >= 0.98 && dist[i] > defringe;
    const r = Math.ceil(defringe) + 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (alpha[i] <= 0 || dist[i] > defringe) continue;
        let n = 0;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let dy = -r - 1; dy <= r + 1; dy++)
          for (let dx = -r - 1; dx <= r + 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!solid(j)) continue;
            n++;
            sr += out[j * 4];
            sg += out[j * 4 + 1];
            sb += out[j * 4 + 2];
          }
        if (n) {
          out[i * 4] = sr / n;
          out[i * 4 + 1] = sg / n;
          out[i * 4 + 2] = sb / n;
        } else {
          const s = despill([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]], K, 1);
          out[i * 4] = s[0];
          out[i * 4 + 1] = s[1];
          out[i * 4 + 2] = s[2];
        }
        if (!own) alpha[i] *= smoothstep(0, 1.5, dist[i]);
      }
  }
  for (let i = 0; i < N; i++) out[i * 4 + 3] = Math.round(clamp(alpha[i]) * 255);
  return out;
}

/** The box (x0, y0, x1, y1 exclusive) of pixels with alpha above `threshold`, or null. */
export function trimBox(rgba, W, H, threshold = 8) {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (rgba[(y * W + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * How the trimmed painting goes into the manifest canvas: `scale` (canvas px per source px) and
 * the canvas position of the source's (0, 0). Contained inside the canvas less `margin` (a fraction
 * of each side; a plate standing on its anchor's baseline keeps only `base` at the bottom), aligned:
 *
 * - by the source's `anchor` point, if the sidecar names one: it lands exactly on the manifest
 *   anchor (an arm's shoulder, a blade tip), as large as fits;
 * - else, for plates anchored at their foot (anchor y = 1), standing on the bottom edge, centred on
 *   the anchor's x;
 * - else centred in the canvas.
 */
export function planFit(box, size, anchor, { margin = 0.03, base = 0.004, anchorPoint = null, srcSize = null } = {}) {
  const [W, H] = size;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const left = W * margin;
  const right = W * (1 - margin);
  const standing = anchor[1] >= 0.999;
  const top = H * margin;
  const bottom = standing ? H * (1 - base) : H * (1 - margin);
  if (anchorPoint && srcSize) {
    // The source's anchor (px) lands on the canvas anchor; the box must fit around it on every side.
    const ax = anchorPoint[0] * srcSize[0];
    const ay = anchorPoint[1] * srcSize[1];
    const cx = anchor[0] * W;
    const cy = anchor[1] * H;
    const limits = [];
    if (ax > box.x0) limits.push((cx - left) / (ax - box.x0));
    if (box.x1 > ax) limits.push((right - cx) / (box.x1 - ax));
    if (ay > box.y0) limits.push((cy - top) / (ay - box.y0));
    if (box.y1 > ay) limits.push((bottom - cy) / (box.y1 - ay));
    const scale = Math.max(1e-6, Math.min(...limits.filter((v) => v > 0)));
    return { scale, x: cx - ax * scale, y: cy - ay * scale, rule: "anchor" };
  }
  const scale = Math.min((right - left) / bw, (bottom - top) / bh);
  if (standing) {
    const cx = clamp(anchor[0] * W, left + (bw * scale) / 2, right - (bw * scale) / 2);
    return { scale, x: cx - ((box.x0 + box.x1) / 2) * scale, y: bottom - box.y1 * scale, rule: "baseline" };
  }
  return { scale, x: (W - bw * scale) / 2 - box.x0 * scale, y: (top + bottom - bh * scale) / 2 - box.y0 * scale, rule: "centre" };
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** A point in the source's fractions to the manifest canvas's fractions. */
export function remapPoint([u, v], fit, srcSize, size) {
  return [round6((fit.x + u * srcSize[0] * fit.scale) / size[0]), round6((fit.y + v * srcSize[1] * fit.scale) / size[1])];
}

/** A sidecar's rig (rectangles [l, t, r, b] and a pivot, in source fractions) to the canvas's fractions. */
export function remapRig(rig, fit, srcSize, size) {
  if (!rig) return undefined;
  const out = {};
  for (const [name, value] of Object.entries(rig)) {
    if (value.length === 4) {
      const [l, t] = remapPoint([value[0], value[1]], fit, srcSize, size);
      const [r, b] = remapPoint([value[2], value[3]], fit, srcSize, size);
      out[name] = [l, t, r, b];
    } else out[name] = remapPoint(value, fit, srcSize, size);
  }
  return out;
}

/**
 * Places a cut-out (RGBA, srcW x srcH) into a transparent canvas by a fit, with bilinear sampling
 * of premultiplied colour (so edges never pick up the transparent pixels' colour).
 */
export function compose(src, srcW, srcH, fit, [W, H]) {
  const out = new Uint8ClampedArray(W * H * 4);
  const inv = 1 / fit.scale;
  // Downscaling by more than 2x: average a box first so detail does not alias.
  const step = Math.max(1, Math.floor(inv));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5 - fit.x) * inv - 0.5;
      const sy = (y + 0.5 - fit.y) * inv - 0.5;
      if (sx < -1 || sy < -1 || sx > srcW || sy > srcH) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let oy = 0; oy < step; oy++)
        for (let ox = 0; ox < step; ox++) {
          const px = sx + (ox - (step - 1) / 2);
          const py = sy + (oy - (step - 1) / 2);
          const x0 = Math.floor(px);
          const y0 = Math.floor(py);
          const fx = px - x0;
          const fy = py - y0;
          for (const [dx, dy, w] of [
            [0, 0, (1 - fx) * (1 - fy)],
            [1, 0, fx * (1 - fy)],
            [0, 1, (1 - fx) * fy],
            [1, 1, fx * fy],
          ]) {
            const xx = x0 + dx;
            const yy = y0 + dy;
            n += w;
            if (xx < 0 || yy < 0 || xx >= srcW || yy >= srcH || w === 0) continue;
            const j = (yy * srcW + xx) * 4;
            const al = (src[j + 3] / 255) * w;
            r += src[j] * al;
            g += src[j + 1] * al;
            b += src[j + 2] * al;
            a += al;
          }
        }
      if (a <= 0) continue;
      const i = (y * W + x) * 4;
      out[i] = r / a;
      out[i + 1] = g / a;
      out[i + 2] = b / a;
      out[i + 3] = Math.round((a / n) * 255);
    }
  return out;
}

/**
 * The edge of a plate: `margin`, the smallest distance (px) from any visible pixel (alpha > 8) to
 * the image border (0 when something is cut by its own edge), and `fringe`, the share of the
 * half-transparent edge pixels still leaning to the key colour.
 */
export function edgeReport(rgba, W, H, key = "magenta") {
  const K = parseKey(key);
  const box = trimBox(rgba, W, H);
  if (!box) return { margin: Math.min(W, H), fringe: 0, empty: true };
  const margin = Math.min(box.x0, box.y0, W - box.x1, H - box.y1);
  let edge = 0;
  let tinted = 0;
  for (let i = 0; i < W * H; i++) {
    const a = rgba[i * 4 + 3];
    if (a <= 8 || a >= 247) continue;
    edge++;
    if (keyExcess([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], K) > 0.12) tinted++;
  }
  return { margin, fringe: edge ? tinted / edge : 0, empty: false };
}

/* ------------------------------------------------------------------ */
/* The manifest, in its own layout                                     */
/* ------------------------------------------------------------------ */

/** A value on one line: arrays as `[a, b]`, objects as `{ "k": v }`. */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

/** The manifest as `public/art/manifest.json` lays it out: top-level keys, then one plate key per line. */
export function formatManifest(manifest) {
  const lines = ["{"];
  const top = Object.entries(manifest);
  top.forEach(([key, value], k) => {
    const comma = k < top.length - 1 ? "," : "";
    if (key !== "plates") {
      lines.push(`  ${JSON.stringify(key)}: ${inline(value)}${comma}`);
      return;
    }
    lines.push(`  "plates": [`);
    value.forEach((plate, p) => {
      lines.push("    {");
      const entries = Object.entries(plate);
      entries.forEach(([pk, pv], e) => lines.push(`      ${JSON.stringify(pk)}: ${inline(pv)}${e < entries.length - 1 ? "," : ""}`));
      lines.push(`    }${p < value.length - 1 ? "," : ""}`);
    });
    lines.push(`  ]${comma}`);
  });
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/**
 * The manifest entry after an import: the placeholder spec gone, `painted: true`, the sidecar's
 * points (remapped) over the entry's own, and the rig. Keys stay in the manifest's order.
 */
export function paintedEntry(entry, { points, rig }) {
  const next = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === "placeholder" || k === "painted" || k === "rig") continue;
    if (k === "note") {
      const merged = { ...(entry.points ?? {}), ...(points ?? {}) };
      if (Object.keys(merged).length) next.points = merged;
      if (rig) next.rig = rig;
    }
    if (k === "points") continue;
    next[k] = v;
  }
  next.painted = true;
  return next;
}
