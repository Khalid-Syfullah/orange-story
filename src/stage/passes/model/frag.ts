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
import { art } from "@/content/art";
import { REST_GLSL } from "../rest";
import { STATIC_GLSL } from "../static";

const f = (x: number) => x.toFixed(4);
const depth = art.graft.depth;

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
${STATIC_GLSL}

const float GRAFT_NEAR = ${f(depth.near)};   // the hands, branch and leaves: rate of the camera's travel
const float GRAFT_FAR = ${f(depth.far)};     // the cream ground
const float GRAFT_CELL = ${f(depth.cell)};   // the layer mask's lattice, painting heights

int gA;
int gB;
float gZk;     // the breath, as a factor on every zoom
vec2 gOff;     // parallax and drift

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
  return texture2D(uGraft, pt + depthShift(near, nearOff, farOff)).rgb;
}

vec3 img(int k, vec2 uv) {
  if (k == 0) return texture2D(uReel, cover(uv, uReelSize, uPan + uReelPan, uZoom * gZk) + gOff).rgb;
  if (k == 1) return graftAt(uv);
  if (k == 2) return texture2D(uGrove, cover(uv, uGroveSize, uF2.xy, uF2.z * gZk) + gOff).rgb;
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
  gA = int(uImgA + 0.5);
  gB = int(uImgB + 0.5);
  gl_FragColor = vec4(clamp(staticCut(screenUV(), gl_FragCoord.xy, uCutC, 0.25), 0.0, 1.0), 1.0);
}
`;
