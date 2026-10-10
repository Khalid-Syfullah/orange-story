/**
 * Placeholder plates: draws the image for a manifest entry that still carries a `placeholder` spec,
 * at the entry's pixel size. Used by `npm run art:placeholders` (scripts/art-placeholders.mjs),
 * which runs it on a pool of worker threads.
 *
 * - Character plates (`kind: "study"`) are painted as small oil studies by the stand-in painter
 *   (`study.mjs`: the cast from `cast.mjs`, posed by `poses.mjs`).
 * - World props (fruit, leaves, trees, column, urn, plinth, tower stone) are drawn as SVG
 *   silhouettes, then given a lighter pass of the same painter: the shared light, strokes and the
 *   canvas surface (`paintProp` in `paint.mjs`).
 * - Skies, glows, clouds, masks and other data stay as drawn.
 *
 * Colors come from `src/styles/tokens.ts` (the palette), mixed for wood and bark.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { paintProp } from "./paint.mjs";
import { renderStudy, studyRig } from "./study.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

async function readPalette() {
  const source = await readFile(path.join(ROOT, "src/styles/tokens.ts"), "utf8");
  const block = /export const colors = \{([\s\S]*?)\}/.exec(source);
  if (!block) throw new Error("Could not find `colors` in src/styles/tokens.ts");
  const colors = {};
  for (const [, name, hex] of block[1].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)) colors[name] = hex;
  return colors;
}

const C = await readPalette();

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
/** Mixes two hex colors: t = 0 is `a`, 1 is `b`. */
const mix = (a, b, t) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
};
const shade = (c, t) => mix(c, C.ink, t);
const lighten = (c, t) => mix(c, C.white, t);
/** A palette name ("marble") or a hex color. */
const color = (name, fallback) => (name ? (C[name] ?? name) : fallback);

const WOOD = mix(C.orange, C.ink, 0.55);
const BARK = mix(mix(C.orange, C.ink, 0.7), C.leaf, 0.2);
const TWINE = mix(C.orange, C.marble, 0.55);
const SAND = mix(C.marble, C.orange, 0.12);

/* ------------------------------------------------------------------ */
/* Seeded randomness (mulberry32, as in src/lib/progress.ts)            */
/* ------------------------------------------------------------------ */

function seeded(seed) {
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = Math.imul(31, h) + String(seed).charCodeAt(i);
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* SVG primitives                                                      */
/* ------------------------------------------------------------------ */

const n = (v) => (Math.round(v * 10) / 10).toString();
const attrs = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? n(v) : v}"`)
    .join("");

const rect = (x, y, w, h, fill, o) => `<rect${attrs({ x, y, width: w, height: h, fill, ...o })}/>`;
const circle = (cx, cy, r, fill, o) => `<circle${attrs({ cx, cy, r, fill, ...o })}/>`;
const ellipse = (cx, cy, rx, ry, fill, o) => `<ellipse${attrs({ cx, cy, rx, ry, fill, ...o })}/>`;
const pathEl = (d, fill, o) => `<path${attrs({ d, fill, ...o })}/>`;
const line = (x1, y1, x2, y2, stroke, width, o) =>
  `<line${attrs({ x1, y1, x2, y2, stroke, "stroke-width": width, "stroke-linecap": "round", ...o })}/>`;
const polyline = (points, stroke, width, o) =>
  `<polyline${attrs({ points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(" "), fill: "none", stroke, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round", ...o })}/>`;
const group = (transform, inner, o) => `<g${attrs({ transform, ...o })}>${inner}</g>`;

/** A pointed leaf with its base at (x, y), pointing along `angle` (degrees, 0 is up). */
function leaf(x, y, length, angle, fill, opacity = 1) {
  const w = length * 0.32;
  // Two halves either side of the midrib: the one turned to the sun (upper left) is lighter.
  const half = (s) => `M0 0 C${n(s * w * 1.2)} ${n(-length * 0.25)} ${n(s * w * 0.9)} ${n(-length * 0.75)} 0 ${n(-length)}Z`;
  const a = (angle * Math.PI) / 180;
  const leftLit = -Math.cos(a) * -0.66 + -Math.sin(a) * -0.75 > 0;
  const lit = lighten(fill, 0.18);
  const dark = shade(fill, 0.16);
  let veins = line(0, 0, 0, -length * 0.88, lighten(fill, 0.32), Math.max(0.8, length * 0.025), { opacity: 0.75 });
  for (const t of [0.3, 0.5, 0.7]) for (const s of [1, -1]) veins += line(0, -length * t, s * w * 0.75 * (1 - t * 0.4), -length * (t + 0.12), lighten(fill, 0.2), Math.max(0.6, length * 0.012), { opacity: 0.45 });
  return group(
    `translate(${n(x)} ${n(y)}) rotate(${n(angle)})`,
    pathEl(half(-1), leftLit ? lit : dark) + pathEl(half(1), leftLit ? dark : lit) + veins,
    { opacity: opacity < 1 ? opacity : undefined },
  );
}

/** An orange: base, a shaded crescent, a highlight and (optionally) a leaf at the stem. */
function orangeBall(cx, cy, r, { leafy = false, tone = 0 } = {}) {
  const base = tone > 0 ? mix(C.orange, C.skySoft, tone) : C.orange;
  const id = `o${Math.round(cx)}_${Math.round(cy)}_${Math.round(r)}`;
  // Lit from the upper left: light, half-tone, a core shadow toward the lower right, a little reflected light at the edge.
  const grad = `<radialGradient id="g${id}" cx="0.36" cy="0.32" r="0.78"><stop offset="0" stop-color="${lighten(base, 0.22)}"/><stop offset="0.45" stop-color="${base}"/><stop offset="0.82" stop-color="${shade(base, 0.3)}"/><stop offset="1" stop-color="${mix(shade(base, 0.18), C.skySoft, 0.15)}"/></radialGradient>`;
  // Rind: a stipple of pores.
  const rand = seeded(id);
  let pores = "";
  const count = Math.min(60, Math.max(8, Math.round(r * 1.2)));
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r * 0.92;
    pores += circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(0.5, r * 0.03), rand() > 0.5 ? shade(base, 0.25) : lighten(base, 0.25), { opacity: 0.45 });
  }
  return (
    `<defs>${grad}<clipPath id="${id}">${circle(cx, cy, r)}</clipPath></defs>` +
    circle(cx, cy, r, `url(#g${id})`) +
    group("", pores, { "clip-path": `url(#${id})` }) +
    ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.2, r * 0.12, C.white, { opacity: 0.32, transform: `rotate(-35 ${n(cx - r * 0.35)} ${n(cy - r * 0.4)})` }) +
    circle(cx + r * 0.05, cy - r * 0.9, r * 0.07, shade(C.leaf, 0.3)) +
    (leafy ? leaf(cx + r * 0.08, cy - r * 0.92, r * 0.75, 55, C.leaf) : "")
  );
}

/* ------------------------------------------------------------------ */
/* Plants                                                              */
/* ------------------------------------------------------------------ */

const leafTones = (tone = 0) => [C.leaf, shade(C.leaf, 0.18), lighten(C.leaf, 0.12), mix(C.leaf, C.sky, 0.15)].map((c) => (tone > 0 ? mix(c, C.skySoft, tone) : c));

