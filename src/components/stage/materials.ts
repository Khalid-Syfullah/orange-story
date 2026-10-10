import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  NormalBlending,
  RedFormat,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Texture,
} from "three";

import { seeded } from "@/lib/progress";
import { colors } from "@/styles/tokens";

/**
 * The plate shaders. Every texture is sampled premultiplied (see `textures.ts`), every material
 * blends premultiplied and draws in painter's order (no depth test), so plates stack exactly as the
 * scene sorts them.
 *
 * - `PlateMaterial`: one painted plate with opacity, tint and blur (a small golden-angle ring of
 *   reads on a mip-biased texture: cheap depth of field).
 * - `MorphMaterial`: two textures blended through a mask with a moving, soft edge (stone turning
 *   into bark), with an optional glow along the edge.
 * - `TwinkleMaterial`: instanced sprites that pulse on idle time and appear as `reveal` passes
 *   each one's threshold (stars, sparkles).
 * - `RippleMaterial`: instanced droplets of light that drift outward from a source, brightened by a
 *   slow ring wave (the hero's glow). Their whole motion is computed in the vertex shader.
 *
 * Plates and morphs can also be cut to a screen-space circle (`revealMask`): the rainbow ring shows
 * the new scene inside it and the old one outside. Plates can also thin out of, or recede into the
 * sky's haze inside, a soft screen-space rectangle behind text (`clearInside`): the clouds parting
 * around the service cards, the foliage and fruit fading back behind a headline.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Premultiplied linear color in, premultiplied output color (in the canvas color space) out. */
const OUTPUT = /* glsl */ `
vec4 toOutput(vec4 color, float opacity) {
  vec3 straight = color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
  vec4 outColor = linearToOutputTexel(vec4(straight, color.a));
  return vec4(outColor.rgb * outColor.a, outColor.a) * opacity;
}
`;

/**
 * A screen-space circle that hides the plate outside it (or inside it): the rainbow ring revealing
 * the new scene. `revealCircle` is in drawing-buffer pixels (centre x, centre y from the bottom,
 * radius, soft half-width); `revealSide` is 0 (off), 1 (show inside) or -1 (show outside).
 */
const REVEAL = /* glsl */ `
uniform vec4 revealCircle;
uniform float revealSide;
float revealMask() {
  if (revealSide == 0.0) return 1.0;
  float d = distance(gl_FragCoord.xy, revealCircle.xy);
  float inside = 1.0 - smoothstep(revealCircle.z - revealCircle.w, revealCircle.z + revealCircle.w, d);
  return revealSide > 0.0 ? inside : 1.0 - inside;
}
`;

/**
 * A screen-space clearing behind text: a rectangle (`clearRect`, drawing-buffer pixels, left,
 * bottom, right, top) with a soft edge `clearSoft` pixels wide, at strength `clearAmount` (0 off).
 * Inside it the plate either thins out (`clearHaze` 0: the clouds part around the service cards) or
 * recedes into the haze, its color drawn toward `hazeColor` (`clearHaze` 1: foliage and fruit
 * behind a headline), so text never sits on a bright cloud or fruit.
 */
const CLEARING = /* glsl */ `
uniform vec4 clearRect;
uniform float clearSoft;
uniform float clearAmount;
uniform float clearHaze;
uniform vec3 hazeColor;
float clearInside() {
  if (clearAmount <= 0.0) return 0.0;
  vec2 center = (clearRect.xy + clearRect.zw) * 0.5;
  vec2 q = abs(gl_FragCoord.xy - center) - (clearRect.zw - clearRect.xy) * 0.5;
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return (1.0 - smoothstep(0.0, clearSoft, outside)) * clearAmount;
}
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvTransform;
uniform float opacity;
uniform vec3 tint;
uniform float tintAmount;
uniform vec2 blurRadius;
uniform float blurBias;
varying vec2 vUv;
${OUTPUT}
${REVEAL}
${CLEARING}
vec4 sampleMap(vec2 uv) {
  if (blurRadius.x <= 0.0 && blurRadius.y <= 0.0) return texture2D(map, uv);
  vec4 sum = texture2D(map, uv, blurBias) * 2.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 8.0);
    float a = fi * 2.39996323;
    sum += texture2D(map, uv + vec2(cos(a), sin(a)) * r * blurRadius, blurBias);
  }
  return sum / 10.0;
}
void main() {
  vec4 color = sampleMap(vUv * uvTransform.xy + uvTransform.zw);
  color.rgb = mix(color.rgb, tint * color.a, tintAmount);
  float cleared = clearInside();
  gl_FragColor = toOutput(color, opacity * revealMask() * (1.0 - cleared * (1.0 - clearHaze)));
  if (cleared * clearHaze > 0.0) {
    // The haze mixes in the display's color space, as paint (and the browser's own compositing)
    // would: fruit receding into the blue goes dusky, not violet as a mix in linear light does.
    vec3 haze = linearToOutputTexel(vec4(hazeColor, 1.0)).rgb;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, haze * gl_FragColor.a, cleared * clearHaze);
  }
  if (gl_FragColor.a < 0.002) discard;
}
`;

