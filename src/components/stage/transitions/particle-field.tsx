"use client";

import * as React from "react";
import {
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";

import { MEDIA_GLSL } from "./media";
import { PARTICLE_GLSL, PARTICLE_STRIDE, type ParticleField } from "./particles";

/**
 * A particle field on the stage: one instanced draw of every particle of a `ParticleField`, each
 * flying in the vertex shader (`particleFlight`, the twin of `particleAt`). A particle is a painted
 * dab: a brushy, irregular round lit from the story's sun (a warm facet toward it, a cool one away),
 * soft where it is out of focus (near the lens, or far behind the focus), stretched along its flight
 * by the smear when the story is scrolled fast. With a `map`, it is that sprite instead (a leaf, an
 * orange), turning as it goes and softened out of focus by reading a smaller mip.
 *
 * The field draws `count` of its particles (a lighter mode draws the first share: the generator
 * shuffles them, so any first share is an even sample).
 */

export interface ParticleLook {
  /** Colour at tone 0 and tone 1 (hex): each particle's `tone` mixes them. */
  colorA: string;
  colorB: string;
  /** The tint of the sunlit facet, and how far toward it. */
  lit: string;
  litAmount: number;
  /** How much darker (and cooler) the facet away from the sun is: a multiplier. */
  shade: string;
  /** How round (lit as a ball, 1) or flat (a fleck of paint, 0) a dab is. Default 1. */
  round?: number;
  /** How fast a particle's tone moves toward 1 as it ages (per second): a grain leaving the sun cools. Default 0. */
  toneDrift?: number;
  /** A sprite instead of a dab. */
  map?: Texture | null;
  /** How far a sprite turns over its life (radians per second, times its seed). */
  spin?: number;
  /** Seconds a particle takes to grow to its size once born (a leaf unfurling on its twig). Default 0: born whole. */
  unfurl?: number;
}

const VERTEX = /* glsl */ `
${PARTICLE_GLSL}
uniform vec3 uTravel;
uniform float uSmear;
uniform float uStretch;
uniform float uSizeScale;
uniform float uSpin;
uniform float uUnfurl;  // seconds a particle takes to grow to its size once born (a leaf unfurling); 0: born whole
varying vec2 vUv;
varying float vAlpha;
varying vec4 vLook;
varying float vDepth;
varying float vAge;
void main() {
  vec3 velocity;
  vec4 f = particleFlight(velocity);
  vUv = uv;
  vLook = aLook;
  vAlpha = f.w;
  vAge = uTime - aStart.w;
  vec3 p = f.xyz - uTravel;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  // Nothing nearer than the camera's near plane (0.1) is drawn.
  if (f.w <= 0.001 || vDepth < 0.1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 v = (modelViewMatrix * vec4(velocity, 0.0)).xyz;
  float screenSpeed = length(v.xy) / vDepth;
  vec2 dir = screenSpeed > 1e-5 ? normalize(v.xy) : vec2(1.0, 0.0);
  float stretch = 1.0 + uSmear * min(5.0, screenSpeed * uStretch);
  float grown = uUnfurl > 0.0 ? smoothstep(0.0, uUnfurl, uTime - aStart.w) : 1.0;
  vec2 c = position.xy * aLook.x * uSizeScale * grown;
  #ifdef MAP
  // A sprite keeps its own up, turning as it tumbles; it smears along its flight.
  float turn = (aLook.y - 0.5) * 6.2831853 + uSpin * (aLook.y - 0.5) * (uTime - aStart.w);
  float s = sin(turn);
  float k = cos(turn);
  c = vec2(k * c.x - s * c.y, s * c.x + k * c.y);
  float along = dot(c, dir);
  c += dir * along * (stretch - 1.0);
  #else
  c = dir * (c.x * stretch) + vec2(-dir.y, dir.x) * c.y;
  #endif
  mv.xy += c;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
${MEDIA_GLSL}
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uLit;
uniform float uLitAmount;
uniform vec3 uShade;
uniform float uOpacity;
uniform float uFocus;
uniform float uAperture;
uniform float uRound;
uniform float uToneDrift;
#ifdef MAP
uniform sampler2D map;
#endif
varying vec2 vUv;
varying float vAlpha;
varying vec4 vLook;
varying float vDepth;
varying float vAge;
void main() {
  float defocus = clamp(uAperture * abs(vDepth - uFocus) / max(vDepth, 1e-3), 0.0, 1.0);
  #ifdef MAP
  vec4 texel = texture2D(map, vUv, defocus * 4.5);
  vec3 straight = texel.a > 0.0 ? texel.rgb / texel.a : vec3(0.0);
  vec3 col = linearToOutputTexel(vec4(straight, 1.0)).rgb;
  // Out of focus a near leaf darkens a little (it is in its own shade, seen against the light).
  col = mix(col, col * uShade, defocus * 0.5);
  float a = texel.a * vAlpha * uOpacity;
  #else
  vec2 q = vUv * 2.0 - 1.0;
  float seed = vLook.y;
  // A brushy dab: an irregular round, softer out of focus.
  float edge = vnoise(q * 2.7 + seed * 91.0) - 0.5;
  float r = length(q) * (1.0 + 0.4 * edge * (1.0 - defocus));
  float soft = mix(0.22, 0.75, defocus);
  float body = 1.0 - smoothstep(1.0 - soft, 1.0, r);
  if (body <= 0.002) discard;
  // Lit from the story's sun: a warm facet toward it, a cool, darker one away.
  vec3 n = normalize(vec3(q, sqrt(max(0.0, 1.0 - dot(q, q)))));
  float lit = mix(0.55, clamp(dot(n, SUN_DIR) * 1.3 - 0.15, 0.0, 1.0), uRound);
  vec3 base = mix(uColorA, uColorB, clamp(vLook.z + vAge * uToneDrift, 0.0, 1.0));
  vec3 col = mix(base * uShade, mix(base, uLit, uLitAmount), lit);
  float a = body * vAlpha * uOpacity * mix(1.0, 0.55, defocus);
  #endif
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col * a, a);
}
`;

/** Linear colour from a palette hex. */
const color = (hex: string) => new Color(hex);

export class ParticleMaterial extends ShaderMaterial {
  constructor(look: ParticleLook) {
    super({
      name: "transition:particles",
      defines: look.map ? { MAP: "" } : {},
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: 9.81 },
        uWind: { value: new Vector3() },
        uTravel: { value: new Vector3() },
        uSmear: { value: 0 },
        uStretch: { value: 0.12 },
        uSizeScale: { value: 1 },
        uSpin: { value: look.spin ?? 0 },
        uUnfurl: { value: look.unfurl ?? 0 },
        uColorA: { value: srgb(look.colorA) },
        uColorB: { value: srgb(look.colorB) },
        uLit: { value: srgb(look.lit) },
        uLitAmount: { value: look.litAmount },
        uShade: { value: srgb(look.shade) },
        uOpacity: { value: 1 },
        uFocus: { value: 1 },
        uAperture: { value: 0.5 },
        uRound: { value: look.round ?? 1 },
        uToneDrift: { value: look.toneDrift ?? 0 },
        map: { value: look.map ?? null },
      },
    });
  }
}