/** Leaves and oranges scattered inside an ellipse (cx, cy, rx, ry). */
function crown({ cx, cy, rx, ry, leaves, oranges, seed, size, tone = 0, avoid }) {
  const rand = seeded(seed);
  const tones = leafTones(tone);
  let out = "";
  const pick = () => {
    for (let tries = 0; tries < 20; tries++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      if (!avoid || !avoid(x, y)) return [x, y];
    }
    return null;
  };
  for (let i = 0; i < leaves; i++) {
    const p = pick();
    if (p) out += leaf(p[0], p[1], size * (0.7 + rand() * 0.6), rand() * 360, tones[Math.floor(rand() * tones.length)]);
  }
  for (let i = 0; i < oranges; i++) {
    const p = pick();
    if (p) out += orangeBall(p[0], p[1], size * (0.32 + rand() * 0.14), { tone });
  }
  return out;
}

/** A tapered branch from (x1, y1) to (x2, y2) with twigs and leaves along it. */
function branch({ x1, y1, x2, y2, width, leaves, oranges = 0, seed, size, color: c = BARK, fruit = null }) {
  const rand = seeded(seed);
  const mx = (x1 + x2) / 2;
  const my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.08;
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  const ox = (nx / len) * width * 0.5;
  const oy = (ny / len) * width * 0.5;
  let out = pathEl(`M${n(x1 + ox)} ${n(y1 + oy)} Q${n(mx)} ${n(my)} ${n(x2)} ${n(y2)} Q${n(mx)} ${n(my + width * 0.3)} ${n(x1 - ox)} ${n(y1 - oy)}Z`, c);
  const at = (t) => {
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * mx + t * t * x2, u * u * y1 + 2 * u * t * my + t * t * y2];
  };
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.22;
    const [bx, by] = at(t);
    const tx = bx + (x2 - x1) * 0.18;
    const ty = by - width * (1.6 + rand() * 1.4) * (i % 2 ? 1 : -0.6);
    out += line(bx, by, tx, ty, c, Math.max(1, width * 0.28 * (1 - t * 0.5)));
  }
  const tones = leafTones();
  for (let i = 0; i < leaves; i++) {
    const t = 0.25 + rand() * 0.75;
    const [bx, by] = at(t);
    const side = rand() > 0.5 ? 1 : -1;
    out += leaf(bx, by, size * (0.7 + rand() * 0.5), (side > 0 ? 30 : -30) + (rand() - 0.5) * 70 + (x2 > x1 ? 20 : -20), tones[i % tones.length]);
  }
  for (let i = 0; i < oranges; i++) {
    let [bx, by] = at(0.55 + rand() * 0.35);
    if (fruit && i === 0) [bx, by] = [fruit[0], fruit[1] - size * 0.75];
    out += line(bx, by, bx, by + size * 0.35, shade(C.leaf, 0.3), Math.max(1, size * 0.05)) + orangeBall(bx, by + size * 0.75, size * 0.42);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Placeholder kinds: each returns the SVG body for a W x H image      */
/* ------------------------------------------------------------------ */

const KINDS = {
  glow: (W, H, s) =>
    `<defs><radialGradient id="g"><stop offset="0" stop-color="${C.white}" stop-opacity="1"/><stop offset="0.35" stop-color="${color(s.color, C.white)}" stop-opacity="0.75"/><stop offset="1" stop-color="${mix(C.white, C.orange, 0.4)}" stop-opacity="0"/></radialGradient></defs>${ellipse(W / 2, H / 2, W / 2, H / 2, "url(#g)")}`,

  // Sized so the leaf stays inside the image (a clipped leaf shows as a flat edge once blurred).
  orange: (W, H, s) => orangeBall(W / 2, H * 0.57, Math.min(W, H) * 0.38, { leafy: s.leaf !== false }),

  minaret: (W, H) => {
    // Tileable vertically (and across): eight courses of stone blocks, staggered, each a little
    // different in value, lit from above (a light top edge, a shadowed bottom one), over the
    // shaft's left-to-right light.
    let out = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lighten(C.marble, 0.3)}"/><stop offset="0.55" stop-color="${C.marble}"/><stop offset="1" stop-color="${shade(C.marble, 0.2)}"/></linearGradient></defs>`;
    out += rect(0, 0, W, H, "url(#g)");
    const rand = seeded("bricks");
    const rows = 8;
    const rh = H / rows;
    for (let k = 0; k < rows; k++) {
      const y = k * rh;
      const per = 3;
      const off = (k % 2 ? 0.5 : 0) * (W / per);
      for (let j = -1; j <= per; j++) {
        const x = off + (j * W) / per;
        const tone = (rand() - 0.5) * 0.12;
        out += rect(x + 1, y + 1, W / per - 2, rh - 2, tone > 0 ? C.white : C.ink, { opacity: Math.abs(tone) });
        out += rect(x + 1, y + 1, W / per - 2, Math.max(1, rh * 0.08), C.white, { opacity: 0.25 });
        out += rect(x + 1, y + rh - Math.max(1, rh * 0.1) - 1, W / per - 2, Math.max(1, rh * 0.1), C.ink, { opacity: 0.12 });
        out += line(x, y, x, y + rh, shade(C.marble, 0.35), Math.max(1, W * 0.008), { opacity: 0.5 });
      }
      out += line(0, y, W, y, shade(C.marble, 0.32), Math.max(1, H * 0.008), { opacity: 0.6 });
    }
    return out;
  },

  // The ascent starts from the hero's minaret, so its stone is the same course pattern: the handover between the scenes is invisible.
  stone: (W, H) => KINDS.minaret(W, H),

  bark: (W, H) => {
    const rand = seeded("bark");
    let out = rect(0, 0, W, H, BARK);
    for (let i = 0; i < 9; i++) {
      const x0 = (i / 9) * W + rand() * 20;
      const amp = 6 + rand() * 10;
      const k = 1 + Math.floor(rand() * 2);
      const pts = [];
      for (let y = 0; y <= H; y += H / 32) pts.push([x0 + Math.sin((2 * Math.PI * k * y) / H + i) * amp, y]);
      out += polyline(pts, shade(BARK, 0.35), 4 + rand() * 6, { opacity: 0.8 });
      out += polyline(pts.map(([x, y]) => [x + 9, y]), lighten(BARK, 0.15), 2, { opacity: 0.5 });
    }
    return out;
  },

  branch: (W, H, s) => {
    const left = s.direction === "left";
    const anchorX = left ? W : 0;
    // A `fruit` point says where the branch's orange hangs (its centre); the stem rises from it.
    const fruit = s.points?.fruit ? [s.points.fruit[0] * W, s.points.fruit[1] * H] : null;
    return branch({ x1: anchorX, y1: H * 0.72, x2: left ? W * 0.04 : W * 0.96, y2: H * 0.4, width: H * 0.12, leaves: s.leaves ?? 12, oranges: s.oranges ?? 0, seed: s.seed ?? "branch", size: H * 0.24, fruit });
  },

  "branch-closeup": (W, H) => {
    let out = pathEl(`M0 ${n(H * 0.42)} Q${n(W * 0.5)} ${n(H * 0.36)} ${n(W)} ${n(H * 0.48)} L${n(W)} ${n(H * 0.66)} Q${n(W * 0.5)} ${n(H * 0.56)} 0 ${n(H * 0.64)}Z`, BARK);
    for (let i = 0; i < 6; i++) out += line(W * (0.05 + i * 0.16), H * 0.46, W * (0.12 + i * 0.16), H * 0.48, shade(BARK, 0.35), H * 0.008, { opacity: 0.8 });
    out += pathEl(`M${n(W * 0.47)} ${n(H * 0.4)} L${n(W * 0.5)} ${n(H * 0.52)} L${n(W * 0.53)} ${n(H * 0.4)}Z`, shade(BARK, 0.55));
    out += crown({ cx: W * 0.88, cy: H * 0.42, rx: W * 0.12, ry: H * 0.22, leaves: 22, oranges: 0, seed: "closeup", size: H * 0.16 });
    out += crown({ cx: W * 0.08, cy: H * 0.5, rx: W * 0.08, ry: H * 0.15, leaves: 10, oranges: 0, seed: "closeup-left", size: H * 0.14 });
    return out;
  },

  leaf: (W, H) => leaf(W / 2, H * 0.98, H * 0.92, 0, C.leaf),


  cutting: (W, H) =>
    pathEl(`M${n(W * 0.47)} ${n(H * 0.98)} L${n(W * 0.5)} ${n(H * 0.86)} L${n(W * 0.53)} ${n(H * 0.98)}Z`, shade(BARK, 0.2)) +
    line(W * 0.5, H * 0.88, W * 0.52, H * 0.18, BARK, W * 0.06) +
    leaf(W * 0.51, H * 0.45, H * 0.36, -40, C.leaf) +
    leaf(W * 0.52, H * 0.22, H * 0.34, 35, lighten(C.leaf, 0.1)),

  twine: (W, H) => {
    let out = rect(W * 0.04, H * 0.2, W * 0.92, H * 0.6, TWINE, { rx: H * 0.3 });
    for (let i = 0; i < 9; i++) out += line(W * (0.1 + i * 0.1), H * 0.24, W * (0.06 + i * 0.1), H * 0.76, shade(TWINE, 0.3), Math.max(1, W * 0.012));
    return out;
  },

  knot: (W, H, s) => {
    const step = s.step ?? 1;
    let out = line(W * 0.2, H * 0.3, W * 0.8, H * 0.7, TWINE, W * 0.08) + line(W * 0.2, H * 0.7, W * 0.8, H * 0.3, shade(TWINE, 0.12), W * 0.08);
    if (step >= 2) out += ellipse(W * 0.3, H * 0.4, W * 0.16, H * 0.1, "none", { stroke: TWINE, "stroke-width": W * 0.06, transform: `rotate(-25 ${n(W * 0.3)} ${n(H * 0.4)})` }) + ellipse(W * 0.7, H * 0.4, W * 0.16, H * 0.1, "none", { stroke: TWINE, "stroke-width": W * 0.06, transform: `rotate(25 ${n(W * 0.7)} ${n(H * 0.4)})` });
    if (step >= 3) out += circle(W * 0.5, H * 0.5, W * 0.08, shade(TWINE, 0.2)) + line(W * 0.48, H * 0.55, W * 0.38, H * 0.92, TWINE, W * 0.05) + line(W * 0.52, H * 0.55, W * 0.64, H * 0.9, TWINE, W * 0.05);
    return out;
  },

  foliage: (W, H, s) => {
    const hole = s.hole ? (x, y) => ((x - W / 2) / (W * 0.3)) ** 2 + ((y - H / 2) / (H * 0.32)) ** 2 < 1 : undefined;
    // Leaves stay inside the image, so the plate's edges are clear and it never shows a hard border.
    return crown({ cx: W / 2, cy: H / 2, rx: W * 0.44, ry: H * 0.44, leaves: s.leaves ?? 200, oranges: s.oranges ?? 20, seed: s.seed ?? "foliage", size: Math.min(W, H) * (s.size ?? 0.07), tone: s.haze ?? 0, avoid: hole });
  },




  half: (W, H, s) => {
    const left = s.side !== "right";
    const r = Math.min(W, H) * 0.44;
    const cx = left ? W * 0.62 : W * 0.38;
    const cy = H / 2;
    const arc = (rr) => (left ? `M${n(cx)} ${n(cy - rr)} A${n(rr)} ${n(rr)} 0 0 0 ${n(cx)} ${n(cy + rr)}Z` : `M${n(cx)} ${n(cy - rr)} A${n(rr)} ${n(rr)} 0 0 1 ${n(cx)} ${n(cy + rr)}Z`);
    if (s.part === "face") {
      // The cut face, seen a little from the side: pith ring and segments.
      let out = ellipse(cx, cy, r * 0.32, r * 0.96, C.milk);
      out += ellipse(cx, cy, r * 0.27, r * 0.86, mix(C.orange, C.milk, 0.25));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        out += line(cx, cy, cx + Math.cos(a) * r * 0.26, cy + Math.sin(a) * r * 0.84, C.milk, Math.max(1, r * 0.025), { opacity: 0.8 });
      }
      return out;
    }
    return pathEl(arc(r), C.orange) + pathEl(arc(r * 0.82), shade(C.orange, 0.12), { opacity: 0.35 }) + ellipse(left ? cx - r * 0.55 : cx + r * 0.55, cy - r * 0.45, r * 0.16, r * 0.1, C.white, { opacity: 0.35 });
  },

  "giant-orange": (W, H) => {
    const r = W * 0.45;
    const cy = H * 0.25;
    return (
      rect(W * 0.35, cy + r * 0.6, W * 0.3, H - (cy + r * 0.6), C.marble) +
      rect(W * 0.3, cy + r * 0.85, W * 0.4, H * 0.025, shade(C.marble, 0.15)) +
      rect(W * 0.6, cy + r * 0.6, W * 0.05, H - (cy + r * 0.6), shade(C.marble, 0.2), { opacity: 0.6 }) +
      orangeBall(W / 2, cy, r, { leafy: true })
    );
  },

  scaffold: (W, H) => {
    let out = rect(W * 0.38, H * 0.1, W * 0.24, H * 0.9, C.marble);
    out += pathEl(`M${n(W * 0.38)} ${n(H * 0.1)} L${n(W * 0.44)} ${n(H * 0.06)} L${n(W * 0.5)} ${n(H * 0.09)} L${n(W * 0.56)} ${n(H * 0.05)} L${n(W * 0.62)} ${n(H * 0.1)}Z`, C.marble);
    for (const x of [0.2, 0.3, 0.7, 0.8]) out += line(W * x, H * 0.08, W * x, H, WOOD, W * 0.018);
    for (let i = 0; i < 6; i++) {
      const y = H * (0.16 + i * 0.15);
      out += rect(W * 0.16, y, W * 0.68, H * 0.012, WOOD);
      out += line(W * 0.2, y, W * 0.3, y + H * 0.15, WOOD, W * 0.008, { opacity: 0.8 }) + line(W * 0.8, y, W * 0.7, y + H * 0.15, WOOD, W * 0.008, { opacity: 0.8 });
    }
    return out;
  },

  plan: (W, H, s) => {
    const rand = seeded(`plan${s.panel ?? 1}`);
    let out = rect(0, 0, W, H, C.milk) + rect(W * 0.06, H * 0.05, W * 0.88, H * 0.9, "none", { stroke: shade(C.milk, 0.5), "stroke-width": Math.max(1, W * 0.006) });
    const ink = shade(C.sky, 0.25);
    for (let i = 0; i < 5; i++) {
      const y = H * (0.15 + rand() * 0.7);
      out += line(W * 0.12, y, W * (0.4 + rand() * 0.5), y, ink, Math.max(1, W * 0.006), { opacity: 0.55 });
    }
    if ((s.panel ?? 1) % 2) out += rect(W * 0.32, H * 0.2, W * 0.36, H * 0.68, "none", { stroke: ink, "stroke-width": W * 0.012, opacity: 0.75 }) + circle(W * 0.5, H * 0.16, W * 0.14, "none", { stroke: ink, "stroke-width": W * 0.01, opacity: 0.75 });
    else out += pathEl(`M${n(W * 0.2)} ${n(H * 0.8)} L${n(W * 0.5)} ${n(H * 0.25)} L${n(W * 0.8)} ${n(H * 0.8)}`, "none", { stroke: ink, "stroke-width": W * 0.01, opacity: 0.7 });
    out += `<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="0"><stop offset="0.85" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0.14"/></linearGradient></defs>` + rect(0, 0, W, H, "url(#f)");
    return out;
  },

  sea: (W, H, s) => {
    const horizon = H * (s.horizon ?? 0.62);
    const band = H * (s.band ?? 0.2);
    let out = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky}"/><stop offset="1" stop-color="${C.skySoft}"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(C.sky, C.skySoft, 0.3)}"/><stop offset="1" stop-color="${shade(C.sky, 0.15)}"/></linearGradient></defs>`;
    out += rect(0, 0, W, horizon, "url(#s)") + rect(0, horizon, W, band, "url(#w)") + rect(0, horizon + band, W, H - horizon - band, SAND);
    const rand = seeded("sea");
    for (let i = 0; i < 26; i++) {
      const y = horizon + band * 0.05 + rand() * band * 0.9;
      const x = rand() * W;
      out += line(x, y, x + W * (0.02 + rand() * 0.05), y, C.white, Math.max(1, H * 0.003), { opacity: 0.35 });
    }
    return out;
  },

  platform: (W, H) => {
    let out = pathEl(`M${n(W * 0.04)} ${n(H * 0.3)} L${n(W * 0.12)} ${n(H * 0.05)} L${n(W * 0.88)} ${n(H * 0.05)} L${n(W * 0.96)} ${n(H * 0.3)}Z`, lighten(C.marble, 0.3));
    out += rect(W * 0.04, H * 0.3, W * 0.92, H * 0.7, C.marble);
    for (let i = 1; i < 6; i++) out += line(W * (0.04 + i * 0.153), H * 0.3, W * (0.04 + i * 0.153), H, shade(C.marble, 0.2), Math.max(1, W * 0.003));
    return out + rect(W * 0.04, H * 0.3, W * 0.92, H * 0.06, shade(C.marble, 0.12));
  },

  stage: (W, H) => {
    let out = "";
    for (const [x0, x1] of [
      [0.12, 0.38],
      [0.62, 0.92],
    ]) {
      out += rect(W * x0, H * 0.42, W * (x1 - x0), H * 0.06, WOOD);
      for (const x of [x0 + 0.02, (x0 + x1) / 2, x1 - 0.02]) out += line(W * x, H * 0.48, W * x, H, shade(WOOD, 0.2), W * 0.012);
      out += line(W * x0, H * 0.5, W * x1, H * 0.95, shade(WOOD, 0.1), W * 0.006, { opacity: 0.7 });
    }
    for (let i = 0; i < 4; i++) out += rect(W * (0.02 + i * 0.025), H * (0.48 + i * 0.13), W * 0.1, H * 0.035, lighten(WOOD, 0.1));
    return out;
  },

  "orange-build": (W, H) => {
    const r = Math.min(W, H) * 0.46;
    const cx = W / 2;
    const cy = H - r - H * 0.02;
    let out = `<defs><clipPath id="b">${rect(0, cy - r * 0.15, W, H)}</clipPath></defs>`;
    out += group("", orangeBall(cx, cy, r), { "clip-path": "url(#b)" });
    out += circle(cx, cy, r, "none", { stroke: WOOD, "stroke-width": r * 0.03 });
    for (let i = 1; i < 6; i++) out += ellipse(cx, cy, r * (i / 6), r, "none", { stroke: WOOD, "stroke-width": r * 0.02, opacity: 0.85 });
    for (let i = 1; i < 4; i++) out += line(cx - r * Math.sqrt(1 - (i / 4) ** 2), cy - r * (i / 4), cx + r * Math.sqrt(1 - (i / 4) ** 2), cy - r * (i / 4), WOOD, r * 0.02);
    return out;
  },

  topdown: (W, H) => {
    let out = rect(W * 0.14, H * 0.2, W * 0.72, H * 0.6, C.marble) + rect(W * 0.14, H * 0.2, W * 0.72, H * 0.6, "none", { stroke: shade(C.marble, 0.2), "stroke-width": W * 0.006 });
    out += rect(W * 0.04, H * 0.3, W * 0.2, H * 0.4, WOOD) + rect(W * 0.76, H * 0.3, W * 0.2, H * 0.4, WOOD);
    for (let i = 0; i < 4; i++) out += rect(W * (0.04 + i * 0.05), H * 0.7, W * 0.04, H * 0.1, lighten(WOOD, 0.12));
    out += orangeBall(W * 0.5, H * 0.5, W * 0.2) + circle(W * 0.5, H * 0.5, W * 0.03, shade(C.leaf, 0.2));
    for (const [x, y] of [
      [0.14, 0.42],
      [0.86, 0.45],
      [0.8, 0.62],
    ]) out += ellipse(W * x, H * y, W * 0.07, W * 0.038, C.white, { stroke: shade(C.white, 0.2), "stroke-width": W * 0.003 }) + circle(W * x, H * y, W * 0.02, C.ink, { opacity: 0.9 });
    return out;
  },

  // The plain ground the tiled field grows over: the same sand as the seaside ground, seen from above.
  ground: (W, H) => rect(0, 0, W, H, SAND),

  tiles: (W, H) => {
    const k = 4;
    const s = W / k;
    let out = rect(0, 0, W, H, shade(C.marble, 0.25));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out += rect(i * s + 2, j * s + 2, s - 4, s - 4, (i + j) % 2 ? C.marble : mix(C.marble, C.skySoft, 0.3));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k; j++) out += rect(i * s - s * 0.06, j * s - s * 0.06, s * 0.12, s * 0.12, mix(C.marble, C.orange, 0.25), { transform: `rotate(45 ${n(i * s)} ${n(j * s)})` });
    return out;
  },

  shadow: (W, H) => {
    const rand = seeded("shadow");
    let out = `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(W * 0.018)}"/></filter></defs>`;
    let leaves = "";
    for (let i = 0; i < 36; i++) leaves += leaf(rand() * W, rand() * H, W * (0.08 + rand() * 0.1), rand() * 360, C.leaf);
    return out + group("", leaves, { filter: "url(#b)", opacity: 0.45 });
  },

  column: (W, H) => {
    // A shaft lit from the left, with concave flutes (each dark on its left wall, lit on its right),
    // a capital and a few chips and rain streaks of wear.
    let out = `<defs><linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lighten(C.marble, 0.25)}"/><stop offset="0.55" stop-color="${C.marble}"/><stop offset="0.85" stop-color="${shade(C.marble, 0.2)}"/><stop offset="1" stop-color="${mix(shade(C.marble, 0.12), C.skySoft, 0.2)}"/></linearGradient>`;
    out += `<linearGradient id="flute" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.ink}" stop-opacity="0.22"/><stop offset="0.45" stop-color="${C.ink}" stop-opacity="0.04"/><stop offset="0.8" stop-color="${C.white}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0.08"/></linearGradient></defs>`;
    out += rect(W * 0.18, H * 0.06, W * 0.64, H * 0.94, "url(#shaft)");
    const flutes = 6;
    for (let i = 0; i < flutes; i++) out += rect(W * (0.19 + (i * 0.62) / flutes), H * 0.065, (W * 0.62) / flutes - W * 0.012, H * 0.935, "url(#flute)");
    out += rect(W * 0.04, 0, W * 0.92, H * 0.035, lighten(C.marble, 0.2)) + rect(W * 0.1, H * 0.035, W * 0.8, H * 0.025, shade(C.marble, 0.08));
    const rand = seeded("column-wear");
    for (let i = 0; i < 14; i++) {
      const x = W * (0.2 + rand() * 0.6);
      const y = H * (0.07 + rand() * 0.9);
      out += line(x, y, x + W * (rand() - 0.5) * 0.01, y + H * (0.02 + rand() * 0.08), shade(C.marble, 0.18), Math.max(1, W * 0.006), { opacity: 0.35 });
    }
    for (let i = 0; i < 8; i++) out += ellipse(W * (0.05 + rand() * 0.9), H * (0.005 + rand() * 0.05), W * 0.012, H * 0.004, shade(C.marble, 0.3), { opacity: 0.5 });
    return out;
  },

  urn: (W, H) =>
    `<defs><linearGradient id="urn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lighten(C.marble, 0.4)}"/><stop offset="0.45" stop-color="${C.white}"/><stop offset="0.8" stop-color="${shade(C.marble, 0.16)}"/><stop offset="1" stop-color="${mix(shade(C.marble, 0.1), C.skySoft, 0.25)}"/></linearGradient></defs>` +
    pathEl(`M${n(W * 0.12)} ${n(H * 0.1)} L${n(W * 0.88)} ${n(H * 0.1)} C${n(W * 0.86)} ${n(H * 0.5)} ${n(W * 0.66)} ${n(H * 0.68)} ${n(W * 0.6)} ${n(H * 0.78)} L${n(W * 0.7)} ${n(H * 0.995)} L${n(W * 0.3)} ${n(H * 0.995)} L${n(W * 0.4)} ${n(H * 0.78)} C${n(W * 0.34)} ${n(H * 0.68)} ${n(W * 0.14)} ${n(H * 0.5)} ${n(W * 0.12)} ${n(H * 0.1)}Z`, "url(#urn)") +
    rect(W * 0.06, H * 0.04, W * 0.88, H * 0.08, lighten(C.marble, 0.4), { rx: H * 0.02 }) +
    rect(W * 0.06, H * 0.1, W * 0.88, H * 0.02, shade(C.marble, 0.2), { opacity: 0.6 }) +
    pathEl(`M${n(W * 0.7)} ${n(H * 0.14)} C${n(W * 0.72)} ${n(H * 0.45)} ${n(W * 0.6)} ${n(H * 0.62)} ${n(W * 0.55)} ${n(H * 0.74)}`, "none", { stroke: shade(C.marble, 0.15), "stroke-width": W * 0.03, opacity: 0.6 }),

  tree: (W, H, s) => {
    const young = !!s.young;
    const trunkW = W * (young ? 0.045 : 0.09);
    const crownY = H * (young ? 0.38 : 0.36);
    let out = pathEl(`M${n(W / 2 - trunkW)} ${n(H)} Q${n(W / 2 - trunkW * 0.4)} ${n(H * 0.7)} ${n(W / 2 - trunkW * 0.3)} ${n(crownY)} L${n(W / 2 + trunkW * 0.3)} ${n(crownY)} Q${n(W / 2 + trunkW * 0.4)} ${n(H * 0.7)} ${n(W / 2 + trunkW)} ${n(H)}Z`, BARK);
    out += line(W / 2, H * 0.62, W * 0.3, H * 0.42, BARK, trunkW * 0.5) + line(W / 2, H * 0.58, W * 0.72, H * 0.4, BARK, trunkW * 0.5);
    out += crown({ cx: W / 2, cy: crownY, rx: W * (young ? 0.34 : 0.46), ry: H * (young ? 0.3 : 0.32), leaves: young ? 70 : 260, oranges: s.oranges ?? 8, seed: s.seed ?? "tree", size: W * (young ? 0.09 : 0.06) });
    return out;
  },

  "trees-row": (W, H, s) => {
    const left = s.side !== "right";
    const haze = s.haze ?? 0;
    const rand = seeded(s.seed ?? "row");
    let out = "";
    const trunk = haze ? mix(BARK, C.skySoft, haze) : BARK;
    for (let i = 0; i < 4; i++) {
      const cx = W * (left ? 0.18 + rand() * 0.42 : 0.82 - rand() * 0.42);
      const cy = H * (0.12 + i * 0.22 + rand() * 0.05);
      out += line(cx, cy, cx + (rand() - 0.5) * W * 0.1, H, trunk, W * 0.05);
      out += crown({ cx, cy, rx: W * 0.36, ry: H * 0.13, leaves: 120, oranges: 14, seed: `${s.seed}-${i}`, size: W * 0.09, tone: haze });
    }
    // Named points (the oranges the question lines are fixed on): a sprig of leaves with an orange
    // centred exactly on the point, drawn last so nothing covers it.
    for (const [name, [u, v]] of Object.entries(s.points ?? {})) {
      const x = u * W;
      const y = v * H;
      const r = W * 0.09 * 0.4;
      const sprig = seeded(`${s.seed}-${name}`);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + sprig() * 0.6;
        out += leaf(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * (1.3 + sprig() * 0.5), (a * 180) / Math.PI + 90, leafTones(haze)[i % 4]);
      }
      out += orangeBall(x, y, r, { leafy: true, tone: haze });
    }
    // The trunks fade into the haze at the foot of the plate: a tall (phone) screen sees below the
    // rows, and must never see them end in a cut edge.
    const fade = `<defs><linearGradient id="rowfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.8" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="rowmask">${rect(0, 0, W, H, "url(#rowfade)")}</mask></defs>`;
    return fade + group("", out, { mask: "url(#rowmask)" });
  },

  ring: (W, H) =>
    `<defs><radialGradient id="r"><stop offset="0" stop-color="#000"/><stop offset="0.6" stop-color="#000"/><stop offset="0.76" stop-color="#fff"/><stop offset="0.84" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs>${rect(0, 0, W, H, "#000")}${circle(W / 2, H / 2, W / 2, "url(#r)")}`,

  fabric: (W, H) => {
    const rand = seeded("fabric");
    let out = `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(W * 0.03)}"/></filter></defs>${rect(0, 0, W, H, C.sky)}`;
    let folds = "";
    for (let i = 0; i < 9; i++) {
      const x = rand() * W;
      folds += line(x - W * 0.3, -H * 0.1, x + W * 0.3, H * 1.1, i % 2 ? C.skySoft : shade(C.sky, 0.25), W * (0.04 + rand() * 0.05), { opacity: 0.55 });
    }
    return out + group("", folds, { filter: "url(#b)" });
  },

  stairs: (W, H) => {
    let out = rect(W * 0.08, H * 0.08, W * 0.84, H * 0.06, lighten(C.marble, 0.3)) + rect(W * 0.08, H * 0.14, W * 0.84, H * 0.06, C.marble);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const half = W * (0.3 + t * 0.2);
      const y = H * (0.22 + i * 0.087);
      out += rect(W / 2 - half, y, half * 2, H * 0.03, lighten(C.marble, 0.2)) + rect(W / 2 - half, y + H * 0.03, half * 2, H * 0.057, shade(C.marble, 0.06 + t * 0.06));
    }
    return out;
  },

  star: (W) => {
    const c = W / 2;
    const r = W * 0.48;
    const k = W * 0.07;
    return `<defs><radialGradient id="g"><stop offset="0" stop-color="${C.white}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient></defs>${circle(c, c, r, "url(#g)")}${pathEl(`M${n(c)} ${n(c - r)} L${n(c + k)} ${n(c - k)} L${n(c + r)} ${n(c)} L${n(c + k)} ${n(c + k)} L${n(c)} ${n(c + r)} L${n(c - k)} ${n(c + k)} L${n(c - r)} ${n(c)} L${n(c - k)} ${n(c - k)}Z`, C.white)}`;
  },

  sparkle: (W) => {
    const c = W / 2;
    const r = W * 0.46;
    const k = W * 0.1;
    return `<defs><radialGradient id="g"><stop offset="0" stop-color="${C.white}" stop-opacity="0.75"/><stop offset="0.5" stop-color="${mix(C.white, C.orange, 0.3)}" stop-opacity="0.2"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient></defs>${circle(c, c, r * 0.8, "url(#g)")}${pathEl(`M${n(c)} ${n(c - r)} Q${n(c + k * 0.3)} ${n(c - k * 0.3)} ${n(c + r)} ${n(c)} Q${n(c + k * 0.3)} ${n(c + k * 0.3)} ${n(c)} ${n(c + r)} Q${n(c - k * 0.3)} ${n(c + k * 0.3)} ${n(c - r)} ${n(c)} Q${n(c - k * 0.3)} ${n(c - k * 0.3)} ${n(c)} ${n(c - r)}Z`, C.white)}`;
  },

};

