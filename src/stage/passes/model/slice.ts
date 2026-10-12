// The slice (docs/TRANSITIONS.md, Graft -> grove -> share, "Inside `share`"): inside the share beat the man
// holds the gilded orange and studies it (keyframe 1); then his knife meets it and a thin, ragged front runs
// along the blade's line (art.share.knife) through the picture, and behind that front the orange is two halves,
// held a hand's width apart by two hands (keyframe 2, the frame The Split opens on).
//
//   - the front is a thin band across the knife's line sweeping along it: a distance along the line's direction,
//     bitten by two fields of fbm stretched along the front (rule 1), printed with a Bayer and stipple edge
//     (rule 2), so every pixel is one picture or the other: dots, never an alpha ramp;
//   - behind it keyframe 2 is still catching up with the edge that uncovered it: offset a little along the
//     travel by `exp(-distBehindCut / lagDist)`, smeared five taps the way it moves (rule 6), and the lag is
//     exactly 0 at the end of the slice so the beat comes to rest on the keyframe (the Split opens on it);
//   - the leading edge carries a thin pale glint (cream, 1 to 2 px x dpr) and, where the cut crosses the fruit
//     or the halves, a few zest-coloured specks hashed per cell and per sixth of a second (rule 10), denser
//     when the scroll is fast;
//   - the copy sits in column A: the glint, the specks and the lag are scaled to 0 inside a soft rectangle over
//     it (the keyframes are one paper-white there, so the front is not seen to pass over the words);
//   - fast paths: a pixel provably ahead of every possible front takes one tap of keyframe 1 and grain, and a
//     pixel provably behind it, past the lag's reach, one tap of keyframe 2 and grain.
//
// Every number is in SLICE_TUNE (the HUD shows them; `?tune=key:value,...` retunes them live, as the Split's).
// Distances are frame heights. Everything is a function of the scroll units through `uSliceE` (timeline.ts
// sliceEase), so scrubbing back replays it exactly.
import { art } from "@/content/art";

export const SLICE_TUNE = {
  // ---- the front: f = distAlong - R + (n1 - 0.5) * a1 + (n2 - 0.5) * a2, noise read at (across the front, along it * across)
  a1: 0.1,
  f1: 4.5,
  a2: 0.04,
  f2: 15,
  across: 0.4,
  /** How far the flanks trail the tip (frame heights of lag per frame height of lateral distance squared): the tip leads along the knife's line. */
  curve: 0.5,
  creep: 0.03,
  bayer: 0.03,
  stipple: 0.02,
  edgeSoft: 0.004,
  // ---- where the front starts: this many fruit radii before the knife's point along the travel (clear of the fruit's top and of the man's head, which stands higher)
  start: 2.2,
  // ---- the lag of keyframe 2 behind the cut: exp(-behind / lagDist) * (1 - smoothstep(lagFadeFrom, 1, s))
  lagDist: 0.09,
  lagOffset: 0.05,
  lagSmear: 0.03,
  lagFadeFrom: 0.78,
  // ---- the glint on the leading edge: px x dpr wide, cream
  glintPx: 1.5,
  glintAlpha: 0.9,
  glintR: 1.0,
  glintG: 0.96,
  glintB: 0.82,
  // ---- the specks on the cut: hash threshold, band width on the cut, cell px, per second, the speed that doubles them
  speckThreshold: 0.972,
  speckWidth: 0.03,
  speckCell: 3,
  speckRate: 6,
  speckVel: 40,
  speckR: 1.0,
  speckG: 0.7,
  speckB: 0.25,
  // ---- column A's keep-out: the rectangle over the copy (frame uv from the top-left), its edge eased over `keepSoft`
  keepW: 0.5,
  keepH: 0.55,
  keepSoft: 0.08,
  // ---- the fast path behind the front: past this many lagDist the lag is under 0.5% and the pixel is one tap
  fastBehind: 5.3,
};

export type SliceTuneKey = keyof typeof SLICE_TUNE;
export type SliceTune = Record<SliceTuneKey, number>;
export const SLICE_TUNE_KEYS = Object.keys(SLICE_TUNE) as SliceTuneKey[];

/** The uniform carrying a tune entry: `lagDist` -> `uSl_lagDist`. */
export const sliceUniform = (key: SliceTuneKey): string => `uSl_${key}`;

const GROUPS: readonly (readonly [string, readonly SliceTuneKey[]])[] = [
  ["front", ["a1", "f1", "a2", "f2", "across", "curve", "creep", "bayer", "stipple", "edgeSoft"]],
  ["start", ["start"]],
  ["lag", ["lagDist", "lagOffset", "lagSmear", "lagFadeFrom", "fastBehind"]],
  ["glint", ["glintPx", "glintAlpha", "glintR", "glintG", "glintB"]],
  ["specks", ["speckThreshold", "speckWidth", "speckCell", "speckRate", "speckVel", "speckR", "speckG", "speckB"]],
  ["keep", ["keepW", "keepH", "keepSoft"]],
];

