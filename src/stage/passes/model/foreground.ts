// The Model's foreground (phase 18): layers drifting in front of the grove and the share at their own
// speeds (docs/MOTION-BRIEF.md: the beats keep their camera moves, groveCamera and shareCamera, and gain
// layers of their own). Three layers of motes (pollen in the light: the nearest out of focus, bokeh, the
// farthest crisp) and a few olive leaves crossing low in the frame, nearer than all of it. Over the
// share's white ground, a warm light drifts through the white (and nothing else).
//
// Every position is a function of the scroll units (`uFgX`: the layer slides at its own rate, so a
// stopped page holds it and scrubbing back replays it) and, for the sway and the rise, of the pass clock
// (still under reduced motion). The gain (timeline.ts foregroundGain) is 0 until the grove has opened
// and exactly 0 at the segment's end, so the share lands at rest on `art.share.lastFraming` and the
// Split opens on the same picture; sizes scale with it, so a mote shrinks away rather than fading
// (rule 3), and edges are printed (a Bayer threshold bites the soft edge, rule 2). Pixels are skipped
// where the gain is 0 (rule 14).
import { FOREGROUND } from "./timeline";

const f = (x: number) => x.toFixed(4);
const L = FOREGROUND.leaves;
const W = FOREGROUND.wind;

const moteCalls = FOREGROUND.motes
  .map(
    (m) =>
      `  col = moteLayer(col, q, frag, ${f(m.cell)}, ${f(m.speed / 1000)}, ${f(m.rise)}, vec2(${f(m.r[0])}, ${f(m.r[1])}), ${f(m.density)}, ${f(m.alpha)}, ${f(m.soft)}, ${f(m.seed)}, tm);`,
  )
  .join("\n");

