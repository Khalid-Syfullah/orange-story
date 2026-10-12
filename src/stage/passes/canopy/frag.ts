// The canopy's shaders (docs/STORY.md rows 3 -> 4 and 4 · Questions, docs/TRANSITIONS.md row
// Halo -> canopy). CANOPY_GLSL is the picture both share: the `canopy` loop through cover() with
// the shared rest state (breath, parallax, drift), the paintings' film grain, and one halftone
// cloud (the shared cloud() function, cells 6.5 px) drifting across the sky gap at 0.008 widths a
// second with its fbm edge advancing at 0.03 a second, sampled at each dot cell's centre in
// painting coordinates so it stays glued to the sky through the camera's tilt and the cut's dolly.
// The leaves sway in the wind (the motion toolkit: windAt times foliageMask read through a soft
// lattice, art.ts canopy.sway), in painting coordinates, so the match cut's landing, the chapter
// and the moire's first frame sway alike; the fruit, the branches and the sky hold still.
//
//   - QUESTIONS_FRAG: that picture, by itself.
//   - MATCH_FRAG: the match cut. The picked orange (the coda's last frame, through CODA_GLSL) is
//     thrown from the `share-orange` anchor to the canopy's nearest orange, shrinking or growing to
//     its size, while the halo opens outward as a ring front: the distance from the orange bitten by
//     two decorrelated fbm fields (rule 1) and printed by a Bayer threshold and a hash stipple
//     (rule 2). Ahead of the ring is the coda's blue; behind it the canopy, which arrives pushed in
//     about the orange, offset the way the ring travels and smeared along it (rules 5, 6, 7),
//     printed in through a dither driven by the cut so t = 0 is the coda's last frame exactly
//     (rule 3). The ring's crest is a gaussian band exp(-x^2 / 0.0011) with a chroma split between
//     channels and a dithered crest (rules 2, 8); the floating fruit gives way to the canopy's own
//     through a Bayer threshold over the last of the cut, so t = 1 is the chapter's first frame.
import { art } from "@/content/art";
import { CLOUDS_GLSL } from "../clouds";
import { CODA_GLSL } from "../coda/frag";
import { CODA_TUNE } from "../coda/timeline";
import { REST_GLSL } from "../rest";
import { CANOPY_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);
const T = CANOPY_TUNE;
const sway = art.canopy.sway;

