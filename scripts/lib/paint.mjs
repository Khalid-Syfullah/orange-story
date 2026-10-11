// The placeholder painter's toolkit: an SVG builder with painterly primitives (the orange, leaves,
// draped figures, hands, marble, clouds, paper) rendered through sharp (librsvg), and raster helpers
// for the finish (paint texture, vignette, label), noise fields, warps and blends.
//
// Everything is drawn in pixels of the target size; `svg.s` is the scale relative to a 1440-wide
// picture, so a placeholder looks the same at every tier. Light comes from the upper left.
import sharp from "sharp";

// ---------------------------------------------------------------------------------------------
// Palette (the tokens in src/app/globals.css plus the painting colours of docs/PAINTINGS.md)
// ---------------------------------------------------------------------------------------------

export const C = {
  sky: "#1f4e9c",
  skyDeep: "#163d84",
  skyLow: "#2c5ea9",
  skySoft: "#6f9bd6",
  milk: "#f6f3ec",
  cream: "#efe3c8",
  creamLight: "#fbf5e6",
  creamShade: "#c8b48e",
  white: "#f7f4ee",
  whiteShade: "#cfc8ba",
  ochre: "#c8953a",
  ochreLight: "#e2b660",
  ochreShade: "#94661f",
  gold: "#d9a43a",
  rust: "#a4452a",
  crimson: "#9b2430",
  red: "#ad3229",
  marble: "#ece7dd",
  marbleTop: "#f7f3eb",
  marbleShade: "#c7beb0",
  marbleDeep: "#a99f90",
  vein: "#9d978d",
  leaf: "#2b4d25",
  leafDark: "#162c17",
  leafLight: "#5f8c46",
  bark: "#5d3d26",
  barkDark: "#36230f",
  barkLight: "#86603e",
  paper: "#efe6d2",
  paperWhite: "#f3eee3",
  sepia: "#5e3f22",
  ink: "#15130f",
  skin: "#e2b48e",
  skinLight: "#f1cba7",
  skinShade: "#b47f59",
  hairDark: "#2b1c13",
  auburn: "#8e3f1b",
  velvet: "#1f4a2d",
  velvetDark: "#0f2a19",
  velvetLight: "#3d7046",
  brass: "#c79b3b",
  brassLight: "#ecc76d",
  brassDark: "#7a581b",
  boxwood: "#d6b676",
  raffia: "#d8c48c",
  steel: "#a3abb0",
};

// ---------------------------------------------------------------------------------------------
// Numbers, colours, randomness
// ---------------------------------------------------------------------------------------------

/** Round for SVG output. */
export const n = (v) => Math.round(v * 100) / 100;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smoother = (t) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const TAU = Math.PI * 2;

const hex = (c) => {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
/** Mix two hex colours. */
export const mix = (a, b, t) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => lerp(v, y[i], t)));
};
export const rgbOf = hex;

/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// The SVG builder
// ---------------------------------------------------------------------------------------------

export class Svg {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    /** Scale relative to a 1440-wide picture. */
    this.s = width / 1440;
    this.defs = [];
    this.parts = [];
    this.count = 0;
    this.keyed = new Map();
  }

  uid(prefix = "d") {
    this.count += 1;
    return `${prefix}${this.count}`;
  }

  add(...parts) {
    for (const p of parts) if (p) this.parts.push(p);
    return this;
  }

  /** Register a def once per key (or always, when no key). Returns its id. */
  def(key, make) {
    if (key && this.keyed.has(key)) return this.keyed.get(key);
    const id = this.uid();
    this.defs.push(make(id));
    if (key) this.keyed.set(key, id);
    return id;
  }

  /** Linear gradient; stops = [[offset, colour, opacity?], ...]; vector in bbox units. */
  linear(stops, [x1, y1, x2, y2] = [0, 0, 1, 0], key = null, units = "objectBoundingBox") {
    return this.def(key, (id) => {
      const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("");
      return `<linearGradient id="${id}" gradientUnits="${units}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
    });
  }

  /** Radial gradient in bbox units unless `units` is userSpaceOnUse. */
  radial(stops, { cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy, units = "objectBoundingBox" } = {}, key = null) {
    return this.def(key, (id) => {
      const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("");
      return `<radialGradient id="${id}" gradientUnits="${units}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fx="${n(fx)}" fy="${n(fy)}">${s}</radialGradient>`;
    });
  }

  /** A filter from primitives; region in bbox units by default. */
  filter(primitives, { x = "-15%", y = "-15%", w = "130%", h = "130%" } = {}, key = null) {
    return this.def(key, (id) => `<filter id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">${primitives}</filter>`);
  }

  /** Painterly edge: displace the graphic by fractal noise. */
  rough(scale = 4, freq = 0.03, seed = 3, octaves = 2) {
    const k = this.s;
    return this.filter(
      `<feTurbulence type="fractalNoise" baseFrequency="${n(freq / k)}" numOctaves="${octaves}" seed="${seed}" result="t"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="t" scale="${n(scale * k)}" xChannelSelector="R" yChannelSelector="G"/>`,
      {},
      `rough:${scale}:${freq}:${seed}:${octaves}`,
    );
  }

  blur(sd, key = true) {
    const v = n(sd * this.s);
    return this.filter(`<feGaussianBlur stdDeviation="${v}"/>`, { x: "-50%", y: "-50%", w: "200%", h: "200%" }, key ? `blur:${v}` : null);
  }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}"><defs>${this.defs.join("")}</defs>${this.parts.join("")}</svg>`;
  }
}

// ---------------------------------------------------------------------------------------------
// Grounds
// ---------------------------------------------------------------------------------------------

/** A cobalt sky: deeper at the top, lighter low, with long horizontal brush mottling. */
export function sky(svg, { top = C.skyDeep, mid = C.sky, low = C.skyLow, seed = 11, mottle = 0.5, y0 = 0, y1 = svg.H } = {}) {
  const g = svg.linear([[0, top], [0.55, mid], [1, low]], [0, 0, 0, 1]);
  svg.add(`<rect x="0" y="${n(y0)}" width="${svg.W}" height="${n(y1 - y0)}" fill="url(#${g})"/>`);
  if (mottle > 0) {
    // broad, uneven layers of paint (isotropic: no bands), lighter patches only
    const k = svg.s;
    const f = svg.filter(
      `<feTurbulence type="fractalNoise" baseFrequency="${n(0.0022 / k)} ${n(0.0032 / k)}" numOctaves="3" seed="${seed}"/>` +
        `<feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.7  0 0 0 0 0.95  1.6 0 0 0 -0.78"/>` +
        `<feComposite in2="SourceGraphic" operator="in"/>`,
      { x: "0", y: "0", w: "100%", h: "100%" },
    );
    svg.add(`<rect x="0" y="${n(y0)}" width="${svg.W}" height="${n(y1 - y0)}" fill="#fff" filter="url(#${f})" opacity="${n(mottle * 0.6)}"/>`);
  }
}

/** A flat paper field with fibre and a warm darkening toward the edges. */
export function paper(svg, { color = C.paper, seed = 21, fibre = 0.5 } = {}) {
  svg.add(`<rect width="${svg.W}" height="${svg.H}" fill="${color}"/>`);
  const k = svg.s;
  const f = svg.filter(
    `<feTurbulence type="fractalNoise" baseFrequency="${n(0.006 / k)} ${n(0.008 / k)}" numOctaves="3" seed="${seed}"/>` +
      `<feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.3  1.2 0 0 0 -0.55"/>`,
    { x: "0", y: "0", w: "100%", h: "100%" },
  );
  svg.add(`<rect width="${svg.W}" height="${svg.H}" filter="url(#${f})" opacity="${n(fibre * 0.5)}"/>`);
  const edge = svg.radial([[0.55, "#7a5a2a", 0], [1, "#7a5a2a", 0.22]], { r: 0.75 });
  svg.add(`<rect width="${svg.W}" height="${svg.H}" fill="url(#${edge})"/>`);
}

