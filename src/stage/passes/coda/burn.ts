// The close (docs/TRANSITIONS.md row Sheet -> blue): the sheet burns from the bottom left into the
// coda's first frame. A is the terms page at rest (passes/terms/frag.ts termsPage(): the sheet, the
// panel, the terms' ink and the margin orange, all under the burn, so they go with the paper); B is
// the coda's first frame through CODA_GLSL (./frag.ts). Everything is a function of local t (uBurnR
// and uLagK come from ./timeline.ts) plus uTime for breath, so scrubbing back unburns the sheet:
//
//   - the front is the distance from an origin off the bottom-left corner less a travelling radius,
//     bitten by two decorrelated fbm fields (rule 1) and printed by a Bayer threshold and a hash
//     stipple (rule 2), so the boundary is dots and char, not a ramp;
//   - the side about to go carbonises in a band that travels with the front (rule 8): the paper
//     yellows, browns, then blackens toward the cut, saturated a little way ahead of it and released
//     further ahead, all multiplied into the sheet so the paper reads through the char;
//   - an ember sits on the cut, flickering per band and per ninth of a second (rule 10) and brighter
//     when the scroll is fast; its light falls on the char; sparks hashed per cell and per eighth of
//     a second are gated on the burn's coverage, so nothing speckles ahead of the front;
//   - the blue arrives offset the way the front travels with lag = exp(-distBehindCut / 0.12),
//     smeared along that way, and settles as the front leaves (rules 5, 6); a soot band travels just
//     behind the cut;
//   - two fast paths (rule 14): a pixel provably ahead of every possible front (the char band
//     included) is the page at rest, so the first frame is the terms pass's last exactly; a pixel
//     provably behind, where the lag has died, is the coda's first frame, so the last frame is the
//     coda pass's first exactly.
import { TERMS_GLSL } from "../terms/frag";
import { CODA_GLSL } from "./frag";
import { CLOSE_TUNE, FAST_AHEAD } from "./timeline";

const f = (x: number) => x.toFixed(4);
const T = CLOSE_TUNE;