/** The picture both shaders share. Needs REST_GLSL and CLOUDS_GLSL before it. */
export const CANOPY_GLSL = /* glsl */ `
uniform sampler2D uCanopy;    // the canopy loop's current frame
uniform vec2 uCanopySize;
uniform vec2 uCanPan;         // the canopy's framing now (pan walks up through the branches)
uniform float uCanZoom;
uniform vec2 uNear;           // the nearest orange on the first frame, canopy uv (y down)
uniform float uNearR;         // its radius as a share of the canopy's width
uniform vec2 uCanRoom;        // the room the framing leaves the leaves' sway, painting units (timeline.ts canopySwayRoom)

const float CLOUD_DRIFT = ${f(T.cloudDrift)};   // widths a second
const float CLOUD_EDGE = ${f(T.cloudEdge)};     // fbm lattice units a second
const float CLOUD_SIZE = 0.22;                  // height units
const vec2 CLOUD_BASE = vec2(0.95, 0.73);       // where its flat base starts at t = 0 (x is before the wrap's offset)
const vec4 SWAY_WIND = vec4(${f(sway.wind.scale)}, ${f(sway.wind.speed)}, ${f(sway.wind.flutter)}, ${f(sway.wind.flutterSpeed)});   // art.ts canopy.sway.wind
const float SWAY_AMP = ${f(sway.amp)};          // the sway at a full gust, painting heights
const float SWAY_CELL = ${f(sway.cell)};        // the foliage mask's lattice, painting heights

float gKz;        // the canopy's zoom with the breath
vec2 gKoff;       // parallax and drift, painting units
float gKtm;       // the pass clock (0 under reduced motion), for the wind
// The cut's displacement of the canopy: a dolly about gMO (screen uv) by gMS and an offset gMLag
// (screen uv) along the way the ring travels. Identity in the chapter.
vec2 gMO = vec2(0.5);
float gMS = 1.0;
vec2 gMLag = vec2(0.0);

void canopyFrame(float tm) {
  gKz = restZoom(uCanZoom, tm);
  gKoff = restOffset(tm);
  gKtm = tm;
}

vec2 canopyUV(vec2 uv) { return dollyAbout(uv - gMLag, gMO, gMS); }
vec2 toCanopy(vec2 uv) { return cover(uv, uCanopySize, uCanPan, gKz) + gKoff; }

// The leaves in the wind: a canopy painting point moved by the wind where the leaves are, the
// foliage read on a lattice anchored to the painting so the warp is continuous; bounded by the
// room the framing leaves, so no edge of the painting ever shows. Identity on the sky, the fruit and
// the branches, and under reduced motion.
vec2 canopySway(vec2 pt) {
  if (uStill > 0.5) return pt;
  float ar = uCanopySize.x / uCanopySize.y;
  vec2 cell = vec2(SWAY_CELL / ar, SWAY_CELL);
  float m = SOFT_MASK(uCanopy, pt, cell, foliageMask);
  if (m < 0.002) return pt;
  vec2 w = windAt(vec2(pt.x * ar, pt.y), gKtm, SWAY_WIND);
  return pt + softBound(vec2(w.x / ar, w.y) * (SWAY_AMP * m), uCanRoom);
}

// Film grain, +-1.2%: the paintings' grain, as on the coda.
float canopyGrain(vec2 frag, float tm) { return filmGrain(frag, tm, 0.024); }

// The one cloud's coverage at a canopy painting point: it drifts across the gap at CLOUD_DRIFT
// widths a second and wraps behind the leaves, where nothing shows; its fbm edge advances at
// CLOUD_EDGE a second. Painting height units: x in 0..aspect.
float canopyCloud(vec2 pt, float tm) {
  float ar = uCanopySize.x / uCanopySize.y;
  vec2 pa = vec2(pt.x * ar, pt.y);
  float x = mod(CLOUD_BASE.x + CLOUD_DRIFT * ar * tm, ar + 1.2) - 0.5;
  return cloud(pa, vec2(x, CLOUD_BASE.y), CLOUD_SIZE, 31.0, cloudSway(CLOUD_SIZE, 31.0, tm), CLOUD_EDGE * tm);
}

// The canopy at a screen pixel: the loop, smeared 'smearLen' along dirUV when the cut asks for it,
// and the halftone cloud over the sky (never over leaves or fruit).
vec3 canopyScene(vec2 uv, vec2 frag, float tm, vec2 dirUV, float smearLen) {
  vec2 pt = canopySway(toCanopy(canopyUV(uv)));
  vec3 c;
  if (smearLen > 0.0005) {
    vec2 dp = dirUV * coverScale(uCanopySize) / gKz;
    c = smear5(uCanopy, pt, dp, smearLen);
  } else {
    c = texture2D(uCanopy, pt).rgb;
  }
  float cellPx = CLOUD_CELL * uDpr;
  vec2 cpt = toCanopy(canopyUV(cloudCellUV(floor(frag / cellPx), cellPx)));
  float cov = canopyCloud(cpt, tm);
  if (cov > 0.0) c = mix(c, uMilk, cloudDot(frag, cellPx, cov) * skyMask(c) * 0.94);
  return c;
}
`;

/** Chapter 4: the canopy at rest, tilting up through the branches with the cloud drifting across the gap. */
export const QUESTIONS_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
${CANOPY_GLSL}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  canopyFrame(tm);
  vec3 col = canopyScene(uv, frag, tm, vec2(0.0), 0.0);
  gl_FragColor = vec4(clamp(col + canopyGrain(frag, tm), 0.0, 1.0), 1.0);
}
`;

/** The match cut: the picked orange into the canopy, the halo opening outward as the ring that brings it. */
export const MATCH_FRAG = /* glsl */ `
${CODA_GLSL}
${CLOUDS_GLSL}
${CANOPY_GLSL}
uniform float uMove;       // the orange's travel 0..1 (./timeline.ts orangeTravel)
uniform float uRingP;      // the ring's travel 0..1
uniform float uRingEnd;    // the ring's radius at the end, frame heights
uniform float uBite;       // the bite's amplitude 0..1
uniform float uReveal;     // the canopy's printing-in 0..1
uniform float uDisc;       // the floating orange's share of the fruit 1..0
uniform float uCrest;      // the crest's amplitude 0..1
uniform float uSettle;     // the lag and the push 1..0
uniform float uDolly;      // the canopy's dolly about the orange (1.14..1)

