// The Model's foreground (phase 18): layers drifting in front of the grove and the share at their own
// speeds (docs/MOTION-BRIEF.md: the beats keep their camera moves, groveCamera and shareCamera, and gain
// layers of their own). Three layers of motes (pollen in the light: the nearest out of focus, bokeh, the
// farthest crisp), a few olive leaves crossing low in the frame, nearer than all of it, and, at the graft's
// hand-over to the grove, the push-through: the scion's leaves rushing across the lens. Over the share's
// white ground, a warm light drifts through the white (and nothing else).
//
// Every position is a function of the scroll units (`uFgX`: the layer slides at its own rate, so a
// stopped page holds it and scrubbing back replays it) and, for the sway and the rise, of the pass clock
// (still under reduced motion). The gain (timeline.ts foregroundGain) is 0 until the grove has opened
// and exactly 0 at the segment's end, so the share lands at rest on `art.share.lastFraming` and the
// Split opens on the same picture; sizes scale with it, so a mote shrinks away rather than fading
// (rule 3), and edges are printed (a Bayer threshold bites the soft edge, rule 2). Pixels are skipped
// where the gain is 0 (rule 14).
//
// The leaves and the light are worked out on the CPU (instances.ts) and handed over as uniforms: a leaf's
// place is the same for every pixel, so each pixel pays a distance test per leaf, not the hashes, trig and
// wind that decide it (the first version did, and cost the Model six milliseconds a frame). The motes are a
// lattice read per pixel, one cell per layer: a mote's place is the middle 0.2 to 0.8 of its cell and it is
// at most 0.13 of a cell across, so it never leaves it.
import { FOREGROUND } from "./timeline";

const f = (x: number) => x.toFixed(4);
const L = FOREGROUND.leaves;
const P = FOREGROUND.push;

const moteCalls = FOREGROUND.motes
  .map(
    (m) =>
      `  col = moteLayer(col, q, frag, ${f(m.cell)}, ${f(m.speed / 1000)}, ${f(m.rise)}, vec2(${f(m.r[0])}, ${f(m.r[1])}), ${f(m.density)}, ${f(m.alpha)}, ${f(m.soft)}, ${f(m.seed)}, tm);`,
  )
  .join("\n");

const indices = (n: number) => Array.from({ length: n }, (_, i) => i);
const leafUniforms = indices(L.count).map((i) => `uFgLeaf${i}`).join(", ");
const leafCalls = indices(L.count)
  .map((i) => `  col = leafLayer(col, q, frag, uFgLeaf${i}, uFgLeafSoft${i}, ${f(i)}, 0.0, 0.82);`)
  .join("\n");
const pushUniforms = indices(P.count).map((i) => `uFgPush${i}, uFgPushDir${i}`).join(", ");
const pushCalls = indices(P.count)
  .map((i) => `  col = pushLayer(col, q, frag, uFgPush${i}, uFgPushDir${i}, ${f(i + 40)});`)
  .join("\n");
const leafSoft = indices(L.count).map((i) => `uFgLeafSoft${i}`).join(", ");

