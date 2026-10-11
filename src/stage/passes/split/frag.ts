// The Split fragment shader (docs/TRANSITIONS.md, "The Split in full"): the cut in the orange
// becomes the cut in the picture. A is the share beat's last keyframe (the halves held apart)
// through the model's own mapping, so the first frame is the model's last; B is the top of the
// plate (its sky) fitted to the frame's width, pushed in about the seam point and easing out.
//
// Everything is a function of local t (and uTime for breath only), so scrubbing back closes the
// fruit again:
//   - the front is an anisotropic metric about the seam (narrow in x, tall in y) bitten by two
//     decorrelated fbm fields and printed by Bayer and a hash stipple (rules 1, 2);
//   - the halves are displaced apart along x with the sign ramped through zero at the seam, smeared
//     the way they go, pushed in about the seam point, which drifts as the push accelerates, and
//     softened radially in the last quarter (rules 6, 7, 12);
//   - the bands (rind, pith, zest, lag) are measured across the front in frame heights, the printed
//     front distance divided by the metric's gradient, so a rim is the same width all the way round
//     the opening instead of 2.6x taller along the seam than across it (rule 8: a band, not a
//     column): a rind band ahead of the cut desaturates and darkens; a pith rim behind it with fibre
//     along the seam; zest specks on the cut, hashed per cell and per sixth of a second (rule 10);
//   - the plate arrives offset in the direction the front travels by a lag that decays behind it,
//     smeared along x, its halftone clouds drawn in plate coordinates through the same mapping
//     (rules 5, 6);
//   - the bite, the rind and the zest ease in over the first stretch (rule 4), so the rest phase is
//     untouched and nothing switches on;
//   - two fast paths return one picture where a pixel is provably ahead of or behind every possible
//     front (rule 14), and the rest phase is the first of them for the whole frame.
// Every number comes from ./tune.ts as a uniform.
import { CLOUDS_GLSL } from "../clouds";
import { REST_GLSL } from "../rest";
import { SPLIT_TUNE_GLSL } from "./tune";

export const SPLIT_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
uniform sampler2D uShareLast, uPlate;
uniform vec2 uShareLastSize, uPlateSize;
uniform vec3 uFrameA;      // the share beat's last framing: pan.xy, zoom (art.share.lastFraming)
uniform vec2 uSeam;        // the gap between the halves in the keyframe, painting uv (art.share.anchors.seam)
${SPLIT_TUNE_GLSL}

float gTm;      // the pass's clock (stopped under reduced motion)
float gZk;      // the breath, as a factor on the zoom
vec2 gOff;      // parallax and drift, painting units

// Screen uv -> painting uv of the halves: the share beat's cover() mapping with the rest state, the
// same expression the model's shader uses for this picture.
vec2 toA(vec2 uv) { return cover(uv, uShareLastSize, uFrameA.xy, uFrameA.z * gZk) + gOff; }

// Film grain, +-1.5%: the model's, carried across the cut.
float grain(vec2 frag) { return filmGrain(frag, gTm, 0.03); }

// A: the halves at screen uv uvA, smeared 'len' (screen units) along 'dirA' (the way they move, in
// painting units), then softened by 'soft' (screen units) near the lens. The soft blends in over
// its first 0.004 so the smear never switches to the blur.
vec3 halves(vec2 uvA, vec2 dirA, float len, float soft, vec2 csA) {
  vec2 p = toA(uvA);
  vec3 c = len > 1.0e-4 ? smear5(uShareLast, p, dirA, len) : texture2D(uShareLast, p).rgb;
  if (soft > 1.0e-4) c = mix(c, blur(uShareLast, p, soft * csA.y), smoothstep(0.0, 0.004, soft));
  return c;
}

