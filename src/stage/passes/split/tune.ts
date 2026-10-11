// The Split's numbers (docs/TRANSITIONS.md, "The Split in full"): every one is a uniform behind
// this object, so the HUD can show them and `?tune=key:value,key:value` can retune them by eye
// without a rebuild. The defaults are the table's. Tuning order: front speed, bite, rind width,
// lag distance; then the rest in the order of the table.
//
// Band widths (rindWidth, lagDist, pith*, zestWidth) are in frame heights across the front: the
// shader divides the printed front distance by the metric's gradient, so a band is the same width
// along the seam as across it (phase 15; before that they were in the metric's own units, 2.6x
// taller than wide, and the pith read as a cream column rather than a rim).
export const SPLIT_TUNE = {
  // ---- front speed: R(t) = tt·(lin + (1 − lin)·tt²)·gain + offset, tt = (t − partFrom) / partSpan
  frontLin: 0.55,
  frontGain: 1.6,
  frontOffset: -0.1,
  partFrom: 0.1,
  partSpan: 0.65,
  // ---- bite: front = r − R + (n1·n1Amp + n2·n2Amp)·onset; n1 = fbm(q·n1Freq), n2 = fbm(q·n2Freq +
  //      0.4t + 0.02·time), both 4 octaves; the boundary printed by Bayer and a hash stipple. The
  //      bite, the rind and the zest ease in over t partFrom..onsetTo (rule 4), so the rest phase is
  //      the model's last frame exactly and nothing switches on at t = 0.10.
  n1Freq: 2.2,
  n1Amp: 0.3,
  n2Freq: 5.1,
  n2Amp: 0.1,
  bayer: 0.03,
  stipple: 0.02,
  onsetTo: 0.22,
  // ---- rind band ahead of the cut: smoothstep(rindWidth, 0, edgeS); A desaturates and darkens
  rindWidth: 0.09,
  rindDesat: 0.3,
  rindDark: 0.25,
  rindSmear: 0.01,
  // ---- lag of the plate behind the cut: exp(−distBehind / lagDist) · (1 − smoothstep(lagFadeFrom, 1, t))
  lagDist: 0.12,
  lagOffset: 0.05,
  lagSmear: 0.02,
  lagFadeFrom: 0.7,
  // ---- the metric, the halves and the push (table rows metric, sgn, parting; skeleton's push)
  metricY: 0.38,
  sgnWidth: 0.06,
  parting: 0.09,
  partRamp: 0.6,
  partSmear: 0.025,
  pushLin: 0.45,
  pushGain: 0.1,
  driftX: 0.03,
  driftY: 0.01,
  // ---- the settle: the plate's scale, the radial softening, the pith band and its fibre
  plateScale: 1.18,
  scaleFrom: 0.55,
  softFrom: 0.7,
  softTo: 0.95,
  soft: 0.006,
  pithIn: -0.012,
  pithPeak: -0.024,
  pithOut: -0.07,
  pithFadeFrom: 0.75,
  fibreX: 40,
  fibreY: 6,
  // ---- zest specks and the fast paths
  zestThreshold: 0.985,
  zestWidth: 0.03,
  zestCell: 3,
  zestRate: 6,
  zestVel: 40,
  fastAhead: 0.4,
  fastBehind: 0.95,
};

export type SplitTuneKey = keyof typeof SPLIT_TUNE;
export type SplitTune = Record<SplitTuneKey, number>;

export const SPLIT_TUNE_KEYS = Object.keys(SPLIT_TUNE) as SplitTuneKey[];

/** The uniform carrying a tune entry: `rindWidth` -> `uTune_rindWidth`. */
export const tuneUniform = (key: SplitTuneKey): string => `uTune_${key}`;

/** The declarations for the shader, generated from the keys so the two cannot drift apart. */
export const SPLIT_TUNE_GLSL = `uniform float ${SPLIT_TUNE_KEYS.map(tuneUniform).join(", ")};`;

/** The HUD's groups, in tuning order. */
const GROUPS: readonly (readonly [string, readonly SplitTuneKey[]])[] = [
  ["front", ["frontLin", "frontGain", "frontOffset", "partFrom", "partSpan"]],
  ["bite", ["n1Freq", "n1Amp", "n2Freq", "n2Amp", "bayer", "stipple", "onsetTo"]],
  ["rind", ["rindWidth", "rindDesat", "rindDark", "rindSmear"]],
  ["lag", ["lagDist", "lagOffset", "lagSmear", "lagFadeFrom"]],
  ["part", ["metricY", "sgnWidth", "parting", "partRamp", "partSmear", "pushLin", "pushGain", "driftX", "driftY"]],
  ["settle", ["plateScale", "scaleFrom", "softFrom", "softTo", "soft", "pithIn", "pithPeak", "pithOut", "pithFadeFrom", "fibreX", "fibreY"]],
  ["zest", ["zestThreshold", "zestWidth", "zestCell", "zestRate", "zestVel", "fastAhead", "fastBehind"]],
];

let cachedSearch: string | null = null;
let cached: SplitTune = { ...SPLIT_TUNE };
let overridden: SplitTuneKey[] = [];

const isKey = (k: string): k is SplitTuneKey => Object.prototype.hasOwnProperty.call(SPLIT_TUNE, k);

/**
 * The tune in effect: the defaults with `?tune=rindWidth:0.22,lagDist:0.15` applied. Read again
 * only when the search string changes, so the per-frame call costs a string compare.
 */
export function splitTune(): SplitTune {
  if (typeof window === "undefined") return cached;
  const search = window.location.search;
  if (search === cachedSearch) return cached;
  cachedSearch = search;
  const next: SplitTune = { ...SPLIT_TUNE };
  const list: SplitTuneKey[] = [];
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

/** Keys the URL has changed (the HUD stars them). */
export function splitTuneOverrides(): readonly SplitTuneKey[] {
  splitTune();
  return overridden;
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** The tune as HUD lines, grouped in tuning order; entries changed by the URL carry a star. */
export function splitTuneLines(): string[] {
  const t = splitTune();
  const marked = new Set(overridden);
  return GROUPS.map(
    ([name, keys]) => `${name.padEnd(6)} ${keys.map((k) => `${k}${marked.has(k) ? "*" : ""} ${fmt(t[k])}`).join("  ")}`,
  );
}