// ---------------------------------------------------------------------------------------------
// The orange
// ---------------------------------------------------------------------------------------------

const ORANGE_STOPS = [[0, "#ffc46a"], [0.32, "#fa9c26"], [0.7, "#e0700c"], [1, "#9a4206"]];
const GOLD_STOPS = [[0, "#fff0b0"], [0.25, "#ffc94a"], [0.62, "#e69a16"], [1, "#94550a"]];
const GREEN_STOPS = [[0, "#b9cf6a"], [0.4, "#7f9c37"], [1, "#3f5a1c"]];

/**
 * An orange: a disc lit from the upper left with a darker lower half, peel dimples, a small
 * highlight at `highlight` (absolute px; the hero's glint anchor), and a stem with leaves.
 */
export function orange(svg, o) {
  const { cx, cy, r } = o;
  const kind = o.gilded ? "gold" : o.green ? "green" : "orange";
  const [hx, hy] = o.highlight ?? [cx - r * 0.42, cy - r * 0.46];
  const fx = clamp(0.5 + (hx - cx) / (2 * r), 0.1, 0.9);
  const fy = clamp(0.5 + (hy - cy) / (2 * r), 0.1, 0.9);
  const stops = kind === "gold" ? GOLD_STOPS : kind === "green" ? GREEN_STOPS : ORANGE_STOPS;
  const body = svg.radial(stops, { cx: lerp(fx, 0.5, 0.3), cy: lerp(fy, 0.5, 0.3), r: 0.78, fx, fy });
  const lower = svg.linear([[0, "#000", 0], [0.48, "#1d0800", 0], [1, "#1d0800", o.lowerShade ?? 0.5]], [0, 0, 0, 1], "orange-lower");
  const bounce = svg.radial([[0.6, "#ffb070", 0], [1, "#ffb070", 0.28]], { cx: 0.32, cy: 0.3, r: 0.72 }, "orange-bounce");
  const freq = clamp(60 / r, 0.1, 0.6);
  const dimple = svg.filter(
    `<feTurbulence type="fractalNoise" baseFrequency="${n(freq)}" numOctaves="2" seed="${o.seed ?? 5}" result="t"/>` +
      `<feColorMatrix in="t" type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.08  0 0 0 0 0  0 0 0 -3.2 1.75"/>` +
      `<feComposite in2="SourceGraphic" operator="in"/>`,
    { x: "0", y: "0", w: "100%", h: "100%" },
    `dimple:${n(freq)}:${o.seed ?? 5}`,
  );
  const parts = [];
  const disc = (fill, extra = "") => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${extra}/>`;
  parts.push(disc(`url(#${body})`));
  parts.push(disc(`url(#${lower})`));
  parts.push(disc(`url(#${bounce})`));
  parts.push(disc("#000", `filter="url(#${dimple})" opacity="${o.dimples ?? 0.16}"`));
  // the highlight where the light hits (soft bloom, then a small bright core)
  const hl = o.highlightSize ?? 1;
  parts.push(
    `<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="${n(r * 0.2 * hl)}" ry="${n(r * 0.12 * hl)}" transform="rotate(-38 ${n(hx)} ${n(hy)})" fill="#fff4d6" opacity="0.55" filter="url(#${svg.blur(r * 0.05 / svg.s)})"/>`,
    `<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="${n(r * 0.065 * hl)}" ry="${n(r * 0.04 * hl)}" transform="rotate(-38 ${n(hx)} ${n(hy)})" fill="#fffbef" opacity="0.92" filter="url(#${svg.blur(Math.max(0.6, r * 0.012 / svg.s))})"/>`,
  );
  if (kind === "gold") {
    // a thin burnished sheen along the lit rim
    parts.push(`<path d="M${n(cx - r * 0.86)},${n(cy + r * 0.2)} A${n(r * 0.9)},${n(r * 0.9)} 0 0 1 ${n(cx + r * 0.1)},${n(cy - r * 0.88)}" fill="none" stroke="#fff3c2" stroke-width="${n(r * 0.035)}" opacity="0.45" stroke-linecap="round"/>`);
  }
  let out = `<g>${parts.join("")}</g>`;
  if (o.rough !== false) out = `<g filter="url(#${svg.rough(Math.max(1.2, r * 0.025 / svg.s), 0.04, 7)})">${out}</g>`;
  // stem, calyx and leaves on top
  const top = [];
  if (o.stem !== false) {
    const sx = cx + r * 0.04;
    const sy = cy - r * 0.97;
    const stemLen = o.stemLen ?? r * 0.16;
    top.push(`<path d="M${n(sx)},${n(sy)} q${n(r * 0.02)},${n(-stemLen * 0.6)} ${n(r * 0.08)},${n(-stemLen)}" fill="none" stroke="${C.bark}" stroke-width="${n(Math.max(1.2, r * 0.045))}" stroke-linecap="round"/>`);
    top.push(`<ellipse cx="${n(sx)}" cy="${n(sy + r * 0.01)}" rx="${n(r * 0.08)}" ry="${n(r * 0.03)}" fill="${C.leafDark}" opacity="0.9"/>`);
    const leaves = o.leaves ?? 2;
    const la = o.leafAngle ?? 0;
    const ls = o.leafScale ?? 1;
    if (leaves >= 1) top.push(leaf(svg, sx + r * 0.05, sy - stemLen * 0.7, r * 0.62 * ls, -28 + la));
    if (leaves >= 2) top.push(leaf(svg, sx + r * 0.02, sy - stemLen * 0.5, r * 0.48 * ls, -150 + la));
  }
  return out + top.join("");
}

/** An orange cut in half, its face tilted toward the viewer: peel rim, white pith, segments. */
export function halfOrange(svg, { cx, cy, r, face = 1, tilt = 0.62, seed = 9 }) {
  // the peel's back (a half disc behind the face, on the side away from the cut)
  const rx = r * tilt;
  const body = svg.radial(GOLD_STOPS, { cx: 0.4, cy: 0.35, r: 0.8 }, "half-body");
  const parts = [];
  const bx = cx - face * rx * 0.35;
  parts.push(`<ellipse cx="${n(bx)}" cy="${n(cy)}" rx="${n(r * 0.9)}" ry="${n(r)}" fill="url(#${body})"/>`);
  parts.push(`<ellipse cx="${n(bx)}" cy="${n(cy)}" rx="${n(r * 0.9)}" ry="${n(r)}" fill="url(#${svg.linear([[0.45, "#1d0800", 0], [1, "#1d0800", 0.45]], [0, 0, 0, 1], "orange-lower2")})"/>`);
  // the cut face
  parts.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(r * 0.98)}" fill="#f19a2a"/>`);
  parts.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * 0.93)}" ry="${n(r * 0.92)}" fill="#fbf1dc"/>`);
  const flesh = svg.radial([[0, "#ffd36a"], [0.6, "#f7a42c"], [1, "#e9861c"]], { r: 0.55 }, "flesh");
  parts.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * 0.86)}" ry="${n(r * 0.85)}" fill="url(#${flesh})"/>`);
  const segs = 10;
  const rand = rng(seed);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU + rand() * 0.08;
    parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx + Math.cos(a) * rx * 0.84)}" y2="${n(cy + Math.sin(a) * r * 0.83)}" stroke="#fff3d6" stroke-width="${n(r * 0.035)}" opacity="0.85"/>`);
  }
  parts.push(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * 0.12)}" ry="${n(r * 0.1)}" fill="#fff5de"/>`);
  // a bead of juice catching the light
  parts.push(`<ellipse cx="${n(cx + face * rx * 0.2)}" cy="${n(cy + r * 0.55)}" rx="${n(r * 0.06)}" ry="${n(r * 0.08)}" fill="#ffe7a6" opacity="0.9"/>`);
  parts.push(`<ellipse cx="${n(cx + face * rx * 0.18)}" cy="${n(cy + r * 0.52)}" rx="${n(r * 0.02)}" ry="${n(r * 0.025)}" fill="#fff"/>`);
  return `<g filter="url(#${svg.rough(Math.max(1, r * 0.02 / svg.s), 0.05, 4)})">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------------------------------------
// Leaves, branches, trees
// ---------------------------------------------------------------------------------------------

/** One glossy leaf from (x, y), `len` long, pointing at `angle` degrees (0 = right). */
export function leaf(svg, x, y, len, angle, o = {}) {
  const w = o.width ?? 0.36;
  const hw = (len * w) / 2;
  const tone = o.tone ?? "dark";
  const key = `leaf:${tone}`;
  const g =
    tone === "lit"
      ? svg.linear([[0, "#8fb35a"], [0.5, "#4f7a33"], [1, "#24421d"]], [0, 0, 0, 1], key)
      : tone === "young"
        ? svg.linear([[0, "#a7c766"], [0.5, "#6f9a3c"], [1, "#3c6224"]], [0, 0, 0, 1], key)
        : svg.linear([[0, "#4f7a3a"], [0.45, C.leaf], [1, C.leafDark]], [0, 0, 0, 1], key);
  const d = `M0,0 C${n(len * 0.22)},${n(-hw * 1.35)} ${n(len * 0.72)},${n(-hw * 1.05)} ${n(len)},0 C${n(len * 0.72)},${n(hw * 1.05)} ${n(len * 0.22)},${n(hw * 1.35)} 0,0Z`;
  const rib = `<path d="M${n(len * 0.04)},0 Q${n(len * 0.5)},${n(-hw * 0.08)} ${n(len * 0.94)},0" fill="none" stroke="#9fbe7a" stroke-width="${n(Math.max(0.5, len * 0.025))}" opacity="0.5"/>`;
  const gloss = o.gloss === false ? "" : `<path d="M${n(len * 0.18)},${n(-hw * 0.55)} Q${n(len * 0.5)},${n(-hw * 0.95)} ${n(len * 0.82)},${n(-hw * 0.32)}" fill="none" stroke="#d4e8b4" stroke-width="${n(Math.max(0.5, len * 0.03))}" opacity="0.32" stroke-linecap="round"/>`;
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})"><path d="${d}" fill="url(#${g})"/>${rib}${gloss}</g>`;
}

