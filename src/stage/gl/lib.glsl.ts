// The GLSL library prepended to every fragment shader on the stage (WebGL 1, GLSL ES 1.00).
//
// Conventions shared by every pass:
//   - Screen uv has y DOWN: (0,0) is the top-left of the canvas, (1,1) the bottom-right. This matches
//     painting coordinates in src/content/art.ts and CSS, so a point mapped with uncover() can be
//     placed in the DOM as `left: x*100%; top: y*100%` with no flip.
//   - Textures are uploaded without UNPACK_FLIP_Y, so painting uv (0,0) is the top-left of the image
//     and `texture2D(tex, cover(uv, ...))` draws it upright.
//   - Shared uniforms are set once per frame by the pass manager (src/stage/gl/passes.ts).

/** The vertex shader for the single full-screen triangle. */
export const VERTEX_GLSL = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Appended after every pass: the pass's `main` is renamed `passMain` (program.ts) and this `main`
 * runs it, then, on a tall phone (uBand < 1, where the canvas is the band hung from the top of the
 * viewport), fades the base of the picture into the page colour over its lower 34%. The fade is
 * printed, not ramped (rule 2): a Bayer threshold bites the ramp, with its amplitude following the
 * ramp's own shape so the first and last rows of the fade are exact.
 */
export const EPILOGUE_GLSL = `
void main() {
  passMain();
  if (uBand < 0.999) {
    float y = (uRes.y - gl_FragCoord.y) / uRes.y;
    float f = clamp((y - 0.66) / 0.34, 0.0, 1.0);
    f = f * f * (3.0 - 2.0 * f);
    f = clamp(f + (bayer4(gl_FragCoord.xy) - 0.5) * 0.10 * sin(3.14159265 * f), 0.0, 1.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uPage, f);
  }
}
`;

