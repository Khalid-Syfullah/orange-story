// Halftone clouds, shared by every sky on the stage (the hero, the plate of The Work, later the
// canopy gap and the rise). One cloud is a smooth-min of five circles bitten by fbm with a flat
// underside, as coverage 0..1 in the painting's own coordinates, so it stays glued to the sky
// through parallax, dolly and scroll. The dots are a print screen in device pixels (cells 6.5 px x
// dpr, radius sqrt(coverage) * 0.64) whose coverage is sampled at each cell's centre, so a cloud
// moving under the fixed screen reads as dots growing and shrinking, never as a sliding bitmap.
//
// Painting coordinates here are "height units": (u * aspect, v) for a painting point (u, v), so
// sizes are fractions of the painting's height and the circles are round on the painting.
//
// Instances differ in size, seed, drift speed and phase, the larger slower (rule 13). The hero
// lays out its own three (passes/hero/frag.ts); the plate's live here in `plateClouds` because
// The Split and The Work draw the same sky, mapped through the same `plateUV`.
/** The plate's phone fit (see plateFit in the GLSL below and plateFit() in passes/work/timeline.ts). */
export const PLATE_SPAN = 1.8;
export const PLATE_CX = 0.62;

export const CLOUDS_GLSL = /* glsl */ `
const float PLATE_SPAN = ${PLATE_SPAN.toFixed(3)};
const float PLATE_CX = ${PLATE_CX.toFixed(3)};
const float CLOUD_TAU = 6.2831853;
// Dot cell size in CSS px (multiply by uDpr for device px).
const float CLOUD_CELL = 6.5;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// One cloud: smooth-min circles bitten by fbm with a flat underside, as coverage 0..1.
// 'pa' is a painting point in height units, 'c' the left end of the flat base, 'sc' the cloud's
// size in the same units, 'seed' its own shape, 'sway' its drift (height units).
// 'edge' advances the fbm that bites the outline, in noise lattice units (the canopy's cloud runs it
// at 0.03 a second); 0 is the plain cloud the hero and the plate draw.
float cloud(vec2 pa, vec2 c, float sc, float seed, vec2 sway, float edge) {
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
  d += (fbm(q * 3.4 + j + vec2(edge, edge * 0.37), 3) - 0.5) * 0.34;
  d = max(d, q.y);                                   // flat underside
  float cov = smoothstep(0.02, -0.16, d);
  cov *= mix(0.45, 1.0, smoothstep(0.0, -0.55, q.y)); // lit from above: denser dots on top
  return cov;
}

float cloud(vec2 pa, vec2 c, float sc, float seed, vec2 sway) {
  return cloud(pa, c, sc, seed, sway, 0.0);
}

// cloudSway: an instance's slow drift: two incommensurate sines in x and one in y (rule 9), slower
// and wider the larger the cloud, phased by its seed. 'size' and the result are in height units.
vec2 cloudSway(float size, float seed, float tm) {
  float p1 = 14.0 + 55.0 * size;                      // 0.30 -> 30.5 s, 0.10 -> 19.5 s
  float p2 = p1 * 0.618034;
  float p3 = p1 * 0.787;
  float ph = hash(seed) * CLOUD_TAU;
  float ax = 0.25 * size;                             // wide enough to read as drift: ~10-20 px a second
  return vec2(ax * (sin(tm * CLOUD_TAU / p1 + ph) + 0.5 * sin(tm * CLOUD_TAU / p2 + ph * 1.7)),
              ax * 0.2 * sin(tm * CLOUD_TAU / p3 + ph * 0.6));
}

// cloudCellUV: the screen uv (y down) of the centre of dot cell 'cid' (cells of cellPx device px).
vec2 cloudCellUV(vec2 cid, float cellPx) {
  return vec2((cid.x + 0.5) * cellPx, uRes.y - (cid.y + 0.5) * cellPx) / uRes;
}

// cloudDot: the dot mask at this fragment for the coverage 'cov' sampled at its cell's centre:
// radius sqrt(cov) * 0.64 cells (breathing with the scroll-stop kick), anti-aliased over 0.75 px,
// nothing under a 5% radius. Multiply by the sky mask and mix the milk in at 0.94.
float cloudDot(vec2 frag, float cellPx, float cov) {
  vec2 cid = floor(frag / cellPx);
  float r = sqrt(cov) * 0.64 * (1.0 + 0.015 * uKick);
  float aa = 0.75 / cellPx;
  float dist = length(frag / cellPx - cid - 0.5);
  return (1.0 - smoothstep(r - aa, r + aa, dist)) * smoothstep(0.0, 0.05, r);
}

// skyMask (1 on a painting's blue sky, so clouds sit behind leaves, scaffold and fruit) is in the
// GLSL library with the motion toolkit's other masks (src/stage/gl/lib.glsl.ts).

// plateFit: how the 9:16 plate sits in the frame, as (fh, zoom, cx). It is fitted to the frame's
// width; on a frame so tall that the plate would be shorter than 1.8 frames (phones), it is zoomed
// in just enough that it still has a height to scroll through, cropping the sides about the plate's
// column 'cx' (leaning right, toward the orange). 'fh' is the frame's height in plate heights after
// the zoom. On desktop zoom is 1 and cx is 0.5, so the plain width-fit is unchanged.
// PLATE_SPAN and PLATE_CX are mirrored by plateFit() in passes/work/timeline.ts.
vec3 plateFit(vec2 plateSize) {
  float k = (plateSize.x / plateSize.y) * (uRes.y / uRes.x);   // the frame's height in plate units at width-fit
  float z = max(1.0, PLATE_SPAN * k);
  return vec3(k / z, z, clamp(PLATE_CX, 0.5 / z, 1.0 - 0.5 / z));
}

// plateUV: screen uv (y down) -> painting uv of the 9:16 plate fitted to the frame (see plateFit)
// and scrolled through its own height: 'yOff' is the plate v at the top of the frame (0 = its top),
// 'pan' a screen-uv offset (pointer parallax and drift only, docs/STORY.md).
vec2 plateUV(vec2 uv, vec2 plateSize, float yOff, vec2 pan) {
  vec3 f = plateFit(plateSize);
  return vec2(f.z + (uv.x - 0.5 + pan.x) / f.y, (uv.y + pan.y) * f.x + yOff);
}

// plateClouds: coverage of the plate's sky at painting point 'pa' (height units: x in 0..aspect),
// swaying at time tm. The large one sits half off the plate's right edge; 'drift' 0..1 walks it in
// over The Work without it ever clearing the edge. The Split draws it at 0.
float plateClouds(vec2 pa, float tm, float drift) {
  float cov = cloud(pa, vec2(0.070, 0.115), 0.075, 21.0, cloudSway(0.075, 21.0, tm));
  cov = max(cov, cloud(pa, vec2(0.345, 0.205), 0.042, 22.0, cloudSway(0.042, 22.0, tm)));
  cov = max(cov, cloud(pa, vec2(0.50 - 0.13 * drift, 0.275), 0.105, 23.0, cloudSway(0.105, 23.0, tm)));
  return cov;
}
`;
