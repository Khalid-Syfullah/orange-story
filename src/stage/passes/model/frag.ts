// The Model fragment shader: the segment's pictures (the bridge reel's last frame, the graft, the
// grove, the share keyframe and its second keyframe), each cover-fitted with its own pan, and the
// static treatment at a quarter of its amplitude for the cuts between them. Most of the time a
// single image is held and the shader is one tap and grain.
//
// The rest state (breath, parallax, drift) is the shared chunk, applied to every picture alike, so
// the reel's last frame here is exactly the bridge's last frame, and the share keyframe is what
// The Split opens on.
//
// The graft is drawn in two depth layers (the motion toolkit's depthShift, lib.glsl.ts): its pale
// cream ground is the far layer and the hands, branch, knife and leaves the near one, each sliding
// at its own rate of the camera's travel (the beat's drift, the pointer and the ambient drift), read
// through a soft lattice mask so the picture warps and never tears (art.ts graft.depth).
//
// Phase 18 (docs/MOTION-BRIEF.md): the graft's slow lateral dolly is wider (art.ts graft.drift) with its
// leaves stirring in the wind; the grove's cloudscape is left behind by the camera's travel (the pale sky
// is its own far layer, the leaves and fruit keep the camera's move) and its leaves stir; the grove and the
// share gain foreground layers drifting at their own speeds (foreground.ts), drawn over the cuts, and the
// share's white ground takes a drifting warm light. Each is 0 at the end of the segment.
//
// Phase 22 (docs/TRANSITIONS.md, Graft -> grove -> share): the grove -> share cut is a match cut on the gilded
// orange (match.ts solves the share's camera so its fruit lands where the grove's does, same size; the cut's
// tear, mosaic and chroma split are scaled to 0 in a disc round the fruit), and the keyframe cut inside the
// share is the knife's slice (slice.ts), not the static treatment.
import { art } from "@/content/art";
import { REST_GLSL } from "../rest";
import { STATIC_GLSL } from "../static";
import { FOREGROUND_GLSL } from "./foreground";
import { SLICE_GLSL } from "./slice";

const f = (x: number) => x.toFixed(4);
const depth = art.graft.depth;
const gSway = art.graft.sway;
const grove = art.grove;

