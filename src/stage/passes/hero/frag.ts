// The hero fragment shader: the hero loop through cover(), then everything the shader adds to it.
//
// Layers, in order (all in the painting's own coordinates so they stay glued to it through parallax,
// the scroll push and the rest-state drift):
//   1. the loop, sampled through dolly(cover(uv)) + parallax, with the ring's radial displacement
//   2. halftone clouds in the open sky (three instances, masked to the sky by the loop's own blue)
//   3. the halftone pour from the spout to the step below it
//   4. the rainbow glint on the peel
//   5. the print-in from the orange (a halftone screen that grows until the dots merge)
//   6. the signal ring, then vignette, copy protection and grain, all multiplied by the print-in
//      driver so nothing switches on (rule 3)
// Scroll-driven state is a function of uP/uT; time only feeds breath, the glint, the pour, the
// grain and the two events (print-in, ring).
import { REST_GLSL } from "../rest";

// HERO_LIB is everything but main(): the bridge pass reuses it so the film it hands over from is
// exactly the hero (clouds, glint, pour, grain and all), never a copy of it.
export const HERO_LIB = /* glsl */ `
${REST_GLSL}
uniform sampler2D uHero;
uniform vec2 uHeroSize;
uniform vec2 uPan;
uniform float uZoom;
uniform vec2 uAGlint, uASpout, uAPourEnd, uAOrange;   // painting points, 0..1, y down
uniform float uPush;      // scroll push-in, 0.. (about the orange)
uniform float uHeroT;     // how far the hero's scroll drift has run (1 at the end of the hero)
uniform float uIntro;     // 0..1 print-in progress, 1 = complete
uniform float uRingAge;   // seconds since the ring left, -1 = none
uniform float uPhone;     // 0 wide .. 1 tall phone
uniform float uCloud3;    // 0 hides the third (lower) cloud on tall phones

const float TAU = 6.2831853;

// The mapping between screen and painting, set once per fragment in main().
float gZoom;
vec2 gOff;
float gS;
vec2 gO;

vec2 toPaint(vec2 uv) { return cover(dollyAbout(uv, gO, gS), uHeroSize, uPan, gZoom) + gOff; }

// Painting point -> aspect-corrected screen coordinates (the exact inverse of toPaint).
vec2 toScreenA(vec2 P) {
  vec2 u0 = uncover(P - gOff, uHeroSize, uPan, gZoom);
  return aspectUV(gO + (u0 - gO) * gS);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// One cloud: smooth-min circles bitten by fbm with a flat underside, as coverage 0..1.
// 'pa' is a painting point in height units (x scaled by the painting's aspect), 'c' the left end of
// the flat base, 'sc' the cloud's size in the same units.
float cloud(vec2 pa, vec2 c, float sc, float seed, vec2 sway) {
  vec2 q = (pa - c - sway) / sc;
  if (q.x < -0.9 || q.x > 2.0 || q.y < -1.05 || q.y > 0.2) return 0.0;
  float j = seed * 7.31;
  float d = 1.0e3;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 cc = vec2(fi * 0.30 - 0.05 + (hash(j + fi) - 0.5) * 0.16,
                   -0.20 - 0.18 * sin(fi * 1.9 + j) - 0.06 * hash(j + fi * 2.3));
    float r = 0.20 + 0.12 * hash(j + fi * 3.1 + 5.0);
    d = smin(d, length(q - cc) - r, 0.16);
  }
  d += (fbm(q * 3.4 + j, 3) - 0.5) * 0.34;
  d = max(d, q.y);                                   // flat underside
  float cov = smoothstep(0.02, -0.16, d);
  cov *= mix(0.45, 1.0, smoothstep(0.0, -0.55, q.y)); // lit from above: denser dots on top
  return cov;
}

// The pour: halftone rows leaving the spout, advancing 13 cells per second, hash-thinned, denser on
// the centre line and dying over the last 20% of the length.
vec3 pour(vec3 col, vec2 q, vec2 A, vec2 B, float tm) {
  vec2 ax = B - A;
  float L = length(ax);
  if (L < 1.0e-4) return col;
  vec2 dir = ax / L;
  vec2 rel = q - A;
  float s = dot(rel, dir);
  float n = dot(rel, vec2(-dir.y, dir.x));
  float cell = 4.6 * uDpr / uRes.y;
  if (s < -cell || s > L + cell || abs(n) > 0.05) return col;
  float row = floor(s / cell - 13.0 * tm);
  float stag = mod(row, 2.0) * 0.5;
  float ci = floor(n / cell + stag);
  float cs = (row + 0.5 + 13.0 * tm) * cell;           // the cell centre, along and across
  float cn = (ci + 0.5 - stag) * cell;
  float f = cs / L;
  float hw = 0.010 + 0.007 * f;
  float cw = exp(-(cn * cn) / (hw * hw));              // denser on the centre line
  float dens = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.8, 1.0, f));
  float keep = step(hash(vec2(row, ci)), cw * dens * 1.1);
  float rad = (0.30 + 0.16 * hash(vec2(ci, row) + 3.7)) * (0.55 + 0.45 * cw);
  float dd = length(vec2(s - cs, n - cn)) / cell;
  float m = (1.0 - smoothstep(rad - 0.12, rad + 0.12, dd)) * keep;
  vec3 water = mix(uSkySoft, uMilk, 0.75);
  return mix(col, water, m * 0.92);
}

// Sets the mapping globals from the rest state and the scroll push (call once per fragment).
void heroFrame() {
  float tm = uTime * (1.0 - uStill);
  gZoom = restZoom(uZoom, tm);
  gOff = restOffset(tm);
  gO = uncover(uAOrange, uHeroSize, uPan, gZoom);
  gS = 1.0 + uPush;
}

// The hero as it is at this screen position: the whole look, ending in grain. heroFrame() first.
vec3 heroColor(vec2 uv, vec2 frag) {
  vec2 q = aspectUV(uv);
  float tm = uTime * (1.0 - uStill);
  float aspect = uHeroSize.x / uHeroSize.y;

  vec2 glintQ = toScreenA(uAGlint);

  // ---- the ring: per-channel bands so the chroma splits +-1.5% along the radius ------------------
  float ringEnv = 0.0;
  vec3 ringBand = vec3(0.0);
  vec2 radial = q - glintQ;
  float rd = length(radial);
  vec2 uvS = uv;
  if (uRingAge >= 0.0) {
    float n = clamp(uRingAge / 1.7, 0.0, 1.0);
    float rad = 1.35 * (1.0 - pow(1.0 - n, 2.2));
    ringEnv = smoothstep(0.0, 0.08, n) * pow(1.0 - n, 1.5);
    vec3 x = vec3(rd - rad * 1.015, rd - rad, rd - rad * 0.985);
    ringBand = exp(-x * x / 0.0011);
    vec2 dirR = radial / max(rd, 1.0e-4);
    uvS -= vec2(dirR.x * uRes.y / uRes.x, dirR.y) * ringBand.g * ringEnv * 0.006;
  }

  // ---- the print-in front: bitten by two decorrelated fbm fields (rule 1), printed by Bayer ------
  float v = 1.0;
  float lag = 0.0;
  vec2 lagDir = vec2(0.0);
  vec2 oq = toScreenA(uAOrange);
  if (uIntro < 1.0) {
    float asp = uRes.x / uRes.y;
    vec2 far = vec2(max(oq.x, asp - oq.x), max(oq.y, 1.0 - oq.y));
    float d = length(q - oq) / length(far);
    float a = uIntro * uIntro * (3.0 - 2.0 * uIntro);
    float front = d - a * 1.95 + fbm4(q * 2.2 + 3.1) * 0.30 + fbm4(q * 7.0 + 11.7) * 0.10;
    v = clamp((-front + (bayer4(frag) - 0.5) * 0.10) / 0.42, 0.0, 1.0);
    // The picture arrives moving: it catches up with the front it was printed behind (rules 5, 6).
    lag = exp(-max(-front, 0.0) / 0.25) * (1.0 - smoothstep(0.75, 1.0, uIntro));
    lagDir = (q - oq) / max(length(q - oq), 1.0e-3);
  }

  // ---- 1. the loop -----------------------------------------------------------------------------
  vec2 pp = toPaint(uvS);
  vec3 base;
  if (lag > 0.002) {
    vec2 dv = vec2(lagDir.x * uRes.y / uRes.x, lagDir.y) * coverScale(uHeroSize) / gZoom;
    base = smear5(uHero, pp - dv * lag * 0.02, dv, lag * 0.03);
  } else {
    base = texture2D(uHero, pp).rgb;
  }
  vec3 col = base;
  float sky = smoothstep(0.08, 0.22, base.b - max(base.r, base.g));

  // ---- 2. halftone clouds in painting coordinates ----------------------------------------------
  // Cells 6.5 px x dpr; coverage is sampled at the cell centre, dot radius sqrt(coverage) * 0.64.
  if (sky > 0.0) {
    float cellPx = 6.5 * uDpr;
    vec2 cid = floor(frag / cellPx);
    vec2 cuv = vec2((cid.x + 0.5) * cellPx, uRes.y - (cid.y + 0.5) * cellPx) / uRes;
    vec2 cpp = toPaint(cuv);
    vec2 pa = vec2(cpp.x * aspect, cpp.y);
    // Larger clouds are slower: sway periods 47 / 31 / 23 s, scroll drift falls with size.
    vec2 swayA = vec2(0.012 * (sin(tm * TAU / 47.0 + 1.0) + 0.5 * sin(tm * TAU / 29.5 + 2.0)), 0.002 * sin(tm * TAU / 37.0))
               + vec2(-uHeroT * 0.012 / (0.3 + 0.30 * 2.0), 0.0);
    vec2 swayB = vec2(0.008 * (sin(tm * TAU / 31.0 + 4.0) + 0.5 * sin(tm * TAU / 19.5 + 0.5)), 0.0015 * sin(tm * TAU / 26.0 + 2.0))
               + vec2(-uHeroT * 0.012 / (0.3 + 0.13 * 2.0), 0.0);
    vec2 swayC = vec2(0.006 * (sin(tm * TAU / 23.0 + 2.5) + 0.5 * sin(tm * TAU / 14.5 + 3.0)), 0.001 * sin(tm * TAU / 17.0 + 1.0))
               + vec2(-uHeroT * 0.012 / (0.3 + 0.12 * 2.0), 0.0);
    float cov = cloud(pa, vec2(0.47 * aspect, 0.15), 0.30, 1.0, swayA);
    cov = max(cov, cloud(pa, vec2(0.83 * aspect, 0.22), 0.13, 2.0, swayB));
    cov = max(cov, cloud(pa, vec2(0.33 * aspect, 0.50), 0.12, 3.0, swayC) * uCloud3);
    float r = sqrt(cov) * 0.64 * (1.0 + 0.015 * uKick);
    float aa = 0.75 / cellPx;
    float dist = length(frag / cellPx - cid - 0.5);
    float m = (1.0 - smoothstep(r - aa, r + aa, dist)) * smoothstep(0.0, 0.05, r) * sky;
    col = mix(col, uMilk, m * 0.94);
  }

  // ---- 3. the pour ------------------------------------------------------------------------------
  col = pour(col, q, toScreenA(uASpout), toScreenA(uAPourEnd), tm);

  // ---- 4. the rainbow glint: anisotropic gaussian, screen-blended with a warm halo ---------------
  {
    // A 5.3 s cycle with a hashed amplitude per cycle, so no two pulses are alike (rule 10).
    float cyc = tm / 5.3;
    float cf = fract(cyc);
    float pulse = smoothstep(0.0, 0.2, cf) * (1.0 - smoothstep(0.6, 1.0, cf));
    pulse *= 0.78 + 0.22 * hash(floor(cyc) + 3.0);
    pulse = mix(pulse, 0.85, uStill);
    pulse *= 1.0 + 0.15 * uKick * (1.0 - uStill);
    vec2 r = q - glintQ;
    // Horizontal slips, hashed per band and per 0.45 s.
    float band = floor(r.y / 0.014);
    float slot = floor(tm / 0.45);
    float slip = (hash(vec2(band, slot)) - 0.5) * 2.0 * step(0.62, hash(vec2(band + 40.0, slot)));
    r.x += slip * 0.03 * (1.0 - uStill);
    float ang = -0.6;
    vec2 e = vec2(cos(ang) * r.x + sin(ang) * r.y, -sin(ang) * r.x + cos(ang) * r.y);
    float g = exp(-(e.x * e.x) / (2.0 * 0.07 * 0.07) - (e.y * e.y) / (2.0 * 0.012 * 0.012));
    vec3 spec = 0.5 + 0.5 * cos(TAU * (e.x * 5.0 + 0.08 * tm + vec3(0.0, 0.33, 0.67)));
    spec = clamp((spec - 0.5) * 1.7 + 0.5, 0.0, 1.0);   // saturate: pale pastel vanishes on the orange
    vec3 halo = vec3(1.0, 0.80, 0.52) * exp(-dot(radial, radial) / (2.0 * 0.06 * 0.06)) * 0.30;
    vec3 add = clamp((spec * g * 0.9 + halo) * pulse, 0.0, 1.0);
    col = 1.0 - (1.0 - col) * (1.0 - add);
  }

  // ---- 5. the print-in: dots grow from nothing until they merge --------------------------------
  if (uIntro < 1.0) {
    float cell = 9.0 * uDpr;
    float ca = 0.31;
    mat2 rot = mat2(cos(ca), -sin(ca), sin(ca), cos(ca));
    vec2 rf = rot * frag / cell;
    vec2 rid = floor(rf);
    mat2 irot = mat2(cos(ca), sin(ca), -sin(ca), cos(ca));   // the inverse rotation
    vec2 centreFrag = irot * ((rid + 0.5) * cell);
    vec2 cuv = vec2(centreFrag.x, uRes.y - centreFrag.y) / uRes;
    vec3 cCol = texture2D(uHero, toPaint(cuv)).rgb;
    float rad = 0.76 * v;
    float dd = length(rf - rid - 0.5);
    float aa = 0.9 / cell;
    float dot_ = (1.0 - smoothstep(rad - aa, rad + aa, dd)) * smoothstep(0.0, 0.05, rad);
    vec3 inner = mix(cCol, col, smoothstep(0.30, 0.65, rad));
    col = mix(uOrange, inner, dot_);
  }

  // ---- 6. ring, then vignette, copy protection and grain (all ride the print-in driver) --------
  float drv = smoothstep(0.35, 1.0, uIntro);
  if (uRingAge >= 0.0) {
    vec3 dith = step(vec3(bayer4(frag)), ringBand * ringBand);   // the crest prints as stipple
    vec3 tone = (ringBand * 0.34 + dith * 0.42) * ringEnv;
    col = 1.0 - (1.0 - col) * (1.0 - tone * vec3(1.0, 0.97, 0.92));
  }
  vec2 vq = (uv - vec2(0.55, 0.42)) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(0.55, 1.25, length(vq * vec2(0.85, 1.1)));
  col = mix(col, col * vec3(0.42, 0.50, 0.72), vig * 0.55 * drv);
  // Copy protection: the lower left (the whole lower edge on phones) and the top of a phone sit in
  // a soft blue shade so the milk copy reads over marble and orange.
  float lowL = smoothstep(0.58, 1.0, uv.y) * mix(1.0 - smoothstep(0.10, 0.62, uv.x), 1.0, uPhone);
  float topP = (1.0 - smoothstep(0.0, 0.34, uv.y)) * uPhone;
  col = mix(col, uSky * 0.55, clamp(lowL * 0.62 + topP * 0.5, 0.0, 0.8) * drv);
  // Film grain, +-1.5%, re-hashed every 1/24 s.
  float gr = hash(frag + floor(tm * 24.0) * vec2(37.1, 17.3)) - 0.5;
  col += gr * 0.03 * drv;

  return clamp(col, 0.0, 1.0);
}
`;

export const HERO_FRAG = /* glsl */ `
${HERO_LIB}
void main() {
  heroFrame();
  gl_FragColor = vec4(heroColor(screenUV(), gl_FragCoord.xy), 1.0);
}
`;
