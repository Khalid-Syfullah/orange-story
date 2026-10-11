// The application's shaders (docs/STORY.md rows 4 -> application, Application and The rise;
// docs/TRANSITIONS.md rows Questions -> Application and Application -> finale). APP_GLSL is the
// picture all three share: the `application` painting through cover() with its own framing (the
// figure pinned left: uAppPan comes from applicationFraming()), the shared rest state (breath,
// parallax, drift), the paintings' film grain, and the scrim that lies under the form.
//
//   - MOIRE_FRAG (p 0.76-0.79): the canopy chapter's last frame becomes the application. One
//     coarse halftone screen (cell 10 px x dpr, laid at 15 degrees so it moires against the pixel
//     grid) carries the whole cut. Every dot cell has its own arrival `m` 0..1 at its centre: the
//     sky gap and the clouds first, the branches from the gap's inner edge outward (a distance
//     bitten by two decorrelated fbm fields, rule 1), the figure, the steps and the fruit last. The
//     application's dots grow with `m` until they merge into paint (radius past half a cell's
//     diagonal) and hand over to the plain painting through a Bayer and stipple threshold, never a
//     fade (rule 2); the painting arrives pushed in about the gap's centre, offset the way the front
//     travels and smeared along it, settling as it lands (rules 5, 6, 7). Over the bare gap a faint
//     second screen, a hair finer and turned, beats against the first: the moire.
//   - APPLICATION_FRAG (p 0.79-0.90): the painting at rest.
//   - RISE_FRAG (p 0.90-0.96): the painting with the sapling printed onto it from its trunk foot
//     upward (a front bitten by two fbm fields, printed by a halftone screen and Bayer stipple, the
//     sapling arriving displaced toward its foot and smeared the way it grows), and the shared
//     halftone cloud crossing behind it.
import { CLOUDS_GLSL } from "../clouds";
import { CANOPY_GLSL } from "../canopy/frag";
import { REST_GLSL } from "../rest";
import { art } from "@/content/art";
import { APP_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);
const T = APP_TUNE;

const gap = art.canopy.rects.gap;

/** The picture the three shaders share. Needs REST_GLSL (and CLOUDS_GLSL for the grain's sibling, the cloud) before it. */
export const APP_GLSL = /* glsl */ `
uniform sampler2D uApp;       // the application painting
uniform vec2 uAppSize;
uniform vec2 uAppPan;         // its framing now (the figure pinned left)
uniform float uAppZoom;
uniform vec4 uScrimBox;       // the form's column in screen uv: left, top, right, bottom
uniform float uScrim;         // 0..1: the scrim behind the form

const vec3 SCRIM_TINT = vec3(0.60, 0.66, 0.80);

float gAz;        // the painting's zoom with the breath
vec2 gAoff;       // parallax and drift, painting units

void appFrame(float tm) {
  gAz = restZoom(uAppZoom, tm);
  gAoff = restOffset(tm);
}

vec2 toApp(vec2 uv) { return cover(uv, uAppSize, uAppPan, gAz) + gAoff; }

// A soft box (signed distance, feathered inward) in screen uv: 1 deep inside, 0 outside.
float scrimMask(vec2 uv) {
  vec2 c = (uScrimBox.xy + uScrimBox.zw) * 0.5;
  vec2 h = (uScrimBox.zw - uScrimBox.xy) * 0.5;
  vec2 d = abs(uv - c) - h;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-0.05, 0.14, sd);
}

// The scrim: a soft darkening toward the sky's blue under the form, as strong as its driver.
vec3 scrimMul(vec2 uv) { return mix(vec3(1.0), SCRIM_TINT, scrimMask(uv) * uScrim); }

// Film grain, +-1.2%: the paintings' grain (the canopy's, exactly).
float appGrain(vec2 frag, float tm) { return filmGrain(frag, tm, 0.024); }

// 5 taps trailing along -dp by len (painting units), as smear5, for the painting.
vec3 appSmear(vec2 pt, vec2 dp, float len) {
  if (len < 0.0005) return texture2D(uApp, pt).rgb;
  vec2 d = dp * len;
  return texture2D(uApp, pt).rgb * 0.30
       + texture2D(uApp, pt - d * 0.25).rgb * 0.25
       + texture2D(uApp, pt - d * 0.50).rgb * 0.20
       + texture2D(uApp, pt - d * 0.75).rgb * 0.15
       + texture2D(uApp, pt - d).rgb * 0.10;
}

// A feathered box in painting coordinates (feather in painting units), bitten by 'bite'.
float rectSoft(vec2 p, vec4 r, float feather, float bite) {
  vec2 c = r.xy + r.zw * 0.5;
  vec2 h = r.zw * 0.5;
  vec2 d = abs(p - c) - h;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) + bite;
  return 1.0 - smoothstep(-0.01, feather, sd);
}
`;