/** A tapered branch along a quadratic curve, with bark shading. */
export function branch(svg, [x0, y0], [cx, cy], [x1, y1], w0, w1, color = C.bark) {
  // offset the curve on both sides to make a tapered shape
  const nx = (ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  const [n0x, n0y] = nx(x0, y0, cx, cy);
  const [n1x, n1y] = nx(cx, cy, x1, y1);
  const [ncx, ncy] = nx(x0, y0, x1, y1);
  const wc = (w0 + w1) / 2;
  const d =
    `M${n(x0 + n0x * w0)},${n(y0 + n0y * w0)} Q${n(cx + ncx * wc)},${n(cy + ncy * wc)} ${n(x1 + n1x * w1)},${n(y1 + n1y * w1)} ` +
    `L${n(x1 - n1x * w1)},${n(y1 - n1y * w1)} Q${n(cx - ncx * wc)},${n(cy - ncy * wc)} ${n(x0 - n0x * w0)},${n(y0 - n0y * w0)}Z`;
  const shade = `M${n(x0 - n0x * w0 * 0.5)},${n(y0 - n0y * w0 * 0.5)} Q${n(cx - ncx * wc * 0.5)},${n(cy - ncy * wc * 0.5)} ${n(x1 - n1x * w1 * 0.5)},${n(y1 - n1y * w1 * 0.5)}`;
  const lit = `M${n(x0 + n0x * w0 * 0.55)},${n(y0 + n0y * w0 * 0.55)} Q${n(cx + ncx * wc * 0.55)},${n(cy + ncy * wc * 0.55)} ${n(x1 + n1x * w1 * 0.55)},${n(y1 + n1y * w1 * 0.55)}`;
  return (
    `<path d="${d}" fill="${color}"/>` +
    `<path d="${shade}" fill="none" stroke="${C.barkDark}" stroke-width="${n(wc * 0.7)}" opacity="0.45" stroke-linecap="round"/>` +
    `<path d="${lit}" fill="none" stroke="${C.barkLight}" stroke-width="${n(wc * 0.35)}" opacity="0.5" stroke-linecap="round"/>`
  );
}

/** A cluster of leaves scattered round a point (deterministic by seed). */
export function leafCluster(svg, x, y, radius, count, { seed = 1, len = 40, tone = "dark", spread = 1 } = {}) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * radius * spread;
    const lx = x + Math.cos(a) * d;
    const ly = y + Math.sin(a) * d;
    out.push(leaf(svg, lx, ly, len * (0.7 + rand() * 0.6), (a * 180) / Math.PI + (rand() - 0.5) * 70, { tone: rand() < 0.2 ? "lit" : tone }));
  }
  return out.join("");
}

// ---------------------------------------------------------------------------------------------
// Marble
// ---------------------------------------------------------------------------------------------

