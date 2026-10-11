// The bridge fragment shader: the hero film hands over to the 121-frame reel through the static
// treatment (../static.ts). The film is the hero's own shader (HERO_LIB, never a copy of it), held
// where the hero ended (5% push about the orange, clouds drifted); the reel is cover-fitted with the
// same math, the same dolly about the same orange, and the pan table's extra pan for the frame on
// screen, so the orange does not jump between film and reel.
import { HERO_LIB } from "../hero/frag";
import { STATIC_GLSL } from "../static";

export const BRIDGE_FRAG = /* glsl */ `
${HERO_LIB}
uniform sampler2D uReel;
uniform vec2 uReelSize;
uniform vec2 uReelPan;    // the pan table's extra pan for the frame on screen (painting units)
uniform float uReelS;     // the reel's dolly about the orange: the hero's push, easing to 1 late
uniform float uCutC;      // the crest position (static.ts)
${STATIC_GLSL}

vec2 reelPaint(vec2 uv) {
  return cover(dollyAbout(uv, gO, uReelS), uReelSize, uPan + uReelPan, gZoom) + gOff;
}

float grain(vec2 frag) { return filmGrain(frag, uTime * (1.0 - uStill), 0.03); }

vec3 cutA(vec2 uv, vec2 frag) { return heroColor(uv, frag); }

vec3 cutB(vec2 uv, vec2 frag, float lag) {
  vec2 uvB = uv - cutDir() * lag * 0.05;        // still catching up with the edge that uncovered it
  vec2 p0 = reelPaint(uvB);
  vec3 c;
  if (lag < 0.004) {
    c = texture2D(uReel, p0).rgb;
  } else {
    vec2 dp = cutDir() * coverScale(uReelSize) / gZoom;
    c = smear5(uReel, p0, dp, lag * 0.03);
  }
  return c + grain(frag);
}

vec3 cutRaw(vec2 uv, float behind) {
  return mix(texture2D(uHero, toPaint(uv)).rgb, texture2D(uReel, reelPaint(uv)).rgb, behind);
}

void main() {
  heroFrame();
  gl_FragColor = vec4(clamp(staticCut(screenUV(), gl_FragCoord.xy, uCutC, 1.0), 0.0, 1.0), 1.0);
}
`;
