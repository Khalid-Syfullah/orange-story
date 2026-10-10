/**
 * The stand-in painter: turns a built figure (`figure.mjs`) into a small oil study, in four stages.
 *
 * 1. Form: the layers are composited in painter's order into coverage, height, normals and the part
 *    that owns each pixel; cloth gets its folds and bumps as a relief.
 * 2. Light: the story's one light (warm sun from the upper left, cool sky fill on the shadow side, a
 *    thin warm rim on the right) gives five values (light, half-tone, core shadow, reflected light,
 *    cast shadow, by ray-marching the height toward the sun); shadows lean to sky blue on cloth and
 *    to red ochre on skin; marble gets veins and warm, translucent thin edges.
 * 3. Paint: thousands of short, seeded, translucent strokes follow a flow field (the fold direction
 *    on cloth, the limb axis on arms, around the form on heads), with bristle streaks and dry-brush
 *    ends, sized to the form (finer on faces and hands).
 * 4. Surface: impasto catch-lights from the stroke density, canvas weave, a faint craquelure and a
 *    broken, lost-and-found edge; no outlines.
 *
 * Deterministic: everything random is seeded by the plate.
 */

import { createCanvas } from "@napi-rs/canvas";

import { LIGHT } from "./cast.mjs";
import { blurField, clamp, distanceInside, fbm, hex, lerp, rng, sample, smoothstep } from "./raster.mjs";
import { traceScene } from "./sdf.mjs";

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const MAT = {
  skin: { spec: 0.16, gloss: 16, shadow: [1.0, 0.7, 0.58], fill: 0.5, sss: 0.25, stroke: 0.55 },
  marble: { spec: 0.1, gloss: 12, shadow: [0.9, 0.93, 1.02], fill: 0.6, sss: 0.55, stroke: 0.6, vein: true },
  linen: { spec: 0.05, gloss: 6, shadow: [0.88, 0.86, 0.95], fill: 0.65, stroke: 1 },
  wool: { spec: 0.09, gloss: 3, shadow: [0.88, 0.85, 0.96], fill: 0.55, stroke: 1.1 },
  leather: { spec: 0.22, gloss: 10, shadow: [0.85, 0.82, 0.92], fill: 0.4, stroke: 0.8 },
  hair: { spec: 0.2, gloss: 9, shadow: [0.85, 0.85, 0.95], fill: 0.4, stroke: 0.7 },
  straw: { spec: 0.08, gloss: 6, shadow: [0.88, 0.85, 0.95], fill: 0.5, stroke: 0.7 },
  metal: { spec: 0.85, gloss: 36, shadow: [0.75, 0.82, 1.0], fill: 0.8, stroke: 0.5, diffuse: 0.55 },
  gold: { spec: 0.75, gloss: 22, shadow: [0.9, 0.8, 0.7], fill: 0.5, stroke: 0.5, diffuse: 0.75 },
  wood: { spec: 0.12, gloss: 8, shadow: [0.85, 0.82, 0.9], fill: 0.4, stroke: 0.7 },
  bone: { spec: 0.2, gloss: 12, shadow: [0.9, 0.9, 1.0], fill: 0.5, stroke: 0.6 },
  fruit: { spec: 0.32, gloss: 20, shadow: [0.95, 0.72, 0.62], fill: 0.4, stroke: 0.6 },
  leaf: { spec: 0.3, gloss: 18, shadow: [0.8, 0.9, 1.0], fill: 0.5, stroke: 0.6 },
  paper: { spec: 0.04, gloss: 6, shadow: [0.85, 0.9, 1.02], fill: 0.7, stroke: 0.8 },
  terracotta: { spec: 0.08, gloss: 8, shadow: [0.95, 0.75, 0.68], fill: 0.45, stroke: 0.7 },
  twine: { spec: 0.05, gloss: 6, shadow: [0.88, 0.85, 0.95], fill: 0.5, stroke: 0.6 },
};

const SUN = [1.0, 0.955, 0.86];
const SKY_FILL = [0.62, 0.74, 1.0];
const RIM = [1.0, 0.78, 0.52];

