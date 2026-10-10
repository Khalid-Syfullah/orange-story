/**
 * Raster helpers for the stand-in painter: seeded randomness, noise, float fields (distance
 * transform, blur, gradients, sampling) and colour. Plain typed arrays, no dependencies, so they
 * run fast in Node and are easy to test.
 */

/* ------------------------------------------------------------------ */
/* Seeded randomness (mulberry32, as in src/lib/progress.ts)            */
/* ------------------------------------------------------------------ */

export function hashString(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i);
  return h >>> 0;
}

/** A seeded generator in [0, 1). */
export function seeded(seed) {
  let t = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Helpers on a generator: a range, a sign, a gaussian-ish jitter, a pick. */
export function rng(seed) {
  const r = seeded(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    jitter: (s) => (r() + r() + r() - 1.5) * (s / 1.5),
    pick: (list) => list[Math.floor(r() * list.length)],
    chance: (p) => r() < p,
  };
}

/* ------------------------------------------------------------------ */
/* Noise                                                               */
/* ------------------------------------------------------------------ */

/** Smooth 2D value noise in [0, 1] on a 256-cell lattice that wraps. */
export function valueNoise(seed) {
  const r = seeded(seed);
  const N = 256;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (i, j) => grid[(j & (N - 1)) * N + (i & (N - 1))];
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    let u = x - i;
    let v = y - j;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const a = at(i, j);
    const b = at(i + 1, j);
    const c = at(i, j + 1);
    const d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Fractal noise in about [0, 1]: `octaves` of value noise, each twice as fine at half the weight. */
export function fbm(seed, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, k) => valueNoise(`${seed}:${k}`));
  let norm = 0;
  for (let k = 0; k < octaves; k++) norm += 0.5 ** k;
  return (x, y) => {
    let sum = 0;
    let f = 1;
    let w = 1;
    for (let k = 0; k < octaves; k++) {
      sum += layers[k](x * f + k * 17.3, y * f - k * 9.1) * w;
      f *= 2;
      w *= 0.5;
    }
    return sum / norm;
  };
}

/* ------------------------------------------------------------------ */
/* Scalars                                                             */
/* ------------------------------------------------------------------ */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Colour (sRGB, channels in 0..1)                                     */
/* ------------------------------------------------------------------ */

export function hex(color) {
  const h = color.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("")}`;
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulRgb = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scaleRgb = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Shifts a colour's value by `dv` (multiplicative) and its warmth by `dw` (+ warmer, - cooler). */
export function shiftRgb(c, dv, dw = 0) {
  const s = 1 + dv;
  return [clamp(c[0] * s * (1 + dw * 0.6)), clamp(c[1] * s * (1 + dw * 0.1)), clamp(c[2] * s * (1 - dw * 0.7))];
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

const INF = 1e20;

/** 1D squared Euclidean distance transform (Felzenszwalb and Huttenlocher), in place on f[0..n). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * Exact Euclidean distance (px) from every pixel where `inside(i)` is true to the nearest pixel where
 * it is false, inside a box (x0, y0, w, h) of a W-wide image. Pixels outside get 0. The box border
 * counts as an edge unless `borderIsEdge` is false. Returns a Float32Array of the box.
 */
export function distanceInside(inside, W, x0, y0, w, h, borderIsEdge = true) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  // Columns, with a border of "outside" beyond the box so edges of the box count as edges.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = inside((y0 + y) * W + x0 + x) ? INF : 0;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) {
      // Distance to the box border counts as outside too.
      const border = borderIsEdge ? Math.min(y + 1, h - y) : INF;
      grid[y * w + x] = Math.min(d[y], border * border);
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) {
      const border = borderIsEdge ? Math.min(x + 1, w - x) : INF;
      out[y * w + x] = Math.sqrt(Math.min(d[x], border * border));
    }
  }
  return out;
}

/** Box blur of a float field in place (separable, `radius` px, repeated `passes` times: about gaussian). */
export function blurField(field, W, H, radius, passes = 3) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(field.length);
  const line = new Float32Array(Math.max(W, H) + 2 * r + 2);
  for (let pass = 0; pass < passes; pass++) {
    // Horizontal
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += field[row + clampIndex(x, W)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum / (2 * r + 1);
        sum += field[row + clampIndex(x + r + 1, W)] - field[row + clampIndex(x - r, W)];
      }
    }
    // Vertical
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clampIndex(y, H) * W + x];
      for (let y = 0; y < H; y++) {
        line[y] = sum / (2 * r + 1);
        sum += tmp[clampIndex(y + r + 1, H) * W + x] - tmp[clampIndex(y - r, H) * W + x];
      }
      for (let y = 0; y < H; y++) field[y * W + x] = line[y];
    }
  }
  return field;
}

const clampIndex = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);

/** Bilinear sample of a float field (clamped at the edges). */
export function sample(field, W, H, x, y) {
  const fx = clamp(x, 0, W - 1.001);
  const fy = clamp(y, 0, H - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  const k = j * W + i;
  return field[k] * (1 - u) * (1 - v) + field[k + 1] * u * (1 - v) + field[k + W] * (1 - u) * v + field[k + W + 1] * u * v;
}
