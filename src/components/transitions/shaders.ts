import { colors } from "@/styles/tokens";

import { DUST, FABRIC, RING, SAND, UNFOLD, type CanvasKind } from "./choreography";

/**
 * Fragment shaders of the transition canvas: one full-screen pass per transition, drawing
 * premultiplied color over the stage (transparent where the scene shows through). Fronts, folds and
 * radii arrive as uniforms from `choreography.ts`; the shaders only add texture: ragged edges, sand
 * grain, dust specks, paper fibre, fold shading, the spectral band, the cloth ripple and the cloud.
 *
 * Coordinates: `st` runs 0 to 1 across and down the screen (y down, like the stage), `P` is the same
 * in screen heights. Noise is bounded to -1..1 (`snoise`): the bounds in `choreography.ts` (`ragged`,
 * `soft`, `lead`, ...) are pasted in below, so every effect is exactly clear at its start and end.
 * Idle time (`uTime`) only moves grains and specks and the cloth's ripple, never a front.
 */

/** A GLSL float literal. */
const f = (n: number) => {
  const s = Number(n.toFixed(6)).toString();
  return /[.e]/.test(s) ? s : `${s}.0`;
};

/** A palette color as an sRGB GLSL vec3. */
function rgb(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return `vec3(${c.map(f).join(", ")})`;
}

export const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uTime;
uniform float uT;
uniform float uEnter;
uniform float uExit;

const vec3 SKY = ${rgb(colors.sky)};
const vec3 SKY_SOFT = ${rgb(colors.skySoft)};
const vec3 MILK = ${rgb(colors.milk)};
const vec3 INK = ${rgb(colors.ink)};
const vec3 MARBLE = ${rgb(colors.marble)};
const vec3 WHITE = ${rgb(colors.white)};

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* Four octaves: 0 to 0.9375, around 0.47. */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 19.7;
    a *= 0.5;
  }
  return v;
}

/* Signed noise, bounded to -1..1 (the choreography's ragged bounds rely on it). */
float snoise(vec2 p) {
  return clamp((fbm(p) - 0.47) * 3.4, -1.0, 1.0);
}

vec2 screenUv() {
  return vec2(vUv.x, 1.0 - vUv.y);
}

float screenAspect() {
  return uResolution.x / uResolution.y;
}

/* CSS px from the top left of the stage. */
vec2 cssPx() {
  return screenUv() * uResolution / uDpr;
}

/* Premultiplied "over". */
vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

/*
 * Round particles, at most one per cell of a grid in CSS px (the grid moves with the caller's q).
 * chance (0..1) is the share of cells that hold one; each fades in as chance passes its own threshold.
 * stretch elongates along dir (motion streaks). Returns (alpha, a random number for the particle).
 */