/** One marble step or block: a lit tread band on top and a shaded riser face below it. */
export function marbleStep(svg, { x0, x1, top, tread, bottom, seed = 1, veins = 3 }) {
  const treadG = svg.linear([[0, C.marbleTop], [1, C.marble]], [0, 0, 0, 1], "tread");
  const faceG = svg.linear([[0, "#e9e3d7"], [0.6, C.marble], [1, C.marbleShade]], [0, 0, 1, 0.25], "riser");
  const parts = [];
  parts.push(`<rect x="${n(x0)}" y="${n(top)}" width="${n(x1 - x0)}" height="${n(tread - top)}" fill="url(#${treadG})"/>`);
  parts.push(`<rect x="${n(x0)}" y="${n(tread)}" width="${n(x1 - x0)}" height="${n(bottom - tread)}" fill="url(#${faceG})"/>`);
  // shadow under the nosing, and a lit edge on the nosing
  const sh = svg.linear([[0, "#5c5446", 0.32], [1, "#5c5446", 0]], [0, 0, 0, 1], "nosing-shadow");
  parts.push(`<rect x="${n(x0)}" y="${n(tread)}" width="${n(x1 - x0)}" height="${n((bottom - tread) * 0.3)}" fill="url(#${sh})"/>`);
  parts.push(`<line x1="${n(x0)}" y1="${n(tread)}" x2="${n(x1)}" y2="${n(tread)}" stroke="#fffdf8" stroke-width="${n(1.4 * svg.s)}" opacity="0.8"/>`);
  // veins
  const rand = rng(seed);
  for (let i = 0; i < veins; i++) {
    const vx = lerp(x0, x1, rand());
    const vy = lerp(tread, bottom, rand() * 0.5);
    const len = (x1 - x0) * (0.15 + rand() * 0.25);
    parts.push(`<path d="M${n(vx)},${n(vy)} q${n(len * 0.3)},${n((bottom - tread) * (rand() * 0.6 - 0.1))} ${n(len)},${n((bottom - tread) * (rand() * 0.5))}" fill="none" stroke="${C.vein}" stroke-width="${n((0.7 + rand()) * svg.s)}" opacity="${n(0.25 + rand() * 0.25)}"/>`);
  }
  // the far end of the block in shadow (light from the left)
  parts.push(`<rect x="${n(x1 - (x1 - x0) * 0.12)}" y="${n(tread)}" width="${n((x1 - x0) * 0.12)}" height="${n(bottom - tread)}" fill="url(#${svg.linear([[0, "#6b6152", 0], [1, "#6b6152", 0.22]], [0, 0, 1, 0], "block-end")})"/>`);
  return `<g filter="url(#${svg.rough(1.6, 0.05, 13 + (seed % 5))})">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------------------------

/**
 * A standing draped figure, feet at (x, y), `h` px tall. Options:
 *   gown, shade, sash, shawl, back (seen from behind), face (-1 left, 1 right), hair, bun,
 *   lean (px at the shoulders), sway (px at the hem), arms: [{ side: "L"|"R", to: [x, y],
 *   bend: 1|-1, front: true, hand: "open"|"point", tip: [x, y] }].
 * Returns `{ svg, shoulders }`.
 */
export function figure(svg, o) {
  const { x, y, h } = o;
  const lean = o.lean ?? 0;
  const sway = o.sway ?? 0;
  const face = o.face ?? -1;
  const gown = o.gown ?? C.cream;
  const shade = o.shade ?? C.creamShade;
  const lit = o.lit ?? mix(gown, "#ffffff", 0.45);
  const R = h * 0.062;
  const top = y - h;
  const hx = x + lean;
  const hy = top + R;
  const neckY = hy + R * 0.95;
  const shY = top + h * 0.19;
  const shW = h * 0.105;
  const waistY = top + h * 0.47;
  const waistW = h * 0.068;
  const hemW = h * 0.13;
  const wx = x + lean * 0.55;
  const shoulders = { L: [hx - shW * 0.82, shY + h * 0.03], R: [hx + shW * 0.82, shY + h * 0.03] };

  const g = svg.linear([[0, lit], [0.42, gown], [1, shade]], [0, 0, 1, 0.15]);
  const body =
    `M${n(hx - h * 0.03)},${n(neckY)} ` +
    `C${n(hx - shW * 0.6)},${n(shY - h * 0.012)} ${n(hx - shW)},${n(shY - h * 0.006)} ${n(hx - shW)},${n(shY + h * 0.025)} ` +
    `C${n(hx - shW * 1.02)},${n(shY + h * 0.13)} ${n(wx - waistW * 1.12)},${n(waistY - h * 0.08)} ${n(wx - waistW)},${n(waistY)} ` +
    `C${n(wx - waistW * 1.05)},${n(waistY + h * 0.2)} ${n(x - hemW * 0.95 + sway * 0.5)},${n(y - h * 0.15)} ${n(x - hemW + sway)},${n(y)} ` +
    `Q${n(x - hemW * 0.5 + sway)},${n(y + h * 0.014)} ${n(x + sway)},${n(y - h * 0.004)} ` +
    `Q${n(x + hemW * 0.5 + sway)},${n(y + h * 0.016)} ${n(x + hemW + sway)},${n(y)} ` +
    `C${n(x + hemW * 0.95 + sway * 0.5)},${n(y - h * 0.15)} ${n(wx + waistW * 1.05)},${n(waistY + h * 0.2)} ${n(wx + waistW)},${n(waistY)} ` +
    `C${n(wx + waistW * 1.12)},${n(waistY - h * 0.08)} ${n(hx + shW * 1.02)},${n(shY + h * 0.13)} ${n(hx + shW)},${n(shY + h * 0.025)} ` +
    `C${n(hx + shW)},${n(shY - h * 0.006)} ${n(hx + shW * 0.6)},${n(shY - h * 0.012)} ${n(hx + h * 0.03)},${n(neckY)}Z`;

  const back = [];
  const front = [];
  for (const arm of o.arms ?? []) (arm.front === false ? back : front).push(drawArm(svg, shoulders[arm.side], arm, h, o));

  const parts = [];
  parts.push(...back);
  parts.push(`<path d="${body}" fill="url(#${g})"/>`);
  // folds: darker grooves and lit ridges falling from the waist to the hem
  const rand = rng(o.seed ?? 3);
  for (let i = 0; i < 6; i++) {
    const t = -0.75 + i * 0.3 + (rand() - 0.5) * 0.1;
    const x0 = wx + t * waistW * 0.9;
    const x1 = x + t * hemW * 0.92 + sway * (0.6 + 0.4 * rand());
    const col = i % 2 ? shade : lit;
    parts.push(`<path d="M${n(x0)},${n(waistY + h * 0.03)} C${n(x0 + (rand() - 0.5) * h * 0.02)},${n(waistY + h * 0.22)} ${n(x1)},${n(y - h * 0.2)} ${n(x1)},${n(y - h * 0.01)}" fill="none" stroke="${col}" stroke-width="${n(h * (i % 2 ? 0.011 : 0.007))}" opacity="${i % 2 ? 0.55 : 0.5}" stroke-linecap="round"/>`);
  }
  // bodice folds
  parts.push(`<path d="M${n(hx - shW * 0.5)},${n(shY + h * 0.05)} Q${n(wx - waistW * 0.2)},${n(waistY - h * 0.1)} ${n(wx - waistW * 0.3)},${n(waistY)}" fill="none" stroke="${shade}" stroke-width="${n(h * 0.006)}" opacity="0.5"/>`);
  if (o.shawl) {
    const sg = svg.linear([[0, mix(o.shawl, "#ffffff", 0.3)], [0.5, o.shawl], [1, mix(o.shawl, "#000000", 0.35)]], [0, 0, 1, 0.3]);
    const dark = mix(o.shawl, "#000000", 0.4);
    // a cape over both shoulders with a curved hem across the chest, one end falling to the knee
    parts.push(
      `<path d="M${n(hx - shW * 1.16)},${n(shY + h * 0.035)} C${n(hx - shW * 1.2)},${n(shY + h * 0.14)} ${n(hx - shW * 0.9)},${n(shY + h * 0.2)} ${n(hx - shW * 0.55)},${n(shY + h * 0.22)} ` +
        `Q${n(hx)},${n(shY + h * 0.27)} ${n(hx + shW * 0.55)},${n(shY + h * 0.215)} C${n(hx + shW * 0.9)},${n(shY + h * 0.2)} ${n(hx + shW * 1.2)},${n(shY + h * 0.14)} ${n(hx + shW * 1.16)},${n(shY + h * 0.035)} ` +
        `Q${n(hx)},${n(shY - h * 0.045)} ${n(hx - shW * 1.16)},${n(shY + h * 0.035)}Z" fill="url(#${sg})"/>`,
      `<path d="M${n(hx - shW * 0.95)},${n(shY + h * 0.1)} C${n(hx - shW * 1.05)},${n(waistY)} ${n(x - hemW * 0.75 + sway * 0.4)},${n(y - h * 0.38)} ${n(x - hemW * 0.62 + sway * 0.6)},${n(y - h * 0.24)} ` +
        `L${n(x - hemW * 0.28 + sway * 0.6)},${n(y - h * 0.27)} C${n(x - hemW * 0.35 + sway * 0.4)},${n(y - h * 0.4)} ${n(hx - shW * 0.45)},${n(waistY)} ${n(hx - shW * 0.45)},${n(shY + h * 0.2)}Z" fill="url(#${sg})"/>`,
      `<path d="M${n(hx - shW * 0.7)},${n(shY + h * 0.15)} C${n(hx - shW * 0.78)},${n(waistY)} ${n(x - hemW * 0.5)},${n(y - h * 0.4)} ${n(x - hemW * 0.48 + sway * 0.5)},${n(y - h * 0.26)}" fill="none" stroke="${dark}" stroke-width="${n(h * 0.007)}" opacity="0.55"/>`,
      `<path d="M${n(hx - shW * 0.8)},${n(shY + h * 0.06)} Q${n(hx)},${n(shY + h * 0.2)} ${n(hx + shW * 0.8)},${n(shY + h * 0.06)}" fill="none" stroke="${dark}" stroke-width="${n(h * 0.006)}" opacity="0.5"/>`,
    );
  }
  if (o.sash) {
    const s0 = [hx - shW * 0.72, shY + h * 0.012];
    const s1 = [wx + waistW * 0.95, waistY + h * 0.025];
    parts.push(
      `<path d="M${n(s0[0])},${n(s0[1])} Q${n(lerp(s0[0], s1[0], 0.5) - h * 0.01)},${n(lerp(s0[1], s1[1], 0.55))} ${n(s1[0])},${n(s1[1])}" fill="none" stroke="${o.sash}" stroke-width="${n(h * 0.034)}" stroke-linecap="round"/>`,
      `<path d="M${n(s0[0])},${n(s0[1] - h * 0.008)} Q${n(lerp(s0[0], s1[0], 0.5) - h * 0.012)},${n(lerp(s0[1], s1[1], 0.55) - h * 0.008)} ${n(s1[0])},${n(s1[1] - h * 0.008)}" fill="none" stroke="${mix(o.sash, "#ffffff", 0.35)}" stroke-width="${n(h * 0.008)}" opacity="0.6"/>`,
      // knot and tails at the hip
      `<ellipse cx="${n(s1[0])}" cy="${n(s1[1])}" rx="${n(h * 0.02)}" ry="${n(h * 0.016)}" fill="${mix(o.sash, "#000000", 0.15)}"/>`,
      `<path d="M${n(s1[0])},${n(s1[1])} q${n(h * 0.012 + sway * 0.3)},${n(h * 0.08)} ${n(h * 0.004 + sway * 0.6)},${n(h * 0.17)}" fill="none" stroke="${o.sash}" stroke-width="${n(h * 0.018)}" stroke-linecap="round"/>`,
      `<path d="M${n(s1[0])},${n(s1[1])} q${n(-h * 0.008 + sway * 0.3)},${n(h * 0.07)} ${n(-h * 0.014 + sway * 0.5)},${n(h * 0.14)}" fill="none" stroke="${mix(o.sash, "#000000", 0.2)}" stroke-width="${n(h * 0.015)}" stroke-linecap="round"/>`,
    );
  }
  // neck and head
  const skinG = svg.linear([[0, C.skinLight], [0.5, C.skin], [1, C.skinShade]], [0, 0, 1, 0.3], "skin");
  parts.push(`<rect x="${n(hx - R * 0.36)}" y="${n(hy + R * 0.4)}" width="${n(R * 0.72)}" height="${n(neckY - hy - R * 0.2)}" fill="${C.skinShade}"/>`);
  const hair = o.hair ?? C.hairDark;
  const hairLit = mix(hair, "#ffffff", 0.18);
  if (o.back) {
    parts.push(`<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="${n(R * 0.86)}" ry="${n(R * 1.02)}" fill="${hair}"/>`);
    parts.push(`<circle cx="${n(hx + face * R * 0.1)}" cy="${n(hy - R * 0.92)}" r="${n(R * 0.48)}" fill="${hair}"/>`);
    parts.push(`<path d="M${n(hx - R * 0.6)},${n(hy - R * 0.5)} q${n(R * 0.5)},${n(-R * 0.4)} ${n(R * 1.1)},${n(-R * 0.1)}" fill="none" stroke="${hairLit}" stroke-width="${n(R * 0.12)}" opacity="0.6"/>`);
    parts.push(`<path d="M${n(hx + face * R * 0.75)},${n(hy + R * 0.1)} q${n(face * R * 0.12)},${n(R * 0.3)} 0,${n(R * 0.55)}" fill="none" stroke="${C.skinShade}" stroke-width="${n(R * 0.18)}" opacity="0.8"/>`);
  } else {
    parts.push(`<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="${n(R * 0.8)}" ry="${n(R)}" fill="url(#${skinG})"/>`);
    // the profile on the side she faces: brow, nose and chin, and a soft eye shadow
    parts.push(`<path d="M${n(hx + face * R * 0.7)},${n(hy - R * 0.3)} q${n(face * R * 0.14)},${n(R * 0.22)} ${n(face * R * 0.2)},${n(R * 0.42)} l${n(-face * R * 0.16)},${n(R * 0.06)} q${n(face * R * 0.02)},${n(R * 0.26)} ${n(-face * R * 0.12)},${n(R * 0.42)}" fill="${C.skin}" stroke="${C.skinShade}" stroke-width="${n(R * 0.05)}" stroke-opacity="0.5"/>`);
    parts.push(`<ellipse cx="${n(hx + face * R * 0.42)}" cy="${n(hy - R * 0.08)}" rx="${n(R * 0.14)}" ry="${n(R * 0.06)}" fill="${C.skinShade}" opacity="0.7"/>`);
    parts.push(`<path d="M${n(hx + face * R * 0.3)},${n(hy - R * 0.08)} q${n(face * R * 0.1)},${n(-R * 0.05)} ${n(face * R * 0.22)},${n(R * 0.01)}" fill="none" stroke="${C.hairDark}" stroke-width="${n(R * 0.06)}" stroke-linecap="round" opacity="0.85"/>`);
    parts.push(`<path d="M${n(hx + face * R * 0.26)},${n(hy - R * 0.24)} q${n(face * R * 0.14)},${n(-R * 0.08)} ${n(face * R * 0.3)},${n(-R * 0.01)}" fill="none" stroke="${mix(o.hair ?? C.hairDark, C.skinShade, 0.3)}" stroke-width="${n(R * 0.05)}" stroke-linecap="round" opacity="0.7"/>`);
    parts.push(`<path d="M${n(hx + face * R * 0.62)},${n(hy + R * 0.5)} q${n(-face * R * 0.08)},${n(R * 0.03)} ${n(-face * R * 0.16)},0" fill="none" stroke="#a5604a" stroke-width="${n(R * 0.05)}" stroke-linecap="round" opacity="0.7"/>`);
    // hair cap swept to the back of the head, and a bun
    parts.push(`<path d="M${n(hx + face * R * 0.7)},${n(hy - R * 0.35)} Q${n(hx + face * R * 0.2)},${n(hy - R * 1.25)} ${n(hx - face * R * 0.8)},${n(hy - R * 0.55)} Q${n(hx - face * R * 1.0)},${n(hy + R * 0.1)} ${n(hx - face * R * 0.55)},${n(hy + R * 0.55)} Q${n(hx - face * R * 0.2)},${n(hy - R * 0.2)} ${n(hx + face * R * 0.7)},${n(hy - R * 0.35)}Z" fill="${hair}"/>`);
    if (o.bun !== false) parts.push(`<circle cx="${n(hx - face * R * 0.8)}" cy="${n(hy - R * 0.5)}" r="${n(R * 0.42)}" fill="${hair}"/>`);
    parts.push(`<path d="M${n(hx - face * R * 0.4)},${n(hy - R * 0.85)} q${n(-face * R * 0.4)},${n(R * 0.1)} ${n(-face * R * 0.6)},${n(R * 0.5)}" fill="none" stroke="${hairLit}" stroke-width="${n(R * 0.1)}" opacity="0.6"/>`);
  }
  parts.push(...front);
  const rough = svg.rough(Math.max(1.2, h * 0.006 / svg.s), 0.045, o.seed ?? 3);
  return { svg: `<g filter="url(#${rough})">${parts.join("")}</g>`, shoulders };
}