export const FOREGROUND_GLSL = /* glsl */ `
uniform float uFgX;       // scroll units into the segment
uniform float uFgGain;    // timeline.ts foregroundGain: 0 before the grove has opened and at the end
uniform float uFgLight;   // timeline.ts shareLightGain

const vec4 FG_WIND = vec4(${f(W.scale)}, ${f(W.speed)}, ${f(W.flutter)}, ${f(W.flutterSpeed)});
const float FG_FROM = ${f(FOREGROUND.from)};
const float FG_TO = ${f(FOREGROUND.to)};
const float FG_LEAF_DUR = ${f(L.dur)};
const vec3 FG_GOLD = vec3(0.96, 0.78, 0.38);

// A layer of motes, composited over col. The layer slides left 'speed' frame heights a scroll unit
// (content moves left as the camera travels right) and rises 'rise' a second; each lattice cell holds a
// mote with probability 'density', jittered inside the cell, swaying a little in the wind, its own size
// (rule 13); the three-by-three neighbours cover a mote that has strayed across a cell line.
vec3 moteLayer(vec3 col, vec2 q, vec2 frag, float cell, float speed, float rise, vec2 rr, float density, float alpha, float soft, float seed, float tm) {
  vec2 W = q + vec2(uFgX * speed, -tm * rise);
  vec2 base = floor(W / cell);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = base + vec2(float(i), float(j));
      float h = hash(cid + seed);
      if (h > density) continue;
      float h2 = hash(cid * 1.37 + seed + 5.1);
      float h3 = hash(cid * 0.73 + seed + 9.7);
      // The mote's place in its cell, and its sway: a slow wander from the clock, never a periodic sine.
      vec2 wob = vec2(vnoise(vec2(tm * 0.21 + h2 * 40.0, h3 * 9.0)), vnoise(vec2(h3 * 33.0, tm * 0.17 + h2 * 7.0))) - 0.5;
      vec2 pos = (cid + 0.2 + 0.6 * vec2(h2, h3) + wob * 0.28) * cell;
      float r = mix(rr.x, rr.y, h2 * h2) * uFgGain;
      float d = length(W - pos);
      if (d > r * 1.6 + 0.004) continue;
      float aa = max(r * soft, 1.5 / uRes.y);
      float edge = d - r + (bayer4(frag) - 0.5) * aa * 0.9;     // the soft edge, printed
      float m = 1.0 - smoothstep(-aa, aa, edge);
      float tw = 0.7 + 0.3 * hash(vec2(h2 * 91.0, floor(tm * 3.0 + h3 * 30.0)));   // a flicker, hashed (rule 10)
      acc = max(acc, m * tw * (0.8 + 0.2 * h));
    }
  }
  return mix(col, FG_GOLD, acc * alpha);
}

// The olive leaves: each its own size, lane, crossing time, tumble and pace, out of focus (a soft printed
// edge), lit from the upper left, a midrib and a warm rim; swaying with the wind and crossing right to
// left (the way the camera's travel moves things) in about FG_LEAF_DUR units.
vec3 leaves(vec3 col, vec2 q, vec2 frag, float tm) {
  float asp = uRes.x / uRes.y;
  for (int i = 0; i < ${L.count}; i++) {
    float fi = float(i);
    float h1 = hash(fi * 3.17 + 1.3);
    float h2 = hash(fi * 5.41 + 2.7);
    float h3 = hash(fi * 7.13 + 4.1);
    float h4 = hash(fi * 11.7 + 0.9);
    float dur = FG_LEAF_DUR * (0.8 + 0.5 * h1);
    float u0 = mix(FG_FROM, FG_TO - dur, (fi + 0.2 + 0.6 * h2) / ${f(L.count)});
    float prog = (uFgX - u0) / dur;
    if (prog < -0.04 || prog > 1.04) continue;
    float size = mix(${f(L.size[0])}, ${f(L.size[1])}, h3) * uFgGain;
    if (size < 1.0e-3) continue;
    vec2 pos = vec2(mix(asp + 1.4 * size, -1.4 * size, prog),
                    mix(${f(L.lane[0])}, ${f(L.lane[1])}, h4) + 0.05 * sin(prog * 3.1 + h1 * 6.0));
    // Far from the leaf (the wind moves it by 0.03 at most): nothing to draw, and no wind to look up.
    vec2 d00 = q - pos;
    float reach = size * 1.5 + 0.05;
    if (dot(d00, d00) > reach * reach) continue;
    vec2 w = windAt(pos, tm, FG_WIND);
    pos += vec2(w.x * 0.012, w.y * 0.02);
    float ang = -0.5 + (h2 - 0.5) * 1.3 + prog * (h3 - 0.5) * 2.4 + 0.22 * w.x;
    float c = cos(ang);
    float s = sin(ang);
    vec2 d0 = q - pos;
    vec2 l = vec2(c * d0.x + s * d0.y, -s * d0.x + c * d0.y) / size;   // leaf space: the length is -1..1
    float wid = 0.40 * pow(max(1.0 - l.x * l.x, 0.0), 0.75) * (1.1 - 0.25 * l.x);
    float dist = max(abs(l.y) - wid, (abs(l.x) - 1.0) * 0.4) * size;
    float blur = ${f(L.blur)} * (0.6 + 1.2 * h3);
    float m = 1.0 - smoothstep(-blur, blur, dist + (bayer4(frag) - 0.5) * blur * 0.9);
    if (m < 0.003) continue;
    // Colour: dark olive on the shade side, lit yellow-green on the light side (up and left), a pale midrib.
    float lit = smoothstep(-0.45, 0.55, -l.y * 0.9 - l.x * 0.15);
    vec3 lc = mix(uLeaf * 0.42, mix(uLeaf, vec3(0.78, 0.76, 0.30), 0.5), lit);
    lc += (fbm(l * 3.0 + fi * 7.0, 2) - 0.5) * 0.10;
    lc = mix(lc, vec3(0.80, 0.78, 0.45), exp(-l.y * l.y / 0.0025) * 0.22 * step(abs(l.x), 0.95));
    lc += vec3(0.30, 0.17, 0.0) * smoothstep(0.7, 1.0, abs(l.y) / max(wid, 0.05)) * lit * 0.5;   // a warm rim on the lit edge
    col = mix(col, lc, m * ${f(L.opacity)});
  }
  return col;
}

// The foreground over the frame: the far motes, the leaves, then the near motes (bokeh), over everything.
vec3 foreground(vec3 col, vec2 q, vec2 frag, float tm) {
  if (uFgGain <= 0.0) return col;
${moteCalls.split("\n").slice(1).reverse().join("\n")}
  col = leaves(col, q, frag, tm);
${moteCalls.split("\n")[0]}
  return col;
}

// The share's white ground takes a warm light that drifts with the air: where the ground is pure white
// (the figure, his linen and the halves are not), a cream wash in slow patches of two scales. 0 with
// the gain, so the ground is the white the Split opens on at the segment's end.
vec3 shareLight(vec3 col, vec2 q, float tm) {
  if (uFgLight <= 0.0) return col;
  float white = smoothstep(0.88, 0.96, min(col.r, min(col.g, col.b)));
  if (white <= 0.0) return col;
  float m1 = fbm(q * 1.1 + vec2(tm * 0.012, 4.3));
  float m2 = fbm(q * 3.6 + vec2(-tm * 0.02, 9.1));
  float k = clamp(0.45 + (m1 - 0.5) * 1.7 + (m2 - 0.5) * 0.5, 0.0, 1.0);
  // A pool of light high in the frame's left, where the light comes from (the painting's own).
  float pool = exp(-dot((q - vec2(0.35 * uRes.x / uRes.y, 0.22)) * vec2(0.8, 1.2), (q - vec2(0.35 * uRes.x / uRes.y, 0.22)) * vec2(0.8, 1.2)) / 0.28);
  float a = clamp(k * ${f(FOREGROUND.light.strength)} - pool * 0.18, 0.0, 1.0) * white * uFgLight;
  return col * mix(vec3(1.0), vec3(1.0, 0.95, 0.875), a);
}
`;