export const MODEL_FRAG = /* glsl */ `
${REST_GLSL}
uniform sampler2D uReel, uGraft, uGrove, uShare, uShareLast;
uniform vec2 uReelSize, uGraftSize, uGroveSize, uShareSize, uShareLastSize;
uniform vec2 uPan;        // the hero's pan at this viewport (the reel keeps it)
uniform float uZoom;      // the hero's zoom
uniform vec2 uReelPan;    // the pan table's extra pan for the reel's last frame
uniform vec3 uF1, uF2, uF3, uF4;   // pan.xy and zoom for graft, grove, share, share keyframe 2
uniform float uImgA, uImgB;        // the two images on screen (equal when holding)
uniform float uCutC;               // the crest position (static.ts)
uniform vec2 uGraftCam;            // the graft's camera travel off its framing (the beat's drift), painting units
uniform vec2 uGraftCamMax;         // the bound on the travel the layers are fed (motion.ts depthTravelMax)
uniform vec2 uGraftSwayRoom;       // the room the graft's leaf sway may use (motion.ts swayRoom)
uniform vec2 uGroveCam;            // the grove's camera travel off its framing (groveCamera's pan), painting units
uniform vec2 uGroveCamMax;         // the bound on it
uniform vec2 uGroveSwayRoom;       // the room the grove's leaf sway may use
uniform float uShareOffK;          // the factor on the share's rest offset that keeps its fruit moving as the grove's does (match.ts)
uniform vec3 uDisc;                // the match cut's disc: the fruit's centre (screen uv) and radius (frame heights); 0 radius = off
uniform float uDiscSoft;           // its edge, as a share of the radius
uniform float uSliceOn;            // 1 while the slice is the cut in progress
uniform vec2 uGraftWind0, uGraftWind1, uGraftWind2;   // the wind over the graft at a quarter, the middle and three quarters of its width (index.ts, motion.ts windAt)
uniform vec2 uGroveWind0, uGroveWind1, uGroveWind2;   // ... and over the grove
${FOREGROUND_GLSL}
#define CUT_KEEP
${STATIC_GLSL}

const float GRAFT_NEAR = ${f(depth.near)};   // the hands, branch and leaves: rate of the camera's travel
const float GRAFT_FAR = ${f(depth.far)};     // the cream ground
const float GRAFT_CELL = ${f(depth.cell)};   // the layer mask's lattice, painting heights

const float GRAFT_SWAY = ${f(gSway.amp)};
const float GRAFT_SWAY_CELL = ${f(gSway.cell)};
const float GROVE_NEAR = ${f(grove.depth.near)};   // the leaves and fruit: rate of the camera's travel (1: the camera's own move)
const float GROVE_FAR = ${f(grove.depth.far)};     // the cloudscape
const float GROVE_CELL = ${f(grove.depth.cell)};
const vec4 GROVE_RECT = vec4(${f(grove.hold.x)}, ${f(grove.hold.y)}, ${f(grove.hold.w)}, ${f(grove.hold.h)});   // the sleeve, the cuff and the sky beside them
const float GROVE_HOLD_SWAY = ${f(grove.holdSway)};
const float GROVE_SWAY = ${f(grove.sway.amp)};
const float GROVE_SWAY_CELL = ${f(grove.sway.cell)};

int gA;
int gB;
float gZk;     // the breath, as a factor on every zoom
vec2 gOff;     // parallax and drift

// The wind over a painting, sampled once a frame on the CPU (motion.ts windAt, the same field) at three places
// along its width (a quarter, the middle and three quarters) and mixed by x where the leaves are: the gusts
// still cross the painting, and the ten noise octaves of windAt are neither compiled nor run per fragment (a cut
// reads the pictures a dozen ways, and a pixel at rest would pay for the field it only needs once).
vec2 windAcross(vec2 w0, vec2 w1, vec2 w2, float x) {
  return mix(mix(w0, w1, smoothstep(0.0, 0.5, x)), w2, smoothstep(0.5, 1.0, x));
}

// A painting's leaves stirring in the wind: the foliage mask read on a lattice anchored to the painting
// (a continuous field, so the warp compresses and never tears), times the wind at the point, times
// 'keep' (0..1: a region the sway spares), squeezed inside the room it may use. The displacement to add
// to the point 'pt' the leaves are read at; 0 under reduced motion and off the leaves.
vec2 leafSway(sampler2D tex, vec2 size, vec2 pt, vec2 w, float amp, float cellH, vec2 room, float keep) {
  if (uStill > 0.5) return vec2(0.0);
  float ar = size.x / size.y;
  vec2 cell = vec2(cellH / ar, cellH);
  float m = SOFT_MASK(tex, pt, cell, foliageMask) * keep;
  if (m < 0.002) return vec2(0.0);
  return softBound(vec2(w.x / ar, w.y) * (amp * m), room);
}

// The graft in its two layers: the camera's travel (the beat's drift plus the pointer and the
// ambient drift), bounded, moves the near layer (rate - 1) more and the far layer (1 - rate) less
// than the flat picture moved; the layer is read at the far layer's point.
vec3 graftAt(vec2 uv) {
  vec2 pt = cover(uv, uGraftSize, uF1.xy, uF1.z * gZk) + gOff;
  vec2 cam = softBound(uGraftCam + gOff, uGraftCamMax);
  vec2 nearOff = cam * (GRAFT_NEAR - 1.0);
  vec2 farOff = cam * (GRAFT_FAR - 1.0);
  vec2 cell = vec2(GRAFT_CELL * uGraftSize.y / uGraftSize.x, GRAFT_CELL);
  vec2 ptFar = pt + farOff;
  float near = 1.0 - SOFT_MASK(uGraft, ptFar, cell, paleMask);
  vec2 p2 = pt + depthShift(near, nearOff, farOff);
  p2 += leafSway(uGraft, uGraftSize, p2, windAcross(uGraftWind0, uGraftWind1, uGraftWind2, p2.x), GRAFT_SWAY, GRAFT_SWAY_CELL, uGraftSwayRoom, 1.0);
  return texture2D(uGraft, p2).rgb;
}

// 1 inside the grove's held region (the sleeve, the cuff, the sky beside them), eased over 0.04.
float groveHold(vec2 p) {
  vec2 a = smoothstep(GROVE_RECT.xy - 0.04, GROVE_RECT.xy + 0.04, p);
  vec2 b = 1.0 - smoothstep(GROVE_RECT.xy + GROVE_RECT.zw - 0.04, GROVE_RECT.xy + GROVE_RECT.zw + 0.04, p);
  return a.x * a.y * b.x * b.y;
}

// The pale cloudscape at a painting point: pale, and not in the held region (the lace cuff is as pale as
// cloud but sewn to the sleeve, so it stays with it).
float groveCloudAt(vec2 p) { return paleMask(texture2D(uGrove, p).rgb) * (1.0 - groveHold(p)); }

// ... at a lattice node, eroded (the least of the node and two taps half a cell away on a diagonal), so a leaf or a stem
// smaller than a cell is not left in the cloud layer by a node that fell in the gap beside it: the soft
// hand-over between the layers lies in the open sky, never across a leaf.
float groveCloudNode(vec2 p, vec2 r) {
  float m = groveCloudAt(p);
  m = min(m, groveCloudAt(p + r));
  m = min(m, groveCloudAt(p - r));
  return m;
}

// The grove in two layers: the camera's lateral travel (and the pointer and the ambient drift), bounded,
// leaves the cloudscape behind (the far layer moves (far - 1) of it, 0.7 of it back), while the leaves,
// the fruit and the branch keep the camera's own move (near 1); then the leaves stir.
vec3 groveAt(vec2 uv) {
  vec2 pt = cover(uv, uGroveSize, uF2.xy, uF2.z * gZk) + gOff;
  vec2 cam = softBound(uGroveCam + gOff, uGroveCamMax);
  vec2 nearOff = cam * (GROVE_NEAR - 1.0);
  vec2 farOff = cam * (GROVE_FAR - 1.0);
  vec2 cell = vec2(GROVE_CELL * uGroveSize.y / uGroveSize.x, GROVE_CELL);
  vec2 ptFar = pt + farOff;
  vec2 b = latticeBase(ptFar, cell);
  vec2 er = cell * 0.5;
  float far = latticeBlend(ptFar, cell, groveCloudNode(b, er), groveCloudNode(b + vec2(cell.x, 0.0), er), groveCloudNode(b + vec2(0.0, cell.y), er), groveCloudNode(b + cell, er));
  vec2 p2 = pt + depthShift(1.0 - far, nearOff, farOff);
  p2 += leafSway(uGrove, uGroveSize, p2, windAcross(uGroveWind0, uGroveWind1, uGroveWind2, p2.x), GROVE_SWAY, GROVE_SWAY_CELL, uGroveSwayRoom, mix(1.0, GROVE_HOLD_SWAY, groveHold(p2)));
  return texture2D(uGrove, p2).rgb;
}

// The share's two keyframes ride one camera (uF3 and uF4 differ only by their framing) and one rest offset, which the
// match scales so the fruit moves with the offset exactly as the grove's does (match.ts offScale).
vec3 imgShare(vec2 uv) { return texture2D(uShare, cover(uv, uShareSize, uF3.xy, uF3.z * gZk) + gOff * uShareOffK).rgb; }
vec3 imgShareLast(vec2 uv) { return texture2D(uShareLast, cover(uv, uShareLastSize, uF4.xy, uF4.z * gZk) + gOff * uShareOffK).rgb; }

vec3 img(int k, vec2 uv) {
  if (k == 0) return texture2D(uReel, cover(uv, uReelSize, uPan + uReelPan, uZoom * gZk) + gOff).rgb;
  if (k == 1) return graftAt(uv);
  if (k == 2) return groveAt(uv);
  if (k == 3) return imgShare(uv);
  return imgShareLast(uv);
}

float grain(vec2 frag) { return filmGrain(frag, uTime * (1.0 - uStill), 0.03); }

vec3 cutA(vec2 uv, vec2 frag) { return img(gA, uv) + grain(frag); }

vec3 cutB(vec2 uv, vec2 frag, float lag) {
  if (lag < 0.004) return img(gB, uv) + grain(frag);
  vec2 uvB = uv - cutDir() * lag * 0.05;     // still catching up with the edge that uncovered it
  vec2 d = cutDir() * lag * 0.03;
  // Five taps trailing along the way it moves (rule 6), in a loop so the whole picture (layers, sway and all)
  // is compiled once for them, not five times.
  vec3 c = vec3(0.0);
  for (int t = 0; t < 5; t++) {
    float ft = float(t);
    float wt = 0.30 - 0.05 * ft;                          // 0.30 0.25 0.20 0.15 0.10, as smear5 weights them
    c += img(gB, uvB - d * (0.25 * ft)) * wt;
  }
  return c + grain(frag);
}

// A cheap tap of whichever side 'behind' selects, for the crest's chroma split and rubbing: the pictures as
// they sit in their framing, without the graft's and the grove's layers and sway (a few pixels of difference
// that those effects, which read a difference of two nearby taps or a luminance, cannot show).
vec3 imgFlat(int k, vec2 uv) {
  if (k == 0) return texture2D(uReel, cover(uv, uReelSize, uPan + uReelPan, uZoom * gZk) + gOff).rgb;
  if (k == 1) return texture2D(uGraft, cover(uv, uGraftSize, uF1.xy, uF1.z * gZk) + gOff).rgb;
  if (k == 2) return texture2D(uGrove, cover(uv, uGroveSize, uF2.xy, uF2.z * gZk) + gOff).rgb;
  if (k == 3) return imgShare(uv);
  return imgShareLast(uv);
}

vec3 cutRaw(vec2 uv, float behind) {
  return imgFlat(behind > 0.5 ? gB : gA, uv);
}

${SLICE_GLSL}

// The match cut's disc: 1 inside it, eased to 0 over uDiscSoft of its radius beyond (0 everywhere when the cut is not the match cut).
float cutKeep(vec2 uv) {
  if (uDisc.z <= 0.0) return 0.0;
  float dist = length((uv - uDisc.xy) * vec2(uRes.x / uRes.y, 1.0));
  return 1.0 - smoothstep(uDisc.z, uDisc.z * (1.0 + uDiscSoft), dist);
}

void main() {
  float tm = uTime * (1.0 - uStill);
  gZk = restZoom(1.0, tm);
  gOff = restOffset(tm);
  gA = int(uImgA + 0.5);
  gB = int(uImgB + 0.5);
  vec3 col;
  if (uSliceOn > 0.5) col = sliceCut(screenUV(), gl_FragCoord.xy);
  else col = staticCut(screenUV(), gl_FragCoord.xy, uCutC, 0.25);
  // Over the cuts, not part of them: the foreground drifts at its own pace through the grove and the share
  // (0 elsewhere and exactly 0 at the end), and the share's white ground takes its warm light.
  vec2 fq = aspectUV(screenUV());
  col = shareLight(col, fq);
  col = foreground(col, fq, gl_FragCoord.xy, tm);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
