// The Terms on paper: the drawing, its window and the margin orange, drawn into the sheet of
// passes/paper.ts (docs/TRANSITIONS.md rows Sheet -> drawing and Drawing -> panel).
//
//   - the ink: the drawing (the `drawing` sequence, then the `plan` still, which is its last frame)
//     divided by its own paper colour and multiplied into the sheet, so line and wash sit in the
//     paper (ink on paper, not a picture over it). Its paper leaves a faint warm wash, so the panel
//     reads as a patch the drawing was laid on; the drawing's paper mottle is softened so the
//     sheet's own pulp carries the texture;
//   - the soak: from the drawing's centre, holding the whole frame:
//     coverage = t*4.2 - dist*1.9 + (fbm(q*3) - 0.5)*0.7, plus a finer field at a third of the bite
//     (rule 1: two decorrelated scales), so patches spread and join and the front is never a compass
//     circle. Its boundary is printed with a Bayer threshold and a hash stipple (rule 2); behind it
//     the ink is a smudge (the drawing blurred and pale) that resolves into line as the coverage
//     rises; a tide line sits in a band that travels with the front (rule 8);
//   - the window: one rounded rect in CSS px, its edge brushed: the signed distance in bands,
//     eaten by a broad tear and a finer fray running along the edge (bristle streaks), both anchored
//     to the paper and advancing at 0.02 per second (a held frame breathes at the fray), then printed
//     (rule 2). Inside the band the ink thins before it breaks up, like a dry brush. The picture
//     samples through the window's centre with its own side, so it zooms inside the cutout; while it
//     moves it is smeared along this frame's motion (rule 6);
//   - the margin orange: a small gilded orange raymarched only inside its bounding circle: an oblate
//     sphere with the stem end sunk, a stalk and a leaf, dimple noise on the normal, the sheet's warm
//     raking key light (its intensity read from paperLight at the orange), a bounce from the paper,
//     a burnished gold specular; a soft contact shadow multiplied into the paper. It turns at
//     0.11 rad/s with a 0.03 rad wobble traced by two sines, and prints in as a halftone screen
//     whose dots grow until they merge (the gesture the Work's orange prints in with), its shadow on
//     the same driver (rule 3). Skipped when uFruit.w is 0 (frames under 768 px wide);
//   - fast paths (rule 14): the soak is identity once it covers everything and skipped where it
//     provably has not started; the window's noise runs only inside its band; the orange only
//     inside its circle.
//
// TERMS_GLSL holds the uniforms and functions, `termsPage()` the whole page at a pixel; TERMS_FRAG
// is the pass. The close (phase 10) can draw the panel at rest with the same chunk.
import { PAPER_GLSL } from "../paper";
import { TERMS_TUNE } from "./timeline";

const f = (x: number) => x.toFixed(4);