/* ------------------------------------------------------------------ */
/* Data kinds: computed pixel by pixel (one gray channel)              */
/* ------------------------------------------------------------------ */

/** Smooth value noise in 0..1, tileable horizontally with `period` cells. */
function valueNoise(seed, period) {
  const rand = seeded(seed);
  const grid = Array.from({ length: 64 * period }, () => rand());
  const at = (i, j) => grid[(((j % 64) + 64) % 64) * period + (((i % period) + period) % period)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = smooth(x - i);
    const v = smooth(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return top + (bottom - top) * v;
  };
}

/** Tileable smooth value noise on [0, 1)^2: a `period` x `period` lattice that wraps, so the tile repeats seamlessly. */
function tileNoise(seed, period) {
  const rand = seeded(seed);
  const grid = Float32Array.from({ length: period * period }, () => rand());
  const at = (i, j) => grid[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const a = smooth(x - i);
    const b = smooth(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * a;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * a;
    return top + (bottom - top) * b;
  };
}

/** Plain (not tileable) fractal value noise in about [0, 1]: octaves of `valueNoise`, each twice as fine. */
function fbm2(seed, octaves, period = 64) {
  const layers = Array.from({ length: octaves }, (_, k) => valueNoise(`${seed}:${k}`, period));
  let norm = 0;
  for (let k = 0; k < octaves; k++) norm += 0.5 ** k;
  return (x, y) => {
    let sum = 0;
    for (let k = 0; k < octaves; k++) sum += layers[k](x * 2 ** k + k * 3.7, y * 2 ** k - k * 1.9) * 0.5 ** k;
    return sum / norm;
  };
}

const rgb01 = (hex) => hexToRgb(hex).map((v) => v / 255);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Writes an sRGB colour (0..1 channels) and alpha into an RGBA buffer, dithered by `d` (in 1/255 steps) so soft ramps never band. */
function put(out, i, r, g, b, a, d) {
  out[i] = Math.round(clamp01(r) * 255 + d);
  out[i + 1] = Math.round(clamp01(g) * 255 + d);
  out[i + 2] = Math.round(clamp01(b) * 255 + d);
  out[i + 3] = Math.round(clamp01(a) * 255);
}

/** A 4x4 ordered-dither matrix. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Colour kinds: computed pixel by pixel into straight-alpha RGBA (0..255), for soft painted
 * surfaces an SVG cannot give (mottling, brushing, soft edges, no banding).
 */
const PIXEL_KINDS = {
  /**
   * The sky as a painted cobalt: deep overhead, a soft value shift toward the horizon, large soft
   * mottling and cloudy brushing with a few faint directional strokes, dithered so it never bands.
   * Mixed in the display's colour space, as the contrast rule is measured: nowhere lighter than a
   * 40% mix toward sky-soft (text on the sky needs the bottom no lighter than the 42% mix), and the
   * mottling calmer where the left column of text stands.
   */
  sky: (W, H) => {
    const sky = rgb01(C.sky);
    const soft = rgb01(C.skySoft);
    const deep = rgb01(mix(C.sky, C.ink, 0.22));
    const out = new Uint8ClampedArray(W * H * 4);
    // The image is stretched over a screen about 1.6 times as wide as tall: shapes are drawn in screen proportions.
    const SX = 1.6;
    const mottle = fbm2("sky-mottle", 3);
    const brush = fbm2("sky-brush", 3);
    const fine = fbm2("sky-fine", 2);
    // A few long, faint strokes along the wind (about 15 degrees down to the right on screen).
    const strokeRand = seeded("sky-strokes");
    const strokes = Array.from({ length: 11 }, () => {
      const x = strokeRand() * SX;
      const y = 0.05 + strokeRand() * 0.85;
      const len = 0.25 + strokeRand() * 0.45;
      const angle = (-12 - strokeRand() * 10) * (Math.PI / 180);
      return { x, y, dx: Math.cos(angle), dy: -Math.sin(angle), len, width: 0.014 + strokeRand() * 0.024, value: (strokeRand() - 0.45) * 0.08, seed: strokeRand() * 100 };
    });
    for (let py = 0; py < H; py++) {
      const v = (py + 0.5) / H;
      // The soft value shift, deep at the top, softer toward the horizon.
      const base = v < 0.7 ? lerp(0, 0.3, smoothstep(0, 0.7, v) ** 0.9) : lerp(0.3, 0.39, smoothstep(0.7, 1, v));
      for (let px = 0; px < W; px++) {
        const u = (px + 0.5) / W;
        const sx = u * SX;
        // Calmer behind the left column of text.
        const calm = lerp(0.6, 1, smoothstep(0.5, 0.75, u));
        // Large soft mottling, and cloudy brushing stretched along the wind.
        const m = (mottle(sx * 2.2, v * 2.2) - 0.5) * 2;
        const ra = sx * 0.97 + v * 0.26;
        const rb = -sx * 0.26 + v * 0.97;
        const br = (brush(ra * 1.1, rb * 7) - 0.5) * 2;
        const f = (fine(sx * 14, v * 14) - 0.5) * 2;
        let t = base + calm * (0.055 * m + 0.042 * br) + 0.01 * f;
        let dark = calm * 0.32 * Math.max(0, -m) * (1 - v * 0.5);
        for (const s of strokes) {
          const qx = sx - s.x;
          const qy = v - s.y;
          const along = qx * s.dx + qy * s.dy;
          if (along < 0 || along > s.len) continue;
          const across = -qx * s.dy + qy * s.dx;
          const taper = Math.sin((Math.PI * along) / s.len);
          const w = s.width * (0.5 + 0.5 * taper);
          const k = Math.exp(-((across / w) ** 2)) * taper;
          // Bristles: the stroke breaks up along its length.
          const bristle = 0.6 + 0.4 * Math.sin(across * 900 + s.seed) * Math.sin(along * 40 + s.seed);
          t += calm * s.value * k * bristle;
        }
        t = Math.min(0.4, t);
        if (t < 0) {
          dark += -t * 1.2;
          t = 0;
        }
        const r = lerp(lerp(sky[0], soft[0], t), deep[0], Math.min(0.6, dark));
        const g = lerp(lerp(sky[1], soft[1], t), deep[1], Math.min(0.6, dark));
        const b = lerp(lerp(sky[2], soft[2], t), deep[2], Math.min(0.6, dark));
        // An ordered (Bayer) dither: it breaks the soft ramps into steps too fine to see, and compresses.
        put(out, (py * W + px) * 4, r, g, b, 1, BAYER[(py & 3) * 4 + (px & 3)] / 16 - 0.47);
      }
    }
    return out;
  },

  /**
   * A cloud as soft painted luminance (the stage turns it into halftone dots): soft-edged puffs that
   * rise toward the middle, lit from the upper left, shading into a cool blue-grey underneath and on
   * the right, with soft mottling. A clear margin on every side.
   */
  cloud: (W, H, s) => {
    const rand = seeded(s.seed ?? "cloud");
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      puffs.push([W * (0.14 + t * 0.72), H * (0.6 - Math.sin(t * Math.PI) * (0.12 + rand() * 0.06)), H * (0.17 + Math.sin(t * Math.PI) * 0.13 + rand() * 0.05)]);
    }
    const lit = rgb01(mix(C.white, C.milk, 0.35));
    const shade = rgb01(mix(C.milk, C.skySoft, 0.78));
    const mottle = fbm2(`${s.seed ?? "cloud"}-mottle`, 3);
    const dither = seeded(`${s.seed ?? "cloud"}-dither`);
    const soft = H * 0.035;
    const k = H * 0.022;
    const out = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const x = px + 0.5;
        const y = py + 0.5;
        // A smooth union of the puffs and the flat base (signed distance, softened).
        let d = Infinity;
        let lightSum = 0;
        let weightSum = 0;
        for (const [cx, cy, r] of puffs) {
          const dd = Math.hypot(x - cx, y - cy) - r;
          d = -Math.log(Math.exp(-d / k) + Math.exp(-dd / k)) * k;
          // Each puff is round: lit toward the upper left.
          const w = Math.exp(-Math.max(0, dd) / (H * 0.08));
          const nx = (x - cx) / r;
          const ny = (y - cy) / r;
          lightSum += w * clamp01(0.55 - 0.56 * nx - 0.64 * ny);
          weightSum += w;
        }
        const bx = Math.max(W * 0.12 - x, x - W * 0.88, 0);
        const by = Math.max(H * 0.5 - y, y - H * 0.72, 0);
        d = Math.min(d, Math.hypot(bx, by) - H * 0.02);
        const a = 1 - smoothstep(-soft, soft * 0.6, d);
        if (a <= 0) continue;
        const puffLight = weightSum > 0 ? lightSum / weightSum : 0.5;
        const below = smoothstep(H * 0.42, H * 0.72, y);
        const m = (mottle((x / W) * 5, (y / H) * 2.5) - 0.5) * 2;
        const tone = clamp01(0.7 * below + 0.55 * (1 - puffLight) - 0.18 + 0.14 * m);
        put(out, (py * W + px) * 4, lerp(lit[0], shade[0], tone), lerp(lit[1], shade[1], tone), lerp(lit[2], shade[2], tone), a, dither() - 0.5);
      }
    }
    return out;
  },

  /**
   * Water poured from the jug, as soft painted luminance (the stage draws it as halftone dots): a
   * curved band from the spout, widening as it falls, streaked along the flow, breaking into drops.
   */
  stream: (W, H, s) => {
    const frame = s.frame ?? 0;
    const rand = seeded(`stream${frame}`);
    const reach = 0.7 + frame * 0.12;
    const p0 = [W * 0.1, H * 0.05];
    const p1 = [W * (0.6 + frame * 0.1), H * 0.1];
    const p2 = [W * 0.7, H * reach];
    const at = (t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
    const path = Array.from({ length: 64 }, (_, i) => at(i / 63));
    const drops = Array.from({ length: 9 }, () => [W * (0.55 + rand() * 0.3), H * (reach - 0.06 + rand() * 0.22), W * (0.025 + rand() * 0.03)]);
    const light = rgb01(C.white);
    const cool = rgb01(mix(C.white, C.skySoft, 0.55));
    const streaks = fbm2(`stream-streaks-${frame}`, 2);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const x = px + 0.5;
        const y = py + 0.5;
        let best = Infinity;
        let bt = 0;
        for (let i = 0; i < path.length; i++) {
          const d = Math.hypot(x - path[i][0], y - path[i][1]);
          if (d < best) {
            best = d;
            bt = i / (path.length - 1);
          }
        }
        const width = W * lerp(0.05, 0.14, bt);
        let a = Math.exp(-((best / width) ** 2)) * smoothstep(0, 0.06, bt) * (1 - smoothstep(0.9, 1, bt) * 0.6);
        for (const [cx, cy, r] of drops) a = Math.max(a, Math.exp(-((Math.hypot(x - cx, y - cy) / r) ** 2)) * 0.9);
        if (a < 0.01) continue;
        const k = streaks((x / W) * 3, (y / H) * 9);
        put(out, (py * W + px) * 4, lerp(cool[0], light[0], k), lerp(cool[1], light[1], k), lerp(cool[2], light[2], k), a * 0.85, 0);
      }
    }
    return out;
  },

  /** The soft contact shadow under a standing figure: a cool, soft ellipse, darker at its core. */
  contact: (W, H) => {
    const c = rgb01(mix(C.ink, C.sky, 0.3));
    const out = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const x = ((px + 0.5) / W - 0.5) * 2;
        const y = ((py + 0.5) / H - 0.5) * 2;
        const r = Math.hypot(x / 0.92, y / 0.8);
        const a = Math.exp(-((r / 0.55) ** 2)) * (1 - smoothstep(0.85, 1, r)) * 0.8 + Math.exp(-((r / 0.22) ** 2)) * 0.2;
        put(out, (py * W + px) * 4, c[0], c[1], c[2], a, 0);
      }
    }
    return out;
  },
};