export const FOREGROUND_GLSL = /* glsl */ `
uniform float uFgX;       // scroll units into the segment
uniform float uFgGain;    // timeline.ts foregroundGain: 0 before the grove has opened and at the end
uniform float uFgLight;   // timeline.ts shareLightGain
uniform float uFgPushOn;  // 1 while the push-through's leaves are crossing (timeline.ts pushGain > 0), else 0
uniform vec4 ${leafUniforms};      // each drifting leaf: its middle (frame heights), direction and half length (instances.ts)
uniform vec4 ${leafSoft};          // ... and the softness of its edge (x)
uniform vec4 ${pushUniforms};      // each push-through leaf: its middle, direction and half length; the direction it travels, its smear and its edge
uniform vec4 uFgPool0, uFgPool1, uFgPool2;   // the share's pools of light: middle, radius, strength

const vec3 FG_GOLD = vec3(0.96, 0.78, 0.38);

// A layer of motes, composited over col. The layer slides left 'speed' frame heights a scroll unit
// (content moves left as the camera travels right) and rises 'rise' a second; each lattice cell holds a
// mote with probability 'density', placed in the middle of its cell and swaying a little with the air (two
// incommensurate sines of the clock per axis, its own rates, rule 9), its own size (rule 13).
vec3 moteLayer(vec3 col, vec2 q, vec2 frag, float cell, float speed, float rise, vec2 rr, float density, float alpha, float soft, float seed, float tm) {
  vec2 W = q + vec2(uFgX * speed, -tm * rise);
  vec2 cid = floor(W / cell);
  float h = hash(cid + seed);
  if (h > density) return col;
  float h2 = hash(cid * 1.37 + seed + 5.1);
  float h3 = hash(cid * 0.73 + seed + 9.7);
  vec2 wob = vec2(sin(tm * (0.5 + 0.7 * h2) + h3 * 6.3) + 0.5 * sin(tm * (0.31 + 0.5 * h3) + h2 * 9.1),
                  sin(tm * (0.43 + 0.6 * h3) + h2 * 5.7) + 0.5 * sin(tm * (0.27 + 0.4 * h2) + h3 * 8.3));
  vec2 pos = (cid + 0.3 + 0.4 * vec2(h2, h3) + wob * 0.06) * cell;
  float r = mix(rr.x, rr.y, h2 * h2) * uFgGain;
  float d = length(W - pos);
  if (d > r * 1.6 + 0.004) return col;
  float aa = max(r * soft, 1.5 / uRes.y);
  float edge = d - r + (bayer4(frag) - 0.5) * aa * 0.9;     // the soft edge, printed
  float m = 1.0 - smoothstep(-aa, aa, edge);
  float tw = 0.7 + 0.3 * hash(vec2(h2 * 91.0, floor(tm * 3.0 + h3 * 30.0)));   // a flicker, hashed (rule 10)
  return mix(col, FG_GOLD, m * tw * (0.8 + 0.2 * h) * alpha);
}

// A leaf (a pointed oval, its length along its own x) at q: its coverage 0..1 through a soft, printed edge,
// and its point in leaf space (the length is -1..1) and half width for its colour. 'pos' is its middle,
// 'ang' its direction, 'size' its half length (frame heights), 'blur' the softness of its edge (frame heights).
float leafCover(vec2 q, vec2 pos, float ang, float size, float blur, vec2 frag, out vec2 l, out float wid) {
  float c = cos(ang);
  float s = sin(ang);
  vec2 d0 = q - pos;
  l = vec2(c * d0.x + s * d0.y, -s * d0.x + c * d0.y) / size;
  wid = 0.40 * pow(max(1.0 - l.x * l.x, 0.0), 0.75) * (1.1 - 0.25 * l.x);
  float dist = max(abs(l.y) - wid, (abs(l.x) - 1.0) * 0.4) * size;
  return 1.0 - smoothstep(-blur, blur, dist + (bayer4(frag) - 0.5) * blur * 0.6);
}

// A leaf's colour: dark olive on the shade side, lit yellow-green on the light side (up and left), a pale
// midrib and a warm rim on the lit edge. 'fresh' 0..1 lifts it toward a young leaf's green.
vec3 leafColor(vec2 l, float wid, float seed, float fresh) {
  float lit = smoothstep(-0.45, 0.55, -l.y * 0.9 - l.x * 0.15);
  vec3 base = mix(uLeaf, vec3(0.55, 0.72, 0.26), fresh * 0.6);
  vec3 lc = mix(base * 0.42, mix(base, vec3(0.78, 0.76, 0.30), 0.5), lit);
  lc += (vnoise(l * 3.0 + seed * 7.0) - 0.5) * 0.12;
  lc = mix(lc, vec3(0.80, 0.78, 0.45), exp(-l.y * l.y / 0.0025) * 0.22 * step(abs(l.x), 0.95));
  lc += vec3(0.30, 0.17, 0.0) * smoothstep(0.7, 1.0, abs(l.y) / max(wid, 0.05)) * lit * 0.5;
  return lc;
}

// One of the drifting olive leaves (instances.ts leafInstances): out of focus, a printed soft edge.
vec3 leafLayer(vec3 col, vec2 q, vec2 frag, vec4 A, vec4 B, float seed, float fresh, float opacity) {
  if (A.w <= 0.0) return col;
  vec2 d00 = q - A.xy;
  float reach = A.w * 1.5 + 0.05;
  if (dot(d00, d00) > reach * reach) return col;
  vec2 l;
  float wid;
  float m = leafCover(q, A.xy, A.z, A.w, B.x, frag, l, wid);
  if (m < 0.003) return col;
  return mix(col, leafColor(l, wid, seed, fresh), m * opacity);
}

// One of the push-through's leaves (instances.ts pushInstances): the scion's leaves rushing out of the frame's
// middle as the camera pushes through them into the canopy. Smeared along the push (rule 6): the leaf is read
// where it was a moment ago, the point moved toward the nearest place on its sweep (the centre's projection on
// the line it travels, clamped to the smear's length), and what the sweep leaves behind is a little fainter.
vec3 pushLayer(vec3 col, vec2 q, vec2 frag, vec4 A, vec4 B, float seed) {
  if (A.w <= 0.0) return col;
  vec2 dir = B.xy;
  float len = B.z;
  vec2 d00 = q - A.xy;
  float reach = A.w * 1.6 + len + 0.04;
  if (dot(d00, d00) > reach * reach) return col;
  PROBE(0.0);   // the e2e probe: where a leaf may be is the cut's crest (a bounding disc, not the leaf itself)
  float tt = clamp(dot(A.xy - q, dir), 0.0, len);
  vec2 l;
  float wid;
  float m = leafCover(q + dir * tt, A.xy, A.z, A.w, B.w, frag, l, wid) * (1.0 - 0.45 * tt / max(len, 1.0e-4));
  if (m < 0.003) return col;
  return mix(col, leafColor(l, wid, seed, 1.0), m * 0.96);
}

// The foreground over the frame: the far motes, the leaves, the near motes (bokeh), and over everything the
// push-through's leaves while they are crossing.
vec3 foreground(vec3 col, vec2 q, vec2 frag, float tm) {
  if (uFgGain > 0.0) {
${moteCalls.split("\n").slice(1).reverse().join("\n").replace(/^  /gm, "    ")}
${leafCalls.replace(/^  /gm, "    ")}
${moteCalls.split("\n")[0].replace(/^  /gm, "    ")}
  }
  if (uFgPushOn > 0.5) {
${pushCalls.replace(/^  /gm, "    ")}
  }
  return col;
}

// A pool of light: a gaussian of the given middle, radius and strength.
float lightPool(vec2 q, vec4 P) {
  vec2 d = (q - P.xy) / P.z;
  return P.w * exp(-dot(d, d));
}

// The share's white ground takes a warm light that drifts with the air: where the ground is pure white
// (the figure, his linen and the halves are not), a cream wash in three slow pools (instances.ts lightPools).
// 0 with the gain, so the ground is the white the Split opens on at the segment's end.
vec3 shareLight(vec3 col, vec2 q) {
  if (uFgLight <= 0.0) return col;
  float white = smoothstep(0.88, 0.96, min(col.r, min(col.g, col.b)));
  if (white <= 0.0) return col;
  float a = clamp(lightPool(q, uFgPool0) + lightPool(q, uFgPool1) + lightPool(q, uFgPool2), 0.0, 1.0) * white * uFgLight;
  return col * mix(vec3(1.0), vec3(1.0, 0.95, 0.875), a);
}
`;