function drawArm(svg, [sx, sy], arm, h, o) {
  let [tx, ty] = arm.to;
  const L1 = h * 0.17;
  const L2 = h * 0.165;
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy) || 1;
  if (d > L1 + L2 - 1) {
    const k = (L1 + L2 - 1) / d;
    tx = sx + dx * k;
    ty = sy + dy * k;
    dx = tx - sx;
    dy = ty - sy;
    d = Math.hypot(dx, dy);
  }
  // two-bone IK: elbow on the side given by `bend`
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const bend = arm.bend ?? 1;
  const ex = sx + ux * a - uy * off * bend;
  const ey = sy + uy * a + ux * off * bend;
  const skin = C.skin;
  // a short chiton sleeve in the gown's colour unless the arm says otherwise
  const sleeve = arm.sleeve === undefined ? (o.sleeve ?? o.gown ?? C.cream) : arm.sleeve;
  const parts = [];
  // upper arm: a tapered limb (shade outline, skin, a lit edge toward the light)
  parts.push(`<path d="M${n(sx)},${n(sy)} L${n(ex)},${n(ey)}" stroke="${C.skinShade}" stroke-width="${n(h * 0.05)}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${n(sx)},${n(sy)} L${n(ex)},${n(ey)}" stroke="${skin}" stroke-width="${n(h * 0.042)}" stroke-linecap="round"/>`);
  if (sleeve) {
    const k = arm.sleeveLen ?? 0.38;
    const s0 = [lerp(sx, ex, 0.08), lerp(sy, ey, 0.08)];
    const s1 = [lerp(sx, ex, k), lerp(sy, ey, k)];
    parts.push(`<path d="M${n(s0[0])},${n(s0[1])} L${n(s1[0])},${n(s1[1])}" stroke="${mix(sleeve, "#000000", 0.15)}" stroke-width="${n(h * 0.049)}" stroke-linecap="butt"/>`);
    parts.push(`<path d="M${n(s0[0])},${n(s0[1])} L${n(s1[0])},${n(s1[1])}" stroke="${sleeve}" stroke-width="${n(h * 0.043)}" stroke-linecap="butt"/>`);
  }
  // forearm, slightly thinner toward the wrist
  parts.push(`<path d="M${n(ex)},${n(ey)} L${n(tx)},${n(ty)}" stroke="${C.skinShade}" stroke-width="${n(h * 0.04)}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${n(ex)},${n(ey)} L${n(tx)},${n(ty)}" stroke="${skin}" stroke-width="${n(h * 0.032)}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${n(ex)},${n(ey)} L${n(lerp(ex, tx, 0.8))},${n(lerp(ey, ty, 0.8))}" stroke="${C.skinLight}" stroke-width="${n(h * 0.009)}" stroke-linecap="round" opacity="0.55" transform="translate(${n(-h * 0.006)} ${n(-h * 0.006)})"/>`);
  if (arm.hand === "point" && arm.tip) {
    const [px, py] = arm.tip;
    parts.push(`<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(h * 0.024)}" ry="${n(h * 0.02)}" fill="${skin}"/>`);
    parts.push(`<path d="M${n(tx)},${n(ty)} L${n(px)},${n(py)}" stroke="${C.skinShade}" stroke-width="${n(h * 0.015)}" stroke-linecap="round"/>`);
    parts.push(`<path d="M${n(tx)},${n(ty)} L${n(px)},${n(py)}" stroke="${skin}" stroke-width="${n(h * 0.011)}" stroke-linecap="round"/>`);
  } else if (arm.hand !== "none") {
    const a = (Math.atan2(ty - ey, tx - ex) * 180) / Math.PI;
    parts.push(`<ellipse cx="${n(tx + h * 0.012)}" cy="${n(ty)}" rx="${n(h * 0.03)}" ry="${n(h * 0.021)}" transform="rotate(${n(a)} ${n(tx)} ${n(ty)})" fill="${skin}" stroke="${C.skinShade}" stroke-width="${n(h * 0.004)}"/>`);
  }
  return parts.join("");
}

