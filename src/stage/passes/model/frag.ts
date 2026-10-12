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
import { art } from "@/content/art";
import { REST_GLSL } from "../rest";
import { STATIC_GLSL } from "../static";
import { FOREGROUND_GLSL } from "./foreground";

const f = (x: number) => x.toFixed(4);
const depth = art.graft.depth;
const gSway = art.graft.sway;
const grove = art.grove;
const wv = (w: { scale: number; speed: number; flutter: number; flutterSpeed: number }) =>
  `vec4(${f(w.scale)}, ${f(w.speed)}, ${f(w.flutter)}, ${f(w.flutterSpeed)})`;

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
${FOREGROUND_GLSL}
${STATIC_GLSL}

const float GRAFT_NEAR = ${f(depth.near)};   // the hands, branch and leaves: rate of the camera's travel
const float GRAFT_FAR = ${f(depth.far)};     // the cream ground
const float GRAFT_CELL = ${f(depth.cell)};   // the layer mask's lattice, painting heights

const vec4 GRAFT_WIND = ${wv(gSway.wind)};     // art.ts graft.sway
const float GRAFT_SWAY = ${f(gSway.amp)};
const float GRAFT_SWAY_CELL = ${f(gSway.cell)};
const float GROVE_NEAR = ${f(grove.depth.near)};   // the leaves and fruit: rate of the camera's travel (1: the camera's own move)
const float GROVE_FAR = ${f(grove.depth.far)};     // the cloudscape
const float GROVE_CELL = ${f(grove.depth.cell)};
const vec4 GROVE_RECT = vec4(${f(grove.hold.x)}, ${f(grove.hold.y)}, ${f(grove.hold.w)}, ${f(grove.hold.h)});   // the sleeve, the cuff and the sky beside them
const float GROVE_HOLD_SWAY = ${f(grove.holdSway)};
const vec4 GROVE_WIND = ${wv(grove.sway.wind)};
const float GROVE_SWAY = ${f(grove.sway.amp)};
const float GROVE_SWAY_CELL = ${f(grove.sway.cell)};

int gA;
int gB;
float gZk;     // the breath, as a factor on every zoom
vec2 gOff;     // parallax and drift
float gTm;     // the pass clock (0 under reduced motion), for the wind

// A painting's leaves stirring in the wind: the foliage mask read on a lattice anchored to the painting
// (a continuous field, so the warp compresses and never tears), times the wind at the point, times
// 'keep' (0..1: a region the sway spares), squeezed inside the room it may use. The displacement to add
// to the point 'pt' the leaves are read at; 0 under reduced motion and off the leaves.
vec2 leafSway(sampler2D tex, vec2 size, vec2 pt, vec4 wind, float amp, float cellH, vec2 room, float keep) {
  if (uStill > 0.5) return vec2(0.0);
  float ar = size.x / size.y;
  vec2 cell = vec2(cellH / ar, cellH);
  float m = SOFT_MASK(tex, pt, cell, foliageMask) * keep;
  if (m < 0.002) return vec2(0.0);
  vec2 w = windAt(vec2(pt.x * ar, pt.y), gTm, wind);
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
  p2 += leafSway(uGraft, uGraftSize, p2, GRAFT_WIND, GRAFT_SWAY, GRAFT_SWAY_CELL, uGraftSwayRoom, 1.0);
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
  float far = latticeBlend(ptFar, cell, groveCloudAt(b), groveCloudAt(b + vec2(cell.x, 0.0)), groveCloudAt(b + vec2(0.0, cell.y)), groveCloudAt(b + cell));
  vec2 p2 = pt + depthShift(1.0 - far, nearOff, farOff);
  p2 += leafSway(uGrove, uGroveSize, p2, GROVE_WIND, GROVE_SWAY, GROVE_SWAY_CELL, uGroveSwayRoom, mix(1.0, GROVE_HOLD_SWAY, groveHold(p2)));
  return texture2D(uGrove, p2).rgb;
}

vec3 img(int k, vec2 uv) {
  if (k == 0) return texture2D(uReel, cover(uv, uReelSize, uPan + uReelPan, uZoom * gZk) + gOff).rgb;
  if (k == 1) return graftAt(uv);
  if (k == 2) return groveAt(uv);
  if (k == 3) return texture2D(uShare, cover(uv, uShareSize, uF3.xy, uF3.z * gZk) + gOff).rgb;
  return texture2D(uShareLast, cover(uv, uShareLastSize, uF4.xy, uF4.z * gZk) + gOff).rgb;
}

float grain(vec2 frag) { return filmGrain(frag, uTime * (1.0 - uStill), 0.03); }

vec3 cutA(vec2 uv, vec2 frag) { return img(gA, uv) + grain(frag); }

vec3 cutB(vec2 uv, vec2 frag, float lag) {
  if (lag < 0.004) return img(gB, uv) + grain(frag);
  vec2 uvB = uv - cutDir() * lag * 0.05;     // still catching up with the edge that uncovered it
  vec2 d = cutDir() * lag * 0.03;
  vec3 c = img(gB, uvB) * 0.30 + img(gB, uvB - d * 0.25) * 0.25 + img(gB, uvB - d * 0.50) * 0.20
         + img(gB, uvB - d * 0.75) * 0.15 + img(gB, uvB - d) * 0.10;
  return c + grain(frag);
}

vec3 cutRaw(vec2 uv, float behind) {
  return behind > 0.5 ? img(gB, uv) : img(gA, uv);
}

void main() {
  float tm = uTime * (1.0 - uStill);
  gZk = restZoom(1.0, tm);
  gOff = restOffset(tm);
  gTm = tm;
  gA = int(uImgA + 0.5);
  gB = int(uImgB + 0.5);
  vec3 col = staticCut(screenUV(), gl_FragCoord.xy, uCutC, 0.25);
  // Over the cuts, not part of them: the foreground drifts at its own pace through the grove and the share
  // (0 elsewhere and exactly 0 at the end), and the share's white ground takes its warm light.
  vec2 fq = aspectUV(screenUV());
  col = shareLight(col, fq, tm);
  col = foreground(col, fq, gl_FragCoord.xy, tm);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
