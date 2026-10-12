// The static treatment: the one gesture behind the Hero -> Model handover and the quarter-strength
// cuts between the Model's beats (docs/TRANSITIONS.md, first row).
//
// A wave leaves the bottom-right corner and runs up and left at 45 degrees (`d = ((1-x)*aspect +
// (1-y)) / (aspect+1)` with y down, so the iso-lines are 45 degrees in pixels, not in uv), bent by
// two slow decorrelated fbm fields (rule 1). Ahead of it the old picture A, behind it the new
// picture B, and the boundary is printed by a 4x4 Bayer threshold and a hash stipple (rule 2). At
// the crest, and only there:
//   - a horizontal tear with hashed row shifts (fine rows and wide slips, re-hashed every 1/14 s,
//     rule 10), whose amplitude scales with |uVel| so a fast scroll tears harder,
//   - a mosaic that starts coarse (24 px cells) and resolves to 1 px as the crest passes,
//   - a chroma split of +-0.006 along x,
//   - a 5x5 bitmap-font rubbing of the luminance, ` .:-+=*%#@` from lightest to heaviest, gated per
//     cell by the same Bayer threshold so it thins out toward the band's edges.
// Every term is a bell in the signed front distance `f`, so none of them switches on (rule 3), and
// pixels provably ahead of or behind every possible crest skip the treatment (rule 14: the front
// is displaced by at most 0.20 by the noise and the band is 0.13 wide).
//
// B arrives moving: it is offset along the wave's travel by `lag = exp(-distBehind / 0.12)` and
// smeared with 5 taps the way it moves (rules 5, 6); the pass does that inside cutB.
//
// The pass supplies three functions (declared here, defined by the pass after this chunk):
//   vec3 cutA(vec2 uv, vec2 frag)               the old picture, in full quality
//   vec3 cutB(vec2 uv, vec2 frag, float lag)    the new picture, arriving with this lag
//   vec3 cutRaw(vec2 uv, float behind)          a cheap tap of whichever side `behind` selects
// and calls `staticCut(uv, frag, c, amp)` with the crest position `c` (-0.37 = not arrived, 1.37 =
// gone) and the amplitude (1 for the bridge, 0.25 for the cuts between beats).

/** The crest position at which the wave has not reached the frame (every pixel is ahead of it). */
export const CUT_START = -0.37;
/** The crest position at which the wave has left the frame (every pixel is behind it). */
export const CUT_END = 1.37;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The crest position for a cut with progress `s` in 0..1. The first stretch eases in (rule 4) and
 * the last accelerates away; half smoothstep, half accelerating curve.
 */
export function crestAt(s: number): number {
  const x = clamp01(s);
  const e = 0.5 * x * x * (3 - 2 * x) + 0.5 * x * (0.4 + 0.6 * x * x);
  return CUT_START + (CUT_END - CUT_START) * e;
}

// Five 5-bit rows per glyph, MSB = left column, ordered lightest to heaviest: ` .:-+=*%#@`.
const GLYPHS: readonly (readonly number[])[] = [
  [0b00000, 0b00000, 0b00000, 0b00000, 0b00000], // ' '
  [0b00000, 0b00000, 0b00000, 0b00100, 0b00100], // '.'
  [0b00000, 0b00100, 0b00000, 0b00100, 0b00100], // ':'
  [0b00000, 0b00000, 0b11111, 0b00000, 0b00000], // '-'
  [0b00100, 0b00100, 0b11111, 0b00100, 0b00100], // '+'
  [0b00000, 0b11111, 0b00000, 0b11111, 0b00000], // '='
  [0b00100, 0b10101, 0b01110, 0b10101, 0b00100], // '*'
  [0b11001, 0b11010, 0b00100, 0b01011, 0b10011], // '%'
  [0b01010, 0b11111, 0b01010, 0b11111, 0b01010], // '#'
  [0b11111, 0b10101, 0b11111, 0b10111, 0b11111], // '@'
];

