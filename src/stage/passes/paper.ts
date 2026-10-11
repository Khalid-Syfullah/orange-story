// The sheet: paper built in the pixels, shared by every pass that draws on paper (the push into the
// parchment, the bare sheet, and later the drawing, the panel and the burn). It is not a colour:
//
//   - pulp: fbm from broad clouds to small flocks; thick pulp is warmer and a touch darker, thin pulp cooler and
//     lighter, so the sheet never reads as tinted grey;
//   - laid fibre running one way: noise stretched 12:1 along a direction a few degrees off the rows;
//   - tooth: a fine hash at one and two CSS px, static (paper does not flicker);
//   - inclusions: a few dark specks and short hairs where a cell's hash passes 0.995, softened, each
//     with its own size, length, angle and darkness (rule 13);
//   - light: a slow raking gradient whose direction, position, patch size, depth and contrast are
//     sums of incommensurate sines (rule 9), plus the scroll-stop kick, swinging at most 4% of value
//     across the frame while the frame's mean moves about 1%, so it reads as something moving
//     between the sheet and the sun, not the screen dimming.
//
// Texture fields use uOctaves through fbm() (2 on phones), never the motion fields' fbm4.
//
// Coordinates: `pc` is a point on the sheet in CSS px (the frame's CSS px once the sheet is at
// rest), `lod` how many sheet px fall in one screen px (1 at rest, more while the camera is still
// pushing in from far away): detail finer than a pixel fades out instead of aliasing. The light
// takes screen uv (y down).
//
// Every term is a multiplicative factor around 1, so a pass brings the paper in by mixing toward it
// with the same driver as its colour: `ground * mix(vec3(1.0), paperTexture(..) * paperLight(..), f)`.
// Nothing switches on (rule 3).

/** Numbers of the sheet, mirrored into the GLSL below. */
export const PAPER_TUNE = {
  /** Pulp: the largest fbm period in CSS px; each octave halves it (150, 75, 37, 19 on desktop). */
  pulpScale: 150,
  /** Fibre: length and width of the stretched noise (12:1) in CSS px, and its amplitude. */
  fibreLength: 30,
  fibreWidth: 2.5,
  fibreAmp: 0.042,
  /** Tooth amplitude (peak to peak, share of value). */
  toothAmp: 0.034,
  /** Inclusions: cell size in CSS px and the hash threshold a cell must pass. */
  inclusionCell: 23,
  inclusionThreshold: 0.995,
  /** Light: amplitude (share of value, before the contrast swing): the swing across the frame peaks at 4%. */
  lightAmp: 0.032,
} as const;

const f = (x: number) => x.toFixed(4);