let cachedSearch: string | null = null;
let cached: SliceTune = { ...SLICE_TUNE };
let overridden: SliceTuneKey[] = [];

const isKey = (k: string): k is SliceTuneKey => Object.prototype.hasOwnProperty.call(SLICE_TUNE, k);

/** The tune in effect: the defaults with `?tune=glintPx:2,lagDist:0.12` applied (keys of other cuts' tunes are ignored). */
export function sliceTune(): SliceTune {
  if (typeof window === "undefined") return cached;
  const search = window.location.search;
  if (search === cachedSearch) return cached;
  cachedSearch = search;
  const next: SliceTune = { ...SLICE_TUNE };
  const list: SliceTuneKey[] = [];
  const raw = new URLSearchParams(search).get("tune");
  if (raw) {
    for (const pair of raw.split(",")) {
      const [k, v] = pair.trim().split(/[:=]/);
      const value = Number.parseFloat(v ?? "");
      if (k && isKey(k) && Number.isFinite(value)) {
        next[k] = value;
        list.push(k);
      }
    }
  }
  cached = next;
  overridden = list;
  return cached;
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** The tune as HUD lines, grouped in tuning order; entries changed by the URL carry a star. */
export function sliceTuneLines(): string[] {
  const t = sliceTune();
  const marked = new Set(overridden);
  return GROUPS.map(([name, keys]) => `${name.padEnd(6)} ${keys.map((k) => `${k}${marked.has(k) ? "*" : ""} ${fmt(t[k])}`).join("  ")}`);
}

/** The direction the front travels along the knife's line, a unit vector in screen pixels (y down). */
export function sliceDirection(): { x: number; y: number } {
  const k = art.share.knife;
  const a = (k.angle * Math.PI) / 180;
  return { x: k.travel * Math.cos(a), y: k.travel * Math.sin(a) };
}

const fruitR = art.share.fruit.r;
const decl = SLICE_TUNE_KEYS.map(sliceUniform).join(", ");

export const SLICE_GLSL = /* glsl */ `
uniform float ${decl};
const float SLICE_FRUIT_R = ${fruitR.toFixed(4)};     // the share's fruit radius, a share of the painting's width (art.share.fruit.r)
uniform vec2 uKnife;        // the knife's point in the share painting (art.share.knife.at)
uniform vec2 uKnifeDir;     // the way the front travels along the line: a unit vector in screen pixels, y down
uniform vec2 uSlice;        // x: how far the front has run (timeline.ts sliceEase), y: progress through the slice 0..1

// Column A's keep-out: 1 inside the soft rectangle over the copy, 0 beyond it.
float sliceKeep(vec2 uv) {
  float kx = 1.0 - smoothstep(uSl_keepW, uSl_keepW + uSl_keepSoft, uv.x);
  float ky = 1.0 - smoothstep(uSl_keepH, uSl_keepH + uSl_keepSoft, uv.y);
  return kx * ky;
}

// keyframe 2 as it arrives: offset along the travel by the lag, smeared five taps the way it moves (rule 6).
vec3 sliceBehind(vec2 uv, vec2 dir, float lag) {
  if (lag < 0.004) return imgShareLast(uv);
  vec2 uvB = uv - dir * (lag * uSl_lagOffset);
  vec2 d = dir * (lag * uSl_lagSmear);
  vec3 c = vec3(0.0);
  for (int t = 0; t < 5; t++) {
    float ft = float(t);
    c += imgShareLast(uvB - d * (0.25 * ft)) * (0.30 - 0.05 * ft);     // the weights of smear5
  }
  return c;
}

// Orange: the peel's hue and a strong saturation (the fruit and the cut halves, not the skin or the cuffs).
float peelMask(vec3 c) {
  vec2 hs = hueSat(c);
  return bandMask(hs.x, vec2(0.04, 0.13), 0.02) * smoothstep(0.45, 0.65, hs.y);
}

vec3 sliceCut(vec2 uv, vec2 frag) {
  float ar = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * ar, uv.y);
  vec2 T = uKnifeDir;
  vec2 P = vec2(-T.y, T.x);
  // The knife's point on screen, through the keyframe's own mapping (the rest state included), in frame heights.
  vec2 K = uncover(uKnife - gOff * uShareOffK, uShareSize, uF3.xy, uF3.z * gZk) * vec2(ar, 1.0);
  // The front is a tip leading along the knife's line with its flanks trailing: distance along the travel plus
  // 'curve' times the squared distance across it. Its extent over the frame is read at the four corners (the
  // squared term is convex, so the far end is at a corner; the near end is bounded by the travel alone).
  vec2 v0 = -K;
  vec2 v1 = vec2(ar, 0.0) - K;
  vec2 v2 = vec2(0.0, 1.0) - K;
  vec2 v3 = vec2(ar, 1.0) - K;
  float a0 = dot(v0, P);
  float a1 = dot(v1, P);
  float a2 = dot(v2, P);
  float a3 = dot(v3, P);
  float dmin = min(min(dot(v0, T), dot(v1, T)), min(dot(v2, T), dot(v3, T)));
  float dmax = max(max(dot(v0, T) + uSl_curve * a0 * a0, dot(v1, T) + uSl_curve * a1 * a1), max(dot(v2, T) + uSl_curve * a2 * a2, dot(v3, T) + uSl_curve * a3 * a3));
  float biteMax = 0.5 * (uSl_a1 + uSl_a2);
  // Ahead of the front the bite, the print (+-0.025) and the glint are all it reaches; behind it the lag.
  float padA = biteMax + 0.06;
  float padB = biteMax + uSl_lagDist * uSl_fastBehind;
  // The tip starts clear of the fruit and the head (the first thing it does is meet the orange) and the flanks leave past the far corner.
  float fruitH = SLICE_FRUIT_R * uF3.z * gZk / coverScale(uShareSize).x * ar;
  float R0 = max(dmin, -uSl_start * fruitH) - padA - 0.002;
  float R = mix(R0, dmax + padA + 0.002, uSlice.x);
  float d = dot(q - K, T);
  float a = dot(q - K, P);
  float base = d + uSl_curve * a * a - R;
  if (base > padA) return imgShare(uv) + grain(frag);          // ahead of every possible front: keyframe 1
  if (base < -padB) return imgShareLast(uv) + grain(frag);     // behind it, the lag gone: keyframe 2

  float tm = uTime * (1.0 - uStill);
  float s = uSlice.y;
  // The front: bitten along its length by two decorrelated fields stretched the way it runs (rule 1).
  vec2 nq = vec2(a, d * uSl_across);
  float f = base + bite2(nq, uSl_f1, uSl_a1, uSl_f2, uSl_a2, vec2(5.3, 1.7), vec2(-3.1, 8.2) + vec2(0.0, uSlice.x * 0.6) + tm * uSl_creep);
  PROBE_ZONE(f, 0.06, uSl_lagDist * uSl_fastBehind);
  float edge = f + printEdge(frag, uSl_bayer, uSl_stipple);
  float behind = 1.0 - smoothstep(-uSl_edgeSoft, uSl_edgeSoft, edge);
  if (abs(f) < 0.025 + uSl_edgeSoft) PROBE_MIX(behind);

  float keep = sliceKeep(uv);
  vec2 dirUV = T / vec2(ar, 1.0);                               // the travel in uv, for offsets in frame heights
  float lag = exp(-max(-f, 0.0) / uSl_lagDist) * (1.0 - smoothstep(uSl_lagFadeFrom, 1.0, s)) * (1.0 - keep);
  vec3 col;
  if (behind < 0.002) col = imgShare(uv);
  else if (behind > 0.998) col = sliceBehind(uv, dirUV, lag);
  else col = mix(imgShare(uv), sliceBehind(uv, dirUV, lag), behind);

  // The glint on the leading edge: a thin pale line, 'glintPx' wide on the bitten front (not the printed one).
  float w = uSl_glintPx * uDpr / uRes.y;
  float glint = (1.0 - smoothstep(0.4 * w, w, abs(f - 0.5 * w))) * uSl_glintAlpha * (1.0 - keep);
  col = mix(col, vec3(uSl_glintR, uSl_glintG, uSl_glintB), glint);

  // Zest on the cut where it crosses the fruit or the halves: hashed per cell and per sixth of a second (rule 10).
  float zone = smoothstep(uSl_speckWidth, 0.0, abs(f)) * (1.0 - keep);
  if (zone > 0.0) {
    float cell = uSl_speckCell * uDpr;
    float v = clamp(abs(uVel) / uSl_speckVel, 0.0, 1.0);
    float h = hash(floor(frag / cell) + floor(tm * uSl_speckRate) * vec2(13.7, 5.1));
    float on = step(uSl_speckThreshold - 0.012 * v, h) * zone;
    if (on > 0.0) {
      float peel = max(peelMask(imgShare(uv)), peelMask(imgShareLast(uv)));
      col += vec3(uSl_speckR, uSl_speckG, uSl_speckB) * (on * peel * (0.6 + 0.4 * v));
    }
  }
  return col + grain(frag);
}
`;