/**
 * A close-up hand: wrist at (x, y), pointing at `angle` degrees, `size` = palm length in px.
 * curl 0 (open) .. 1 (closed round something); sleeve and cuff run back from the wrist.
 */
export function hand(svg, { x, y, angle, size, curl = 0.5, sleeve = null, cuff = null, lace = false, sleeveLen = 3, flip = false, seed = 2 }) {
  const s = size;
  const parts = [];
  if (sleeve) {
    const sg = svg.linear([[0, mix(sleeve, "#ffffff", 0.18)], [0.5, sleeve], [1, mix(sleeve, "#000000", 0.4)]], [0, 0, 0, 1], `sleeve:${sleeve}`);
    parts.push(`<path d="M${n(-s * 0.2)},${n(-s * 0.42)} L${n(-s * sleeveLen)},${n(-s * 0.62)} L${n(-s * sleeveLen)},${n(s * 0.62)} L${n(-s * 0.2)},${n(s * 0.42)}Z" fill="url(#${sg})"/>`);
  }
  if (cuff) {
    if (lace) {
      let d = `M${n(-s * 0.05)},${n(-s * 0.5)}`;
      for (let i = 0; i <= 8; i++) {
        const yy = -s * 0.5 + (i / 8) * s;
        d += ` L${n(s * (i % 2 ? 0.12 : 0.02))},${n(yy)}`;
      }
      d += ` L${n(-s * 0.32)},${n(s * 0.48)} L${n(-s * 0.32)},${n(-s * 0.48)}Z`;
      parts.push(`<path d="${d}" fill="${cuff}"/>`);
      parts.push(`<path d="M${n(-s * 0.18)},${n(-s * 0.45)} L${n(-s * 0.18)},${n(s * 0.45)}" stroke="#d9d2c4" stroke-width="${n(s * 0.04)}" stroke-dasharray="${n(s * 0.05)} ${n(s * 0.04)}"/>`);
    } else {
      parts.push(`<rect x="${n(-s * 0.32)}" y="${n(-s * 0.46)}" width="${n(s * 0.3)}" height="${n(s * 0.92)}" rx="${n(s * 0.06)}" fill="${cuff}"/>`);
    }
  }
  const skinG = svg.linear([[0, C.skinLight], [0.55, C.skin], [1, C.skinShade]], [0, 0, 0, 1], "hand-skin");
  const rot = (x, y, deg) => {
    const a = (deg * Math.PI) / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  };
  // four fingers, two joints each, curled toward +y by `curl` (drawn little finger first)
  const rand = rng(seed);
  const lengths = [0.74, 0.82, 0.77, 0.6];
  const fingers = [];
  for (let i = 3; i >= 0; i--) {
    const kx = s * 0.93;
    const ky = -s * 0.29 + i * s * 0.195;
    const l = s * lengths[i] * (0.96 + rand() * 0.08);
    const spread = (i - 1.5) * 4 * (1 - curl);
    const [ax, ay] = rot(l * 0.55, 0, spread + curl * 38);
    const [bx2, by2] = rot(l * 0.47, 0, spread + curl * 95);
    const p1 = [kx + ax, ky + ay];
    const p2 = [p1[0] + bx2, p1[1] + by2];
    const d = `M${n(kx)},${n(ky)} L${n(p1[0])},${n(p1[1])} L${n(p2[0])},${n(p2[1])}`;
    fingers.push(
      `<path d="${d}" fill="none" stroke="${C.skinShade}" stroke-width="${n(s * 0.235)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`,
      `<path d="${d}" fill="none" stroke="${C.skin}" stroke-width="${n(s * 0.19)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<ellipse cx="${n(p1[0])}" cy="${n(p1[1] - s * 0.02)}" rx="${n(s * 0.05)}" ry="${n(s * 0.03)}" fill="${C.skinLight}" opacity="0.6"/>`,
    );
  }
  parts.push(...fingers);
  // palm (over the finger roots)
  parts.push(`<path d="M0,${n(-s * 0.36)} C${n(s * 0.3)},${n(-s * 0.45)} ${n(s * 0.82)},${n(-s * 0.46)} ${n(s * 1.0)},${n(-s * 0.36)} C${n(s * 1.06)},${n(-s * 0.1)} ${n(s * 1.06)},${n(s * 0.22)} ${n(s * 0.98)},${n(s * 0.36)} C${n(s * 0.7)},${n(s * 0.44)} ${n(s * 0.3)},${n(s * 0.44)} 0,${n(s * 0.36)}Z" fill="url(#${skinG})"/>`);
  parts.push(`<path d="M${n(s * 0.3)},${n(-s * 0.12)} Q${n(s * 0.6)},${n(-s * 0.18)} ${n(s * 0.9)},${n(-s * 0.14)}" fill="none" stroke="${C.skinShade}" stroke-width="${n(s * 0.025)}" opacity="0.45"/>`);
  // thumb: from the palm's side, open or closing over the index
  const t0 = [s * 0.3, -s * 0.34];
  const [tx1, ty1] = rot(s * 0.42, 0, -62 + curl * 30);
  const t1 = [t0[0] + tx1, t0[1] + ty1];
  const [tx2, ty2] = rot(s * 0.36, 0, -30 + curl * 55);
  const t2 = [t1[0] + tx2, t1[1] + ty2];
  const td = `M${n(t0[0])},${n(t0[1])} L${n(t1[0])},${n(t1[1])} L${n(t2[0])},${n(t2[1])}`;
  parts.push(`<path d="${td}" fill="none" stroke="${C.skinShade}" stroke-width="${n(s * 0.27)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`);
  parts.push(`<path d="${td}" fill="none" stroke="${C.skin}" stroke-width="${n(s * 0.22)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  parts.push(`<path d="M${n(t0[0])},${n(t0[1] - s * 0.03)} L${n(t1[0])},${n(t1[1] - s * 0.04)}" fill="none" stroke="${C.skinLight}" stroke-width="${n(s * 0.06)}" stroke-linecap="round" opacity="0.6"/>`);
  const scale = flip ? " scale(1 -1)" : "";
  const rough = svg.rough(Math.max(1, s * 0.03 / svg.s), 0.05, seed);
  return `<g filter="url(#${rough})"><g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})${scale}">${parts.join("")}</g></g>`;
}