export const PAPER_GLSL = /* glsl */ `
const float PAPER_TAU = 6.2831853;

// Pulp thickness at a sheet point, 0..1: one fbm whose octaves run from broad clouds of pulp down
// to its small flocks (texture field, uOctaves: phones keep the broad two).
float paperPulp(vec2 pc) {
  return fbm(pc / ${f(PAPER_TUNE.pulpScale)} + vec2(3.1, 7.7));
}

// One inclusion per lucky cell: a speck or a short hair, its own size, length, angle and darkness,
// softened. Returns how dark it is at pc, 0..~0.55.
float paperInclusion(vec2 pc) {
  float cell = ${f(PAPER_TUNE.inclusionCell)};
  vec2 cid = floor(pc / cell);
  if (hash(cid + vec2(17.0, 91.0)) < ${f(PAPER_TUNE.inclusionThreshold)}) return 0.0;
  float h1 = hash(cid + 3.7);
  float h2 = hash(cid + 8.1);
  float h3 = hash(cid + 12.9);
  float h4 = hash(cid + 21.4);
  vec2 c = (cid + 0.25 + 0.5 * vec2(h1, h2)) * cell;           // never near the cell's edge
  float ang = h3 * 3.14159;
  vec2 d = pc - c;
  d = vec2(cos(ang) * d.x + sin(ang) * d.y, -sin(ang) * d.x + cos(ang) * d.y);
  float len = 1.0 + 2.6 * h4;                                   // a speck, or a hair up to 3.6x long
  float r = 0.55 + 0.9 * fract(h1 * 7.13);                      // CSS px
  float dist = length(d / vec2(len, 1.0));
  return (1.0 - smoothstep(r * 0.4, r + 0.9, dist)) * (0.22 + 0.33 * fract(h2 * 5.71));
}

// The sheet's texture at pc as a multiplicative colour around 1: pulp tint, fibre, tooth and
// inclusions. 'lod' (sheet px per screen px) fades the terms that would be finer than a pixel.
vec3 paperTexture(vec2 pc, float lod) {
  // Thick pulp warmer and a touch darker, thin pulp cooler and lighter.
  float th = smoothstep(0.22, 0.78, paperPulp(pc));
  vec3 tint = mix(vec3(1.008, 1.010, 1.018), vec3(0.998, 0.987, 0.963), th);

  // Laid fibre running one way, 12:1, a few degrees off the rows.
  vec2 fq = mat2(0.9982, 0.0600, -0.0600, 0.9982) * pc;
  float fibre = (fbm(vec2(fq.x / ${f(PAPER_TUNE.fibreLength)}, fq.y / ${f(PAPER_TUNE.fibreWidth)}) + 11.0) - 0.5)
              * ${f(PAPER_TUNE.fibreAmp)} * smoothstep(3.2, 1.6, lod);

  // Tooth: a fine static hash at one and two CSS px.
  float tooth = ((hash(floor(pc) + 0.5) - 0.5) * 0.6 + (hash(floor(pc * 0.5) + 41.3) - 0.5) * 0.4)
              * ${f(PAPER_TUNE.toothAmp)} * smoothstep(2.4, 1.3, lod);

  // A few dark inclusions, brown rather than grey (while the sheet is still far they would crowd the
  // frame as dust, so they resolve with the tooth as the camera arrives).
  float inc = paperInclusion(pc) * smoothstep(2.2, 1.25, lod);

  return tint * (1.0 + fibre + tooth) * (1.0 - inc * vec3(0.55, 0.62, 0.72));
}

// The light on the sheet as a multiplicative value around 1 (at most 4% peak to peak): a raking
// gradient from the upper left and the soft shadow of something passing between the sheet and the
// sun. Direction, position, patch size, depth and contrast are each a sum of sines at
// incommensurate periods (rule 9); the scroll-stop kick lifts the contrast for a moment.
float paperLight(vec2 uv, float tm) {
  float ar = uRes.x / uRes.y;
  vec2 a = vec2(uv.x * ar, uv.y);

  float ang = 0.58 + 0.05 * sin(tm * PAPER_TAU / 23.7) + 0.03 * sin(tm * PAPER_TAU / 37.9 + 1.2);
  vec2 dir = vec2(cos(ang), sin(ang));                          // y down: light falls from the upper left
  float pos = 0.10 * sin(tm * PAPER_TAU / 17.3) + 0.06 * sin(tm * PAPER_TAU / 26.9 + 2.1)
            + 0.03 * sin(tm * PAPER_TAU / 9.7 + 0.4);
  float rake = 1.0 - smoothstep(-0.9, 0.9, dot(a - vec2(0.5 * ar, 0.5), dir) - pos);

  float size = 0.62 + 0.14 * sin(tm * PAPER_TAU / 19.1 + 0.8) + 0.07 * sin(tm * PAPER_TAU / 31.3);
  vec2 drift = vec2(tm * 0.011, -tm * 0.004)
             + 0.05 * vec2(sin(tm * PAPER_TAU / 41.0), cos(tm * PAPER_TAU / 29.0 + 0.6));
  float depth = 0.55 + 0.25 * sin(tm * PAPER_TAU / 13.9 + 2.7) + 0.12 * sin(tm * PAPER_TAU / 21.7);
  float shade = smoothstep(0.42, 0.68, fbm(a / size + drift + 5.0, 2)) * depth;   // mean about 0.3 * depth

  float contrast = 1.0 + 0.22 * sin(tm * PAPER_TAU / 11.3 + 0.3) + 0.12 * sin(tm * PAPER_TAU / 27.1 + 1.9)
                 + 0.25 * uKick;
  return 1.0 + ${f(PAPER_TUNE.lightAmp)} * contrast * ((rake - 0.5) * 0.6 - (shade - 0.3 * depth) * 0.4);
}

// The bare sheet at rest: the paper colour with its texture and its light.
vec3 paperSheet(vec2 pc, vec2 uv, float tm) {
  return uPaper * paperTexture(pc, 1.0) * paperLight(uv, tm);
}
`;