/** Shared uniform declarations and helpers. Unused uniforms are optimized away per program. */
export const LIB_GLSL = `
// ---- shared uniforms, set once per frame -----------------------------------------------------
uniform vec2  uRes;      // canvas size in device pixels (gl_FragCoord space)
uniform float uDpr;      // device pixel ratio in use (capped at 2 and by the 3.4 Mpx budget)
uniform float uTime;     // seconds since the stage started: breath only, never scroll state
uniform float uP;        // smoothed scroll progress 0..1
uniform float uT;        // local progress 0..1 inside the active segment
uniform float uVel;      // scroll velocity in px per frame, signed (+ = scrolling down)
uniform vec2  uMouse;    // smoothed pointer, -1..1 on each axis with y down; 0 at rest
uniform float uStill;    // 1 under reduced motion: breath, parallax and drift must stop
uniform float uKick;     // exp decay from the last scroll stop: 1 at the stop, ~0.05 after 1.2 s
uniform int   uOctaves;  // fbm octaves for texture fields: 4 on desktop, 2 on phones
uniform float uBand;     // the picture's share of the viewport height: 1, down to 0.6 on tall phones
uniform vec3  uPage;     // the page colour the band's base fades into (see EPILOGUE_GLSL)

// ---- colour tokens from src/app/globals.css, read at start-up ---------------------------------
uniform vec3 uSky, uSkySoft, uMilk, uInk, uPress, uOrange, uLeaf, uMarble, uPaper;

// screenUV: the fragment as 0..1 with y down, matching painting coordinates and the DOM.
vec2 screenUV() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes; }

// luma: perceived brightness of a colour.
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// hash: 2D -> [0,1) without sin, so it stays stable on mobile GPUs. Decorrelated enough for
// stipple, slips and dot thresholds; feed it floor()ed cells and floor(time*k) (rule 10).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// hash: 1D variant for bands and instance seeds.
float hash(float n) { return hash(vec2(n, n * 0.6180339887 + 11.17)); }

// vnoise: value noise on the integer lattice with quintic interpolation, 0..1, C2 smooth so fbm
// ridges never show lattice creases.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fbm: 'octaves' octaves of vnoise (lacunarity 2, gain 0.5, a rotation per octave so the axes do
// not align), normalized to 0..1 so 2 octaves on a phone have the same amplitude as 4 on desktop.
// Octave count is a runtime value: GLSL ES 1.00 wants constant loop bounds, so the loop breaks.
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float norm = 0.0;
  mat2 r = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    norm += a;
    p = r * p * 2.0 + 17.3;
    a *= 0.5;
  }
  return v / max(norm, 1e-5);
}

// fbm: texture fields (grain, tooth, fibre, clouds) use uOctaves and drop to 2 on phones.
float fbm(vec2 p) { return fbm(p, uOctaves); }

// fbm4: motion fields (fronts, bites, lags) keep 4 octaves everywhere (docs/CHECKS.md phone test).
float fbm4(vec2 p) { return fbm(p, 4); }

// bayer2: the 2x2 ordered-dither threshold (0 .5 / .75 .25) a pixel sits on.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

// bayer4: the 4x4 Bayer threshold for a pixel, 1/32..31/32 with mean 0.5. Add (bayer4 - 0.5) * k
// to a front before the smoothstep so its boundary prints as a dot screen (rule 2).
float bayer4(vec2 a) { return bayer2(a * 0.5) * 0.25 + bayer2(a) + 1.0 / 32.0; }

// smear5: 5 taps trailing from uv back along -dir by len (uv units), centre-weighted. 'dir' is the
// direction the content moves (signed, not normalized), so the smear trails the motion and a
// direction that ramps through zero gives no smear at the seam (rules 6 and 12).
vec3 smear5(sampler2D s, vec2 uv, vec2 dir, float len) {
  vec2 d = dir * len;
  return texture2D(s, uv).rgb * 0.30
       + texture2D(s, uv - d * 0.25).rgb * 0.25
       + texture2D(s, uv - d * 0.50).rgb * 0.20
       + texture2D(s, uv - d * 0.75).rgb * 0.15
       + texture2D(s, uv - d).rgb * 0.10;
}

// blur: 9-tap 3x3 gaussian (1-2-1), radius in uv units of the vertical axis, aspect-corrected so
// the kernel is round on screen. For the radial softening near a lens (rule 7).
vec3 blur(sampler2D s, vec2 uv, float radius) {
  vec2 r = vec2(radius * uRes.y / uRes.x, radius);
  vec3 c = texture2D(s, uv).rgb * 4.0;
  c += (texture2D(s, uv + vec2(r.x, 0.0)).rgb + texture2D(s, uv - vec2(r.x, 0.0)).rgb
      + texture2D(s, uv + vec2(0.0, r.y)).rgb + texture2D(s, uv - vec2(0.0, r.y)).rgb) * 2.0;
  c += texture2D(s, uv + r).rgb + texture2D(s, uv - r).rgb
     + texture2D(s, uv + vec2(r.x, -r.y)).rgb + texture2D(s, uv + vec2(-r.x, r.y)).rgb;
  return c / 16.0;
}

// coverScale: the fraction of a texSize-aspect painting visible along each axis when it is
// cover-fitted to the viewport (1 on the axis that fits, less on the axis that overflows).
vec2 coverScale(vec2 texSize) {
  float va = uRes.x / uRes.y;
  float ta = texSize.x / texSize.y;
  return ta > va ? vec2(va / ta, 1.0) : vec2(1.0, ta / va);
}

// cover: screen uv (y down) -> painting uv (y down) for a source cover-fitted to any viewport,
// pushed in by 'zoom' about the centre and panned so the painting point 0.5 + pan sits at the
// viewport centre. pan is in painting units (-0.5..0.5); zoom 1 is a plain cover fit.
vec2 cover(vec2 uv, vec2 texSize, vec2 pan, float zoom) {
  return 0.5 + pan + (uv - 0.5) * coverScale(texSize) / zoom;
}

// uncover: the exact inverse of cover(): a point in the painting -> where it lands on screen, so
// an anchor from art.ts (a glint, a seam, a fingertip) is pinned at any viewport and any framing.
vec2 uncover(vec2 point, vec2 texSize, vec2 pan, float zoom) {
  return 0.5 + (point - 0.5 - pan) * zoom / coverScale(texSize);
}

// dollyAbout: push in by s about the point o, not the frame centre (rule 7: dolly, not scale).
vec2 dollyAbout(vec2 uv, vec2 o, float s) { return o + (uv - o) / s; }

// aspectUV: screen uv with x scaled by the aspect so distances are round on screen.
vec2 aspectUV(vec2 uv) { return vec2(uv.x * uRes.x / uRes.y, uv.y); }

// ---- the one hand: every cut's front, edge, print-in, crest and grain come from here -----------
// Each section passes its own numbers (pitch, amplitudes, seeds); the gesture is written once.

// bite2: the bite on a front (rule 1): two decorrelated fbm fields at different scales, centred, with
// their own seeds (s1, s2: a drift of the finer field with travel or time goes into s2).
float bite2(vec2 q, float f1, float a1, float f2, float a2, vec2 s1, vec2 s2) {
  return (fbm4(q * f1 + s1) - 0.5) * a1 + (fbm4(q * f2 + s2) - 0.5) * a2;
}

// printEdge: the printed boundary (rule 2): a 4x4 Bayer threshold and a hash stipple to add to a
// front before its smoothstep, so breakup is a print screen, never an alpha ramp.
float printEdge(vec2 frag, float bayerAmp, float stippleAmp) {
  return (bayer4(frag) - 0.5) * bayerAmp + (hash(floor(frag / 2.0)) - 0.5) * stippleAmp;
}

// printStipple: the threshold a halftone print-in hands its gaps over through (Bayer 0.12, stipple 0.06).
float printStipple(vec2 frag) { return printEdge(frag, 0.12, 0.06); }

// The halftone screens on the page are laid at 15 degrees, so they moire against the pixel grid.
const float PRINT_ANGLE = 0.2618;

// screenCell: one halftone cell at an angle: its id, the fragment's place in it (-0.5..0.5 on each
// axis) and the screen uv (y down) of its centre, where the coverage and the tone are read.
void screenCell(vec2 frag, float cellPx, float ang, out vec2 cid, out vec2 loc, out vec2 uvC) {
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 g = vec2(cs * frag.x + sn * frag.y, -sn * frag.x + cs * frag.y) / cellPx;
  cid = floor(g);
  loc = g - cid - 0.5;
  vec2 cc = (cid + 0.5) * cellPx;
  vec2 fc = vec2(cs * cc.x - sn * cc.y, sn * cc.x + cs * cc.y);
  uvC = vec2(fc.x, uRes.y - fc.y) / uRes;
}

// dotGrow: the dot of a cell at coverage cov: radius sqrt(cov) * 0.82 cells, every dot its own size
// (rule 13), anti-aliased over 0.75 px, nothing under a 5% radius. Past 0.71 the dots overlap.
float dotGrow(float cov, vec2 loc, vec2 cid, float cellPx) {
  float r = sqrt(cov) * 0.82 * (0.92 + 0.16 * hash(cid + 7.0));
  float aa = 0.75 / cellPx;
  return (1.0 - smoothstep(r - aa, r + aa, length(loc))) * smoothstep(0.0, 0.05, r);
}

// printGaps / printMerged: past the half-way point of a print-in the gaps between the dots take the
// picture (0.30..0.65 of coverage) and the dots dissolve into it last (0.45..0.74), both through the
// printed threshold, never a fade.
float printGaps(float cov, vec2 frag) { return smoothstep(0.30, 0.65, cov + printStipple(frag) * 0.8); }
float printMerged(float cov, vec2 frag) { return smoothstep(0.45, 0.74, cov + printStipple(frag) * 0.8); }

// printIn: the halftone print-in. Dots carrying the picture's tone at the cell grow on 'ground' until
// they merge; the gaps between them take the picture through the printed threshold, and the dots
// dissolve into it last. cov = 0 is the ground, cov = 1 the picture, exactly, and no mosaic of flat
// cells ever shows (rule 3: one driver).
vec3 printIn(vec3 ground, vec3 tone, vec3 paint, float cov, vec2 loc, vec2 cid, float cellPx, vec2 frag) {
  float c = cov + printStipple(frag) * 0.8;                     // the threshold once, for both hand-overs
  float dotMask = dotGrow(cov, loc, cid, cellPx);
  return mix(mix(ground, paint, smoothstep(0.30, 0.65, c)), mix(tone, paint, smoothstep(0.45, 0.74, c)), dotMask);
}

// printAlpha: the same print-in as a coverage for a layer over its ground (the dots, then the whole).
float printAlpha(float cov, vec2 loc, vec2 cid, float cellPx, vec2 frag) {
  return mix(dotGrow(cov, loc, cid, cellPx), 1.0, printMerged(cov, frag));
}

// crestBand: the crest on a ring front: a gaussian band exp(-x^2 / sigma2) in the signed front
// distance with the red and blue channels split +-split along it (the chroma split, rule 8).
vec3 crestBand(float edge, float split, float sigma2) {
  vec3 x = vec3(edge) + vec3(split, 0.0, -split);
  return exp(-x * x / sigma2);
}

// filmGrain: the paintings' grain, +-amp/2, hashed per pixel and re-hashed every 1/24 s (rule 10).
float filmGrain(vec2 frag, float tm, float amp) {
  return (hash(frag + floor(tm * 24.0) * vec2(37.1, 17.3)) - 0.5) * amp;
}
`;
