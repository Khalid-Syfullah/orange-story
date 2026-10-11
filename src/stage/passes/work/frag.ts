// The Work's fragment shader: the 9:16 plate fitted to the frame (plateFit in passes/clouds.ts) and
// scrolled through its own height, y offset a function of local progress (passes/work/timeline.ts),
// pan from the pointer and the ambient drift only. It picks up exactly where The Split's plate
// leaves off (same mapping, same dolly about the drifted seam point, same rest state and grain).
//
//   - arrival: the plate's scale eases from the Split's end state to the width-fit about the seam
//     point with the inverted push; then the creep, a push-in of 0.6% per 10% of progress;
//   - print-in: below the sky the painting prints itself in. A halftone screen (14 px cells at 15
//     degrees) carries the painting's own tone; its dots grow with the soak-in coverage until they
//     merge, and the merged paint hands over to the plain painting through a Bayer and stipple
//     threshold, never a fade. The front is a plate v, bitten by two decorrelated fbm fields
//     (rule 1) and printed (rule 2); the painting behind it arrives still catching up with its edge,
//     displaced and smeared along the way the front travels (rules 5, 6); a pixel provably behind
//     or ahead of every possible front takes a fast path (rule 14);
//   - clouds: the shared halftone cloud function drawn in plate coordinates in the sky band, so they
//     scroll with the painting; the large one walks in from the right edge and never clears it;
//   - scrim: the plate is multiplied by 2 * (0.35, 0.33, 0.32), faded in over the first 20%.
import { CLOUDS_GLSL } from "../clouds";
import { REST_GLSL } from "../rest";
import { WORK_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);

export const WORK_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
uniform sampler2D uPlate;
uniform vec2 uPlateSize;
uniform vec2 uOrigin;     // the Split's drifted seam point on screen (uv)
uniform float uYTop;      // plate v at the top of the frame
uniform float uCreep;     // the creep zoom about the frame's centre
uniform float uArrive;    // the plate's scale about uOrigin (the arrival)
uniform float uFront;     // plate v of the painted edge
uniform float uDrift;     // 0..1: the large cloud walking in
uniform float uScrim;     // 0..1

const float BAND = ${f(WORK_TUNE.band)};      // soak-in band, plate v
const float CELL = 14.0;                       // halftone cell, CSS px (times dpr)
const float ANGLE = 0.2618;                    // the screen's 15 degrees
const float SKY_V = 0.06;                      // where the painting's own sky is read for the unprinted ground
const float LAG_OFFSET = 0.008;                // plate v the arriving painting trails by at the edge
const vec3 SCRIM = 2.0 * vec3(0.35, 0.33, 0.32);

float gTm;
float gZk;
vec2 gOff;

float grain(vec2 frag) { return (hash(frag + floor(gTm * 24.0) * vec2(37.1, 17.3)) - 0.5) * 0.03; }

// Screen uv -> plate uv: the arrival dolly about the seam point (with the breath), the creep about
// the frame's centre, then the plate's own fit, scroll and parallax.
vec2 toPlate(vec2 uv) {
  vec2 c = dollyAbout(uv, uOrigin, uArrive * gZk);
  c = 0.5 + (c - 0.5) / uCreep;
  return plateUV(c, uPlateSize, uYTop, gOff);
}

vec2 fragUV(vec2 frag) { return vec2(frag.x, uRes.y - frag.y) / uRes; }