/** The application at rest: the painting, the scrim under the form, the grain. */
export const APPLICATION_FRAG = /* glsl */ `
${REST_GLSL}
${APP_GLSL}

void main() {
  vec2 uv = screenUV();
  float tm = uTime * (1.0 - uStill);
  appFrame(tm);
  vec3 col = texture2D(uApp, toApp(uv)).rgb * scrimMul(uv);
  gl_FragColor = vec4(clamp(col + appGrain(gl_FragCoord.xy, tm), 0.0, 1.0), 1.0);
}
`;

/** Questions -> Application: the canopy dissolves through a coarse halftone screen into the application. */
export const MOIRE_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
${CANOPY_GLSL}
${APP_GLSL}
uniform float uClock;      // the cut's clock 0..1 (accelerating)
uniform float uScreen;     // the bare screen's strength 0..1
uniform float uDolly;      // the painting's push about the gap's centre, settling to 1
uniform vec4 uFigure;      // the figure's rect, application painting units
uniform vec4 uSteps;       // the steps' rect

const float CELL = ${f(T.cell)};                 // laid at PRINT_ANGLE, the page's 15 degrees
const float CELL2 = ${f(T.cell2)};
const float ANGLE2 = ${f(T.angle2)};
const float DOLLY_FULL = ${f(T.dolly)};
const float GAP_FROM = ${f(T.gapFrom)};
const float GAP_LEN = ${f(T.gapLen)};
const float LEAF_FROM = ${f(T.leafFrom)};
const float LEAF_SPREAD = ${f(T.leafSpread)};
const float LEAF_LEN = ${f(T.leafLen)};
const float FIG_FROM = ${f(T.figFrom)};
const float FIG_LEN = ${f(T.figLen)};
const float LAG_OFFSET = ${f(T.lagOffset)};
const float LAG_SMEAR = ${f(T.lagSmear)};
const float SCREEN_R = ${f(T.screenR)};
const vec2 GAP_C = vec2(${f(gap.x + gap.w / 2)}, ${f(gap.y + gap.h / 2)});   // the canopy's sky gap, canopy painting uv
const vec2 GAP_R = vec2(${f(gap.w / 2)}, ${f(gap.h / 2)});

