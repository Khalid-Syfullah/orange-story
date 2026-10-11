import { colors, mixColors, type ColorToken } from "@/styles/tokens";

/**
 * The painted look of the transitions' media, as GLSL chunks shared by their shaders: bounded noise,
 * the story's one light, the palette, and the canvas grain read through the stage's shared uniforms.
 * Colours are written in the display's colour space (as the plates' output is), premultiplied.
 */

/** A GLSL float literal. */
export const glslFloat = (n: number) => {
  const s = Number(n.toFixed(6)).toString();
  return /[.e]/.test(s) ? s : `${s}.0`;
};

/** A palette colour (or a hex mix of two) as an sRGB GLSL vec3. */
export function glslColor(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return `vec3(${c.map(glslFloat).join(", ")})`;
}

/** A palette token as a GLSL vec3. */
export const tokenColor = (token: ColorToken) => glslColor(colors[token]);

/** A mix of two palette tokens as a GLSL vec3. */
export const mixColor = (a: ColorToken, b: ColorToken, t: number) => glslColor(mixColors(a, b, t));

/**
 * Toward the sun (camera space: x right, y up, z toward the viewer): warm light from the upper left
 * and a little in front, as on every painting of the story (`docs/ART-DIRECTION.md`).
 */
export const SUN: readonly [number, number, number] = (() => {
  const v = [-0.56, 0.64, 0.53];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as const;
})();

/** Noise bounded to known ranges (the coverage proofs rely on the bounds), and the palette. */
export const MEDIA_GLSL = /* glsl */ `
const vec3 SKY = ${tokenColor("sky")};
const vec3 SKY_SOFT = ${tokenColor("skySoft")};
const vec3 MILK = ${tokenColor("milk")};
const vec3 INK = ${tokenColor("ink")};
const vec3 MARBLE = ${tokenColor("marble")};
const vec3 ORANGE = ${tokenColor("orange")};
const vec3 WHITE = ${tokenColor("white")};
const vec3 SUN_DIR = vec3(${SUN.map(glslFloat).join(", ")});

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

/* Value noise, 0 to 1. */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* Up to four octaves (OCTAVES, 1 to 4), normalised to 0 to 1. */
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    total += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 19.7;
    a *= 0.5;
  }
  return v / total;
}

/* Signed noise, -1 to 1. */
float snoise(vec2 p, int octaves) {
  return clamp((fbm(p, octaves) - 0.5) * 2.6, -1.0, 1.0);
}

/* Premultiplied "over". */
vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}
`;

/** Side of the baked noise texture (texels). */
export const NOISE_SIZE = 256;

/**
 * Four independent fields of tileable fractal noise, 0 to 1 (one per channel), baked once on the CPU
 * (`noiseTexture`): a medium reads a whole fractal with one texture lookup instead of hashing four
 * octaves per pixel. Periods 8, 16, 32 and 64 cells over the tile, so it wraps without a seam.
 */
export function bakeNoise(size = NOISE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const lattice = (period: number, channel: number, i: number, j: number) => {
    const x = ((i % period) + period) % period;
    const y = ((j % period) + period) % period;
    let h = (x * 374761393 + y * 668265263 + channel * 1442695041 + period * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let c = 0; c < 4; c++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0;
        let amp = 0.5;
        let total = 0;
        for (const period of [8, 16, 32, 64]) {
          const fx = (x / size) * period;
          const fy = (y / size) * period;
          const i = Math.floor(fx);
          const j = Math.floor(fy);
          const u = smooth(fx - i);
          const w = smooth(fy - j);
          const a = lattice(period, c, i, j);
          const b = lattice(period, c, i + 1, j);
          const d = lattice(period, c, i, j + 1);
          const e = lattice(period, c, i + 1, j + 1);
          v += amp * (a + (b - a) * u + (d - a) * w + (a - b - d + e) * u * w);
          total += amp;
          amp *= 0.5;
        }
        // Stretch the fractal's narrow spread back toward the full 0 to 1.
        const n = Math.min(1, Math.max(0, (v / total - 0.5) * 2.2 + 0.5));
        data[(y * size + x) * 4 + c] = Math.round(n * 255);
      }
    }
  }
  return data;
}

/** Reads the baked noise: `tnoise(p)` is the four fields at p (one unit is one tile). */
export const NOISE_GLSL = /* glsl */ `
uniform sampler2D uNoise;
vec4 tnoise(vec2 p) {
  return texture2D(uNoise, p);
}
`;

/** The stage's canvas grain, read in a layer's own space (the weave in `hero/canvas-grain`), gated by the quality tier. */
export const GRAIN_GLSL = /* glsl */ `
uniform sampler2D grainMap;
uniform float quality;
float canvasGrain(vec2 uv) {
  if (quality < 1.5) return 0.0;
  return texture2D(grainMap, uv).r - 0.5;
}
`;