// B: the plate fitted to the frame's width with its top at the top of the frame, pushed in by s
// about o, arriving offset by dB and smeared along x while it lags. The halftone clouds are drawn in
// plate coordinates through the same mapping, so they arrive with it and keep drifting under it.
vec3 plate(vec2 uv, vec2 o, float s, vec2 dB, float sgn, float lag, vec2 frag) {
  vec2 pu = plateUV(dollyAbout(uv, o, s) + dB, uPlateSize, 0.0, gOff);
  float len = lag * uTune_lagSmear;
  vec3 b = len > 1.0e-4 ? smear5(uPlate, pu, vec2(sgn, 0.0), len) : texture2D(uPlate, pu).rgb;
  float cellPx = CLOUD_CELL * uDpr;
  vec2 cuv = dollyAbout(cloudCellUV(floor(frag / cellPx), cellPx), o, s) + dB;
  vec2 cpu = plateUV(cuv, uPlateSize, 0.0, gOff);
  float cov = plateClouds(vec2(cpu.x * uPlateSize.x / uPlateSize.y, cpu.y), gTm, 0.0);
  float m = cloudDot(frag, cellPx, cov) * skyMask(b);
  return mix(b, uMilk, m * 0.94);
}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  gTm = uTime * (1.0 - uStill);
  gZk = restZoom(1.0, gTm);
  gOff = restOffset(gTm);

  float t = uT;
  float v = clamp(abs(uVel) / uTune_zestVel, 0.0, 1.0);
  float push = t * (uTune_pushLin + (1.0 - uTune_pushLin) * t * t);
  // The seam between the halves, on screen, drifting sideways as the push accelerates (rule 7).
  vec2 o = uncover(uSeam - gOff, uShareLastSize, uFrameA.xy, uFrameA.z * gZk)
         + vec2(uTune_driftX, uTune_driftY) * push;
  float ar = uRes.x / uRes.y;
  vec2 q = (uv - o) * vec2(ar, 1.0);
  float sgn = clamp(q.x / uTune_sgnWidth, -1.0, 1.0);          // which half, ramped through zero

  float tt = clamp((t - uTune_partFrom) / uTune_partSpan, 0.0, 1.0);
  float R = tt * (uTune_frontLin + (1.0 - uTune_frontLin) * tt * tt) * uTune_frontGain + uTune_frontOffset;
  float r = length(q * vec2(1.0, uTune_metricY));               // a vertical seam widening, not a wipe
  // |grad r| on screen: 1 across the seam, metricY along it. Dividing a front distance by it gives
  // the distance to the front in frame heights, so every band is the same width all round.
  float gradR = length(vec2(q.x, uTune_metricY * uTune_metricY * q.y)) / max(r, 1.0e-4);
  float onset = smoothstep(uTune_partFrom, uTune_onsetTo, t);   // the bite, rind and zest ease in

  // The halves part: displaced apart along x, smeared the way they go, pushed in about the seam.
  float part = smoothstep(0.0, uTune_partRamp, tt);
  float sA = 1.0 + uTune_pushGain * push;
  vec2 dA = vec2(sgn * part * uTune_parting / ar, 0.0);
  vec2 csA = coverScale(uShareLastSize) / (uFrameA.z * gZk);    // screen uv -> painting uv, per axis
  vec2 dirA = vec2(sgn * csA.x, 0.0);
  float soft = smoothstep(uTune_softFrom, uTune_softTo, t) * length(q) * uTune_soft;
  vec2 uvA = dollyAbout(uv, o, sA) - dA;

  // Fast path: the whole frame at rest, and any pixel provably ahead of every possible front.
  if (onset <= 0.0 || r > R + uTune_fastAhead) {
    vec3 c = halves(uvA, dirA, part * uTune_partSmear, soft, csA) + grain(frag);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    return;
  }
  float sB = mix(uTune_plateScale, 1.0, smoothstep(uTune_scaleFrom, 1.0, t)) * gZk;
  // Fast path: any pixel provably behind every possible front, where the lag has died.
  if (r < R - uTune_fastBehind) {
    vec3 c = plate(uv, o, sB, vec2(0.0), sgn, 0.0, frag) + grain(frag);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    return;
  }

  // The front: the metric bitten by two decorrelated fields, its boundary printed, not faded.
  float front = r - R + bite2(q, uTune_n1Freq, uTune_n1Amp, uTune_n2Freq, uTune_n2Amp,
                              vec2(7.0), vec2(-3.0) + vec2(0.0, t * 0.4) + gTm * 0.02) * onset;
  float edge = front + printEdge(frag, uTune_bayer, uTune_stipple);
  float open = 1.0 - smoothstep(-0.02, 0.02, edge);             // 1 = the plate shows
  float edgeS = edge / gradR;                                     // the printed front's distance in frame heights

  vec3 a = vec3(0.0);
  if (open < 0.998) {
    // The rind band ahead of the cut: desaturated and darkened, smeared a little more.
    float rind = smoothstep(uTune_rindWidth, 0.0, edgeS) * (1.0 - open) * onset;
    a = halves(uvA, dirA, part * uTune_partSmear + rind * uTune_rindSmear, soft, csA);
    a = mix(a, vec3(luma(a)), uTune_rindDesat * rind) * (1.0 - uTune_rindDark * rind);
  }

  vec3 b = vec3(0.0);
  if (open > 0.002) {
    // The plate still catching up with the edge that uncovered it.
    float lag = exp(-max(-edgeS, 0.0) / uTune_lagDist) * (1.0 - smoothstep(uTune_lagFadeFrom, 1.0, t));
    vec2 dB = vec2(-sgn * lag * uTune_lagOffset / ar, 0.0);
    b = plate(uv, o, sB, dB, sgn, lag, frag);
    // Pith at the rim: a band that travels with the cut, saturated just inside the opening and
    // released a little way behind it, fibre running along the seam, thinning to nothing over the
    // settle.
    if (edgeS < 0.0 && edgeS > uTune_pithOut) {
      float pith = smoothstep(0.0, uTune_pithIn, edgeS) * smoothstep(uTune_pithOut, uTune_pithPeak, edgeS)
                 * (1.0 - smoothstep(uTune_pithFadeFrom, 1.0, t));
      float fib = fbm(vec2(q.x * uTune_fibreX, q.y * uTune_fibreY));
      vec3 pithCol = mix(vec3(0.98, 0.95, 0.88), vec3(0.90, 0.83, 0.68), fib);
      b = mix(b, pithCol, pith * 0.9);
    }
  }

  // Zest on the cut: oil specks hashed per cell and per sixth of a second, denser when the scroll
  // is fast, additive warm white.
  float zest = step(uTune_zestThreshold, hash(floor(frag / (uTune_zestCell * uDpr)) + floor(gTm * uTune_zestRate)))
             * smoothstep(uTune_zestWidth, 0.0, abs(edgeS)) * (0.6 + 0.4 * v) * onset;

  vec3 col = mix(a, b, open) + vec3(1.0, 0.93, 0.70) * zest + grain(frag);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