const DATA_KINDS = {
  /**
   * The canvas grain (tileable, grey around mid-grey): a plain weave of fine threads (64 to the tile,
   * as a relief lit from the upper left) and the paint's tooth (soft and fine noise over it).
   */
  grain: (W, H) => {
    const period = W / 64;
    const tooth = tileNoise("grain-tooth", 32);
    const fine = tileNoise("grain-fine", 128);
    const pixels = Buffer.alloc(W * H);
    const weave = (x, y) => {
      const u = (x / period) * Math.PI * 2;
      const v = (y / period) * Math.PI * 2;
      const warp = Math.sin(u) * (0.6 + 0.4 * Math.sin(v * 0.5));
      const weft = Math.sin(v) * (0.6 + 0.4 * Math.cos(u * 0.5));
      return 0.5 * (warp + weft);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // The weave's relief, lit from the upper left: the slope toward the light.
        const relief = weave(x, y) - weave(x - 1, y - 1);
        const value = 0.5 + 0.3 * relief + 0.22 * (tooth(x / W, y / H) - 0.5) + 0.18 * (fine(x / W, y / H) - 0.5);
        pixels[y * W + x] = Math.round(clamp01(value) * 255);
      }
    }
    return pixels;
  },

  /** The craquelure (tileable, white cracks on black): the edges of a jittered Voronoi tiling of about ten cells across, some fainter than others. */
  craquelure: (W, H) => {
    const N = 10;
    const rand = seeded("craquelure");
    const sites = Array.from({ length: N * N }, (_, k) => [(k % N) + 0.15 + 0.7 * rand(), Math.floor(k / N) + 0.15 + 0.7 * rand(), 0.45 + 0.55 * rand()]);
    const wobble = tileNoise("craquelure-wobble", 16);
    const pixels = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // A little wobble so the cracks are not straight lines.
        const gx = ((x + 0.5) / W) * N + (wobble(x / W, y / H) - 0.5) * 0.35;
        const gy = ((y + 0.5) / H) * N + (wobble((x / W + 0.37) % 1, (y / H + 0.61) % 1) - 0.5) * 0.35;
        let d1 = Infinity;
        let d2 = Infinity;
        let s1 = 1;
        const ci = Math.floor(gx);
        const cj = Math.floor(gy);
        for (let j = cj - 1; j <= cj + 1; j++)
          for (let i = ci - 1; i <= ci + 1; i++) {
            const wi = ((i % N) + N) % N;
            const wj = ((j % N) + N) % N;
            const [sx, sy, strength] = sites[wj * N + wi];
            const d = Math.hypot(gx - (sx + (i - wi)), gy - (sy + (j - wj)));
            if (d < d1) {
              d2 = d1;
              d1 = d;
              s1 = strength;
            } else if (d < d2) d2 = d;
          }
        const line = 1 - smoothstep(0.0, 0.035, d2 - d1);
        pixels[y * W + x] = Math.round(clamp01(line * s1) * 255);
      }
    }
    return pixels;
  },

  /** Morph mask: a bottom-to-top ramp (dark turns first) broken up by soft noise, so the edge wanders. */
  mask: (W, H) => {
    const octaves = [valueNoise("mask-a", 4), valueNoise("mask-b", 8), valueNoise("mask-c", 16)];
    const pixels = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        const noise = octaves[0](u * 4, v * 8) * 0.55 + octaves[1](u * 8, v * 16) * 0.3 + octaves[2](u * 16, v * 32) * 0.15;
        const value = (1 - v) * 0.72 + noise * 0.28;
        pixels[y * W + x] = Math.round(Math.max(0, Math.min(1, value)) * 255);
      }
    }
    return pixels;
  },
};