/**
 * A brass watering can whose spout tip sits exactly at `tip` when tilt = 0; `dir` 1 = spout to
 * the right. The can turns by `tilt` degrees about `pivot` (the hand holding it).
 */
export function wateringCan(svg, { tip, size, dir = 1, tilt = 0, pivot }) {
  const [tx, ty] = tip;
  const s = size;
  const bx = tx - dir * s * 1.2;
  const by = ty - s * 0.2;
  const g = svg.linear([[0, C.brassLight], [0.45, C.brass], [1, C.brassDark]], [0, 0, 1, 0.35], "brass");
  const parts = [];
  // handle arc over the back
  parts.push(`<path d="M${n(bx - dir * s * 0.32)},${n(by - s * 0.3)} Q${n(bx - dir * s * 0.1)},${n(by - s * 0.95)} ${n(bx + dir * s * 0.28)},${n(by - s * 0.34)}" fill="none" stroke="${C.brassDark}" stroke-width="${n(s * 0.09)}" stroke-linecap="round"/>`);
  // spout: a tapering tube from the body's lower front to the tip, with a small rose
  const sx = bx + dir * s * 0.38;
  const sy = by + s * 0.12;
  parts.push(`<path d="M${n(sx)},${n(sy - s * 0.09)} L${n(tx - dir * s * 0.04)},${n(ty - s * 0.03)} L${n(tx - dir * s * 0.04)},${n(ty + s * 0.04)} L${n(sx)},${n(sy + s * 0.12)}Z" fill="url(#${g})"/>`);
  parts.push(`<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(s * 0.05)}" ry="${n(s * 0.09)}" transform="rotate(${dir * 25} ${n(tx)} ${n(ty)})" fill="${C.brassDark}"/>`);
  // body
  parts.push(`<path d="M${n(bx - s * 0.42)},${n(by - s * 0.32)} L${n(bx + s * 0.42)},${n(by - s * 0.32)} Q${n(bx + s * 0.5)},${n(by + s * 0.35)} ${n(bx + s * 0.4)},${n(by + s * 0.42)} L${n(bx - s * 0.4)},${n(by + s * 0.42)} Q${n(bx - s * 0.5)},${n(by + s * 0.35)} ${n(bx - s * 0.42)},${n(by - s * 0.32)}Z" fill="url(#${g})"/>`);
  parts.push(`<ellipse cx="${n(bx)}" cy="${n(by - s * 0.32)}" rx="${n(s * 0.42)}" ry="${n(s * 0.07)}" fill="${C.brassDark}"/>`);
  parts.push(`<path d="M${n(bx - s * 0.3)},${n(by - s * 0.2)} Q${n(bx - s * 0.36)},${n(by + s * 0.1)} ${n(bx - s * 0.28)},${n(by + s * 0.34)}" fill="none" stroke="#fff3c4" stroke-width="${n(s * 0.05)}" opacity="0.6" stroke-linecap="round"/>`);
  const [px, py] = pivot ?? [bx, by];
  const rough = svg.rough(Math.max(1, s * 0.02 / svg.s), 0.05, 17);
  return `<g filter="url(#${rough})"><g transform="rotate(${n(tilt)} ${n(px)} ${n(py)})">${parts.join("")}</g></g>`;
}

/**
 * A soft cumulus cloud: billows in tiers on a flatter base, a blue-grey shadow body with lit
 * white tops offset toward the light (upper left), edges softened and frayed.
 */
export function cloud(svg, { x, y, w, h, seed = 1, light = 1 }) {
  const rand = rng(seed);
  const puffs = [];
  const tiers = [
    { count: Math.max(6, Math.round(w / (h * 0.32))), lift: 0.0, size: 0.24, span: 1.0 },
    { count: Math.max(4, Math.round(w / (h * 0.45))), lift: 0.32, size: 0.3, span: 0.72 },
    { count: Math.max(2, Math.round(w / (h * 0.8))), lift: 0.62, size: 0.3, span: 0.4 },
  ];
  for (const t of tiers) {
    for (let i = 0; i < t.count; i++) {
      const f = t.count === 1 ? 0.5 : i / (t.count - 1);
      const px = x + (f - 0.5) * w * t.span + (rand() - 0.5) * h * 0.25;
      const pr = h * t.size * (0.75 + rand() * 0.5) * (0.7 + 0.3 * Math.sin(f * Math.PI));
      const py = y - h * t.lift - pr * 0.3 + (rand() - 0.5) * h * 0.08;
      puffs.push([px, py, pr]);
    }
  }
  const shade = "#a9b8d6";
  const lit = "#fbfaf6";
  const body = puffs.map(([px, py, pr]) => `<circle cx="${n(px)}" cy="${n(py)}" r="${n(pr)}"/>`).join("");
  const tops = puffs.map(([px, py, pr]) => `<circle cx="${n(px - pr * 0.12)}" cy="${n(py - pr * 0.16)}" r="${n(pr * 0.86)}"/>`).join("");
  const base = `<ellipse cx="${n(x)}" cy="${n(y + h * 0.04)}" rx="${n(w * 0.5)}" ry="${n(h * 0.12)}"/>`;
  const blur = svg.blur(Math.max(1.5, h * 0.035 / svg.s));
  const fray = svg.rough(Math.max(4, h * 0.08 / svg.s), 0.02, seed + 30, 3);
  return (
    `<g opacity="${n(Math.min(1, 0.55 + 0.45 * light))}" filter="url(#${fray})"><g filter="url(#${blur})">` +
    `<g fill="${shade}">${body}${base}</g>` +
    `<g fill="${lit}" opacity="${n(0.75 + 0.25 * light)}">${tops}</g>` +
    `</g></g>`
  );
}

// ---------------------------------------------------------------------------------------------
// Raster helpers
// ---------------------------------------------------------------------------------------------

