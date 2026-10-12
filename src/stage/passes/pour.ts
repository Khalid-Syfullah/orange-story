// The halftone pour, shared by the hero and the finale: rows of dots leaving a spout and falling
// toward the ground, in screen coordinates (the caller maps its painting's anchors to the aspect
// corrected screen with aspectUV). Needs the shared library (hash, uRes, uDpr) and the palette.
export const POUR_GLSL = /* glsl */ `
// The pour: halftone rows leaving the spout, advancing 13 cells per second, hash-thinned, denser on
// the centre line and dying over the last 20% of the length.
// pourWith answers the scroll's speed (the hero): 'spray' 0..1 widens the stream, keeps more of its
// dots, makes them larger and lets the stream run further; 'lean' -1..1 swings its lower end sideways
// (positive toward +n, the way the camera's sweep leaves it). Both 0 is the plain pour, exactly.
vec3 pourWith(vec3 col, vec2 q, vec2 A, vec2 B, float tm, float spray, float lean) {
  vec2 ax = B - A;
  float L = length(ax);
  if (L < 1.0e-4) return col;
  vec2 dir = ax / L;
  vec2 rel = q - A;
  float s = dot(rel, dir);
  float n = dot(rel, vec2(-dir.y, dir.x)) - lean * 0.03 * clamp(s / L, 0.0, 1.2);
  float cell = 4.6 * uDpr / uRes.y;
  if (s < -cell || s > L * (1.0 + 0.15 * spray) + cell || abs(n) > 0.05 + 0.04 * spray) return col;
  float row = floor(s / cell - 13.0 * tm);
  float stag = mod(row, 2.0) * 0.5;
  float ci = floor(n / cell + stag);
  float cs = (row + 0.5 + 13.0 * tm) * cell;           // the cell centre, along and across
  float cn = (ci + 0.5 - stag) * cell;
  float f = cs / L;
  float hw = (0.010 + 0.007 * f) * (1.0 + 0.8 * spray);
  float cw = exp(-(cn * cn) / (hw * hw));              // denser on the centre line
  float dens = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.8 + 0.15 * spray, 1.0 + 0.15 * spray, f));
  float keep = step(hash(vec2(row, ci)), cw * dens * (1.1 + 0.5 * spray));
  float rad = (0.30 + 0.16 * hash(vec2(ci, row) + 3.7)) * (0.55 + 0.45 * cw) * (1.0 + 0.25 * spray);
  float dd = length(vec2(s - cs, n - cn)) / cell;
  float m = (1.0 - smoothstep(rad - 0.12, rad + 0.12, dd)) * keep;
  vec3 water = mix(uSkySoft, uMilk, 0.75);
  return mix(col, water, m * 0.92);
}

vec3 pour(vec3 col, vec2 q, vec2 A, vec2 B, float tm) {
  return pourWith(col, q, A, B, tm, 0.0, 0.0);
}
`;