const L = (() => {
  const [x, y, z] = LIGHT.direction;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
const FILL = (() => {
  const [x, y, z] = LIGHT.fillDirection;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
const HALF = (() => {
  const h = [L[0], L[1], L[2] + 1];
  const l = Math.hypot(...h);
  return h.map((v) => v / l);
})();

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

/** A smooth closed curve through points (Catmull-Rom as cubic Béziers). */
export function smoothPath(ctx, pts, closed = true) {
  const n = pts.length;
  if (n < 3) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const a = !closed && i === 0 ? p1 : p0;
    const d = !closed && i === n - 2 ? p2 : p3;
    ctx.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}

const rgba = (c, a) => `rgba(${Math.round(clamp(c[0]) * 255)},${Math.round(clamp(c[1]) * 255)},${Math.round(clamp(c[2]) * 255)},${a.toFixed(3)})`;

/* ------------------------------------------------------------------ */
/* 1. Form                                                             */
/* ------------------------------------------------------------------ */

function newImage(W, H) {
  const N = W * H;
  return { W, H, cover: new Float32Array(N), height: new Float32Array(N), normal: new Float32Array(N * 3), owner: new Int16Array(N).fill(-1), sdf: new Uint8Array(N), relief: new Float32Array(N) };
}

/** Rasterizes a path part: coverage from the canvas, height as a rounded puff of the distance to its edge. */
function rasterPath(part, img, canvas, ctx) {
  const { W, H } = img;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  smoothPath(ctx, part.pts, true);
  ctx.fill();
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const dist = distanceInside((i) => data[i * 4 + 3] >= 128, W, x0, y0, bw, bh);
  // Smooth the pixel staircase of slanted edges out of the distance (it would ripple the normals).
  blurField(dist, bw, bh, 2, 2);
  let maxD = 1;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const r = Math.min(maxD, part.round ?? (part.overlay ? Math.max(3, part.thick ?? maxD) * 1.5 : maxD));
  const z = part.z ?? 0;
  const thick = part.thick ?? r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const a = data[i * 4 + 3] / 255;
      if (a <= 0) continue;
      const t = clamp(dist[(y - y0) * bw + (x - x0)] / r);
      // An overlay (an apron, a mantle) lies on whatever is beneath it.
      const under = part.overlay && img.cover[i] >= 0.5 ? img.height[i] : 0;
      const h = under + z + thick * Math.sqrt(1 - (1 - t) * (1 - t));
      if (a >= 0.5) {
        img.cover[i] = Math.max(img.cover[i], a);
        img.height[i] = h;
        img.owner[i] = part.id;
        img.sdf[i] = 0;
      } else if (img.cover[i] < a) {
        img.cover[i] = a;
        if (img.owner[i] < 0) {
          img.owner[i] = part.id;
          img.height[i] = h;
        }
      }
    }
  }
}

/** Folds (ridges and valleys hanging along polylines) and bumps, as a soft relief on their part. */
function reliefFor(part, img) {
  if (!part.folds?.length && !part.bumps?.length) return;
  const { W, H } = img;
  // The part's box (where it owns pixels).
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (img.owner[y * W + x] === part.id) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return;
  const pad = 24;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const up = createCanvas(bw, bh);
  const down = createCanvas(bw, bh);
  const cu = up.getContext("2d");
  const cd = down.getContext("2d");
  for (const c of [cu, cd]) {
    c.fillStyle = "#000";
    c.fillRect(0, 0, bw, bh);
    c.translate(-x0, -y0);
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    c.lineJoin = "round";
  }
  let scale = 0;
  for (const f of part.folds ?? []) {
    const c = f.a >= 0 ? cu : cd;
    const w = Math.max(1.5, f.w);
    scale = Math.max(scale, w);
    c.filter = `blur(${(w * 0.45).toFixed(1)}px)`;
    c.strokeStyle = `rgba(255,255,255,${clamp(Math.abs(f.a) * 0.75).toFixed(3)})`;
    c.lineWidth = w;
    c.beginPath();
    smoothPath(c, f.pts, false);
    c.stroke();
  }
  for (const bmp of part.bumps ?? []) {
    cu.filter = `blur(${(Math.max(bmp.rx, bmp.ry) * 0.5).toFixed(1)}px)`;
    cu.fillStyle = `rgba(255,255,255,${clamp(bmp.a / Math.max(bmp.rx, bmp.ry)).toFixed(3)})`;
    cu.beginPath();
    cu.ellipse(bmp.x, bmp.y, bmp.rx * 0.7, bmp.ry * 0.7, 0, 0, Math.PI * 2);
    cu.fill();
    scale = Math.max(scale, bmp.rx * 0.5);
  }
  const a = cu.getImageData(0, 0, bw, bh).data;
  const b = cd.getImageData(0, 0, bw, bh).data;
  const amp = Math.max(2, scale * 0.7);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (img.owner[i] !== part.id) continue;
      const j = ((y - y0) * bw + (x - x0)) * 4;
      img.relief[i] += ((a[j] - b[j]) / 255) * amp;
    }
}

/** The relief is read back from 8-bit canvases: smooth away the steps (they would band the normals). */
function smoothRelief(img) {
  const { W, H, relief, owner } = img;
  const r = Float32Array.from(relief);
  blurField(r, W, H, 2, 2);
  for (let i = 0; i < W * H; i++) relief[i] = owner[i] >= 0 ? r[i] : 0;
}

/** Normals of 2D parts from their height (plus relief); 3D parts keep theirs and take the relief. */
function computeNormals(img) {
  const { W, H, owner, height, relief, normal, sdf } = img;
  const hAt = (i) => height[i] + relief[i];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = owner[i];
      if (o < 0) continue;
      const same = (j) => owner[j] === o;
      const l = x > 0 && same(i - 1) ? i - 1 : i;
      const r = x < W - 1 && same(i + 1) ? i + 1 : i;
      const u = y > 0 && same(i - W) ? i - W : i;
      const d = y < H - 1 && same(i + W) ? i + W : i;
      const sx = r - l || 1;
      const sy = (d - u) / W || 1;
      if (sdf[i]) {
        const rx = (relief[r] - relief[l]) / sx;
        const ry = (relief[d] - relief[u]) / sy;
        let nx = normal[i * 3] - rx * 0.8;
        let ny = normal[i * 3 + 1] - ry * 0.8;
        let nz = normal[i * 3 + 2];
        const len = Math.hypot(nx, ny, nz) || 1;
        normal[i * 3] = nx / len;
        normal[i * 3 + 1] = ny / len;
        normal[i * 3 + 2] = nz / len;
        continue;
      }
      const gx = (hAt(r) - hAt(l)) / sx;
      const gy = (hAt(d) - hAt(u)) / sy;
      const len = Math.hypot(gx, gy, 1);
      normal[i * 3] = -gx / len;
      normal[i * 3 + 1] = -gy / len;
      normal[i * 3 + 2] = 1 / len;
    }
}

