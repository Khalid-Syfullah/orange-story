// The push into the parchment (docs/TRANSITIONS.md row Work -> sheet). Crest: none, a push and a
// colour; so the colour is not a crossfade but the painting fading to the paper's colour around the
// parchment, and the parchment becoming the sheet:
//
//   - the push: the Work's last frame (the same mapping, breath, parallax, scrim and grain as
//     passes/work/frag.ts at t = 1, so the first frame is The Work's last) seen through a window that
//     shrinks about a drifting origin (./timeline.ts). Displaced pixels are smeared radially by this
//     frame's own push, signed the way they move (rule 6); the last stretch softens radially from
//     the origin, the way things go soft near a lens (rule 7);
//   - the fill: uFlat (a smoothstep over the segment) drives every pixel, each held back by a delay
//     of its own: least far from the parchment and on light paint, most on the parchment and on its
//     ink, bitten by two decorrelated fbm fields in plate coordinates and printed with a Bayer
//     threshold and a hash stipple (rules 1, 2), so the painting fades to paper around the parchment
//     first. A pixel's colour drains into a paper-toned print of itself, then lifts to the paper;
//   - the sheet: pulp, fibre, tooth, inclusions and light (passes/paper.ts), anchored where the push
//     lands and riding the push with the plate, so the parchment becomes the sheet (settling onto
//     the landed frame in the last stretch); every term multiplied by the same driver as the
//     colour (rule 3): no frame shows paper over a clean picture;
//   - a faint shadow of the orange: the plate's luminance at 8% in the sheet, fading with
//     (1 - uFlat)^2;
//   - fast paths: a pixel whose delay provably has not started is the painting (one tap); the film
//     grain leaves as the paper arrives.
import { CLOUDS_GLSL } from "../clouds";
import { PAPER_GLSL } from "../paper";
import { REST_GLSL } from "../rest";
import { PARCHMENT_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);

