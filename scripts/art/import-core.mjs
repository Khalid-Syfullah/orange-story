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

/**
 * The visible painting in an image: the box of its clearly visible pixels (alpha above about 10%),
 * as [left, top, right, bottom] fractions rounded to 4 places, or the whole image when it is empty.
 * The manifest's `box`, from which a figure's height is worked out (`world-scale.mjs`).
 */
export function visibleBox(rgba, W, H) {
  const box = trimBox(rgba, W, H, 24);
  if (!box) return [0, 0, 1, 1];
  const r = (v) => Math.round(v * 1e4) / 1e4;
  return [r(box.x0 / W), r(box.y0 / H), r(box.x1 / W), r(box.y1 / H)];
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
  // A painting registered to the canvas keeps its fractions exactly (a point that must equal the anchor stays equal to it).
  if (fit.x === 0 && fit.y === 0 && srcSize[0] * fit.scale === size[0] && srcSize[1] * fit.scale === size[1]) return [u, v];
  return [round6((fit.x + u * srcSize[0] * fit.scale) / size[0]), round6((fit.y + v * srcSize[1] * fit.scale) / size[1])];
}

/**
 * A sidecar's rig (rectangles [l, t, r, b] and points, in source fractions; several people under
 * `figures`) to the canvas's fractions.
 */