vec2 particle(vec2 q, float cell, float radius, float soft, float chance, vec2 dir, float stretch, float seed) {
  vec2 id = floor(q / cell);
  vec3 r = hash32(id + seed);
  float present = smoothstep(r.x, r.x + 0.12, chance);
  if (present <= 0.0) return vec2(0.0);
  vec2 d = q - (id + 0.25 + 0.5 * r.yz) * cell;
  vec2 e = vec2(dot(d, dir) / stretch, dot(d, vec2(-dir.y, dir.x)));
  float rad = radius * (0.6 + 0.8 * r.z);
  float a = 1.0 - smoothstep(max(rad - soft, 0.0), rad + soft, length(e));
  return vec2(a * present, fract(r.y * 7.13 + r.z * 3.71));
}
`;

/* ------------------------------------------------------------------ */
/* Sand                                                                */
/* ------------------------------------------------------------------ */

const windAngle = (SAND.angle * Math.PI) / 180;

const SAND_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uFront;
uniform float uBack;

const float RAGGED = ${f(SAND.ragged)};
const float SOFT = ${f(SAND.soft)};
const float LEAD = ${f(SAND.lead)};
const float TRAIL = ${f(SAND.trail)};
const vec2 WIND = vec2(${f(Math.cos(windAngle))}, ${f(Math.sin(windAngle))});

void main() {
  vec2 st = screenUv();
  float aspect = screenAspect();
  vec2 P = st * vec2(aspect, 1.0);
  vec2 across = vec2(-WIND.y, WIND.x);

  // The sweep: 0 at the upwind corner of the screen, 1 at the downwind one.
  float c1 = aspect * WIND.x;
  float c2 = WIND.y;
  float lo = min(min(0.0, c1), min(c2, c1 + c2));
  float hi = max(max(0.0, c1), max(c2, c1 + c2));
  float u = dot(P, WIND);
  float v = dot(P, across);
  float s = (u - lo) / (hi - lo);

  // Fine grain, one fleck per CSS pixel, drifting downwind.
  vec2 px = cssPx();
  float width = uResolution.x / uDpr;
  vec2 drift = WIND * (width * 0.9 * uT + 7.0 * uTime);
  float fleck = hash12(floor(px - drift));
  float grain = vnoise((px - drift) * 0.6);

  // Ragged fronts: long streaks along the wind, carried downwind as the sand blows, their edges
  // broken into grains. The mix stays within -1..1, so the fronts keep their bounds.
  float n1 = clamp(0.9 * snoise(vec2(u * 1.1 - uT * 1.4, v * 7.0)) + 0.1 * (2.0 * fleck - 1.0), -1.0, 1.0);
  float n2 = clamp(0.9 * snoise(vec2(u * 1.1 - uT * 1.4 + 11.3, v * 7.0 + 4.1)) + 0.1 * (2.0 * fleck - 1.0), -1.0, 1.0);
  float s1 = s + RAGGED * n1;
  float s2 = s + RAGGED * n2;
  float cover = (1.0 - smoothstep(uFront - SOFT, uFront + SOFT, s1)) * smoothstep(uBack - SOFT, uBack + SOFT, s2);
  float zone = (1.0 - smoothstep(uFront - SOFT, uFront + LEAD, s1)) * smoothstep(uBack - TRAIL, uBack + SOFT, s2);
  float wall = exp(-pow((s1 - uFront) / 0.09, 2.0)) + exp(-pow((s2 - uBack) / 0.09, 2.0));

  // The cover: deep blue sand, flecked and grained, streaked along the wind, lighter where it breaks.
  float streak = snoise(vec2(u * 2.2 - uT * 2.0, v * 28.0));
  vec3 tone = mix(SKY, INK, 0.06 + 0.06 * streak + 0.06 * (1.0 - fleck));
  tone = mix(tone, SKY_SOFT, 0.06 + 0.12 * grain + 0.1 * fleck * fleck + 0.28 * min(wall, 1.0));
  vec4 color = vec4(tone * cover, cover);

  // Loose grains in three sizes: the larger ones are nearer and fly faster. Densest at the wall.
  float density = zone * (0.55 + 0.45 * min(wall, 1.0));
  vec2 g = particle(px - WIND * (width * 1.05 * uT + 11.0 * uTime), 9.0, 0.5, 0.5, 0.8 * density, WIND, 1.6, 3.1);
  color = over(vec4(mix(SKY_SOFT, MILK, g.y), 1.0) * g.x * 0.55, color);
  g = particle(px - WIND * (width * 1.35 * uT + 16.0 * uTime), 14.0, 0.8, 0.5, 0.55 * density, WIND, 2.0, 7.7);
  color = over(vec4(mix(MILK, MARBLE, g.y), 1.0) * g.x * 0.7, color);
  g = particle(px - WIND * (width * 1.75 * uT + 23.0 * uTime), 24.0, 1.2, 0.6, 0.35 * density, WIND, 2.6, 13.3);
  color = over(vec4(mix(MARBLE, SKY_SOFT, g.y * 0.6), 1.0) * g.x * 0.8, color);

  gl_FragColor = color;
}
`;

/* ------------------------------------------------------------------ */
/* Rising dust                                                         */
/* ------------------------------------------------------------------ */

const DUST_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uTop;
uniform float uBottom;

