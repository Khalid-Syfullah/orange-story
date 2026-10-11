// The hero fragment shader: the hero loop through cover(), then everything the shader adds to it.
//
// Layers, in order (all in the painting's own coordinates so they stay glued to it through parallax,
// the scroll push and the rest-state drift):
//   1. the loop, sampled through dolly(cover(uv)) + parallax, with the ring's radial displacement
//   2. halftone clouds in the open sky (three instances, masked to the sky by the loop's own blue;
//      the cloud shape and the dot screen are the shared chunk in ../clouds.ts)
//   3. the halftone pour from the spout to the step below it
//   4. the rainbow glint on the peel
//   5. the print-in from the orange (a halftone screen that grows until the dots merge)
//   6. the signal ring, then vignette, copy protection and grain, all multiplied by the print-in
//      driver so nothing switches on (rule 3)
// Scroll-driven state is a function of uP/uT; time only feeds breath, the glint, the pour, the
// grain and the two events (print-in, ring).
import { CLOUDS_GLSL } from "../clouds";
import { POUR_GLSL } from "../pour";
import { REST_GLSL } from "../rest";

// HERO_LIB is everything but main(): the bridge pass reuses it so the film it hands over from is
// exactly the hero (clouds, glint, pour, grain and all), never a copy of it.
export const HERO_LIB = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
${POUR_GLSL}
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
    ringBand = crestBand(rd - rad, -0.015 * rad, 0.0011);      // the chroma splits +-1.5% along the radius
    vec2 dirR = radial / max(rd, 1.0e-4);
    uvS -= vec2(dirR.x * uRes.y / uRes.x, dirR.y) * ringBand.g * ringEnv * 0.006;
  }

  // ---- the print-in front: bitten by two decorrelated fbm fields (rule 1), printed by the screen --
  // The coverage is read at the centre of this pixel's halftone cell (the shared print-in, 9 px cells
  // at the page's 15 degrees), so every dot is a clean circle; the lag is this pixel's own.
  float lag = 0.0;
  vec2 lagDir = vec2(0.0);
  vec2 oq = toScreenA(uAOrange);
  float printCell = 9.0 * uDpr;
  float cov = 1.0;
  vec2 pcid = vec2(0.0);
  vec2 ploc = vec2(0.0);
  vec2 pcuv = vec2(0.0);
  if (uIntro < 1.0) {
    float asp = uRes.x / uRes.y;
    vec2 far = vec2(max(oq.x, asp - oq.x), max(oq.y, 1.0 - oq.y));
    float a = uIntro * uIntro * (3.0 - 2.0 * uIntro);
    // The bite's mean of 0.2 is kept out of the front so nothing is printed at a = 0.
    float front = length(q - oq) / length(far) + 0.2 - a * 1.95 + bite2(q, 2.2, 0.30, 7.0, 0.10, vec2(3.1), vec2(11.7));
    // The picture arrives moving: it catches up with the front it was printed behind (rules 5, 6).
    lag = exp(-max(-front, 0.0) / 0.25) * (1.0 - smoothstep(0.75, 1.0, uIntro));
    lagDir = (q - oq) / max(length(q - oq), 1.0e-3);
    screenCell(frag, printCell, PRINT_ANGLE, pcid, ploc, pcuv);
    vec2 qC = aspectUV(pcuv);
    float frontC = length(qC - oq) / length(far) + 0.2 - a * 1.95 + bite2(qC, 2.2, 0.30, 7.0, 0.10, vec2(3.1), vec2(11.7));
    cov = clamp(-frontC / 0.42, 0.0, 1.0);
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
  float sky = skyMask(base);

  // ---- 2. halftone clouds in painting coordinates ----------------------------------------------
  // Cells 6.5 px x dpr; coverage is sampled at the cell centre, dot radius sqrt(coverage) * 0.64.
  if (sky > 0.0) {
    float cellPx = CLOUD_CELL * uDpr;
    vec2 cpp = toPaint(cloudCellUV(floor(frag / cellPx), cellPx));
    vec2 pa = vec2(cpp.x * aspect, cpp.y);
    // Each instance sways on the shared cloudSway (periods from its size, the larger slower, phase
    // from its seed: rules 9, 13); the scroll drift falls with size too.
    vec2 swayA = cloudSway(0.30, 1.0, tm) + vec2(-uHeroT * 0.012 / (0.3 + 0.30 * 2.0), 0.0);
    vec2 swayB = cloudSway(0.13, 2.0, tm) + vec2(-uHeroT * 0.012 / (0.3 + 0.13 * 2.0), 0.0);
    vec2 swayC = cloudSway(0.12, 3.0, tm) + vec2(-uHeroT * 0.012 / (0.3 + 0.12 * 2.0), 0.0);
    float cov = cloud(pa, vec2(0.47 * aspect, 0.15), 0.30, 1.0, swayA);
    cov = max(cov, cloud(pa, vec2(0.83 * aspect, 0.22), 0.13, 2.0, swayB));
    cov = max(cov, cloud(pa, vec2(0.405 * aspect, 0.455), 0.12, 3.0, swayC) * uCloud3);
    float m = cloudDot(frag, cellPx, cov) * sky;
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

  // ---- 5. the print-in: dots grow on the orange ground until they merge into the picture ---------
  if (uIntro < 1.0) {
    vec3 cCol = texture2D(uHero, toPaint(pcuv)).rgb;
    col = printIn(uOrange, cCol, col, cov, ploc, pcid, printCell, frag);
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
  col += filmGrain(frag, tm, 0.03) * drv;

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