/* ------------------------------------------------------------------ */
/* 2. Light                                                            */
/* ------------------------------------------------------------------ */

/** Soft cast shadow: march from each pixel toward the sun over the height field (bilinear reads). */
function castShadows(img, reach) {
  const { W, H, cover, height, relief } = img;
  const N = W * H;
  const surface = new Float32Array(N);
  for (let i = 0; i < N; i++) surface[i] = cover[i] >= 0.5 ? height[i] + relief[i] : -1e6;
  const out = new Float32Array(N);
  const lxy = Math.hypot(L[0], L[1]);
  const dx = L[0] / lxy;
  const dy = L[1] / lxy;
  const rise = L[2] / lxy;
  const steps = [];
  for (let s = 1.2; s < reach; s *= 1.18) steps.push(s);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cover[i] < 0.5) continue;
      const h0 = surface[i];
      let occ = 0;
      for (const s of steps) {
        const sx = x + dx * s;
        const sy = y + dy * s;
        if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) break;
        const h = sample(surface, W, H, sx, sy);
        if (h < -1e5) continue;
        const above = h - (h0 + s * rise) - 1.5 - s * 0.03;
        if (above > 0) occ = Math.max(occ, smoothstep(0, 2 + s * 0.15, above));
        if (occ >= 1) break;
      }
      out[i] = occ;
    }
  return blurField(out, W, H, 2, 2);
}