const MORPH_FRAGMENT = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform sampler2D mask;
uniform vec4 uvTransform;
uniform vec4 maskTransform;
uniform float progress;
uniform float softness;
uniform vec3 edgeColor;
uniform float edgeAmount;
uniform float opacity;
varying vec2 vUv;
${OUTPUT}
${REVEAL}
void main() {
  vec2 uv = vUv * uvTransform.xy + uvTransform.zw;
  vec4 a = texture2D(mapA, uv);
  vec4 b = texture2D(mapB, uv);
  float m = texture2D(mask, vUv * maskTransform.xy + maskTransform.zw).r;
  // The edge sweeps the mask from 0 to 1: dark mask values turn first.
  float edge = mix(-softness, 1.0 + softness, progress);
  float keep = smoothstep(edge - softness, edge + softness, m);
  vec4 color = mix(b, a, keep);
  float band = 1.0 - abs(2.0 * keep - 1.0);
  color.rgb += edgeColor * (band * band * edgeAmount * color.a);
  gl_FragColor = toOutput(color, opacity * revealMask());
  if (gl_FragColor.a < 0.002) discard;
}
`;

const TWINKLE_VERTEX = /* glsl */ `
attribute vec4 twinkle;
uniform float time;
uniform float reveal;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  // twinkle: phase (radians), speed (cycles per second), appear (reveal threshold), unused
  float shown = smoothstep(twinkle.z, twinkle.z + 0.06, reveal);
  float wave = 0.5 + 0.5 * sin(time * twinkle.y * 6.2831853 + twinkle.x);
  vAlpha = shown * mix(0.3, 1.0, wave * wave);
  vec4 local = vec4(position * shown * mix(0.72, 1.0, wave), 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`;

const TWINKLE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform vec3 tint;
uniform float tintAmount;
varying vec2 vUv;
varying float vAlpha;
${OUTPUT}
void main() {
  vec4 color = texture2D(map, vUv);
  color.rgb = mix(color.rgb, tint * color.a, tintAmount);
  gl_FragColor = toOutput(color, opacity * vAlpha);
  if (gl_FragColor.a < 0.002) discard;
}
`;

const RIPPLE_VERTEX = /* glsl */ `
attribute vec4 drop; // angle, ring (0 to 1), jitter (-1 to 1), size
uniform float time;
uniform vec2 source;
uniform float reach;
uniform float lift;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  // Droplets travel in rings: every droplet belongs to one of RINGS fronts, staggered in time, and
  // each front spreads from the source in step (a little jitter keeps it from looking drawn). The
  // droplets drift outward and a little upward ("rain in reverse") and are gone before the edge.
  const float RINGS = 8.0;
  float front = floor(drop.y * RINGS) / RINGS;
  float life = fract(front + drop.z * 0.008 + time * 0.045);
  float r = 0.45 + reach * pow(life, 0.62) + drop.z * 0.3;
  vec2 center = source + vec2(cos(drop.x), sin(drop.x)) * r + vec2(0.0, 0.6 * life);
  // A faint glimmer runs through each front as it spreads.
  float wave = 0.5 + 0.5 * cos(6.2831853 * (drop.x * 3.0 + time * 0.12) + drop.y * 40.0);
  float born = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.35, 1.0, life));
  float sky = smoothstep(-1.2, 0.8, center.y);
  // Keep the middle of the sky behind the title calmer.
  float calm = mix(1.0, 0.4, smoothstep(0.5, -2.5, center.x));
  vAlpha = born * sky * calm * (0.45 + 0.55 * wave);
  float size = drop.w * (0.8 + 0.4 * wave) * (0.7 + 0.5 * sin(3.14159265 * life)) * (1.0 + 0.45 * lift);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position.xy * size, 0.0, 1.0);
}
`;

const RIPPLE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform float lift;
varying vec2 vUv;
varying float vAlpha;
${OUTPUT}
void main() {
  vec4 color = texture2D(map, vUv);
  // The glow brightens toward white as the story starts to move.
  color.rgb = mix(color.rgb, vec3(color.a), lift * 0.7);
  gl_FragColor = toOutput(color, opacity * vAlpha);
  if (gl_FragColor.a < 0.002) discard;
}
`;

const PAINTER = {
  transparent: true,
  premultipliedAlpha: true,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
} as const;

export class PlateMaterial extends ShaderMaterial {
  constructor(map: Texture) {
    super({
      ...PAINTER,
      vertexShader: VERTEX,
      fragmentShader: PLATE_FRAGMENT,
      uniforms: {
        map: { value: map },
        uvTransform: { value: new Vector4(1, 1, 0, 0) },
        opacity: { value: 1 },
        tint: { value: new Color(colors.white) },
        tintAmount: { value: 0 },
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        ...revealUniforms(),
        ...clearingUniforms(),
      },
    });
  }
}

/** Uniforms of the reveal circle (off by default). */
function revealUniforms() {
  return { revealCircle: { value: new Vector4(0, 0, 0, 1) }, revealSide: { value: 0 } };
}

/** Uniforms of the clearing (off by default). */
function clearingUniforms() {
  return {
    clearRect: { value: new Vector4(0, 0, 0, 0) },
    clearSoft: { value: 1 },
    clearAmount: { value: 0 },
    clearHaze: { value: 0 },
    hazeColor: { value: new Color(colors.white) },
  };
}

export class MorphMaterial extends ShaderMaterial {
  constructor(mapA: Texture, mapB: Texture, mask: Texture) {
    super({
      ...PAINTER,
      vertexShader: VERTEX,
      fragmentShader: MORPH_FRAGMENT,
      uniforms: {
        mapA: { value: mapA },
        mapB: { value: mapB },
        mask: { value: mask },
        uvTransform: { value: new Vector4(1, 1, 0, 0) },
        maskTransform: { value: new Vector4(1, 1, 0, 0) },
        progress: { value: 0 },
        softness: { value: 0.08 },
        edgeColor: { value: new Color(colors.white) },
        edgeAmount: { value: 0 },
        opacity: { value: 1 },
        // Shared with the plate frame (unused by the morph, kept so one updater fits both).
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        ...revealUniforms(),
      },
    });
  }
}

export class TwinkleMaterial extends ShaderMaterial {
  constructor(map: Texture, additive = false) {
    super({
      ...PAINTER,
      blending: additive ? AdditiveBlending : NormalBlending,
      vertexShader: TWINKLE_VERTEX,
      fragmentShader: TWINKLE_FRAGMENT,
      uniforms: {
        map: { value: map },
        time: { value: 0 },
        reveal: { value: 1 },
        opacity: { value: 1 },
        tint: { value: new Color(colors.white) },
        tintAmount: { value: 0 },
      },
    });
  }
}

export class RippleMaterial extends ShaderMaterial {
  constructor(map: Texture) {
    super({
      ...PAINTER,
      blending: AdditiveBlending,
      vertexShader: RIPPLE_VERTEX,
      fragmentShader: RIPPLE_FRAGMENT,
      uniforms: {
        map: { value: map },
        time: { value: 0 },
        source: { value: new Vector2(0, 0) },
        reach: { value: 7 },
        lift: { value: 0 },
        opacity: { value: 1 },
      },
    });
  }
}

let defaultMask: DataTexture | null = null;

/**
 * A mask for morphs that have none of their own: a bottom-to-top ramp broken up by soft noise,
 * so the edge climbs with a ragged front.
 */
export function defaultMorphMask(): DataTexture {
  if (defaultMask) return defaultMask;
  const width = 64;
  const height = 256;
  const rand = seeded("morph-mask");
  const cells = Array.from({ length: 9 * 33 }, () => rand());
  const cell = (i: number, j: number) => cells[j * 9 + (i % 8)];
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (x / width) * 8;
      const gy = (y / height) * 32;
      const i = Math.floor(gx);
      const j = Math.min(31, Math.floor(gy));
      const u = gx - i;
      const v = gy - j;
      const sx = u * u * (3 - 2 * u);
      const sy = v * v * (3 - 2 * v);
      const top = cell(i, j) + (cell(i + 1, j) - cell(i, j)) * sx;
      const bottom = cell(i, j + 1) + (cell(i + 1, j + 1) - cell(i, j + 1)) * sx;
      const noise = top + (bottom - top) * sy;
      // DataTexture rows run bottom to top: row 0 is the bottom of the plate.
      const ramp = y / (height - 1);
      data[y * width + x] = Math.round(Math.min(1, Math.max(0, ramp * 0.75 + noise * 0.25)) * 255);
    }
  }
  defaultMask = new DataTexture(data, width, height, RedFormat);
  defaultMask.magFilter = LinearFilter;
  defaultMask.minFilter = LinearFilter;
  defaultMask.needsUpdate = true;
  return defaultMask;
}