const float ARC = ${f(T.arc)};
const float N1_FREQ = ${f(T.n1Freq)};
const float N1_AMP = ${f(T.n1Amp)};
const float N2_FREQ = ${f(T.n2Freq)};
const float N2_AMP = ${f(T.n2Amp)};
const float BAYER = ${f(T.bayer)};
const float STIPPLE = ${f(T.stipple)};
const float EDGE_SOFT = ${f(T.edgeSoft)};
const float BAND_SIGMA2 = ${T.bandSigma2.toFixed(5)};
const float SPLIT = ${f(T.split)};
const float CREST_AMT = ${f(T.crestAmt)};
const float LIGHT_REACH = ${f(T.lightReach)};
const float LIGHT_AMT = ${f(T.lightAmt)};
const float LAG_DIST = ${f(T.lagDist)};
const float LAG_OFFSET = ${f(T.lagOffset)};
const float LAG_SMEAR = ${f(T.lagSmear)};
const float DOLLY_FULL = ${f(T.dolly)};
const float HALO_GAP_K = ${f(CODA_TUNE.haloGap)};
const float BITE_MAX = ${f((T.n1Amp + T.n2Amp + T.bayer + T.stipple) / 2)};
const float DITHER_W = 0.1;
const float FRUIT_REACH = 1.75;   // the fruit with its leaf and stem, in peel radii
const vec3 CREST_COL = vec3(1.0, 0.94, 0.82);