export const PARCHMENT_FRAG = /* glsl */ `
${REST_GLSL}
${CLOUDS_GLSL}
${PAPER_GLSL}
uniform sampler2D uPlate;
uniform vec2 uPlateSize;
uniform vec2 uOrigin;     // The Work's arrival origin (its breath dollies about it), screen uv
uniform float uYTop;      // plate v at the top of the Work's last frame
uniform float uCreep;     // the Work's creep at its end
uniform vec2 uPushO;      // the dolly's origin now (screen uv = work uv)
uniform float uPushW;     // the window's side now, in work uv (1/s)
uniform vec2 uPaperO;     // the sheet: screen uv -> landed uv is uPaperO + (uv - uPaperO) * uPaperL
uniform float uPaperL;    // sheet px per screen px (1 once landed)
uniform float uFlat;      // 0..1: the whole frame to the paper
uniform float uShadow;    // the orange's shadow: 0.08 * (1 - uFlat)^2
uniform float uSmear;     // this frame's push as a log change of the magnification, signed
uniform float uSoft;      // lens softening: radius per unit of distance from the origin
uniform vec4 uParch;      // the parchment rect in plate uv: x, y, w, h

const vec3 SCRIM = 2.0 * vec3(0.35, 0.33, 0.32);
const float DELAY_MAX = ${f(PARCHMENT_TUNE.delayMax)};
const float FAR_SPAN = ${f(PARCHMENT_TUNE.farSpan)};
const float NEAR_R = ${f(PARCHMENT_TUNE.nearRadius)};
const float SMEAR_MAX = ${f(PARCHMENT_TUNE.smearMax)};
const float NOISE = 0.25;   // bound on the delay's bite, dither and stipple (fast paths)

float gTm;
float gZk;
vec2 gOff;

// The Work's film grain, +-1.5%, re-hashed every 1/24 s.
float grain(vec2 frag) { return (hash(frag + floor(gTm * 24.0) * vec2(37.1, 17.3)) - 0.5) * 0.03; }

// Screen uv -> work uv: the window of the Work's last frame the camera sees now.
vec2 toWork(vec2 uv) { return uPushO + (uv - uPushO) * uPushW; }

// Work uv -> plate uv: passes/work/frag.ts toPlate() at t = 1 (arrival done), breath and parallax on.
vec2 toPlate(vec2 w) {
  vec2 c = dollyAbout(w, uOrigin, gZk);
  c = 0.5 + (c - 0.5) / uCreep;
  return plateUV(c, uPlateSize, uYTop, gOff);
}

vec3 paintAt(vec2 uv) { return texture2D(uPlate, toPlate(toWork(uv))).rgb; }

void main() {
  vec2 frag = gl_FragCoord.xy;
  gTm = uTime * (1.0 - uStill);
  gZk = restZoom(1.0, gTm);
  gOff = restOffset(gTm);

  vec2 uv = screenUV();
  vec2 pu = toPlate(toWork(uv));
  vec3 tap = texture2D(uPlate, pu).rgb;

  // The painting as The Work leaves it, smeared along this frame's push: content moves away from
  // the origin while pushing in and toward it while pulling back, so the trail points the other
  // way (rule 6). Nothing smears at rest.
  vec3 paint = tap;
  vec2 sv = (uv - uPushO) * uSmear;
  float sl = length(sv);
  if (sl > 1.0e-4) {
    sv *= min(1.0, SMEAR_MAX / sl);
    paint = tap * 0.30 + paintAt(uv - sv * 0.25) * 0.25 + paintAt(uv - sv * 0.50) * 0.20
          + paintAt(uv - sv * 0.75) * 0.15 + paintAt(uv - sv) * 0.10;
  }

  // Fast path: before the fill starts anywhere, the frame is The Work's last.
  if (uFlat <= 0.0) {
    gl_FragColor = vec4(clamp(paint * SCRIM + grain(frag), 0.0, 1.0), 1.0);
    return;
  }

  // The fill's delay at this pixel, from where it is in the plate and how light its paint is.
  float aspect = uPlateSize.x / uPlateSize.y;
  vec2 ph = vec2(pu.x * aspect, pu.y);                                   // plate height units
  vec2 rc = vec2((uParch.x + 0.5 * uParch.z) * aspect, uParch.y + 0.5 * uParch.w);
  vec2 rh = vec2(0.5 * uParch.z * aspect, 0.5 * uParch.w);
  vec2 dq = abs(ph - rc) - rh;
  float dist = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0);         // signed distance to the rect
  float near = 1.0 - smoothstep(-0.02, NEAR_R, dist);
  float lum = luma(tap);
  float base = 0.62 * near + 0.22 * (1.0 - lum) + 0.06;

  // Fast path: this pixel's fill provably has not started.
  if (uFlat <= DELAY_MAX * clamp(base - NOISE, 0.0, 1.0)) {
    gl_FragColor = vec4(clamp(paint * SCRIM + grain(frag), 0.0, 1.0), 1.0);
    return;
  }

  // Bitten by two decorrelated fields in plate coordinates (they push in with the picture) and
  // printed, not faded (rules 1, 2). Away from the parchment a pixel's fill runs over FAR_SPAN of
  // uFlat; on the parchment it runs to the end of the push, so the parchment is the last thing to
  // become the sheet.
  float n1 = fbm4(ph * 7.0 + 3.0) - 0.5;
  float n2 = fbm4(ph * 19.0 - 5.0) - 0.5;
  float d = DELAY_MAX * clamp(base + n1 * 0.32 + n2 * 0.12
                              + (bayer4(frag) - 0.5) * 0.03 + (hash(floor(frag / 2.0)) - 0.5) * 0.02, 0.0, 1.0);
  float fl = smoothstep(d, mix(d + FAR_SPAN, 1.0, near), uFlat);

  // Soft near the lens in the last stretch, radially from the origin (rule 7). It blends in over its
  // first 0.004 so it never switches on.
  float soft = uSoft * length((uv - uPushO) * vec2(uRes.x / uRes.y, 1.0));
  if (soft > 1.0e-4 && fl < 0.999) {
    vec2 r = vec2(soft * uRes.y / uRes.x, soft);
    vec3 b = (paintAt(uv + vec2(r.x, 0.0)) + paintAt(uv - vec2(r.x, 0.0))
            + paintAt(uv + vec2(0.0, r.y)) + paintAt(uv - vec2(0.0, r.y))) * 0.25;
    paint = mix(paint, mix(paint, b, 0.65), smoothstep(0.0, 0.004, soft));
  }

  // The painting fades to the paper's colour: the scrim lifts, the colour drains into a
  // paper-toned print of the painting's own values, then the value lifts to the paper.
  vec3 lit = paint * mix(SCRIM, vec3(1.0), smoothstep(0.0, 0.45, fl));
  vec3 print = uPaper * mix(0.64, 1.0, smoothstep(0.04, 0.92, luma(paint)));
  vec3 ground = mix(lit, print, smoothstep(0.0, 0.6, fl));
  ground = mix(ground, uPaper, pow(fl, 1.6));                         // the print's ghost lingers
  // A faint shadow of the orange survives in the sheet: the plate's luminance at 8%, fading out.
  ground *= 1.0 - uShadow * (1.0 - lum) * fl;

  // The sheet arrives with its colour: every term of the paper multiplied by the same driver.
  vec2 pc = (uPaperO + (uv - uPaperO) * uPaperL) * (uRes / uDpr);      // the landed frame, CSS px
  vec3 col = ground * mix(vec3(1.0), paperTexture(pc, uPaperL) * paperLight(uv, gTm), fl);
  col += grain(frag) * (1.0 - fl);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
