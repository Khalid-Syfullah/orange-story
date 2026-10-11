// The finale fragment shader. It starts from the rise's own last frame (the application painting
// with the sapling printed on it: RISE_FRAG with its main() renamed, so the cut is that picture and
// not a copy of it) and takes the frame over with the finale loop:
//   1. the print-in: a front starting in the open sky above the tree (a colour already on screen),
//      bitten by two decorrelated fbm fields (rule 1), printed by a rotated halftone screen whose
//      dots grow until they merge and by Bayer stipple (rule 2), the loop arriving displaced and
//      smeared away from the front (rules 5, 6). Once it has passed every pixel the whole branch is
//      skipped (rule 14) and the frame is the loop at rest.
//   2. the halftone pour from the can's spout to the roots (../pour.ts, the hero's), grown in by a
//      driver (rule 3).
//   3. the wordmark, from the canvas texture: each letter's dots grow on the glyph alpha until they
//      merge into the glyph, letter after letter.
// Everything but the loop, the pour and the grain is a function of the uniforms set from `p`.
import { POUR_GLSL } from "../pour";
import { RISE_FRAG } from "../application/frag";
import { WORD_LETTERS, FINALE_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);

// The rise's shader, its main() renamed and its output kept in a global.
const RISE_BODY = RISE_FRAG.replace("void main()", "void riseMain()").replace(
  "gl_FragColor = vec4(clamp(col + appGrain(frag, tm), 0.0, 1.0), 1.0);",
  "gRise = vec4(clamp(col + appGrain(frag, tm), 0.0, 1.0), 1.0);",
);