// The front's bite at a plate point, in bands: two decorrelated fields at different scales.
float bite(vec2 pu) {
  vec2 p = vec2(pu.x * uPlateSize.x / uPlateSize.y, pu.y);
  float n1 = fbm4(p * 6.0 + 3.0) - 0.5;
  float n2 = fbm4(p * 17.0 - 5.0 + vec2(0.0, uFront * 3.0) + gTm * 0.02) - 0.5;
  return n1 * 1.2 + n2 * 0.5;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  gTm = uTime * (1.0 - uStill);
  gZk = restZoom(1.0, gTm);
  gOff = restOffset(gTm);

  vec2 uv = screenUV();
  vec2 pu = toPlate(uv);
  float aspect = uPlateSize.x / uPlateSize.y;
  float dd0 = (pu.y - uFront) / BAND;        // bands below the painted edge, before the bite
  vec3 col;

  if (dd0 < -0.95) {
    // Fast path: provably behind every bitten front: the plain painting, one tap.
    col = texture2D(uPlate, pu).rgb;
  } else if (dd0 > 1.95) {
    // Fast path: provably ahead of it: nothing exists yet but the plate's own sky.
    col = texture2D(uPlate, vec2(pu.x, SKY_V)).rgb;
  } else {
    float cellPx = CELL * uDpr;
    float cs = cos(ANGLE);
    float sn = sin(ANGLE);
    // The halftone screen at 15 degrees: this fragment's cell, and the cell's centre on screen.
    vec2 g = vec2(cs * frag.x + sn * frag.y, -sn * frag.x + cs * frag.y) / cellPx;
    vec2 cid = floor(g);
    vec2 loc = g - cid - 0.5;
    vec2 cc = (cid + 0.5) * cellPx;
    vec2 fc = vec2(cs * cc.x - sn * cc.y, sn * cc.x + cs * cc.y);
    vec2 puC = toPlate(fragUV(fc));

    // Soak-in coverage at the cell's centre: the front driven by progress, bitten (rule 1).
    float ddC = (puC.y - uFront) / BAND + bite(puC);
    float cov = clamp(1.0 - ddC, 0.0, 1.0);

    // The painting's own tone at the cell: its centre and four taps round it.
    vec2 dPu = vec2(1.0 / uRes.x, plateFit(uPlateSize).x / uRes.y) / (plateFit(uPlateSize).y * uCreep * uArrive * gZk) * cellPx * 0.32;
    vec3 tone = texture2D(uPlate, puC).rgb * 0.4
              + (texture2D(uPlate, puC + vec2(dPu.x, 0.0)).rgb + texture2D(uPlate, puC - vec2(dPu.x, 0.0)).rgb
               + texture2D(uPlate, puC + vec2(0.0, dPu.y)).rgb + texture2D(uPlate, puC - vec2(0.0, dPu.y)).rgb) * 0.15;
    vec3 ground = texture2D(uPlate, vec2(pu.x, SKY_V)).rgb;

    // The painting behind the edge, still catching up with it: displaced and smeared the way the
    // front travels (down the plate), the lag dying behind the edge (rules 5, 6).
    float stip = (bayer4(frag) - 0.5) * 0.12 + (hash(floor(frag / 2.0)) - 0.5) * 0.06;
    float ddP = dd0 + bite(pu);
    float lag = exp(-max(-ddP, 0.0) / 0.6);
    vec2 pl = pu - vec2(0.0, lag * LAG_OFFSET);
    vec3 paint = lag > 0.04 ? smear5(uPlate, pl, vec2(0.0, 1.0), lag * LAG_OFFSET * 0.8) : texture2D(uPlate, pu).rgb;

    // The dots grow with the coverage until they merge (radius past half a cell's diagonal). Past
    // the half-way point the gaps between them take the painting, through a printed threshold; the
    // dots dissolve into it last. No mosaic of flat cells ever shows (rule 3: all one driver).
    float r = sqrt(cov) * 0.82 * (0.92 + 0.16 * hash(cid + 7.0));
    float aa = 0.75 / cellPx;
    float dotMask = (1.0 - smoothstep(r - aa, r + aa, length(loc))) * smoothstep(0.0, 0.05, r);
    float gaps = smoothstep(0.30, 0.65, cov + stip * 0.8);
    float merged = smoothstep(0.45, 0.74, cov + stip * 0.8);
    col = mix(mix(ground, paint, gaps), mix(tone, paint, merged), dotMask);
  }

  // Clouds in the sky band, in plate coordinates: they scroll with the painting.
  if (pu.y < 0.40) {
    float cellPx = CLOUD_CELL * uDpr;
    vec2 cpu = toPlate(cloudCellUV(floor(frag / cellPx), cellPx));
    float cov = plateClouds(vec2(cpu.x * aspect, cpu.y), gTm, uDrift);
    float m = cloudDot(frag, cellPx, cov) * skyMask(texture2D(uPlate, pu).rgb);
    col = mix(col, uMilk, m * 0.94);
  }

  col *= mix(vec3(1.0), SCRIM, uScrim);
  gl_FragColor = vec4(clamp(col + grain(frag), 0.0, 1.0), 1.0);
}
`;