// A threshold on the Bayer matrix: 0 at x = 0 and 1 at x = 1 for every pixel, in between a print
// screen, never a fade.
float dither(float x, float thr) {
  float k = x * (1.0 + 2.0 * DITHER_W) - DITHER_W;
  return smoothstep(thr - DITHER_W, thr + DITHER_W, k);
}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  float ar = uRes.x / uRes.y;
  codaFrame(tm);
  canopyFrame(tm);

  // The two fruits (frame heights, x scaled by the aspect) and the one in flight: its centre, thrown
  // on a bowed path, and its scale, from the floating orange's size to the canopy fruit's.
  vec2 c0 = aspectUV(uncover(uAnchor - gCoff, uCodaSize, uCodaPan, gCz));
  vec2 c1 = aspectUV(uncover(uNear - gKoff, uCanopySize, uCanPan, gKz));
  float R0 = uOrangeR * gCz / coverScale(uCodaSize).x * ar;
  float R1 = uNearR * gKz / coverScale(uCanopySize).x * ar;
  float s = exp(uMove * log(R1 / R0));
  vec2 way = c1 - c0;
  float wl = max(length(way), 1.0e-4);
  vec2 cq = mix(c0, c1, uMove) + vec2(way.y, -way.x) / wl * (ARC * sin(3.14159265 * uMove));

  // The coda's last frame, still: the picture with the fruit taken out (every pixel within reach of
  // the fruit and its leaf is pushed out to the rim, which is blue), so the blue ahead of the ring
  // does not move; and the fruit with its halo carried along in its own frame, sampled about it so
  // the halo (drawn in the picture's own frame) goes with it and fades on the cut.
  vec2 q = aspectUV(uv);
  vec2 rel0 = q - c0;
  float reach = R0 * FRUIT_REACH + 0.015;
  vec2 qb = c0 + rel0 * (max(length(rel0), reach) / max(length(rel0), 1.0e-4));
  vec3 bg = codaPic(vec2(qb.x / ar, qb.y));
  vec2 qa = c0 + (q - cq) / s;
  vec2 uva = vec2(qa.x / ar, qa.y);
  vec3 pic = codaPic(uva);
  float within = 1.0 - smoothstep(reach * s, reach * s * 1.06, length(q - cq));
  PROBE((length(q - cq) - reach * s) / (reach * s));   // the e2e probe: the thrown fruit and its reach
  vec3 base = mix(bg, pic, within);
  vec3 A = codaHalo(base, uva, tm);
  // Where the fruit (its peel, stem and leaf) is: the picture differs from the blue it was taken from.
  float fruit = smoothstep(0.03, 0.12, length(pic - bg)) * within;

  // The ring: the halo's ring as the coda ends, growing to clear the farthest corner.
  vec2 rel = q - cq;
  float d = length(rel);
  float rho = mix(R0 * (1.0 + HALO_GAP_K) * s, uRingEnd, uRingP);
  float f0 = d - rho;
  // Fast path (rule 14): provably ahead of every possible front, its light and its crest: the coda.
  if (f0 > BITE_MAX + 0.2) {
    gl_FragColor = vec4(clamp(A + canopyGrain(frag, tm), 0.0, 1.0), 1.0);
    return;
  }

  // The front, bitten by two decorrelated fields (4 octaves everywhere: motion fields), printed.
  float front = f0 + bite2(q, N1_FREQ, N1_AMP, N2_FREQ, N2_AMP, vec2(7.3, 1.9), vec2(-3.1, 8.6) + vec2(0.0, uRingP * 0.3) + tm * 0.02) * uBite;
  // The e2e probe: the crest zone is the halo's light ahead and three lag lengths behind the ring.
  PROBE_ZONE(front, 3.0 * LIGHT_REACH, 3.0 * LAG_DIST);
  float thr = bayer4(frag);
  float edge = front + printEdge(frag, BAYER, STIPPLE);
  // 1 = the canopy is here: behind the ring, once the cut has begun to print it in.
  float inside = (1.0 - smoothstep(-EDGE_SOFT, EDGE_SOFT, edge)) * dither(uReveal, thr);
  if (abs(front) < 0.5 * (BAYER + STIPPLE) + EDGE_SOFT) PROBE_MIX(inside);   // the e2e edge probe

  // The floating fruit stays on top of the canopy until the canopy's own takes its place.
  float keep = max(1.0 - inside, fruit * dither(uDisc, thr));

  vec3 col = A;
  if (keep < 0.998) {
    // The canopy arrives pushed in about the orange (the point drifts a few percent sideways as the
    // push eases), offset the way the ring travels and smeared along it, settling as the ring leaves.
    vec2 dir = rel / max(d, 1.0e-4);
    vec2 dirUV = vec2(dir.x / ar, dir.y);
    float lag = exp(-max(-edge, 0.0) / LAG_DIST) * uSettle;
    vec2 cuv = vec2(cq.x / ar, cq.y);
    float push = (uDolly - 1.0) / (DOLLY_FULL - 1.0);
    gMO = cuv + vec2(0.03, 0.01) * push;
    gMS = uDolly;
    gMLag = dirUV * (lag * LAG_OFFSET);
    vec3 can = canopyScene(uv, frag, tm, dirUV, lag * LAG_SMEAR);
    vec3 inner = clamp(can + (A - base), 0.0, 1.0);   // the halo's light stays on the canopy
    col = mix(inner, A, keep);
  }

  // The crest: a gaussian band on the ring with the channels split apart, printed through the Bayer
  // threshold; the halo's light ahead of it and a little of it behind.
  if (uCrest > 0.001) {
    vec3 band = crestBand(edge, SPLIT, BAND_SIGMA2);
    vec3 printed = smoothstep(vec3(thr - 0.1), vec3(thr + 0.1), band);
    vec3 crest = mix(band, printed, 0.65);
    float ahead = step(0.0, edge);
    float light = exp(-abs(edge) / mix(LIGHT_REACH * 0.6, LIGHT_REACH, ahead)) * mix(0.5, 1.0, ahead) * LIGHT_AMT;
    vec3 add = clamp(CREST_COL * (crest * CREST_AMT + light * (1.0 - band * 0.5)) * uCrest, 0.0, 1.0);
    col = 1.0 - (1.0 - col) * (1.0 - add);
  }
  gl_FragColor = vec4(clamp(col + canopyGrain(frag, tm), 0.0, 1.0), 1.0);
}
`;