// A dot cell's arrival 0..1: when the application's dots have grown to take it. 'sk' is how much the
// canopy there is sky. Sky and clouds first; branches by their distance from the gap's inner edge,
// bitten by two decorrelated fields; the figure, the steps and the fruit last.
float arrival(vec2 uvC, float tt, float tm, out float sk) {
  vec2 ptc = toCanopy(uvC);
  sk = skyMask(texture2D(uCanopy, ptc).rgb);
  float ca = uCanopySize.x / uCanopySize.y;
  vec2 pq = vec2(ptc.x * ca, ptc.y);
  float n1 = fbm4(pq * 3.1 + vec2(4.7, 1.3)) - 0.5;
  float n2 = fbm4(pq * 9.0 - vec2(2.0, 5.0) + tm * 0.02) - 0.5;
  float eb = length((ptc - GAP_C) / GAP_R) + n1 * 0.55 + n2 * 0.18;
  float delay = mix(LEAF_FROM + LEAF_SPREAD * smoothstep(0.95, 2.3, eb), GAP_FROM, sk);
  float len = mix(LEAF_LEN, GAP_LEN, sk);
  vec2 pa = toApp(uvC);
  float fig = max(rectSoft(pa, uFigure, 0.05, n1 * 0.06), rectSoft(pa, uSteps, 0.03, n2 * 0.05));
  delay = mix(delay, FIG_FROM, fig);
  len = mix(len, FIG_LEN, fig);
  float x = clamp((tt - delay) / len, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  float ar = uRes.x / uRes.y;
  canopyFrame(tm);
  appFrame(tm);

  if (uClock < 0.0005) {
    gl_FragColor = vec4(clamp(canopyScene(uv, frag, tm, vec2(0.0), 0.0) + canopyGrain(frag, tm), 0.0, 1.0), 1.0);
    return;
  }

  float cellPx = CELL * uDpr;
  vec2 cid;
  vec2 loc;
  vec2 uvC;
  screenCell(frag, cellPx, PRINT_ANGLE, cid, loc, uvC);
  float sk;
  float m = arrival(uvC, uClock, tm, sk);
  if (m > 0.0 && m < 1.0) PROBE(0.0);   // the e2e probe: a cell mid-arrival is the cut's crest

  // The application, pushed in about the gap's centre and still catching up with its edge: offset
  // the way the front travels (outward from the gap) and smeared along it, settling as it lands.
  // The point it is pushed in about drifts a few percent sideways while the push is on (rule 7),
  // as every other push on the page does, and is the gap's centre again once it has settled.
  float push = (uDolly - 1.0) / (DOLLY_FULL - 1.0);
  vec2 o = uncover(GAP_C, uCanopySize, uCanPan, gKz) + vec2(0.03, 0.01) * push;

  vec3 col;
  if (m >= 1.0) {
    // Fast path (rule 14): the cell has arrived. The lag is 0, the print-in is the painting exactly
    // and the bare screen's radius is 0, so this is the landed painting in one tap: no canopy, no
    // tone, no screen.
    col = texture2D(uApp, toApp(dollyAbout(uv, o, uDolly))).rgb * scrimMul(uv);
  } else {
    vec3 A = canopyScene(uv, frag, tm, vec2(0.0), 0.0);
    if (m <= 0.0) {
      // Fast path (rule 14): nothing has arrived at this cell. The print-in on its ground is the
      // canopy exactly (no dot, the gaps' threshold never reached), so the painting is not read.
      col = A;
    } else {
      vec2 rel = aspectUV(uv) - aspectUV(o);
      vec2 dir = rel / max(length(rel), 1.0e-4);
      vec2 dirUV = vec2(dir.x / ar, dir.y);
      float lag = (1.0 - m) * (1.0 - m);
      vec2 pB = toApp(dollyAbout(uv - dirUV * (lag * LAG_OFFSET), o, uDolly));
      vec2 dp = dirUV * coverScale(uAppSize) / (gAz * uDolly);
      vec3 B = appSmear(pB, dp, lag * LAG_SMEAR) * scrimMul(uv);

      // The painting's tone at the cell: its centre and four taps round it.
      vec2 ptC = toApp(dollyAbout(uvC, o, uDolly));
      vec2 dPu = cellPx * 0.32 / uRes * coverScale(uAppSize) / (gAz * uDolly);
      vec3 tone = (texture2D(uApp, ptC).rgb * 0.4
                 + (texture2D(uApp, ptC + vec2(dPu.x, 0.0)).rgb + texture2D(uApp, ptC - vec2(dPu.x, 0.0)).rgb
                  + texture2D(uApp, ptC + vec2(0.0, dPu.y)).rgb + texture2D(uApp, ptC - vec2(0.0, dPu.y)).rgb) * 0.15)
                 * scrimMul(uvC);

      // The shared print-in: the dots grow with the arrival until they merge, the gaps between them
      // take the painting through the printed threshold, the dots dissolve into it last. m = 0 is
      // the canopy, m = 1 the painting, exactly.
      col = printIn(A, tone, B, m, loc, cid, cellPx, frag);
    }

    // The bare screen over the sky gap: the same dots, small, in a lighter blue, and a second screen
    // a hair finer and turned a few degrees more, so the two beat against each other (and against
    // the pixel grid). It comes up with the cut and gives way to the clouds as they print in.
    if (uScreen > 0.002) {
      vec2 cid2;
      vec2 loc2;
      vec2 uvC2;
      float cell2 = CELL2 * uDpr;
      screenCell(frag, cell2, ANGLE2, cid2, loc2, uvC2);
      float sk2 = skyMask(texture2D(uCanopy, toCanopy(uvC2)).rgb);
      float r1 = SCREEN_R * uScreen * sk * (1.0 - m);
      float r2 = SCREEN_R * 0.8 * uScreen * sk2 * (1.0 - m);
      if (max(r1, r2) > 0.0) PROBE(0.0);   // the e2e probe: the gap's bare screen is crest too
      float aa = 0.75 / cellPx;
      float d1 = (1.0 - smoothstep(r1 - aa, r1 + aa, length(loc))) * smoothstep(0.0, 0.05, r1);
      float aa2 = 0.75 / cell2;
      float d2 = (1.0 - smoothstep(r2 - aa2, r2 + aa2, length(loc2))) * smoothstep(0.0, 0.05, r2);
      float bare = (d1 + d2 - d1 * d2) * (1.0 - max(dotGrow(m, loc, cid, cellPx), printGaps(m, frag)));
      col = mix(col, mix(col, uSkySoft, 0.55), bare * 0.85);
    }
  }
  gl_FragColor = vec4(clamp(col + canopyGrain(frag, tm), 0.0, 1.0), 1.0);
}
`;

/** The rise: the sapling prints in from its trunk foot while the halftone cloud crosses behind it. */
export const RISE_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
${APP_GLSL}
uniform sampler2D uSapling;   // the sapling still (the same 16:9 frame as the application)
uniform vec2 uSaplingSize;
uniform float uFront;         // the print-in front's reach R(t), painting heights
uniform float uCloudX;        // the halftone cloud's left end, painting heights
uniform vec4 uTree;           // the sapling's box, painting units
uniform vec2 uFoot;           // the trunk's foot, painting units

const float UP_K = ${f(T.upK)};
const float SIDE_K = ${f(T.sideK)};
const float N1_AMP = ${f(T.n1Amp)};
const float N2_AMP = ${f(T.n2Amp)};
const float BAND = ${f(T.band)};
const float SAP_CELL = ${f(T.saplingCell)};
const float SAP_LAG = ${f(T.saplingLag)};
const float CLOUD_SIZE_R = ${f(T.cloudSize)};
const float CLOUD_BASE_R = ${f(T.cloudBase)};

// The print-in front at a painting point: the distance from the trunk's foot (height above it and
// sideways, in painting heights) less the reach, bitten by two decorrelated fields (rule 1).
// Negative behind the front, where the sapling is printed.
float front(vec2 pt, float tm) {
  float ap = uAppSize.x / uAppSize.y;
  vec2 q = vec2((pt.x - uFoot.x) * ap, pt.y - uFoot.y);
  float d = -q.y * UP_K + abs(q.x) * SIDE_K;
  return d - uFront + bite2(q, 5.0, N1_AMP, 14.0, N2_AMP, vec2(3.1, 7.7), vec2(-4.0, 2.0) + vec2(0.0, uFront * 2.0) + tm * 0.02);
}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  float ap = uAppSize.x / uAppSize.y;
  appFrame(tm);

  vec2 pt = toApp(uv);
  vec3 plain = texture2D(uApp, pt).rgb;
  vec3 col = plain * scrimMul(uv);

  // The halftone cloud behind the sapling, in the painting's coordinates, over its sky only.
  {
    float cellPx = CLOUD_CELL * uDpr;
    vec2 cpt = toApp(cloudCellUV(floor(frag / cellPx), cellPx));
    float cov = cloud(vec2(cpt.x * ap, cpt.y), vec2(uCloudX, CLOUD_BASE_R), CLOUD_SIZE_R, 41.0, cloudSway(CLOUD_SIZE_R, 41.0, tm));
    if (cov > 0.0) col = mix(col, uMilk, cloudDot(frag, cellPx, cov) * skyMask(plain) * 0.94);
  }

  // The sapling, only inside its box (everything else is the painting: rule 14).
  vec2 edge = max(uTree.xy - pt, pt - (uTree.xy + uTree.zw));
  if (max(edge.x, edge.y) < 0.03) {
    float cellPx = SAP_CELL * uDpr;
    vec2 cid;
    vec2 loc;
    vec2 uvC;
    screenCell(frag, cellPx, PRINT_ANGLE, cid, loc, uvC);
    vec2 ptC = toApp(uvC);

    // The front at the cell's centre, and the coverage it gives the cell.
    float fc = front(ptC, tm);
    if (uFront < 0.5) PROBE_ZONE(fc, BAND, 0.3);   // the e2e probe: the band ahead, the lag behind
    float cov = clamp(-fc / BAND, 0.0, 1.0);
    if (cov > 0.0) {
      // The sapling catching up with its front: displaced back toward its foot, smeared the way it grows.
      float lag = exp(-max(-fc, 0.0) / 0.10);
      vec2 pS = pt - vec2(0.0, lag * SAP_LAG);
      vec3 sp = texture2D(uSapling, pS).rgb * 0.30
              + texture2D(uSapling, pS + vec2(0.0, lag * SAP_LAG * 0.25)).rgb * 0.25
              + texture2D(uSapling, pS + vec2(0.0, lag * SAP_LAG * 0.50)).rgb * 0.20
              + texture2D(uSapling, pS + vec2(0.0, lag * SAP_LAG * 0.75)).rgb * 0.15
              + texture2D(uSapling, pS + vec2(0.0, lag * SAP_LAG)).rgb * 0.10;
      // What is sapling and not sky, inside its box.
      // (its marble, a bright and unsaturated stripe at the foot, is the application's steps already)
      float mx = max(sp.r, max(sp.g, sp.b));
      float marble = smoothstep(0.50, 0.70, luma(sp)) * (1.0 - smoothstep(0.14, 0.34, (mx - min(sp.r, min(sp.g, sp.b))) / max(mx, 1.0e-3)));
      float pm = rectSoft(pS, uTree, 0.004, 0.0) * smoothstep(0.15, 0.55, 1.0 - skyMask(sp)) * (1.0 - marble);
      vec2 dPu = cellPx * 0.32 / uRes * coverScale(uAppSize) / gAz;
      vec3 tone = texture2D(uSapling, ptC).rgb * 0.4
                + (texture2D(uSapling, ptC + vec2(dPu.x, 0.0)).rgb + texture2D(uSapling, ptC - vec2(dPu.x, 0.0)).rgb
                 + texture2D(uSapling, ptC + vec2(0.0, dPu.y)).rgb + texture2D(uSapling, ptC - vec2(0.0, dPu.y)).rgb) * 0.15;
      // The shared print-in, inside the sapling's own silhouette only.
      col = mix(col, printIn(col, tone, sp, cov, loc, cid, cellPx, frag), pm);
    }
  }
  gl_FragColor = vec4(clamp(col + appGrain(frag, tm), 0.0, 1.0), 1.0);
}
`;