export const FINALE_FRAG = /* glsl */ `
vec4 gRise;
${RISE_BODY}
${POUR_GLSL}
uniform sampler2D uFin;       // the finale loop
uniform vec2 uFinSize;
uniform vec2 uFinPan;
uniform float uFinZoom;
uniform vec2 uASpout, uARoots; // painting points, 0..1, y down
uniform vec2 uOrigin;         // where the loop starts printing in, screen uv
uniform float uCover;         // 0..1: how far the loop has taken the frame
uniform float uPourGain;      // 0..1: the pour grown in
uniform float uWordT;         // 0..1: the wordmark's clock
uniform sampler2D uWord;      // the wordmark: letter index in red, glyph in alpha
uniform vec4 uWordBox;        // its box in screen uv: left, top, width, height

const float NL = ${f(WORD_LETTERS.length)};
const float WSTEP = ${f(FINALE_TUNE.letterStep)};

// Letter k's arrival 0..1 (eased), after the letters before it.
float arrive(float k) {
  float x = clamp((uWordT - k * WSTEP) / (1.0 - (NL - 1.0) * WSTEP), 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// The wordmark at a screen uv: x = letter index, y = glyph alpha.
vec2 wordAt(vec2 uv) {
  vec4 g = texture2D(uWord, (uv - uWordBox.xy) / uWordBox.zw);
  float k = clamp(floor(g.r / max(g.a, 0.004) * NL), 0.0, NL - 1.0);
  return vec2(k, g.a);
}

// The wordmark printed over col: dots on the page's halftone screen (6.5 px cells at 15 degrees)
// that grow with the letter's arrival until they merge, and the glyph itself once they have.
vec3 printWord(vec3 col, vec2 uv, vec2 frag) {
  vec2 w = (uv - uWordBox.xy) / uWordBox.zw;
  if (uWordT <= 0.0 || w.x < -0.1 || w.x > 1.1 || w.y < -0.15 || w.y > 1.15) return col;
  float cell = 6.5 * uDpr;
  vec2 rid;
  vec2 loc;
  vec2 cuv;
  screenCell(frag, cell, PRINT_ANGLE, rid, loc, cuv);
  vec2 cw = wordAt(cuv);
  float ak = arrive(cw.x);
  // Instances differ (rule 13): each dot has its own size.
  float rad = 0.80 * ak * sqrt(cw.y) * (0.88 + 0.24 * hash(rid + 4.3));
  float dd = length(loc);
  float aa = 0.9 / cell;
  float dots = (1.0 - smoothstep(rad - aa, rad + aa, dd)) * smoothstep(0.0, 0.05, rad);
  vec2 gf = wordAt(uv);
  float solid = gf.y * smoothstep(0.55, 0.95, arrive(gf.x));
  float m = max(dots * (1.0 - smoothstep(0.55, 0.95, ak)), solid);
  return mix(col, uMilk, clamp(m, 0.0, 1.0));
}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  riseMain();
  vec3 col = gRise.rgb;

  float fz = restZoom(uFinZoom, tm);
  vec2 foff = restOffset(tm);
  vec2 pp = cover(uv, uFinSize, uFinPan, fz) + foff;
  float gr = appGrain(frag, tm);

  if (uCover < 1.0) {
    vec2 q = aspectUV(uv);
    vec2 oq = aspectUV(uOrigin);
    float asp = uRes.x / uRes.y;
    vec2 far = vec2(max(oq.x, asp - oq.x), max(oq.y, 1.0 - oq.y));
    float a = uCover * uCover * (3.0 - 2.0 * uCover);
    // The shared print-in (9 px cells at the page's 15 degrees): the coverage is read at the cell's
    // centre so every dot is a clean circle; the bite's mean of 0.2 is kept out of the front so
    // nothing is printed at a = 0 (the hero prints in the same way).
    float cell = 9.0 * uDpr;
    vec2 cid;
    vec2 loc;
    vec2 cuv;
    screenCell(frag, cell, PRINT_ANGLE, cid, loc, cuv);
    vec2 qC = aspectUV(cuv);
    float d0C = length(qC - oq) / length(far) + 0.2 - a * 2.3;
    // Fast path (rule 14): a cell provably ahead of every possible front (the bite is within +-0.2
    // and the merge term is 0 until a = 0.92) has nothing printed in it yet: the rise's frame, with
    // neither bite evaluated. Most of the frame takes it over the cut's first half.
    float cov = 0.0;
    if (d0C < 0.2 || a >= 0.92) {
      float frontC = d0C + bite2(qC, 2.2, 0.30, 7.0, 0.10, vec2(3.1), vec2(11.7));
      cov = max(clamp(-frontC / 0.42, 0.0, 1.0), smoothstep(0.92, 1.0, a));
    }
    if (cov > 0.0) {
      // The loop catching up with the front it was printed behind, smeared away from it.
      float front = length(q - oq) / length(far) + 0.2 - a * 2.3 + bite2(q, 2.2, 0.30, 7.0, 0.10, vec2(3.1), vec2(11.7));
      float lag = exp(-max(-front, 0.0) / 0.25) * (1.0 - smoothstep(0.75, 1.0, a));
      vec2 dirq = (q - oq) / max(length(q - oq), 1.0e-3);
      vec2 dv = vec2(dirq.x * uRes.y / uRes.x, dirq.y) * coverScale(uFinSize) / fz;
      vec3 full = smear5(uFin, pp - dv * lag * 0.02, dv, lag * 0.03) + gr;
      vec3 cCol = texture2D(uFin, cover(cuv, uFinSize, uFinPan, fz) + foff).rgb;
      col = printIn(col, cCol, full, cov, loc, cid, cell, frag);
    }
  } else {
    col = texture2D(uFin, pp).rgb + gr;
  }

  // The pour, from the spout to the roots, grown in by its driver.
  if (uPourGain > 0.001) {
    vec2 A = aspectUV(uncover(uASpout - foff, uFinSize, uFinPan, fz));
    vec2 B = aspectUV(uncover(uARoots - foff, uFinSize, uFinPan, fz));
    col = mix(col, pour(col, aspectUV(uv), A, B, tm), uPourGain);
  }

  col = printWord(col, uv, frag);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