const float RAGGED = ${f(DUST.ragged)};
const float SOFT = ${f(DUST.soft)};
const float LEAD = ${f(DUST.lead)};
const float TRAIL = ${f(DUST.trail)};

void main() {
  vec2 st = screenUv();
  float aspect = screenAspect();
  vec2 P = st * vec2(aspect, 1.0);

  // Billowing edges: plumes of dust, carried upward as it lifts.
  float y1 = st.y + RAGGED * snoise(vec2(P.x * 2.2, P.y * 1.3 + uT * 1.8));
  float y2 = st.y + RAGGED * snoise(vec2(P.x * 2.2 + 6.1, P.y * 1.3 + uT * 1.8 + 2.9));
  float cover = smoothstep(uTop - SOFT, uTop + SOFT, y1) * (1.0 - smoothstep(uBottom - SOFT, uBottom + SOFT, y2));
  float zone = smoothstep(uTop - LEAD, uTop + SOFT, y1) * (1.0 - smoothstep(uBottom - SOFT, uBottom + TRAIL, y2));

  // Blue, a touch deeper toward the ground, catching the light along its rising edge.
  float glow = exp(-pow((y1 - uTop) / 0.08, 2.0)) + 0.6 * exp(-pow((y2 - uBottom) / 0.08, 2.0));
  float haze = fbm(vec2(P.x * 3.0, P.y * 2.0 + uT * 2.4) + 3.3);
  vec3 tone = mix(SKY, INK, 0.1 * st.y);
  tone = mix(tone, SKY_SOFT, 0.16 * haze + 0.4 * min(glow, 1.0));
  tone = mix(tone, MILK, 0.1 * min(glow, 1.0));
  vec4 color = vec4(tone * cover, cover);

  // A faint lit mist just ahead of the edge.
  float mist = max(zone - cover, 0.0) * (0.1 + 0.08 * haze);
  color = over(vec4(SKY_SOFT, 1.0) * mist, color);

  // White specks lifting in the light, three sizes; the larger ones nearer and rising faster.
  vec2 px = cssPx();
  float height = uResolution.y / uDpr;
  vec2 up = vec2(0.0, 1.0);
  vec2 g = particle(px + vec2(3.0 * sin(uTime * 0.7), height * 0.6 * uT + 9.0 * uTime), 12.0, 0.55, 0.5, 0.5 * zone, up, 1.3, 5.3);
  color = over(vec4(WHITE, 1.0) * g.x * 0.7 * (0.65 + 0.35 * sin(uTime * 2.1 + g.y * 6.2832)), color);
  g = particle(px + vec2(4.0 * sin(uTime * 0.5 + 1.7), height * 0.85 * uT + 14.0 * uTime), 20.0, 0.9, 0.6, 0.38 * zone, up, 1.4, 9.1);
  color = over(vec4(mix(WHITE, MILK, g.y), 1.0) * g.x * 0.8 * (0.6 + 0.4 * sin(uTime * 1.6 + g.y * 6.2832)), color);
  g = particle(px + vec2(5.0 * sin(uTime * 0.4 + 3.1), height * 1.15 * uT + 20.0 * uTime), 34.0, 1.3, 1.6, 0.28 * zone, up, 1.3, 17.9);
  color = over(vec4(WHITE, 1.0) * g.x * 0.75 * (0.6 + 0.4 * sin(uTime * 1.2 + g.y * 6.2832)), color);

  gl_FragColor = color;
}
`;

/* ------------------------------------------------------------------ */
/* Paper unfold                                                        */
/* ------------------------------------------------------------------ */

const UNFOLD_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uMilk;
uniform float uOpening;
uniform float uPacket;
uniform float uCenter;
uniform float uLeft;
uniform float uRight;
uniform float uCrease;

const float LEAD = ${f(UNFOLD.lead)};
const float DIST = ${f(UNFOLD.distance)};
const float THIRD = 1.0 / 3.0;

/* Milk paper with a faint fibre and cloud. */
vec3 paper(vec2 P) {
  float fibre = fbm(P * vec2(110.0, 34.0)) - 0.47;
  float cloud = fbm(P * 2.6 + 4.2) - 0.47;
  return MILK * (1.0 + 0.04 * fibre + 0.03 * cloud);
}

/* Inside an edge, softened over about a pixel: 1 inside (margin > 0), 0 outside. */
float inside(float margin, float pixel) {
  return clamp(margin / pixel + 0.5, 0.0, 1.0);
}

void main() {
  vec2 st = screenUv();
  float aspect = screenAspect();
  vec2 P = st * vec2(aspect, 1.0);
  vec3 sheet = paper(P);
  vec2 pixel = 1.0 / uResolution;

  if (uOpening < 0.5) {
    // Covering: the white spreads from the middle until it fills the frame.
    float r = length((st - 0.5) * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
    float a = smoothstep(0.0, 1.0, uMilk * (1.0 + LEAD) - r * LEAD);
    gl_FragColor = vec4(sheet * a, a);
    return;
  }

  float x = st.x;
  float y = st.y;
  float open = 0.0;   // 1 where the new scene shows through
  float ink = 0.0;    // shading laid over the scene where it shows
  float backShade = -1.0; // >= 0 where the back of the lifting panel shows: how dark

  // Middle column, bottom panel: lies flat, under the top panel while that is folded down.
  float col = inside(x - THIRD, pixel.x) * inside(2.0 * THIRD - x, pixel.x);
  float bottomPanel = col * inside(y - 0.5, pixel.y);

  // Middle column, top panel: turns about the middle crease toward the viewer, from PI (folded
  // down on the bottom panel, its back up) to 0 (open, above the crease).
  float c = cos(uCenter);
  float s = sin(uCenter);
  float dy = 0.5 - y;
  float denom = DIST * c + dy * s;
  float lTop = abs(denom) > 1e-5 ? dy * DIST / denom : -1.0;
  float scaleTop = DIST / max(DIST - lTop * s, 1e-3);
  float onTop = inside(lTop, pixel.y) * inside(0.5 - lTop, pixel.y) * inside(scaleTop / 6.0 - abs(x - 0.5), pixel.x);
  if (c < 0.0) {
    // Its back, lifting off the bottom panel: paper, shaded as it tilts.
    backShade = onTop > 0.0 ? 0.2 * s + 0.1 * s * (1.0 - lTop / 0.5) : -1.0;
    open = bottomPanel * (1.0 - onTop);
    // The lifted panel's shadow falls on the bottom panel beside the crease.
    ink = open * 0.28 * s * exp(-(y - 0.5) / 0.08);
  } else {
    // Panels meet at the creases without overlapping: their soft edges add up to exactly 1.
    open = min(bottomPanel + onTop, 1.0);
    ink = onTop * 0.45 * (1.0 - c) * (0.45 + 0.55 * (1.0 - lTop / 0.5));
    ink += bottomPanel * 0.2 * s * exp(-(y - 0.5) / 0.06);
  }

  // Side columns: swing out from behind the middle about the creases, from edge-on to flat.
  for (int k = 0; k < 2; k++) {
    float side = k == 0 ? -1.0 : 1.0;
    float hinge = k == 0 ? THIRD : 2.0 * THIRD;
    float angle = k == 0 ? uLeft : uRight;
    float ca = cos(angle);
    float sa = sin(angle);
    float d = DIST * ca - side * (x - 0.5) * aspect * sa;
    float l = d > 1e-5 ? DIST * side * (x - hinge) / d : -1.0;
    float scale = DIST / (DIST + max(l, 0.0) * aspect * sa);
    float on = inside(l, pixel.x) * inside(THIRD - l, pixel.x) * inside(0.5 * scale - abs(y - 0.5), pixel.y);
    if (ca > 1e-3 && on > 0.0) {
      // Turned away from the light: darker the more it tilts, most toward its outer edge.
      float shade = (1.0 - ca) * (0.32 + 0.38 * l / THIRD) * (k == 0 ? 0.9 : 1.1);
      ink += on * shade;
      open = min(open + on, 1.0);
    }
  }

  // Creases, fading as the sheet settles flat.
  vec2 px = cssPx();
  vec2 size = uResolution / uDpr;
  float creaseH = col * step(0.0, c) * (1.0 - smoothstep(0.6, 1.6, abs(px.y - 0.5 * size.y)));
  float creaseV = (step(uLeft, 1.5) * (1.0 - smoothstep(0.6, 1.6, abs(px.x - THIRD * size.x)))
                 + step(uRight, 1.5) * (1.0 - smoothstep(0.6, 1.6, abs(px.x - 2.0 * THIRD * size.x))));
  float crease = uCrease * 0.22 * min(creaseH + creaseV, 1.0);

  // The open part of the sheet: the scene, shaded, with its creases.
  float shade = clamp(ink + crease, 0.0, 0.85);
  vec4 scene = vec4(INK * shade, shade);

  // The rest: white, with the back of the lifting panel, and the sheet's soft shadow around it.
  float top = c > 0.0 ? 0.5 - 0.5 * c : 0.5;
  float left = THIRD * (1.0 - cos(uLeft));
  float right = 2.0 * THIRD + THIRD * cos(uRight);
  vec2 outside = max(vec2(left - x, x - right) * aspect, 0.0);
  float distance = length(vec2(max(outside.x, outside.y), max(top - y, 0.0)));
  float shadow = uPacket * 0.16 * exp(-distance / 0.014) * step(1e-4, distance);
  vec3 blank = sheet * (1.0 - shadow);
  if (backShade >= 0.0) blank = sheet * (1.0 - backShade);
  vec4 white = vec4(blank, 1.0);

  gl_FragColor = mix(white, scene, open);
}
`;