export function remapRig(rig, fit, srcSize, size) {
  if (!rig) return undefined;
  const out = {};
  for (const [name, value] of Object.entries(rig)) {
    if (name === "figures") out.figures = value.map((f) => remapRig(f, fit, srcSize, size));
    else if (value.length === 4) {
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
/* A first rig, from the cut-out                                       */
/* ------------------------------------------------------------------ */

const r4 = (v) => Math.round(clamp(v) * 1e4) / 1e4;

/** The opaque runs of row `y` between columns `x0` and `x1`: [start, end) pairs. */
function runsOf(solid, W, y, x0, x1) {
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = x < x1 && solid[y * W + x];
    if (on && start < 0) start = x;
    else if (!on && start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  return runs;
}

/** The run of a row nearest to column `c` (or containing it), or null. */
function runNear(runs, c, reach) {
  let best = null;
  let bestD = Infinity;
  for (const [a, b] of runs) {
    const d = c < a ? a - c : c >= b ? c - b + 1 : 0;
    if (d < bestD) {
      bestD = d;
      best = [a, b];
    }
  }
  return bestD <= reach ? best : null;
}

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * One standing person between columns `x0` and `x1` of a silhouette: their feet, head, neck, chest
 * and hem, in pixels (the figure's own height sets every proportion: a head is about a seventh).
 */
function guessPerson(solid, W, H, x0, x1, fingertip, { head: withHead = true, hem: withHem = true } = {}) {
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < H && y0 < 0; y++) for (let x = x0; x < x1; x++) if (solid[y * W + x]) {
    y0 = y;
    break;
  }
  for (let y = H - 1; y >= 0 && y1 < 0; y--) for (let x = x0; x < x1; x++) if (solid[y * W + x]) {
    y1 = y;
    break;
  }
  if (y0 < 0) return null;
  const h = y1 - y0 + 1;
  const row = (t) => Math.min(y1, Math.max(y0, Math.round(y0 + t * h)));
  // The body's axis: the middle of the opaque paint over the torso and the robe.
  let sum = 0;
  let count = 0;
  for (let y = row(0.45); y <= row(0.85); y++) for (let x = x0; x < x1; x++) if (solid[y * W + x]) {
    sum += x;
    count++;
  }
  const axis = count ? sum / count : (x0 + x1) / 2;
  // The feet: the middle of the paint along the bottom.
  sum = 0;
  count = 0;
  for (let y = row(0.97); y <= y1; y++) for (let x = x0; x < x1; x++) if (solid[y * W + x]) {
    sum += x;
    count++;
  }
  const foot = count ? sum / count : axis;
  // The head: the first paint from the top near the axis (a raised arm stands off to one side).
  const reach = 0.12 * h;
  let top = -1;
  for (let y = y0; y <= row(0.45) && top < 0; y++) {
    const run = runNear(runsOf(solid, W, y, x0, x1), axis, reach);
    if (run && run[1] - run[0] >= Math.max(2, 0.02 * h)) top = y;
  }
  if (top < 0) top = y0;
  const chin = top + 0.14 * h;
  let left = Infinity;
  let right = -Infinity;
  let centre = 0;
  let n = 0;
  for (let y = top; y <= Math.min(y1, Math.round(chin)); y++) {
    const run = runNear(runsOf(solid, W, y, x0, x1), axis, reach);
    if (!run) continue;
    left = Math.min(left, run[0]);
    right = Math.max(right, run[1]);
    centre += (run[0] + run[1]) / 2;
    n++;
  }
  const hc = n ? centre / n : axis;
  const half = 0.1 * h;
  const head = [Math.max(left, hc - half) - 0.01 * h, top - 0.02 * h, Math.min(right, hc + half) + 0.01 * h, chin + 0.01 * h];
  // Chest and shoulders: below the chin, as wide as the body there (arms held out are left out).
  const widths = [];
  const centres = [];
  for (let y = Math.round(chin); y <= Math.round(chin + 0.2 * h) && y <= y1; y++) {
    const run = runNear(runsOf(solid, W, y, x0, x1), axis, reach);
    if (!run) continue;
    widths.push(run[1] - run[0]);
    centres.push((run[0] + run[1]) / 2);
  }
  const cw = Math.min(0.3 * h, median(widths) || 0.22 * h);
  const cc = median(centres) || axis;
  const chest = [cc - cw / 2, chin, cc + cw / 2, chin + 0.2 * h];
  // The hem: where the robe ends (its width falls away to the legs below), or the foot of a long robe.
  const robe = [];
  for (let y = row(0.5); y <= row(0.62); y++) {
    const run = runNear(runsOf(solid, W, y, x0, x1), axis, reach);
    if (run) robe.push(run[1] - run[0]);
  }
  const rw = median(robe) || 0.2 * h;
  let bottom = row(0.5);
  for (let y = row(0.5); y <= y1; y++) {
    const run = runNear(runsOf(solid, W, y, x0, x1), axis, reach);
    if (run && run[1] - run[0] >= 0.55 * rw) bottom = y;
  }
  const hem = [axis - rw * 0.65, bottom - 0.16 * h, axis + rw * 0.65, bottom];
  const person = { chest, hem, head, pivot: [foot, y1 + 1], neck: [hc, chin + 0.01 * h] };
  if (!withHem) delete person.hem;
  if (!withHead) {
    // A body whose head is its own plate: no head region; its chest starts at the top of its neck.
    delete person.head;
    person.neck = [hc, top];
    person.chest = [cc - cw / 2, top + 0.04 * h, cc + cw / 2, top + 0.24 * h];
  }
  // A raised arm that points (the astronomer's, to his `fingertip`): from the shoulder on the
  // pointing side to the fingertip, kept off the head.
  if (fingertip) {
    const fx = fingertip[0] * W;
    const fy = fingertip[1] * H;
    const side = fx >= hc ? 1 : -1;
    const shoulder = [cc + side * cw * 0.35, chin + 0.03 * h];
    const near = side > 0 ? Math.max(shoulder[0], head[2] + 0.01 * h) : Math.min(shoulder[0], head[0] - 0.01 * h);
    const pad = 0.05 * h;
    person.arm = side > 0 ? [near, Math.min(fy, shoulder[1]) - pad, Math.max(fx, near) + pad, Math.max(fy, chin - 0.02 * h)] : [Math.min(fx, near) - pad, Math.min(fy, shoulder[1]) - pad, near, Math.max(fy, chin - 0.02 * h)];
    person.shoulder = shoulder;
  }
  return person;
}

/**
 * A first rig for a painted figure from its cut-out (RGBA, W x H), for a plate whose sidecar brings
 * none: `kind` `body` (one person), `crowd` (each person found by the highest points of the
 * silhouette, their heads) or `part` (its joint, the plate's `anchor`). Rectangles and points are
 * fractions of the image, as a sidecar's are. A guess from the silhouette: write the sidecar's own
 * `rig` to calibrate it.
 */
export function guessRig(rgba, W, H, { kind, anchor = [0.5, 1], points = {}, head = true, hem = true }) {
  if (!kind) return undefined;
  if (kind === "part") return { pivot: [r4(anchor[0]), r4(anchor[1])] };
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  const toFractions = (p) => {
    const out = {};
    for (const [k, v] of Object.entries(p)) out[k] = v.length === 4 ? [r4(v[0] / W), r4(v[1] / H), r4(v[2] / W), r4(v[3] / H)] : [r4(v[0] / W), r4(v[1] / H)];
    return out;
  };
  if (kind === "body") {
    const person = guessPerson(solid, W, H, 0, W, points.fingertip ?? null, { head, hem });
    return person ? toFractions(person) : undefined;
  }
  // A crowd: one person under each head. A head is the top of something head-wide: per column, the
  // highest row where the paint there is at least a head across (a staff, a raised hand or a hat's
  // brim is narrower), then the highest of those, a person's width apart.
  const headWidth = Math.max(3, Math.round(0.07 * H));
  const top = new Float32Array(W).fill(H);
  for (let y = 0; y < H; y++) {
    for (const [a, b] of runsOf(solid, W, y, 0, W)) {
      if (b - a < headWidth) continue;
      for (let x = a; x < b; x++) if (top[x] === H) top[x] = y;
    }
  }
  const gap = Math.max(4, Math.round(0.22 * H));
  const heads = [];
  const order = [...top.keys()].filter((x) => top[x] < H * 0.7).sort((a, b) => top[a] - top[b] || a - b);
  for (const x of order) {
    if (heads.length >= 4) break;
    if (heads.every((hx) => Math.abs(hx - x) >= gap)) heads.push(x);
  }
  heads.sort((a, b) => a - b);
  const figures = [];
  heads.forEach((hx, i) => {
    const x0 = i === 0 ? 0 : Math.round((heads[i - 1] + hx) / 2);
    const x1 = i === heads.length - 1 ? W : Math.round((hx + heads[i + 1]) / 2);
    const person = guessPerson(solid, W, H, x0, x1, null);
    if (person) figures.push(toFractions(person));
  });
  return figures.length ? { figures: figures.slice(0, 4) } : undefined;
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
 * points (remapped) over the entry's own, and the sidecar's rig (or, without one, the entry's own,
 * kept until the sidecar has its own); and, when given, the painting's visible `box` and the
 * `height` the world scale gives it. Keys stay in the manifest's order: box right after height,
 * points, rig and paint just before the note.
 */
export function paintedEntry(entry, { points, rig, box, height }) {
  const next = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === "placeholder" || k === "painted" || k === "rig" || k === "points" || k === "paint" || (k === "box" && box)) continue;
    if (k === "height") {
      next.height = height ?? v;
      if (box) next.box = box;
      continue;
    }
    if (k === "note") {
      const merged = { ...(entry.points ?? {}), ...(points ?? {}) };
      if (Object.keys(merged).length) next.points = merged;
      const kept = rig ?? entry.rig;
      if (kept) next.rig = kept;
      if (entry.paint) next.paint = entry.paint;
    }
    next[k] = v;
  }
  next.painted = true;
  return next;
}