/** An if-chain returning the glyph's rows [from, to) as a vecN of exact small floats. */
function chain(name: string, from: number, to: number): string {
  const vec = `vec${to - from}`;
  const lines = GLYPHS.map((rows, i) => {
    const v = `${vec}(${rows.slice(from, to).map((r) => r.toFixed(1)).join(", ")})`;
    return i === GLYPHS.length - 1 ? `  return ${v};` : `  if (g < ${i}.5) return ${v};`;
  });
  return `${vec} ${name}(float g) {\n${lines.join("\n")}\n}`;
}

export const STATIC_GLSL = /* glsl */ `
vec3 cutA(vec2 uv, vec2 frag);
vec3 cutB(vec2 uv, vec2 frag, float lag);
vec3 cutRaw(vec2 uv, float behind);

// A pass may keep a disc of the frame out of the crest's machinery (the model's match cut: the fruit is the one
// thing that does not change): define CUT_KEEP and cutKeep(uv), 0..1, 1 inside the disc. Inside it the tear, the
// mosaic, the chroma split, the rubbing and B's lag are scaled to 0; the front still prints, so every pixel is
// still one picture or the other. Without the define it is 0 everywhere (the bridge).
#ifdef CUT_KEEP
float cutKeep(vec2 uv);
#else
float cutKeep(vec2 uv) { return 0.0; }
#endif

const float CUT_BOUND = 0.36;   // |d - c| beyond which no pixel can be in the band
const float CUT_BAND = 0.13;    // half-width of the crest band in front units
// Half-width of the smoothstep the printed front goes through: well inside the print's own reach
// (+-0.025), so each pixel is one picture or the other (phase 16's edge test: at 0.02 the boundary was
// a dithered alpha ramp, 29% of its pixels between the pictures).
const float CUT_EDGE = 0.004;

// ---- the bitmap font: rows 0-2 and 3-4 of each glyph, rows exact in 5 bits ----------------------
${chain("glyphTop", 0, 3)}
${chain("glyphBottom", 3, 5)}

// One pixel of glyph g (0..9) at column gx and row gy (0..4, from the top-left), 0 or 1.
float glyphPixel(float g, float gx, float gy) {
  vec3 t = glyphTop(g);
  vec2 b = glyphBottom(g);
  float row = gy < 0.5 ? t.x : gy < 1.5 ? t.y : gy < 2.5 ? t.z : gy < 3.5 ? b.x : b.y;
  return mod(floor(row / exp2(4.0 - gx)), 2.0);
}

// d: 0 at the bottom-right corner, 1 at the top-left, iso-lines at 45 degrees in pixels.
float cutD(vec2 uv) {
  float a = uRes.x / uRes.y;
  return ((1.0 - uv.x) * a + (1.0 - uv.y)) / (a + 1.0);
}

// The wave's travel direction in uv, 45 degrees in pixels (up and left).
vec2 cutDir() { return vec2(-0.7071 * uRes.y / uRes.x, -0.7071); }

// The signed front distance: negative behind the crest (new picture), positive ahead (old one).
// Bitten by two decorrelated fields (rule 1), both creeping with time so a held frame still moves.
float cutFront(vec2 uv, float c) {
  float tm = uTime * (1.0 - uStill);
  vec2 q = aspectUV(uv);
  return cutD(uv) - c + bite2(q, 2.0, 0.30, 5.3, 0.10, vec2(3.1, 1.7) + tm * 0.03, -vec2(11.0, 4.0) - tm * 0.05);
}

vec3 staticCut(vec2 uv, vec2 frag, float c, float amp) {
  float dd = cutD(uv) - c;
  if (dd > CUT_BOUND) return cutA(uv, frag);
  if (dd < -CUT_BOUND) return cutB(uv, frag, 0.0);

  float tm = uTime * (1.0 - uStill);
  float v = clamp(abs(uVel) / 40.0, 0.0, 1.0);
  float f = cutFront(uv, c);
  // The e2e probe: the crest zone reaches CUT_BAND ahead (the tear and the chroma split) and
  // CUT_BOUND behind (the mosaic's lead band, and the lag until B's offset is under 5%).
  PROBE_ZONE(f, CUT_BAND, CUT_BOUND);
  float keep = cutKeep(uv);
  float calm = 1.0 - keep;
  float band = smoothstep(CUT_BAND, 0.03, abs(f)) * calm;
  float slot = floor(tm * 14.0);

  // The tear: fine rows jitter a little, a few wide slips jump a lot; harder the faster the scroll.
  float rowF = floor(frag.y / (2.0 * uDpr));
  float rowC = floor(frag.y / (28.0 * uDpr));
  float h1 = hash(vec2(rowF, slot)) - 0.5;
  float h2 = (hash(vec2(rowC, slot + 17.0)) - 0.5) * step(0.55, hash(vec2(rowC + 9.0, slot + 3.0)));
  float tear = (h1 * 0.25 + h2 * 1.6) * 0.06 * amp * (0.35 + 0.65 * v) * band;
  vec2 fragT = frag + vec2(tear * uRes.x, 0.0);

  // The mosaic: coarse at the leading edge of the crest, resolving to 1 px as the crest passes.
  float lead = smoothstep(0.06, 0.0, f) * smoothstep(-0.15, -0.01, f) * calm;
  float cell = max(1.0, floor(1.0 + 23.0 * amp * lead + 0.5)) * uDpr;
  vec2 fragQ = cell > 1.01 * uDpr ? (floor(fragT / cell) + 0.5) * cell : fragT;
  vec2 uvS = vec2(fragQ.x, uRes.y - fragQ.y) / uRes;

  // Which picture: the boundary is printed, not faded (rule 2).
  float edge = f + printEdge(frag, 0.03, 0.02);
  float behind = 1.0 - smoothstep(-CUT_EDGE, CUT_EDGE, edge);
  if (abs(f) < 0.025 + CUT_EDGE) PROBE_MIX(behind);   // the e2e edge probe, where the print reaches
  float lag = exp(-max(-f, 0.0) / 0.12) * calm;
  vec3 col;
  if (behind < 0.002) col = cutA(uvS, fragQ);
  else if (behind > 0.998) col = cutB(uvS, fragQ, lag);
  else col = mix(cutA(uvS, fragQ), cutB(uvS, fragQ, lag), behind);

  // The chroma split: red and blue slide +-0.006 along x, taken as a difference of raw taps so the
  // full picture is only evaluated once.
  float split = 0.006 * amp * band;
  vec3 raw0 = cutRaw(uvS, behind);
  if (split > 1.0e-4) {
    vec2 o = vec2(split, 0.0);
    col += vec3(cutRaw(uvS + o, behind).r - raw0.r, 0.0, cutRaw(uvS - o, behind).b - raw0.b);
  }

  // The rubbing: a glyph per 12 px cell, chosen by the luminance at the cell centre, inside the
  // crest band only. Cells are gated by Bayer so the band thins out into a dot screen.
  float asc = smoothstep(0.075, 0.015, abs(f)) * amp * calm;
  if (asc > 0.0) {
    float gc = 12.0 * uDpr;
    vec2 cid = floor(frag / gc);
    if (bayer4(cid) <= asc) {
      vec2 cc = (cid + 0.5) * gc;
      float lum = luma(cutRaw(vec2(cc.x, uRes.y - cc.y) / uRes, behind));
      float g = floor(clamp((lum - 0.10) / 0.80, 0.0, 1.0) * 9.99);
      vec2 lp = frag / gc - cid;
      float gx = floor(lp.x * 6.0);
      float gy = floor((1.0 - lp.y) * 6.0);
      float on = (gx < 4.5 && gy < 4.5) ? glyphPixel(g, gx, gy) : 0.0;
      col = mix(col * 0.72, uMilk, on * 0.92);
    }
  }
  return col;
}
`;