function lightImage(img, parts, opts) {
  const { W, H, cover, owner, normal } = img;
  const N = W * H;
  const target = new Float32Array(N * 3);
  const valueMap = new Float32Array(N);
  const shadow = castShadows(img, opts.shadowReach);
  // Distance to the figure's edge (for translucent thin edges and the rim).
  const edge = distanceInside((i) => cover[i] >= 0.5, W, 0, 0, W, H, false);
  const veins = fbm(`${opts.seed}-vein`, 4);
  const veins2 = fbm(`${opts.seed}-vein2`, 3);
  // Ambient occlusion from the relief: creases darken.
  const blurred = Float32Array.from(img.relief);
  blurField(blurred, W, H, Math.max(2, opts.hu * 0.06), 2);
  const albedo = parts.map((p) => p.color);
  for (let i = 0; i < N; i++) {
    const o = owner[i];
    if (o < 0) continue;
    const part = parts[o];
    const m = MAT[part.mat] ?? MAT.linen;
    let A = img.albedo ? [img.albedo[i * 3], img.albedo[i * 3 + 1], img.albedo[i * 3 + 2]] : albedo[o];
    const nx = normal[i * 3];
    const ny = normal[i * 3 + 1];
    const nz = normal[i * 3 + 2];
    const e = nx * L[0] + ny * L[1] + nz * L[2];
    const s = shadow[i];
    const refl = clamp(nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
    const x = i % W;
    const y = (i / W) | 0;
    if (m.vein) {
      const v = veins(x / (opts.hu * 0.9), y / (opts.hu * 1.4));
      const line = 1 - smoothstep(0.0, 0.018, Math.abs(v - 0.5));
      const line2 = 1 - smoothstep(0.0, 0.012, Math.abs(veins2(x / (opts.hu * 0.4), y / (opts.hu * 0.5)) - 0.5));
      const k = line * 0.16 + line2 * 0.07;
      A = [A[0] * (1 - k) + 0.55 * k, A[1] * (1 - k) + 0.55 * k, A[2] * (1 - k) + 0.57 * k];
    }
    // Five values: light, half-tone, core shadow, reflected light, cast shadow.
    let v;
    if (e >= 0.1) v = lerp(0.74, 1.0, smoothstep(0.1, 0.7, e));
    else if (e >= -0.18) v = lerp(0.44, 0.74, smoothstep(-0.18, 0.1, e));
    else v = 0.44 + 0.16 * refl * m.fill;
    const castV = 0.4 + 0.08 * refl * m.fill;
    v = lerp(v, Math.min(v, castV), s);
    const ao = clamp(1 + ((img.relief[i] - blurred[i]) / Math.max(2, opts.hu * 0.08)) * 0.5, 0.62, 1.08);
    v *= ao;
    const lit = smoothstep(-0.12, 0.3, e) * (1 - s);
    const diffuse = m.diffuse ?? 1;
    let r = A[0] * v * diffuse;
    let g = A[1] * v * diffuse;
    let b = A[2] * v * diffuse;
    // Colour of the light: sun where lit, sky fill and the material's own shadow hue elsewhere.
    const sky = 0.2 + 0.25 * refl;
    const tr = lerp(m.shadow[0] * lerp(1, SKY_FILL[0], sky), SUN[0], lit);
    const tg = lerp(m.shadow[1] * lerp(1, SKY_FILL[1], sky), SUN[1], lit);
    const tb = lerp(m.shadow[2] * lerp(1, SKY_FILL[2], sky), SUN[2], lit);
    r *= tr;
    g *= tg;
    b *= tb;
    // Specular sheen.
    const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
    const spec = m.spec * Math.pow(nh, m.gloss) * (1 - s);
    const sc = part.mat === "gold" ? [1.0, 0.85, 0.5] : part.mat === "metal" ? [1.0, 0.98, 0.95] : SUN;
    r += spec * sc[0];
    g += spec * sc[1];
    b += spec * sc[2];
    // Metal reflects the blue sky where it faces away from the sun.
    if (part.mat === "metal") {
      const sky = clamp(-ny * 0.6 + 0.4) * 0.25;
      r += sky * 0.4;
      g += sky * 0.55;
      b += sky * 0.85;
    }
    // A thin warm rim on the right edge.
    const d = edge[i];
    const rim = Math.pow(clamp(nx), 2.2) * (1 - smoothstep(1, Math.max(3, opts.hu * 0.05), d)) * 0.45 * (1 - s * 0.5);
    r += rim * RIM[0] * A[0];
    g += rim * RIM[1] * A[1];
    b += rim * RIM[2] * A[2];
    // Translucent thin edges (marble and skin): warm light through the edge.
    if (m.sss) {
      const thin = (1 - smoothstep(0, opts.hu * 0.12, d)) * m.sss * (1 - lit * 0.6);
      r += thin * 0.18;
      g += thin * 0.09;
      b += thin * 0.03;
    }
    target[i * 3] = clamp(r);
    target[i * 3 + 1] = clamp(g);
    target[i * 3 + 2] = clamp(b);
    valueMap[i] = v;
  }
  return { target, valueMap, shadow, edge, blurred };
}

/** Blush and other warm flushes, mixed into a per-pixel albedo before the light. */
function applyBlush(img, parts, blush) {
  const { W, H, owner } = img;
  const albedo = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const o = owner[i];
    if (o < 0) continue;
    const c = parts[o].color;
    albedo[i * 3] = c[0];
    albedo[i * 3 + 1] = c[1];
    albedo[i * 3 + 2] = c[2];
  }
  for (const bl of blush) {
    const [cx, cy] = bl.p;
    const r = bl.r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
        const i = y * W + x;
        const o = owner[i];
        if (o < 0 || parts[o].mat !== "skin") continue;
        const t = bl.amount * (1 - smoothstep(0, r, Math.hypot(x - cx, y - cy)));
        if (t <= 0) continue;
        for (let c = 0; c < 3; c++) albedo[i * 3 + c] = lerp(albedo[i * 3 + c], bl.color[c], t);
      }
  }
  img.albedo = albedo;
}