/* ------------------------------------------------------------------ */
/* The lighter pass for props: which kinds, how round, which surface   */
/* ------------------------------------------------------------------ */

/** Kinds that get the painter's light and surface (`paintProp`), with their settings. Tileable textures and data stay as drawn. */
const PAINTED = {
  orange: (W) => ({ round: W * 0.3, relief: 3, mat: "fruit", brush: W * 0.22, strokes: 1 }),
  half: (W) => ({ round: W * 0.25, relief: 3, mat: "fruit", brush: W * 0.12, strokes: 1 }),
  leaf: (W) => ({ round: W * 0.05, relief: 6, mat: "leaf", brush: W * 0.15, strokes: 1 }),
  cutting: (W) => ({ round: W * 0.03, relief: 5, mat: "leaf", brush: W * 0.1, strokes: 1 }),
  branch: (W, H) => ({ round: H * 0.03, relief: 6, mat: "leaf", brush: H * 0.1, strokes: 1 }),
  "branch-closeup": (W, H) => ({ round: H * 0.03, relief: 6, mat: "leaf", brush: H * 0.06, strokes: 0.9, quality: 76 }),
  foliage: (W) => ({ round: W * 0.006, relief: 7, mat: "leaf", brush: W * 0.025, strokes: 0.85, shadowReach: W * 0.01, quality: 72 }),
  tree: (W) => ({ round: W * 0.01, relief: 6, mat: "leaf", brush: W * 0.045, strokes: 0.9, quality: W > 1500 ? 72 : 78 }),
  "trees-row": (W) => ({ round: W * 0.012, relief: 6, mat: "leaf", brush: W * 0.045, strokes: 0.9, quality: 74 }),
  column: (W) => ({ round: W * 0.32, relief: 3, mat: "marble", brush: W * 0.12, strokes: 1, flow: "down", shadowReach: W * 0.06 }),
  urn: (W) => ({ round: W * 0.25, relief: 3, mat: "marble", brush: W * 0.12, strokes: 1, shadowReach: W * 0.08 }),
  stairs: (W) => ({ round: W * 0.03, relief: 4, mat: "marble", brush: W * 0.06, strokes: 1, quality: 78 }),
  platform: (W, H) => ({ round: H * 0.06, relief: 4, mat: "marble", brush: H * 0.15, strokes: 1, quality: 78 }),
  "giant-orange": (W) => ({ round: W * 0.25, relief: 3, mat: "fruit", brush: W * 0.08, strokes: 1, quality: 76 }),
  "orange-build": (W) => ({ round: W * 0.15, relief: 3, mat: "fruit", brush: W * 0.08, strokes: 1, quality: 78 }),
};

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function svgFor(entry) {
  const [W, H] = entry.size;
  const spec = entry.placeholder;
  const draw = KINDS[spec.kind];
  if (!draw) throw new Error(`${entry.id}: unknown placeholder kind "${spec.kind}"`);
  // The entry's named points (fractions of the image) reach the drawing with the spec.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${draw(W, H, { ...spec, points: entry.points })}</svg>`;
}