/* ------------------------------------------------------------------ */
/* Rainbow ring                                                        */
/* ------------------------------------------------------------------ */

const RING_FRAGMENT = /* glsl */ `
${COMMON}
uniform vec4 uRing;          // centre x, y (CSS px from the top left), mask radius (CSS px), strength
uniform sampler2D uMask;
uniform float uHasMask;

const float INNER = ${f(RING.inner)};
const float MIDDLE = ${f(RING.middle)};
const float OUTER = ${f(RING.outer)};
const float ALPHA = ${f(RING.alpha)};

/* A soft spectrum: 0 violet (inside) to 1 red (outside), as in a rainbow. */
vec3 spectrum(float x) {
  float h = mix(0.78, 0.0, x);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(c, WHITE, 0.28);
}

void main() {
  vec2 d = cssPx() - uRing.xy;
  float radius = max(uRing.z, 1e-3);
  float rho = length(d) / radius;
  float band = 0.0;
  if (rho < OUTER) {
    if (uHasMask > 0.5) band = texture2D(uMask, vec2(0.5) + vec2(d.x, -d.y) / (2.0 * radius)).r;
    else band = smoothstep(INNER, MIDDLE - 0.04, rho) * (1.0 - smoothstep(MIDDLE + 0.04, OUTER, rho));
  }
  // Lift the band's soft shoulders, so the whole spectrum shows, not only its middle.
  float a = pow(clamp(band, 0.0, 1.0), 0.55) * ALPHA * uRing.w;
  vec3 tone = spectrum(clamp((rho - INNER - 0.03) / (OUTER - INNER - 0.06), 0.0, 1.0));
  gl_FragColor = vec4(tone * a, a);
}
`;