export const BURN_FRAG = /* glsl */ `
${TERMS_GLSL}
${CODA_GLSL}
uniform float uBurnR;       // the front's radius now, frame heights (./timeline.ts burnR)
uniform float uLagK;        // the lag's, the ember's and the soot's envelope: 1, dying over the last stretch
uniform float uFastBehind;  // how far behind the cut a pixel is provably settled now (./timeline.ts fastBehindAt)

const float ORIGIN_X = ${f(T.originX)};
const float ORIGIN_Y = ${f(T.originY)};
const float N1_FREQ = ${f(T.n1Freq)};
const float N1_AMP = ${f(T.n1Amp)};
const float N2_FREQ = ${f(T.n2Freq)};
const float N2_AMP = ${f(T.n2Amp)};
const float BAYER = ${f(T.bayer)};
const float STIPPLE = ${f(T.stipple)};
const float EDGE_SOFT = ${f(T.edgeSoft)};
const float CHAR_SAT = ${f(T.charSat)};
const float CHAR_WIDTH = ${f(T.charWidth)};
const float SINGE_WIDTH = ${f(T.singeWidth)};
const float CHAR_MOTTLE = ${f(T.charMottle)};
const float EMBER_W = ${f(T.emberWidth)};
const float EMBER_AMT = ${f(T.emberAmt)};
const float GLOW_W = ${f(T.glowWidth)};
const float GLOW_AMT = ${f(T.glowAmt)};
const float SOOT_W = ${f(T.sootWidth)};
const float SOOT_AMT = ${f(T.sootAmt)};
const float SPARK_T = ${f(T.sparkThreshold)};
const float SPARK_W = ${f(T.sparkWidth)};
const float SPARK_VEL = ${f(T.sparkVel)};
const float LAG_DIST = ${f(T.lagDist)};
const float LAG_OFFSET = ${f(T.lagOffset)};
const float LAG_SMEAR = ${f(T.lagSmear)};
const float FAST_AHEAD = ${f(FAST_AHEAD)};

const vec3 SINGE_COL = vec3(1.0, 0.95, 0.80);
const vec3 CHAR_BROWN = vec3(0.45, 0.28, 0.15);
const vec3 CHAR_BLACK = vec3(0.12, 0.09, 0.07);
const vec3 EMBER_COL = vec3(1.0, 0.56, 0.16);
const vec3 GLOW_COL = vec3(1.0, 0.62, 0.30);
const vec3 SPARK_COL = vec3(1.0, 0.85, 0.55);

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  float ar = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * ar, uv.y);
  vec2 rel = q - vec2(-ORIGIN_X, 1.0 + ORIGIN_Y);
  float d = length(rel);
  float f0 = d - uBurnR;

  // Fast path: provably ahead of every possible front, the char band included: the page at rest.
  if (f0 > FAST_AHEAD) {
    gl_FragColor = vec4(clamp(termsPage(frag, tm), 0.0, 1.0), 1.0);
    return;
  }
  codaFrame(tm);
  // Fast path: provably behind every possible front, where the lag has died: the coda's first frame.
  if (f0 < -uFastBehind) {
    gl_FragColor = vec4(clamp(codaPic(uv) + codaGrain(frag, tm), 0.0, 1.0), 1.0);
    return;
  }

  vec2 dir = rel / max(d, 1.0e-4);                   // the way the front travels here
  float v = clamp(abs(uVel) / SPARK_VEL, 0.0, 1.0);

  // The front: bitten by two decorrelated fields, its boundary printed, not faded. The finer field
  // drifts with the travel and creeps with time, so a held frame's edge still smoulders.
  float front = f0 + bite2(q, N1_FREQ, N1_AMP, N2_FREQ, N2_AMP, vec2(2.3, 9.1), vec2(-5.7, 1.4) + vec2(0.0, uBurnR * 0.05) + tm * 0.015);
  // The e2e probe: the crest zone is the scorch and singe ahead and three lag lengths behind (the soot inside them).
  PROBE_ZONE(front, CHAR_WIDTH + SINGE_WIDTH, 3.0 * LAG_DIST);
  float edge = front + printEdge(frag, BAYER, STIPPLE);
  float gone = 1.0 - smoothstep(-EDGE_SOFT, EDGE_SOFT, edge);      // 1 = the paper has gone
  if (abs(front) < 0.5 * (BAYER + STIPPLE) + EDGE_SOFT) PROBE_MIX(gone);   // the e2e edge probe
  float mottle = fbm(q * CHAR_MOTTLE + 3.3);                         // the char's unevenness

  vec3 a = vec3(0.0);
  if (gone < 0.998) {
    a = termsPage(frag, tm);
    // The scorch band ahead of the cut (rule 8): singe, then brown, then black near the cut,
    // saturated within CHAR_SAT and released by CHAR_WIDTH; multiplied in, so the sheet, the panel
    // and the ink keep reading through the char.
    float ahead = max(edge, 0.0);
    float scorch = (1.0 - smoothstep(CHAR_SAT, CHAR_WIDTH, ahead)) * (0.72 + 0.28 * mottle);
    float singe = 1.0 - smoothstep(CHAR_WIDTH * 0.5, CHAR_WIDTH + SINGE_WIDTH, ahead);
    vec3 tint = mix(vec3(1.0), SINGE_COL, singe * 0.6);
    tint *= mix(vec3(1.0), CHAR_BROWN, smoothstep(0.0, 0.5, scorch));
    tint *= mix(vec3(1.0), CHAR_BLACK, smoothstep(0.35, 0.9, scorch));
    a *= tint;
  }

  vec3 b = vec3(0.0);
  if (gone > 0.002) {
    // The coda arrives offset the way the front travels, still catching up with the edge that
    // uncovered it, smeared along that way, and settles as the front leaves (rules 5, 6).
    float lag = exp(-max(-edge, 0.0) / LAG_DIST) * uLagK;
    vec2 dirUV = vec2(dir.x / ar, dir.y);
    b = codaPicSmeared(uv - dirUV * (lag * LAG_OFFSET), dirUV, lag * LAG_SMEAR);
    // Soot in the air just behind the cut: a band that travels with it, dying with the ember.
    float behind = max(-edge, 0.0);
    float soot = smoothstep(0.0, 0.015, behind) * (1.0 - smoothstep(0.015, SOOT_W, behind)) * (0.6 + 0.4 * mottle) * uLagK;
    b *= 1.0 - SOOT_AMT * soot;
    b += codaGrain(frag, tm);
  }
  vec3 col = mix(a, b, gone);

  // The ember on the cut, flickering per band along the front and per ninth of a second (rule 10),
  // brighter when the scroll is fast; its light falls mostly on the paper side; sparks hashed per
  // cell and per eighth of a second, gated on the burn's coverage so nothing flies ahead of the front.
  float flick = 0.7 + 0.3 * hash(vec2(floor(atan(rel.y, rel.x) * 48.0), floor(tm * 9.0)));
  float ember = exp(-(edge * edge) / (EMBER_W * EMBER_W)) * flick * (0.75 + 0.25 * v) * EMBER_AMT * uLagK;
  float fire = exp(-abs(edge) / GLOW_W) * mix(0.35, 1.0, 1.0 - gone) * GLOW_AMT * uLagK;
  float cov = smoothstep(0.03, -0.03, front);
  float spark = step(SPARK_T, hash(floor(frag / (2.0 * uDpr)) + floor(tm * 8.0) * vec2(13.7, 7.1)))
              * smoothstep(SPARK_W, 0.0, abs(edge)) * (0.4 + 0.6 * v) * cov * uLagK;
  vec3 heat = EMBER_COL * ember + GLOW_COL * fire + SPARK_COL * spark;
  col = 1.0 - (1.0 - col) * (1.0 - clamp(heat, 0.0, 1.0));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
