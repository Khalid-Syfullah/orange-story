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
`;
