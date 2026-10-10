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
 *
 * Plates and morphs can also be cut to a screen-space circle (`revealMask`): the rainbow ring shows
 * the new scene inside it and the old one outside.
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
  gl_FragColor = toOutput(color, opacity * revealMask());
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
        tint: { value: new Color("#ffffff") },
        tintAmount: { value: 0 },
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        ...revealUniforms(),
      },
    });
  }
}

/** Uniforms of the reveal circle (off by default). */
function revealUniforms() {
  return { revealCircle: { value: new Vector4(0, 0, 0, 1) }, revealSide: { value: 0 } };
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
        edgeColor: { value: new Color("#ffffff") },
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
        tint: { value: new Color("#ffffff") },
        tintAmount: { value: 0 },
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