/** A palette hex as raw sRGB numbers (the dab shader writes display colours, as the old transitions did). */
function srgb(hex: string): Color {
  const c = color(hex);
  return c.convertLinearToSRGB();
}

/** The instanced geometry of a field: its own quad (never the plates' shared one), its particles' four attributes. */
export function particleGeometry(field: ParticleField): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setAttribute("uv", quad.getAttribute("uv"));
  const buffer = new InstancedInterleavedBuffer(field.data, PARTICLE_STRIDE);
  geometry.setAttribute("aStart", new InterleavedBufferAttribute(buffer, 4, 0));
  geometry.setAttribute("aVelocity", new InterleavedBufferAttribute(buffer, 4, 4));
  geometry.setAttribute("aLook", new InterleavedBufferAttribute(buffer, 4, 8));
  geometry.setAttribute("aSwirl", new InterleavedBufferAttribute(buffer, 4, 12));
  geometry.instanceCount = field.count;
  return geometry;
}

/** A field's mesh (its own geometry and material, disposed with the component; never culled: it moves in the shader). */
export function useParticleMesh(field: ParticleField, look: ParticleLook, name: string): Mesh<InstancedBufferGeometry, ParticleMaterial> {
  const mesh = React.useMemo(() => {
    const m = new Mesh(particleGeometry(field), new ParticleMaterial(look));
    m.frustumCulled = false;
    m.name = name;
    return m;
    // The look is fixed for a field (its texture aside, set below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, name, look.map]);
  React.useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  return mesh;
}