/* ------------------------------------------------------------------ */
/* Fabric sky                                                          */
/* ------------------------------------------------------------------ */

const FABRIC_FRAGMENT = /* glsl */ `
${COMMON}
uniform float uFabric;
uniform float uSpread;
uniform float uCloud;
uniform float uCloudAlpha;
uniform float uFill;
uniform float uHole;
uniform float uRipple;
uniform sampler2D uSky;
uniform float uHasSky;
uniform sampler2D uCloudMap;
uniform float uHasCloud;
uniform float uCloudAspect;

const float SPREAD_SOFT = ${f(FABRIC.spreadSoft)};
const float HOLE_RAGGED = ${f(FABRIC.holeRagged)};
const float HOLE_SOFT = ${f(FABRIC.holeSoft)};

/* A premultiplied texel in the canvas's colour space. */
vec4 sampleArt(sampler2D map, vec2 uv) {
  vec4 c = texture2D(map, uv);
  vec3 straight = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  return vec4(linearToOutputTexel(vec4(straight, 1.0)).rgb * c.a, c.a);
}

void main() {
  vec2 st = screenUv();
  float aspect = screenAspect();
  vec2 P = (st - 0.5) * vec2(aspect, 1.0);

  // The cloth: two slow waves across the sky, scrubbed by progress, drifting a little on idle time.
  float phase = uRipple + 0.35 * uTime;
  vec2 k1 = vec2(3.1, 2.2);
  vec2 k2 = vec2(-1.7, 4.3);
  float w1 = dot(P, k1) - phase;
  float w2 = dot(P, k2) - 1.37 * phase + 1.9;
  vec2 grad = 0.6 * cos(w1) * k1 + 0.4 * cos(w2) * k2;
  float fold = 0.6 * sin(w1) + 0.4 * sin(w2);
  float light = dot(normalize(vec3(-grad * 0.09, 1.0)), normalize(vec3(-0.45, -0.55, 0.7)));
  vec3 cloth = uHasSky > 0.5
    ? sampleArt(uSky, clamp(vec2(st.x, 1.0 - st.y) + grad * 0.006, 0.0, 1.0)).rgb
    : mix(SKY, SKY_SOFT, 0.22 + 0.12 * fold);
  cloth *= 0.8 + 0.3 * light;
  // It spreads from the centre line toward the trees on both sides.
  float side = abs(P.x) / (0.5 * aspect);
  float fabricA = uFabric * (1.0 - smoothstep(uSpread - SPREAD_SOFT, uSpread + SPREAD_SOFT, side));
  vec4 fabric = vec4(cloth * fabricA, fabricA);

  // The cloud billows from the top centre toward the viewer.
  float g = uCloud;
  float width = mix(0.42, 3.6, g * g);
  vec2 centre = vec2(0.5, mix(0.1, 0.48, g));
  vec2 uv = (st - centre) / vec2(width, width * aspect / uCloudAspect) + 0.5;
  uv += vec2(snoise(uv * 3.0 + g * 1.7), snoise(uv * 3.0 + 5.2 - g * 1.3)) * 0.035;
  vec4 cloud = vec4(0.0);
  if (uHasCloud > 0.5) {
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) cloud = sampleArt(uCloudMap, vec2(uv.x, 1.0 - uv.y));
  } else {
    vec2 e = (uv - 0.5) * vec2(2.0, 1.6);
    float body = 1.0 - smoothstep(0.55, 0.95, length(e) + 0.3 * snoise(uv * 4.0));
    cloud = vec4(mix(WHITE, SKY_SOFT, 0.22 + 0.18 * snoise(uv * 6.0 + 1.0)) * body, body);
  }
  cloud *= uCloudAlpha;

  // Inside the cloud, once it fills the view.
  float puff = fbm(P * 2.4 + vec2(0.0, g * 1.5) + 7.0);
  vec3 inner = mix(WHITE, SKY_SOFT, 0.08 + 0.3 * puff);
  vec4 entering = mix(over(cloud, fabric), vec4(inner, 1.0), uFill);

  // Clearing: a hole opens through the cloud from the middle onto the cloth, which clears too.
  float hole = smoothstep(uHole - HOLE_SOFT, uHole + HOLE_SOFT, length(P) + HOLE_RAGGED * snoise(P * 2.2 + 9.1));
  vec4 leaving = over(vec4(inner, 1.0) * hole, fabric);

  gl_FragColor = uExit > 0.0 ? leaving : entering;
}
`;

export const FRAGMENTS: Record<CanvasKind, string> = {
  sand: SAND_FRAGMENT,
  unfold: UNFOLD_FRAGMENT,
  dust: DUST_FRAGMENT,
  ring: RING_FRAGMENT,
  fabric: FABRIC_FRAGMENT,
};