/** Render an SVG string (or Svg) to raw RGBA at its own size. */
export async function renderSvg(svgOrString) {
  const str = typeof svgOrString === "string" ? svgOrString : svgOrString.toString();
  const { data, info } = await sharp(Buffer.from(str)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const textureCache = new Map();

/**
 * A grey canvas-and-brush texture for a soft-light pass (50% grey is neutral): long strokes in
 * two directions plus a little tooth. Cached per size and seed.
 */
export async function paintTexture(width, height, seed = 7, strength = 1) {
  const key = `${width}x${height}:${seed}:${strength}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const k = width / 1440;
  const a = n(0.5 * strength);
  const b = n(0.26 * strength);
  const d = Math.hypot(width, height);
  // broad uneven layers (isotropic) and brush strokes laid diagonally from the upper left (the
  // filter runs on a rotated rect, so the stroke direction is the rect's). No per-pixel tooth: it
  // reads as noise rather than paint and costs JPEG bytes on every frame.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<filter id="a" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${n(0.0045 / k)}" numOctaves="4" seed="${seed}"/>` +
    `<feColorMatrix type="matrix" values="${a} 0 0 0 ${n(0.5 - a / 2)}  ${a} 0 0 0 ${n(0.5 - a / 2)}  ${a} 0 0 0 ${n(0.5 - a / 2)}  0 0 0 0 1"/></filter>` +
    `<filter id="b" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${n(0.0035 / k)} ${n(0.028 / k)}" numOctaves="3" seed="${seed + 1}"/>` +
    `<feColorMatrix type="matrix" values="${b} 0 0 0 ${n(0.5 - b / 2)}  ${b} 0 0 0 ${n(0.5 - b / 2)}  ${b} 0 0 0 ${n(0.5 - b / 2)}  0 0 0 0 0.5"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#a)"/>` +
    `<g transform="translate(${width / 2} ${height / 2}) rotate(-33)"><rect x="${n(-d / 2)}" y="${n(-d / 2)}" width="${n(d)}" height="${n(d)}" filter="url(#b)"/></g>` +
    `</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  textureCache.set(key, png);
  return png;
}

/** The top overlay: a soft vignette and the faint mono label in the bottom-right corner. */
export async function topOverlay(width, height, { vignette = 0.35, label = null, ink = false, vignetteColor = "#000000" } = {}) {
  const k = width / 1440;
  const fs = Math.max(10, Math.round(13 * Math.max(k, 0.75)));
  const pad = Math.round(16 * Math.max(k, 0.7));
  const text = label
    ? `<text x="${width - pad}" y="${height - pad}" text-anchor="end" font-family="Menlo, 'DejaVu Sans Mono', 'Courier New', monospace" font-size="${fs}" letter-spacing="1" fill="${ink ? "#15130f" : "#f6f3ec"}" fill-opacity="${ink ? 0.32 : 0.38}">${label}</text>`
    : "";
  const r = Math.hypot(width, height) / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<radialGradient id="v" gradientUnits="userSpaceOnUse" cx="${width / 2}" cy="${height * 0.46}" r="${n(r)}">` +
    `<stop offset="0.45" stop-color="${vignetteColor}" stop-opacity="0"/><stop offset="1" stop-color="${vignetteColor}" stop-opacity="${vignette}"/></radialGradient>` +
    `<rect width="100%" height="100%" fill="url(#v)"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Finish a rendered picture: paint texture (soft light), vignette and label. `raw` is RGBA.
 * Returns RGBA.
 */
export async function finish(raw, width, height, { texture = 1, seed = 7, vignette = 0.35, label = null, ink = false, vignetteColor } = {}) {
  const layers = [];
  if (texture > 0) layers.push({ input: await paintTexture(width, height, seed, texture), blend: "soft-light" });
  if (vignette > 0 || label) layers.push({ input: await topOverlay(width, height, { vignette, label, ink, vignetteColor }) });
  if (!layers.length) return raw;
  return sharp(raw, { raw: { width, height, channels: 4 } }).composite(layers).ensureAlpha().raw().toBuffer();
}

/** Composite RGBA layers (each `{ data | input, left?, top? }`) over a raw RGBA base. */
export async function over(base, width, height, layers) {
  const inputs = layers.map((l) =>
    l.data
      ? { input: l.data, raw: { width: l.width, height: l.height, channels: 4 }, left: l.left ?? 0, top: l.top ?? 0 }
      : { input: l.input, left: l.left ?? 0, top: l.top ?? 0, blend: l.blend },
  );
  return sharp(base, { raw: { width, height, channels: 4 } }).composite(inputs).ensureAlpha().raw().toBuffer();
}

// ---------------------------------------------------------------------------------------------
// Noise fields and per-pixel work (for sequences and loops)
// ---------------------------------------------------------------------------------------------

/** Smooth value-noise fbm sampled on a w x h grid; `scale` = cells across the width. 0..1. */
export function noiseField(w, h, { scale = 6, octaves = 4, seed = 1 } = {}) {
  const rand = rng(seed);
  const G = 256;
  const lattice = new Float32Array(G * G);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const at = (ix, iy) => lattice[(iy & (G - 1)) * G + (ix & (G - 1))];
  const out = new Float32Array(w * h);
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 1;
      let f = scale / w;
      for (let o = 0; o < octaves; o++) {
        const fx = x * f + o * 17.3;
        const fy = y * f + o * 31.7;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = at(ix, iy);
        const b = at(ix + 1, iy);
        const c = at(ix, iy + 1);
        const d = at(ix + 1, iy + 1);
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        amp *= 0.5;
        f *= 2;
      }
      out[y * w + x] = v / norm;
    }
  }
  return out;
}

/**
 * Warp an RGBA layer by a displacement function evaluated on a coarse grid (every `step` px) and
 * interpolated; bilinear sampling. `disp(x, y)` returns [dx, dy] in px (sample offset).
 * Only the rectangle `box` = [x0, y0, x1, y1] is warped; the rest is copied.
 */
export function warp(src, width, height, disp, { step = 8, box = [0, 0, width, height] } = {}) {
  const out = Buffer.from(src);
  const [bx0, by0, bx1, by1] = box.map(Math.round);
  const gw = Math.ceil((bx1 - bx0) / step) + 2;
  const gh = Math.ceil((by1 - by0) / step) + 2;
  const gx = new Float32Array(gw * gh);
  const gy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const [dx, dy] = disp(bx0 + i * step, by0 + j * step);
      gx[j * gw + i] = dx;
      gy[j * gw + i] = dy;
    }
  }
  for (let y = Math.max(0, by0); y < Math.min(height, by1); y++) {
    const fj = (y - by0) / step;
    const j = Math.floor(fj);
    const tj = fj - j;
    for (let x = Math.max(0, bx0); x < Math.min(width, bx1); x++) {
      const fi = (x - bx0) / step;
      const i = Math.floor(fi);
      const ti = fi - i;
      const k00 = j * gw + i;
      const dx = (gx[k00] * (1 - ti) + gx[k00 + 1] * ti) * (1 - tj) + (gx[k00 + gw] * (1 - ti) + gx[k00 + gw + 1] * ti) * tj;
      const dy = (gy[k00] * (1 - ti) + gy[k00 + 1] * ti) * (1 - tj) + (gy[k00 + gw] * (1 - ti) + gy[k00 + gw + 1] * ti) * tj;
      let sx = x + dx;
      let sy = y + dy;
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx > width - 1.001) sx = width - 1.001;
      if (sy > height - 1.001) sy = height - 1.001;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const p00 = (y0 * width + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + width * 4;
      const p11 = p01 + 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = (src[p00 + c] * (1 - fx) + src[p10 + c] * fx) * (1 - fy) + (src[p01 + c] * (1 - fx) + src[p11 + c] * fx) * fy;
      }
    }
  }
  return out;
}