/** Trim bands (gold leaf on hems) along the bottom edge of their parts. */
function applyTrims(img, parts) {
  const { W, H, owner } = img;
  for (const part of parts) {
    if (!part.trim || part.kind !== "path") continue;
    const band = Math.max(3, part.trimWidth ?? 8);
    for (let x = 0; x < W; x++) {
      let bottom = -1;
      for (let y = H - 1; y >= 0; y--)
        if (owner[y * W + x] === part.id) {
          bottom = y;
          break;
        }
      if (bottom < 0) continue;
      for (let y = bottom; y > bottom - band && y >= 0; y--) {
        const i = y * W + x;
        if (owner[i] !== part.id) continue;
        const t = y > bottom - band * 0.7 ? 1 : 0.6;
        for (let c = 0; c < 3; c++) img.albedo[i * 3 + c] = lerp(img.albedo[i * 3 + c], part.trim[c], t);
        img.trimMask ??= new Uint8Array(W * H);
        img.trimMask[i] = 1;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3. Paint                                                            */
/* ------------------------------------------------------------------ */

/** Stroke direction at a pixel: fold direction on cloth, limb axis, around the form on heads. */
function flowAt(img, parts, i) {
  const o = img.owner[i];
  const part = parts[o];
  const kind = part?.flow?.kind ?? "down";
  const nx = img.normal[i * 3];
  const ny = img.normal[i * 3 + 1];
  if (kind === "axis") {
    const [dx, dy] = part.flow.dir;
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }
  if (kind === "around" || kind === "radial") {
    const l = Math.hypot(nx, ny);
    if (l < 0.08) return [1, 0];
    return [-ny / l, nx / l];
  }
  // Cloth: along the folds (perpendicular to the relief's slope), else straight down.
  const { W } = img;
  const x = i % W;
  const r = img.relief;
  const gx = (r[Math.min(i + 1, r.length - 1)] - r[Math.max(i - 1, 0)]) * 0.5;
  const gy = (r[Math.min(i + W, r.length - 1)] - r[Math.max(i - W, 0)]) * 0.5;
  void x;
  const g = Math.hypot(gx, gy);
  if (g > 0.08) return [-gy / g, gx / g];
  return [0.05, 1];
}

function paintStrokes(ctx, impasto, img, parts, target, opts) {
  const { W, H, owner, cover } = img;
  const r = rng(`${opts.seed}-strokes`);
  const at = (x, y) => {
    const xi = clamp(Math.round(x), 0, W - 1);
    const yi = clamp(Math.round(y), 0, H - 1);
    return yi * W + xi;
  };
  const hu = opts.hu;
  const passes = [
    { size: clamp(hu * 0.11, 2.2, 12), spacing: 1.1, detailMin: 0, alpha: [0.5, 0.8], jitter: 0.08, length: [3, 5.5] },
    { size: clamp(hu * 0.065, 1.6, 7), spacing: 1.0, detailMin: 0, alpha: [0.45, 0.75], jitter: 0.07, length: [2.5, 4.5] },
    { size: clamp(hu * 0.035, 1.2, 4), spacing: 0.9, detailMin: 0.75, alpha: [0.4, 0.7], jitter: 0.05, length: [2, 3.5] },
  ];
  let count = 0;
  for (const pass of passes) {
    const step = pass.size * pass.spacing * opts.density;
    for (let gy = 0; gy < H; gy += step)
      for (let gx = 0; gx < W; gx += step) {
        const x = gx + r.range(0, step);
        const y = gy + r.range(0, step);
        const i = at(x, y);
        const o = owner[i];
        if (o < 0 || cover[i] < 0.5) continue;
        const part = parts[o];
        const m = MAT[part.mat] ?? MAT.linen;
        if ((part.detail ?? 0.4) < pass.detailMin) continue;
        const size = pass.size * (m.stroke ?? 1) * lerp(0.75, 1.2, r.next()) * (part.detail >= 0.9 && pass.detailMin === 0 ? 0.7 : 1);
        const length = size * lerp(pass.length[0], pass.length[1], r.next());
        // Walk along the flow, stopping at the edge of the part.
        const pts = [[x, y]];
        let px = x;
        let py = y;
        let [dx, dy] = flowAt(img, parts, i);
        if (r.chance(0.5)) {
          dx = -dx;
          dy = -dy;
        }
        const segs = 5;
        for (let k = 0; k < segs; k++) {
          const j = at(px, py);
          const f = flowAt(img, parts, j);
          // Keep heading the same way along the (sign-free) flow.
          const s = f[0] * dx + f[1] * dy >= 0 ? 1 : -1;
          dx = lerp(dx, f[0] * s, 0.6);
          dy = lerp(dy, f[1] * s, 0.6);
          const l = Math.hypot(dx, dy) || 1;
          dx /= l;
          dy /= l;
          px += (dx * length) / segs;
          py += (dy * length) / segs;
          const q = at(px, py);
          if (owner[q] !== o && !r.chance(0.08)) break;
          if (cover[q] < 0.3 && !r.chance(0.3)) break;
          pts.push([px, py]);
        }
        if (pts.length < 2) continue;
        const mid = pts[Math.floor(pts.length / 2)];
        const c0 = sampleTarget(target, W, H, mid[0], mid[1]);
        const dv = r.jitter(pass.jitter);
        const dw = r.jitter(pass.jitter * 0.6);
        const base = [c0[0] * (1 + dv) * (1 + dw * 0.5), c0[1] * (1 + dv), c0[2] * (1 + dv) * (1 - dw * 0.6)];
        const alpha = r.range(pass.alpha[0], pass.alpha[1]);
        drawStroke(ctx, impasto, pts, size, base, alpha, r);
        count++;
      }
  }
  return count;
}

function sampleTarget(target, W, H, x, y) {
  const i = clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1);
  return [target[i * 3], target[i * 3 + 1], target[i * 3 + 2]];
}

/** One brush stroke: several bristles side by side, each with its own tone, ending raggedly (dry brush). */
function drawStroke(ctx, impasto, pts, size, color, alpha, r) {
  const bristles = Math.max(3, Math.min(7, Math.round(size / 1.6)));
  const n = pts.length;
  // Normals along the stroke.
  const normals = pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const w = (size / bristles) * 1.6;
  for (let k = 0; k < bristles; k++) {
    const off = ((k + 0.5) / bristles - 0.5) * size;
    const tone = 1 + r.jitter(0.07);
    const c = [color[0] * tone, color[1] * tone, color[2] * tone];
    // Dry-brush: each bristle runs out at its own point; a few skip a gap.
    const end = Math.max(2, Math.round(n * r.range(0.55, 1.0)));
    const gap = r.chance(0.18) ? Math.floor(r.range(1, end)) : -1;
    const taper = (j) => 1 - Math.abs(((k + 0.5) / bristles) * 2 - 1) * 0.25 * (j / n);
    ctx.lineWidth = w;
    impasto.lineWidth = w * 0.7;
    ctx.beginPath();
    impasto.beginPath();
    for (let j = 0; j < end; j++) {
      const p = pts[j];
      const nn = normals[j];
      const t = taper(j);
      const x = p[0] + nn[0] * off * t;
      const y = p[1] + nn[1] * off * t;
      if (j === 0 || j === gap) {
        ctx.moveTo(x, y);
        impasto.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        impasto.lineTo(x, y);
      }
    }
    ctx.strokeStyle = rgba(c, alpha * r.range(0.6, 1));
    ctx.stroke();
    impasto.strokeStyle = `rgba(255,255,255,${(0.16 * r.range(0.5, 1)).toFixed(3)})`;
    impasto.stroke();
  }
}

/** Painted marks (lash lines, brows, the mouth): soft, short, never outlines of a form. */
function paintMarks(ctx, marks, img) {
  const { W, H } = img;
  for (const m of marks) {
    if (m.normal && m.normal[2] < 0.12) continue;
    const [x, y, z] = m.pts[Math.floor(m.pts.length / 2)];
    const xi = clamp(Math.round(x), 0, W - 1);
    const yi = clamp(Math.round(y), 0, H - 1);
    const i = yi * W + xi;
    if (img.cover[i] < 0.5) continue;
    // Hidden behind something nearer (a hand, the hat brim).
    if (z !== undefined && img.height[i] > z + Math.max(3, m.w * 3)) continue;
    const facing = m.normal ? clamp((m.normal[2] - 0.12) / 0.5) : 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (m.dot) {
      ctx.fillStyle = rgba(m.color, m.alpha * facing);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.6, m.w / 2), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.strokeStyle = rgba(m.color, m.alpha * facing);
    ctx.lineWidth = Math.max(0.7, m.w);
    ctx.beginPath();
    smoothPath(
      ctx,
      m.pts.map((p) => [p[0], p[1]]),
      false,
    );
    if (m.pts.length === 2) {
      ctx.moveTo(m.pts[0][0], m.pts[0][1]);
      ctx.lineTo(m.pts[1][0], m.pts[1][1]);
    }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* 4. Surface                                                          */
/* ------------------------------------------------------------------ */

/** Canvas weave: a plain weave of fine threads, as a relief lit by the same sun. */
export function weave(x, y, period) {
  const u = (x / period) * Math.PI * 2;
  const v = (y / period) * Math.PI * 2;
  const warp = Math.sin(u) * (0.6 + 0.4 * Math.sin(v * 0.5));
  const weft = Math.sin(v) * (0.6 + 0.4 * Math.cos(u * 0.5));
  return 0.5 * (warp + weft);
}

/** A faint network of fine cracks (craquelure): edges of a jittered Voronoi tiling. */
export function craquelure(seed, cell) {
  const r = rng(`${seed}-cracks`);
  const cache = new Map();
  const site = (i, j) => {
    const key = i * 100003 + j;
    let s = cache.get(key);
    if (!s) {
      const h = Math.sin(i * 127.1 + j * 311.7 + r.next() * 0) * 43758.5453;
      const h2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453;
      s = [(i + 0.15 + 0.7 * (h - Math.floor(h))) * cell, (j + 0.15 + 0.7 * (h2 - Math.floor(h2))) * cell];
      cache.set(key, s);
    }
    return s;
  };
  return (x, y) => {
    const ci = Math.floor(x / cell);
    const cj = Math.floor(y / cell);
    let d1 = Infinity;
    let d2 = Infinity;
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        const [sx, sy] = site(i, j);
        const d = Math.hypot(x - sx, y - sy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    return 1 - smoothstep(0.35, 1.25, d2 - d1);
  };
}

/** Applies impasto catch-lights, canvas weave and craquelure to an RGBA buffer (in place), where alpha > 0. */
export function finishSurface(rgba, W, H, impastoData, opts) {
  const imp = new Float32Array(W * H);
  if (impastoData) for (let i = 0; i < W * H; i++) imp[i] = impastoData[i * 4] / 255;
  const crack = craquelure(opts.seed, opts.crackCell ?? 34);
  const grainNoise = fbm(`${opts.seed}-grain`, 2);
  const period = opts.weave ?? 4.2;
  const wk = opts.weaveStrength ?? 0.032;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = rgba[i * 4 + 3];
      if (a === 0) continue;
      let k = 1;
      // Weave relief, lit from the upper left.
      const w0 = weave(x, y, period);
      const w1 = weave(x - 1, y - 1, period);
      k += (w0 - w1) * wk + (w0 * 0.5) * wk * 0.6;
      // Impasto: paint ridges facing the sun catch it.
      if (impastoData) {
        const l = imp[i - 1] ?? imp[i];
        const u = imp[i - W] ?? imp[i];
        const ridge = imp[i] - (l + u) / 2;
        k += clamp(ridge * 1.6, -0.08, 0.14);
      }
      // Fine grain so flat paint never encodes flat.
      k += (grainNoise(x * 0.9, y * 0.9) - 0.5) * 0.035;
      // Craquelure: thin dark lines, faint.
      const c = crack(x, y) * (opts.crackStrength ?? 0.06);
      k -= c;
      for (let ch = 0; ch < 3; ch++) rgba[i * 4 + ch] = clamp(Math.round(rgba[i * 4 + ch] * k), 0, 255);
    }
}

/* ------------------------------------------------------------------ */
/* The whole painting                                                  */
/* ------------------------------------------------------------------ */

/**
 * Paints a built figure into an RGBA buffer (W x H x 4). `opts`: seed, hu (px per head), density
 * (stroke spacing multiplier), haze (0..1 toward the sky's blue, for far plates), edgeFade (fade the
 * alpha to 0 within this many px of the image border: limbs that cross into another plate).
 */
export function paintFigure(fig, W, H, opts) {
  const img = newImage(W, H);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  for (const layer of fig.layers) {
    if (layer.type === "path") rasterPath(layer.part, img, canvas, ctx);
    else traceScene(layer.groups, img);
  }
  // Holdouts hide what is behind them, then leave nothing of their own.
  for (let i = 0; i < W * H; i++) {
    const o = img.owner[i];
    if (o >= 0 && fig.parts[o].holdout) {
      img.owner[i] = -1;
      img.cover[i] = 0;
    }
  }
  for (const part of fig.parts) reliefFor(part, img);
  smoothRelief(img);
  computeNormals(img);
  applyBlush(img, fig.parts, fig.blush);
  applyTrims(img, fig.parts);
  const lit = lightImage(img, fig.parts, { seed: opts.seed, hu: opts.hu, shadowReach: Math.max(12, opts.hu * 0.9) });
  if (opts.debug) opts.debug({ img, lit });
  return paintAndFinish(img, fig.parts, lit.target, fig.marks, opts);
}

/** Strokes, marks, edge and surface over a lit target. Shared by figures and props. */
export function paintAndFinish(img, parts, target, marks, opts) {
  const { W, H, cover } = img;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  // Underpainting: the lit target itself.
  const base = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    base.data[i * 4] = Math.round(target[i * 3] * 255);
    base.data[i * 4 + 1] = Math.round(target[i * 3 + 1] * 255);
    base.data[i * 4 + 2] = Math.round(target[i * 3 + 2] * 255);
    base.data[i * 4 + 3] = cover[i] >= 0.5 ? 255 : Math.round(cover[i] * 255);
  }
  ctx.putImageData(base, 0, 0);
  const impCanvas = createCanvas(W, H);
  const imp = impCanvas.getContext("2d");
  imp.fillStyle = "#000";
  imp.fillRect(0, 0, W, H);
  imp.globalCompositeOperation = "lighter";
  imp.lineCap = "round";
  imp.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokes = paintStrokes(ctx, imp, img, parts, target, { seed: opts.seed, hu: opts.hu, density: opts.density ?? 1 });
  if (marks?.length) paintMarks(ctx, marks, img);
  const out = ctx.getImageData(0, 0, W, H).data;
  const impData = imp.getImageData(0, 0, W, H).data;

  // The edge: the figure's own coverage, broken by noise; strokes may run a little past it.
  const inside = distanceInside((i) => cover[i] >= 0.5, W, 0, 0, W, H, false);
  const outside = distanceInside((i) => cover[i] < 0.5, W, 0, 0, W, H, false);
  const n1 = fbm(`${opts.seed}-edge`, 3);
  const rgba = new Uint8ClampedArray(W * H * 4);
  const fade = opts.edgeFade ?? 0;
  const haze = opts.haze ?? 0;
  const hazeColor = opts.hazeColor ?? [0.43, 0.6, 0.84];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sd = cover[i] >= 0.5 ? inside[i] - 0.5 : -(outside[i] - 0.5);
      const nz = (n1(x / 5, y / 5) - 0.5) * 2;
      const lost = smoothstep(0.3, 0.8, n1(x / 40 + 7, y / 40 - 3));
      let a = smoothstep(-0.8 - lost * 1.6, 0.9, sd + nz * (0.9 + lost));
      const strokeA = out[i * 4 + 3] / 255;
      if (sd < 0) a = Math.max(a, strokeA * smoothstep(-3.5, 0, sd) * 0.9);
      if (fade > 0) {
        const border = Math.min(x, y, W - 1 - x, H - 1 - y);
        a *= smoothstep(0, fade, border);
      }
      const k = i * 4;
      let r = out[k];
      let g = out[k + 1];
      let b = out[k + 2];
      if (haze > 0) {
        r = lerp(r, hazeColor[0] * 255, haze);
        g = lerp(g, hazeColor[1] * 255, haze);
        b = lerp(b, hazeColor[2] * 255, haze);
      }
      rgba[k] = r;
      rgba[k + 1] = g;
      rgba[k + 2] = b;
      rgba[k + 3] = Math.round(clamp(a) * 255);
    }
  finishSurface(rgba, W, H, impData, { seed: opts.seed, weave: opts.weave, weaveStrength: opts.weaveStrength, crackCell: opts.crackCell ?? Math.max(18, opts.hu * 0.32), crackStrength: opts.crackStrength });
  return { rgba, strokes };
}

/* ------------------------------------------------------------------ */
/* A lighter pass for world props                                      */
/* ------------------------------------------------------------------ */

/**
 * Gives a drawn prop (an RGBA buffer, changed in place) the figures' light and surface: a height
 * from its silhouette (rounded by `round` px) and its own values (lighter reads nearer, `relief`),
 * lit by the same sun with its cast shadows, then (if `strokes` > 0) a pass of brush strokes and the
 * canvas surface. The alpha is kept as drawn (fades, tile edges), so contracts like the orchard
 * rows' soft foot survive.
 */
export function paintProp(rgba, W, H, opts) {
  const N = W * H;
  const img = newImage(W, H);
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rgba[i * 4 + 3] / 255;
    img.cover[i] = a;
    if (a > 0.02) img.owner[i] = 0;
    lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  }
  const round = opts.round ?? 12;
  const dist = distanceInside((i) => img.cover[i] >= 0.5, W, 0, 0, W, H, !opts.tile);
  // A wide blur rounds off the creases a distance field has along its middle (the medial axis).
  blurField(dist, W, H, Math.max(1.5, round * 0.18), 3);
  blurField(lum, W, H, opts.reliefBlur ?? 1.5, 2);
  for (let i = 0; i < N; i++) {
    if (img.owner[i] < 0) continue;
    const t = clamp(dist[i] / round);
    img.height[i] = round * (opts.puff ?? 1) * Math.sqrt(1 - (1 - t) * (1 - t)) + lum[i] * (opts.relief ?? 6);
  }
  computeNormals(img);
  const shadow = opts.shadows === false ? null : castShadows(img, opts.shadowReach ?? round * 2);
  const m = MAT[opts.mat ?? "linen"] ?? MAT.linen;
  const flatE = L[2];
  const value = (e) => (e >= 0.1 ? lerp(0.74, 1.0, smoothstep(0.1, 0.7, e)) : e >= -0.18 ? lerp(0.44, 0.74, smoothstep(-0.18, 0.1, e)) : 0.44);
  const flatV = value(flatE);
  const strength = opts.strength ?? 0.8;
  const target = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    const nx = img.normal[i * 3];
    const ny = img.normal[i * 3 + 1];
    const nz = img.normal[i * 3 + 2];
    const e = nx * L[0] + ny * L[1] + nz * L[2];
    const s = shadow ? shadow[i] : 0;
    let v = value(e) / flatV;
    v = lerp(v, Math.min(v, 0.55), s);
    v = lerp(1, v, strength);
    const lit = smoothstep(-0.12, 0.3, e) * (1 - s);
    const tr = lerp(m.shadow[0], SUN[0], lit);
    const tg = lerp(m.shadow[1], SUN[1], lit);
    const tb = lerp(m.shadow[2], SUN[2], lit);
    const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
    const spec = m.spec * Math.pow(nh, m.gloss) * (1 - s) * strength;
    const rim = Math.pow(clamp(nx), 2.2) * (1 - smoothstep(1, round * 0.4, dist[i])) * 0.3 * strength;
    target[i * 3] = clamp((rgba[k] / 255) * v * lerp(1, tr, strength) + spec + rim * 0.25);
    target[i * 3 + 1] = clamp((rgba[k + 1] / 255) * v * lerp(1, tg, strength) + spec + rim * 0.18);
    target[i * 3 + 2] = clamp((rgba[k + 2] / 255) * v * lerp(1, tb, strength) + spec * 0.9 + rim * 0.1);
  }
  const alpha = Uint8ClampedArray.from({ length: N }, (_, i) => rgba[i * 4 + 3]);
  if ((opts.strokes ?? 1) > 0) {
    const part = { id: 0, mat: opts.mat ?? "linen", color: [1, 1, 1], flow: { kind: opts.flow ?? "around" }, detail: 0.5 };
    const { rgba: painted } = paintAndFinish(img, [part], target, [], { seed: opts.seed, hu: opts.brush ?? 40, density: opts.strokes, weave: opts.weave, weaveStrength: opts.weaveStrength ?? 0.025, crackCell: opts.crackCell, crackStrength: opts.crackStrength ?? 0.04 });
    for (let i = 0; i < N; i++) {
      rgba[i * 4] = painted[i * 4];
      rgba[i * 4 + 1] = painted[i * 4 + 1];
      rgba[i * 4 + 2] = painted[i * 4 + 2];
      rgba[i * 4 + 3] = alpha[i];
    }
    return rgba;
  }
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = Math.round(target[i * 3] * 255);
    rgba[i * 4 + 1] = Math.round(target[i * 3 + 1] * 255);
    rgba[i * 4 + 2] = Math.round(target[i * 3 + 2] * 255);
  }
  finishSurface(rgba, W, H, null, { seed: opts.seed, weave: opts.weave, weaveStrength: opts.weaveStrength ?? 0.02, crackCell: opts.crackCell ?? 40, crackStrength: opts.crackStrength ?? 0.03 });
  return rgba;
}

export const materials = MAT;
export { newImage, rasterPath, reliefFor, smoothRelief, computeNormals, lightImage, applyBlush };
export const lightVector = L;
export const sunColor = SUN;
export const skyFill = SKY_FILL;
export { hex };