/** Encodes a straight-alpha RGBA buffer as the plate's WebP. */
export function encodePlate(rgba, W, H, { quality = 82 } = {}) {
  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality, alphaQuality: 90, effort: 5, smartSubsample: true })
    .toBuffer();
}

/** The rig a stand-in gives its plate (character plates only; see `studyRig`), or null. */
export function plateRig(entry, manifest) {
  return entry.placeholder?.kind === "study" ? studyRig(entry, manifest) : null;
}

/** The placeholder image of a manifest entry, as a WebP buffer. */
export async function renderPlate(entry, manifest) {
  const [W, H] = entry.size;
  const spec = entry.placeholder;
  if (spec.kind === "study") return encodePlate(renderStudy(entry, manifest), W, H, { quality: entry.size[0] * entry.size[1] > 1.5e6 ? 74 : 80 });
  const pixels = PIXEL_KINDS[spec.kind];
  if (pixels) {
    const rgba = pixels(W, H, spec);
    // The sky is kept exactly, so its dither survives and its soft ramps never band.
    if (spec.kind === "sky") return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: W, height: H, channels: 4 } }).removeAlpha().webp({ lossless: true, effort: 6 }).toBuffer();
    return encodePlate(rgba, W, H, { quality: 88 });
  }
  const data = DATA_KINDS[spec.kind];
  if (data) {
    const image = sharp(data(W, H), { raw: { width: W, height: H, channels: 1 } }).toColourspace("srgb");
    // Fine data (the canvas's grain and cracks) is kept exactly: lossy compression would smear it.
    if (spec.kind === "grain" || spec.kind === "craquelure") return image.removeAlpha().webp({ lossless: true, effort: 6 }).toBuffer();
    return (entry.linear ? image.removeAlpha().webp({ quality: 92 }) : image.webp({ quality: 88 })).toBuffer();
  }
  const image = sharp(Buffer.from(svgFor(entry))).resize(W, H, { fit: "fill" });
  if (entry.linear) return image.removeAlpha().webp({ quality: 92 }).toBuffer();
  const pass = PAINTED[spec.kind];
  if (pass) {
    const { data: raw } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
    paintProp(rgba, W, H, { seed: entry.id, ...pass(W, H, spec) });
    return encodePlate(rgba, W, H, { quality: pass(W, H, spec).quality ?? 80 });
  }
  return image.webp({ quality: 88, alphaQuality: 100, effort: 5, smartSubsample: true }).toBuffer();
}