export const TERMS_GLSL = /* glsl */ `
${PAPER_GLSL}
uniform sampler2D uDraw;     // the drawing sequence's nearest decoded frame
uniform vec2 uDrawSize;
uniform sampler2D uPlan;     // the plan still (the orbit's last frame)
uniform vec2 uPlanSize;
uniform float uUsePlan;      // 1: sample the plan
uniform float uDrawReady;    // 0 until the drawing has real pixels (then no ink at all)
uniform float uSoak;         // the soak's T: -0.1 (nothing) .. 1 (the whole frame has the ink)
uniform vec4 uWin;           // the window: centre and half-size, CSS px (y down)
uniform vec2 uWinEdge;       // the brushed band's width and the corner radius, CSS px
uniform vec3 uPic;           // the picture: centre (CSS px) and side (CSS px per texture unit)
uniform vec3 uMove;          // this frame's motion of the picture: centre (CSS px) and log side
uniform vec4 uFruit;        // the margin orange: centre and radius (CSS px), on (0 or 1)
uniform float uFruitIn;     // its arrival 0..1

// The drawing's own paper (measured on the frames' plain paper) and the wash it leaves.
const vec3 DRAW_PAPER = vec3(0.912, 0.871, 0.788);
const vec3 PANEL_WASH = vec3(0.958, 0.938, 0.896);

// The soak.
const float SOAK_DONE = 0.999;    // T past which every pixel is covered and sharp (fast path)
const float SOAK_BITE = 0.58;     // bound on the bite and the print (fast path)
const float SOAK_EDGE = 0.30;     // coverage over which a patch's boundary prints in
const float SMUDGE = 0.016;       // the smudge's blur radius (texture units) at the front
const float SMEAR_MAX = ${f(TERMS_TUNE.smearMax)};   // cap on one frame's smear, CSS px

// The window's brushed edge, in bands.
const float TEAR = 2.4;           // the broad tear
const float FRAY = 0.9;           // the finer fray
const float FRAY_RATE = 0.02;     // how fast both fields advance (their own units per second)
const float EDGE_REACH = 2.3;     // bound on |front - e| including the print (fast paths)

// The orange.
const vec3 KEY_DIR = vec3(-0.55, 0.62, 0.56);       // from the upper left, like the sheet's light
const vec3 KEY_COL = vec3(1.06, 0.97, 0.84);
const vec3 PEEL = vec3(0.92, 0.50, 0.11);
const vec3 PEEL_HI = vec3(0.98, 0.67, 0.23);
const vec3 GOLD = vec3(1.0, 0.86, 0.58);
const vec3 SHADOW_TINT = vec3(0.66, 0.64, 0.68);
const float OR_BOUND = 1.48;      // bounding circle, in orange radii
const float DIMPLE = 17.0;        // dimple cells per radius (a few px apart at a 40 px radius)
const float DIMPLE_DEPTH = 0.07;  // how far a dimple tips the normal

float gFrameH;
mat3 gRot;

// ---- the drawing ---------------------------------------------------------------------------

vec3 drawTex(vec2 t) {
  return uUsePlan > 0.5 ? texture2D(uPlan, t).rgb : texture2D(uDraw, t).rgb;
}

// The drawing as ink: its paper divided out, the paper's mottle softened, a faint warm wash where
// its paper was, and nothing outside its square.
vec3 inkOf(vec3 c, vec2 t) {
  vec3 r = min(c / DRAW_PAPER, vec3(1.02));
  float lr = luma(c) / luma(DRAW_PAPER);
  float inky = 1.0 - smoothstep(0.86, 0.96, lr);
  r = mix(mix(vec3(1.0), r, 0.4), r, inky) * PANEL_WASH;
  vec2 e = min(t, 1.0 - t);
  return mix(vec3(1.0), r, smoothstep(0.0, 0.03, min(e.x, e.y)));
}

// Five taps trailing back along this frame's motion (texture units), centre-weighted (rule 6).
vec3 smearDraw(vec2 t, vec2 d) {
  return drawTex(t) * 0.30 + drawTex(t - d * 0.25) * 0.25 + drawTex(t - d * 0.50) * 0.20
       + drawTex(t - d * 0.75) * 0.15 + drawTex(t - d) * 0.10;
}

// ---- the soak --------------------------------------------------------------------------------

// The soak's coverage before printing: from the picture's centre, bitten at two scales.
float soakField(vec2 pc) {
  vec2 q = (pc - uPic.xy) / gFrameH;
  float n1 = fbm4(q * 3.0 + vec2(1.7, 5.3)) - 0.5;
  float n2 = fbm4(q * 8.3 + vec2(-4.1, 2.2) + vec2(0.0, uSoak * 0.4)) - 0.5;
  return uSoak * 4.2 - length(q) * 1.9 + n1 * 0.7 + n2 * 0.22;
}

// ---- the window ------------------------------------------------------------------------------

// The window's coverage at a pixel, 0..1, printed. 'thin' returns how far the ink has thinned
// toward the edge (a dry brush), 0 inside; 'pool' the band just inside the edge where the stroke
// left more pigment (it travels with the edge, rule 8).
float windowCover(vec2 pc, vec2 frag, float tm, out float thin, out float pool) {
  thin = 0.0;
  pool = 0.0;
  vec2 d = abs(pc - uWin.xy) - (uWin.zw - uWinEdge.y);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uWinEdge.y;
  float e = sd / uWinEdge.x;
  if (e < -EDGE_REACH - 1.2) return 1.0;
  if (e > EDGE_REACH) return 0.0;
  vec2 nq = pc / gFrameH;
  float adv = FRAY_RATE * tm;
  float n1 = fbm4(nq * 5.0 + vec2(3.7, -1.9) + vec2(1.0, 0.6) * adv) - 0.5;
  // The fray runs along the edge (bristle streaks): stretched along y on the sides, along x on the
  // top and bottom, blended across the corner's diagonal so there is no seam.
  vec2 nf = nq + vec2(-8.3, 4.1) + vec2(-0.7, 1.0) * adv;
  float side = smoothstep(-0.25, 0.25, (d.x - d.y) / uWinEdge.x);
  float fs = fbm4(nf * vec2(24.0, 5.0)) - 0.5;
  float ft = fbm4(nf * vec2(5.0, 24.0)) - 0.5;
  float n2 = mix(ft, fs, side);
  float front = e + n1 * TEAR + n2 * FRAY;
  thin = smoothstep(-1.4, 0.0, front);
  pool = smoothstep(-1.0, -0.3, front) * (1.0 - smoothstep(-0.3, 0.1, front));
  float pf = front + (bayer4(frag) - 0.5) * 0.36 + (hash(floor(frag / 2.0) + 3.1) - 0.5) * 0.26;
  return 1.0 - smoothstep(-0.08, 0.08, pf);
}

// ---- the margin orange -----------------------------------------------------------------------

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// The orange in its own frame (radius 1, y up): an oblate body with the stem end sunk, a stalk
// and one leaf. m: 0 peel, 1 stalk, 2 leaf.
float orangeSDF(vec3 p, out float m) {
  float body = sdEllipsoid(p, vec3(1.0, 0.94, 1.0));
  body += 0.07 * exp(-dot(p.xz, p.xz) / 0.012) * smoothstep(0.55, 0.94, p.y);
  float stalk = sdCapsule(p, vec3(0.0, 0.82, 0.0), vec3(0.05, 1.05, 0.02), 0.042);
  vec3 lp = p - vec3(0.05, 1.0, 0.02);
  lp = vec3(0.93 * lp.x + 0.37 * lp.y, -0.37 * lp.x + 0.93 * lp.y, lp.z);   // tipped up 22 degrees
  lp = vec3(0.94 * lp.x - 0.34 * lp.z, lp.y, 0.34 * lp.x + 0.94 * lp.z);   // and turned off the axis
  lp.y += 0.28 * lp.x * lp.x - 0.1 * lp.z * lp.z;                           // the blade curls
  float leaf = sdEllipsoid(lp - vec3(0.36, 0.0, 0.0), vec3(0.38, 0.02, 0.15)) * 0.7;
  m = 0.0;
  float d = body;
  if (stalk < d) { d = stalk; m = 1.0; }
  if (leaf < d) { d = leaf; m = 2.0; }
  return d;
}

float orangeDist(vec3 p) {
  float m;
  return orangeSDF(p, m);
}

// Value noise in 3D (object space), 0..1: the peel's dimples and its colour mottle.
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec2 o = vec2(i.z * 17.13, i.z * 31.71);
  float a = mix(mix(hash(i.xy + o), hash(i.xy + vec2(1.0, 0.0) + o), u.x),
                mix(hash(i.xy + vec2(0.0, 1.0) + o), hash(i.xy + vec2(1.0, 1.0) + o), u.x), u.y);
  o += vec2(17.13, 31.71);
  float b = mix(mix(hash(i.xy + o), hash(i.xy + vec2(1.0, 0.0) + o), u.x),
                mix(hash(i.xy + vec2(0.0, 1.0) + o), hash(i.xy + vec2(1.0, 1.0) + o), u.x), u.y);
  return mix(a, b, u.z);
}

// The orange's rotation (view -> object): a turn of 0.11 rad/s about its axis and a 0.03 rad
// wobble whose tilt is traced by two sines at incommensurate periods (rules 9, 10).
void orangeFrame(float tm) {
  float a = 0.11 * tm + 0.6;
  float wx = 0.03 * sin(tm * 6.2831853 / 6.7 + 0.4);
  float wz = 0.03 * sin(tm * 6.2831853 / 9.3 + 2.2);
  mat3 spin = mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a));
  mat3 tx = mat3(1.0, 0.0, 0.0, 0.0, cos(wx), sin(wx), 0.0, -sin(wx), cos(wx));
  mat3 tz = mat3(cos(wz), sin(wz), 0.0, -sin(wz), cos(wz), 0.0, 0.0, 0.0, 1.0);
  gRot = spin * tx * tz;
}

// The orange over the sheet at a pixel: 'col' is the sheet so far; returns it with the contact
// shadow multiplied in and the orange printed over it.
vec3 marginOrange(vec3 col, vec2 pc, vec2 frag, float tm) {
  float R = uFruit.z;
  vec2 rel = (pc - uFruit.xy) / R;                     // orange radii, y down
  float arrive = uFruitIn;

  // The print-in: a halftone screen at 15 degrees whose dots grow with a coverage spreading from
  // the orange's centre, bitten (rules 1, 2), until they merge. Identity once it has arrived.
  float printA = 1.0;
  float covPx = 1.0;
  if (arrive < 1.0) {
    float cellPx = 7.0 * uDpr;                          // the halftone cell, CSS px
    float cs = 0.9659;
    float sn = 0.2588;
    vec2 g = vec2(cs * frag.x + sn * frag.y, -sn * frag.x + cs * frag.y) / cellPx;
    vec2 cid = floor(g);
    vec2 loc = g - cid - 0.5;
    vec2 cc = (cid + 0.5) * cellPx;
    vec2 fc = vec2(cs * cc.x - sn * cc.y, sn * cc.x + cs * cc.y);
    vec2 relC = (vec2(fc.x, uRes.y - fc.y) / uDpr - uFruit.xy) / R;
    float bite = (fbm4(relC * 1.3 + 4.2) - 0.5) * 0.6 + (fbm4(relC * 3.1 - 2.7) - 0.5) * 0.22;
    float cov = clamp(arrive * 2.4 - length(relC) / OR_BOUND + bite, 0.0, 1.0);
    float stip = (bayer4(frag) - 0.5) * 0.12 + (hash(floor(frag / 2.0) + 9.7) - 0.5) * 0.06;
    float r = sqrt(cov) * 0.82 * (0.92 + 0.16 * hash(cid + 7.0));
    float aa = 0.75 / cellPx;
    float dotMask = (1.0 - smoothstep(r - aa, r + aa, length(loc))) * smoothstep(0.0, 0.05, r);
    printA = mix(dotMask, 1.0, smoothstep(0.45, 0.74, cov + stip * 0.8));
    covPx = clamp(arrive * 2.4 - length(rel) / OR_BOUND + bite, 0.0, 1.0);
  }

  // The contact shadow on the paper: offset down and right, away from the key light; a soft
  // penumbra and a tighter core under the fruit. Multiplied into the sheet on the orange's driver.
  float ds = length((rel - vec2(0.22, 0.30)) / vec2(1.06, 0.94));
  float dc = length(rel - vec2(0.07, 0.14));
  float sh = (1.0 - smoothstep(0.5, 1.4, ds)) * 0.30 + (1.0 - smoothstep(0.62, 1.02, dc)) * 0.14;
  col *= mix(vec3(1.0), SHADOW_TINT, sh * covPx);

  // The fruit: marched only inside its bounding circle, orthographic, from the viewer's side.
  if (dot(rel, rel) > OR_BOUND * OR_BOUND || printA <= 0.0) return col;
  vec3 ro = vec3(rel.x, -rel.y, 1.6);
  float t = 0.0;
  float best = 1e9;
  float bestT = 0.0;
  for (int i = 0; i < 40; i++) {
    float d = orangeDist(gRot * (ro - vec3(0.0, 0.0, t)));
    if (d < best) { best = d; bestT = t; }
    if (d < 0.0015 || t > 3.3) break;
    t += d * 0.9;
  }
  float pxObj = 1.0 / (R * uDpr);
  float alpha = 1.0 - smoothstep(0.0, pxObj * 1.4, best);
  if (alpha <= 0.0) return col;

  vec3 pv = ro - vec3(0.0, 0.0, bestT);
  vec3 po = gRot * pv;
  float m;
  orangeSDF(po, m);
  const vec2 k = vec2(1.0, -1.0);
  const float eps = 0.002;
  vec3 no = normalize(k.xyy * orangeDist(po + k.xyy * eps) + k.yyx * orangeDist(po + k.yyx * eps)
                    + k.yxy * orangeDist(po + k.yxy * eps) + k.xxx * orangeDist(po + k.xxx * eps));

  vec3 albedo;
  float gloss;
  float specK;
  if (m < 0.5) {
    // Dimples: pits in the peel's normal and its colour, turning with the fruit.
    vec3 dp = po * DIMPLE;
    float b = vnoise3(dp);
    vec3 gr = vec3(vnoise3(dp + vec3(0.3, 0.0, 0.0)) - b,
                   vnoise3(dp + vec3(0.0, 0.3, 0.0)) - b,
                   vnoise3(dp + vec3(0.0, 0.0, 0.3)) - b) / 0.3;
    no = normalize(no - DIMPLE_DEPTH * (gr - dot(gr, no) * no));
    float mott = vnoise3(po * 3.0 + 3.0);
    albedo = mix(PEEL, PEEL_HI, smoothstep(0.2, 0.9, mott)) * (0.93 + 0.07 * b);
    gloss = 90.0;
    specK = 0.9 * (0.6 + 0.4 * b);
  } else if (m < 1.5) {
    albedo = vec3(0.30, 0.25, 0.11);
    gloss = 12.0;
    specK = 0.12;
  } else {
    albedo = uLeaf * 0.82;
    gloss = 40.0;
    specK = 0.35;
  }

  vec3 n = no * gRot;                                     // back to view space (gRot is orthonormal)
  float keyI = paperLight(uFruit.xy / vec2(uRes.x, uRes.y) * uDpr, tm);
  float ndl = dot(n, KEY_DIR);
  float wrap = max((ndl + 0.28) / 1.28, 0.0);
  vec3 h = normalize(KEY_DIR + vec3(0.0, 0.0, 1.0));
  float ndh = max(dot(n, h), 0.0);
  float fres = pow(1.0 - max(n.z, 0.0), 3.0);
  vec3 amb = mix(uPaper * vec3(0.62, 0.52, 0.40), vec3(0.50, 0.48, 0.47), n.y * 0.5 + 0.5) * 0.5;
  vec3 c = albedo * (KEY_COL * wrap * keyI + amb);
  vec3 specCol = m < 0.5 ? GOLD : vec3(1.0, 0.97, 0.9);
  c += specCol * (pow(ndh, gloss) * specK + pow(ndh, 8.0) * 0.12 * specK) * keyI * step(0.0, ndl);
  c += GOLD * fres * (m < 0.5 ? 0.16 : 0.05);
  return mix(col, c, alpha * printA);
}

// ---- the page --------------------------------------------------------------------------------

// The sheet with the drawing in its window and the margin orange, at a pixel.
vec3 termsPage(vec2 frag, float tm) {
  vec2 uv = vec2(frag.x, uRes.y - frag.y) / uRes;
  vec2 pc = uv * uRes / uDpr;
  gFrameH = uRes.y / uDpr;
  vec3 col = paperSheet(pc, uv, tm);

  // The soak: printed coverage, sharpness and the tide line.
  float soak = 1.0;
  float sharp = 1.0;
  float tide = 0.0;
  if (uSoak < SOAK_DONE) {
    float reach = uSoak * 4.2 - length((pc - uPic.xy) / gFrameH) * 1.9 + SOAK_BITE;
    if (reach <= 0.0) {
      soak = 0.0;
    } else {
      float c = soakField(pc);
      float cp = c + (bayer4(frag) - 0.5) * 0.12 + (hash(floor(frag / 2.0)) - 0.5) * 0.08;
      soak = clamp(cp / SOAK_EDGE, 0.0, 1.0);
      sharp = smoothstep(0.25, 1.0, c);
      tide = smoothstep(0.0, 0.14, cp) * (1.0 - smoothstep(0.14, 0.5, c));
    }
  }

  float thin;
  float pool;
  float win = soak > 0.0 ? windowCover(pc, frag, tm, thin, pool) : 0.0;
  float amt = soak * win * uDrawReady;
  if (amt > 0.0) {
    vec2 t = (pc - uPic.xy) / uPic.z + 0.5;
    vec3 c0;
    // Smeared along this frame's motion while the picture moves (zero at rest).
    vec2 mv = uMove.xy + (pc - uPic.xy) * uMove.z;
    float ml = length(mv);
    if (ml > 0.5) {
      c0 = smearDraw(t, mv * min(1.0, SMEAR_MAX / ml) / uPic.z);
    } else {
      c0 = drawTex(t);
    }
    if (sharp < 0.995) {
      // The smudge: the drawing blurred and pale at the front, resolving into line behind it.
      // Its kernel is turned and sized per 2x2 block by a hash, so the blur is the grain of ink
      // spreading in the fibre rather than ghost copies of the line.
      vec2 hb = floor(frag / 2.0);
      float ang = hash(hb + 0.37) * 6.2831853;
      float r = (1.0 - sharp) * SMUDGE * (0.55 + 0.45 * hash(hb + 5.21));
      vec2 r1 = vec2(cos(ang), sin(ang)) * r;
      vec2 r2 = vec2(-r1.y, r1.x);
      vec3 b = (drawTex(t + r1) + drawTex(t - r1) + drawTex(t + r2) + drawTex(t - r2)) * 0.15
             + (drawTex(t + (r1 + r2) * 0.45) + drawTex(t - (r1 + r2) * 0.45) + drawTex(t + (r1 - r2) * 0.45)
              + drawTex(t - (r1 - r2) * 0.45)) * 0.1;
      vec3 smudge = mix(DRAW_PAPER, b, 0.62);
      c0 = mix(smudge, c0, sharp);
    }
    vec3 ink = inkOf(c0, t);
    // The dry brush: toward the window's edge the ink thins before it breaks up, and the stroke's
    // end holds a little more pigment.
    float a = amt * (1.0 - 0.3 * thin);
    col *= mix(vec3(1.0), ink * (1.0 - pool * 0.07 * vec3(0.8, 0.95, 1.2)), a);
  }
  // The tide line where the patches are spreading: a pale sepia bloom edge (rule 8).
  col *= 1.0 - tide * 0.05 * vec3(0.6, 0.8, 1.0) * uDrawReady;

  if (uFruit.w > 0.5) {
    vec2 rel = (pc - uFruit.xy) / uFruit.z;
    if (dot(rel, rel) < 2.4 * 2.4 && uFruitIn > 0.0) {
      orangeFrame(tm);
      col = marginOrange(col, pc, frag, tm);
    }
  }
  return col;
}
`;

export const TERMS_FRAG = /* glsl */ `
${TERMS_GLSL}

void main() {
  float tm = uTime * (1.0 - uStill);
  gl_FragColor = vec4(clamp(termsPage(gl_FragCoord.xy, tm), 0.0, 1.0), 1.0);
}
`;
