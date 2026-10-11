// The coda on flat blue (docs/STORY.md row 3 · The Terms, second half): the `coda` sequence
// scrubbed by local progress through cover() with the shared rest state (breath, parallax, drift),
// the paintings' film grain, and the halo once the orange hangs alone:
//
//   - the halo: an annulus round the orange at the `share-orange` anchor (mapped through the same
//     cover() as the picture, so it sits on the fruit through breath and parallax), width 0.012 with
//     0.004 softness in frame heights, a faint chroma split on its outer edge, a soft light beyond it
//     and a haze between it and the peel. It grows from the peel outward on the coda's growth driver,
//     and its light is multiplied by the same driver (rule 3). It breathes by rule 9: the radius by
//     0.6% from the three incommensurate sines and 1.5% from the scroll-stop kick (restBreath, uKick);
//   - CODA_GLSL is shared with the burn (./burn.ts), so the close's last frame (the coda's first
//     frame, no halo) is the coda pass's first frame exactly.
import { REST_GLSL } from "../rest";
import { CODA_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);

export const CODA_GLSL = /* glsl */ `
${REST_GLSL}
uniform sampler2D uCoda;      // the coda sequence's nearest decoded frame
uniform vec2 uCodaSize;
uniform vec2 uCodaPan;        // art.coda.framing
uniform float uCodaZoom;
uniform vec2 uAnchor;         // the floating orange in coda uv (y down)
uniform float uOrangeR;       // its radius as a share of the coda frame's width
uniform float uHaloG;         // the halo's growth 0..1 (0: none)

const float HALO_GAP = ${f(CODA_TUNE.haloGap)};
const float HALO_W = ${f(CODA_TUNE.haloWidth)};
const float HALO_SOFT = ${f(CODA_TUNE.haloSoft)};
const float HALO_SPLIT = ${f(CODA_TUNE.haloSplit)};
const vec3 HALO_COL = vec3(1.0, 0.94, 0.82);

float gCz;      // the picture's zoom with the breath
vec2 gCoff;     // parallax and drift, painting units

// Sets the picture's mapping from the rest state (call once per fragment).
void codaFrame(float tm) {
  gCz = restZoom(uCodaZoom, tm);
  gCoff = restOffset(tm);
}

vec2 toCoda(vec2 uv) { return cover(uv, uCodaSize, uCodaPan, gCz) + gCoff; }

vec3 codaPic(vec2 uv) { return texture2D(uCoda, toCoda(uv)).rgb; }

// The picture at a displaced screen uv, smeared 'len' (screen units) along dirUV, the way it moves
// (rule 6).
vec3 codaPicSmeared(vec2 uv, vec2 dirUV, float len) {
  vec2 dp = dirUV * coverScale(uCodaSize) / gCz;
  return smear5(uCoda, toCoda(uv), dp, len);
}

// Film grain, +-1.2%: the paintings' grain, carried onto the coda.
float codaGrain(vec2 frag, float tm) { return filmGrain(frag, tm, 0.024); }

// The halo round the floating orange, screen-blended over the picture. 'col' is the picture so far.
vec3 codaHalo(vec3 col, vec2 uv, float tm) {
  float g = uHaloG;
  if (g <= 0.0) return col;
  float ar = uRes.x / uRes.y;
  vec2 c = aspectUV(uncover(uAnchor - gCoff, uCodaSize, uCodaPan, gCz));
  float R0 = uOrangeR * gCz / coverScale(uCodaSize).x * ar;     // the orange's radius, frame heights
  float rd = length(aspectUV(uv) - c);
  float breath = 1.0 + 0.006 * restBreath(tm) + 0.015 * uKick;
  float R = R0 * (1.0 + HALO_GAP * g) * breath;                  // the ring grows from the peel outward
  if (rd > R + HALO_W + 0.5) return col;
  float inner = smoothstep(R - HALO_SOFT, R, rd);
  vec3 outer = vec3(R + HALO_W) + vec3(HALO_SPLIT, 0.0, -HALO_SPLIT);
  vec3 ring = inner * (1.0 - smoothstep(outer, outer + HALO_SOFT, vec3(rd)));
  float light = exp(-max(rd - R - HALO_W, 0.0) / 0.07);           // its soft light beyond the ring
  float haze = exp(-max(R - rd, 0.0) / 0.03)                       // and the haze between ring and peel,
             * (1.0 - smoothstep(R - HALO_SOFT, R + HALO_SOFT, rd)); // inside the ring only
  vec3 add = clamp(HALO_COL * (ring * 0.6 + light * 0.16 + haze * 0.14) * g, 0.0, 1.0);
  return 1.0 - (1.0 - col) * (1.0 - add);
}
`;

export const CODA_FRAG = /* glsl */ `
${CODA_GLSL}

void main() {
  vec2 uv = screenUV();
  vec2 frag = gl_FragCoord.xy;
  float tm = uTime * (1.0 - uStill);
  codaFrame(tm);
  vec3 col = codaHalo(codaPic(uv), uv, tm) + codaGrain(frag, tm);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
