// The bridge fragment shader: the hero film hands over to the 121-frame reel through the static
// treatment (../static.ts). The film is the hero's own shader (HERO_LIB, never a copy of it), held
// where the hero ended (5% push about the orange, clouds drifted); the reel is cover-fitted with the
// same math, the same dolly about the same orange, and the pan table's extra pan for the frame on
// screen, so the orange does not jump between film and reel.
import { HERO_LIB } from "../hero/frag";
import { STATIC_GLSL } from "../static";
import { REEL_CAM } from "./timeline";

const f = (x: number) => x.toFixed(4);
const vel = REEL_CAM.vel;

// Phase 18: the reel is filmed, not scrubbed (timeline.ts has the whole camera). On top of the film's
// dolly about the orange it takes the film's orbit (relaxing with the dolly: the same two layers, the sky
// mask read on the reel's own frame), a handheld sway and roll about the orange from the reel's progress
// and the wind, and the camera's lean with the scroll's speed: a roll, an extra push and a radial smear.
// All of it is 0 where the reel and the film meet, and again at the reel's last frame.

export const BRIDGE_FRAG = /* glsl */ `
${HERO_LIB}
uniform sampler2D uReel;
uniform vec2 uReelSize;
uniform vec2 uReelPan;    // the pan table's extra pan for the frame on screen (painting units)
uniform float uReelS;     // the reel's dolly about the orange: the hero's push, easing to 1 late
uniform float uCutC;      // the crest position (static.ts)
uniform float uReelHold;  // the share of the film's orbit still held: 1 through the wave, easing to 0 with the dolly
uniform vec3 uReelHand;   // the handheld camera: sway x and y (painting units) and roll (radians), already on their envelope
uniform float uReelWind;  // the wind's sway of the camera, painting units
uniform vec2 uReelGust;   // the wind's gust at the orange (motion.ts windAt, on the CPU), unit-free
uniform vec3 uReelVel;    // the scroll-speed envelope (0 until the reel is revealed and again at its end), the lean at a flick (radians) and the tilt at a flick (painting heights)
${STATIC_GLSL}

const float REEL_KNEE = ${f(vel.knee)};      // the scroll's speed (px a frame) at which the lean is 63%
const float REEL_PUSH = ${f(vel.push)};      // the extra push at a flick
const float REEL_SMEAR = ${f(vel.smear)};    // the radial smear at a flick, painting widths

float gReelRoll;      // the camera's roll about the orange (handheld and lean)
vec2 gReelSway;       // its sway, painting units
float gReelS;         // its dolly about the orange, with the lean's push
vec2 gReelCam;        // the film's orbit, still held (bounded travel from rest)
float gReelV;         // the scroll's speed on the reel, signed, 0 until the reel is revealed

void reelFrame() {
  float vAmt = velAmount(REEL_KNEE) * uReelVel.x;
  gReelV = velSigned(REEL_KNEE) * uReelVel.x;
  vec2 w = uReelGust;   // the wind's gust at the orange (0 under reduced motion): the camera sways with the air
  // The camera tilts up with the scroll: the sample point rises as the scroll goes down (content slides down the frame).
  gReelSway = (uReelHand.xy + vec2(w.x, w.y * 0.6) * uReelWind + vec2(0.0, -uReelVel.z * gReelV)) * (1.0 - uStill);
  gReelRoll = (uReelHand.z + uReelVel.y * gReelV) * (1.0 - uStill);
  gReelS = uReelS * (1.0 + REEL_PUSH * vAmt);
  gReelCam = gCam * uReelHold;
}

// The roll: the frame turns about the orange (distances round on screen).
vec2 reelRoll(vec2 uv) {
  if (abs(gReelRoll) < 1.0e-6) return uv;
  float a = uRes.x / uRes.y;
  vec2 d = vec2((uv.x - gO.x) * a, uv.y - gO.y);
  float c = cos(gReelRoll);
  float s = sin(gReelRoll);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return gO + vec2(d.x / a, d.y);
}

// The reel's flat painting point (the roll, the dolly, the sway, the rest state), no layers.
vec2 reelFlat(vec2 uv) {
  return cover(dollyAbout(reelRoll(uv), gO, gReelS), uReelSize, uPan + uReelPan + gReelSway, gZoom) + gOff;
}

// The reel's picture point: the film's orbit still held, in the film's two layers (the sky far, the rest near).
vec2 reelPaint(vec2 uv) {
  vec2 pf = reelFlat(uv);
  if (dot(gReelCam, gReelCam) < 1.0e-12) return pf;
  vec2 cell = vec2(HERO_CELL * uReelSize.y / uReelSize.x, HERO_CELL);
  float near = 1.0 - skyLayer(uReel, pf + gReelCam * HERO_FAR, cell);
  return pf + depthShift(near, gReelCam * HERO_NEAR, gReelCam * HERO_FAR);
}

float grain(vec2 frag) { return filmGrain(frag, uTime * (1.0 - uStill), 0.03); }

vec3 cutA(vec2 uv, vec2 frag) { return heroColor(uv, frag); }

vec3 cutB(vec2 uv, vec2 frag, float lag) {
  vec2 uvB = uv - cutDir() * lag * 0.05;        // still catching up with the edge that uncovered it
  vec2 p0 = reelPaint(uvB);
  vec3 c;
  if (lag < 0.004) {
    if (abs(gReelV) > 0.002) {
      // The camera's speed: the content streams outward from the orange as the scroll pushes in (and back as
      // it pulls out), more toward the edges; a radial smear along the way it moves (rule 6).
      vec2 rad = uvB - gO;
      vec2 radA = vec2(rad.x * uRes.x / uRes.y, rad.y);
      float rl = length(radA);
      vec2 dp = (rl > 1.0e-4 ? vec2(radA.x * uRes.y / uRes.x, radA.y) / rl : vec2(0.0)) * coverScale(uReelSize) / gZoom;
      c = smear5(uReel, p0, dp * gReelV * smoothstep(0.0, 0.6, rl), REEL_SMEAR);
    } else {
      c = texture2D(uReel, p0).rgb;
    }
  } else {
    vec2 dp = cutDir() * coverScale(uReelSize) / gZoom;
    c = smear5(uReel, p0, dp, lag * 0.03);
  }
  // The signal rings run on over the reel: over its sky, and over its ground once that is pale; dots go from
  // milk to ink as the ground whitens (rings.ts), and the rings are gone by the time the knife is at rest.
  float ground = max(skyMask(c), paleMask(c) * uRingPale);
  vec3 cr = signalRings(c, frag, toScreenA(uACrown), uRingGain, ground, uTime * (1.0 - uStill));
  return cr + grain(frag);
}

vec3 cutRaw(vec2 uv, float behind) {
  // A cheap tap of either side: the flat mapping plus the near layer's offset (the layers' soft mask is skipped).
  return mix(texture2D(uHero, toPaint(uv) + gNearOff).rgb, texture2D(uReel, reelFlat(uv) + gReelCam * HERO_NEAR).rgb, behind);
}

void main() {
  heroFrame();
  reelFrame();
  gl_FragColor = vec4(clamp(staticCut(screenUV(), gl_FragCoord.xy, uCutC, 1.0), 0.0, 1.0), 1.0);
}
`;
