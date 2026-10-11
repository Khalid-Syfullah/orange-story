"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";

import { useMutable } from "@/lib/use-mutable";
import { PHYSICS } from "@/scroll/script";
import { colors, mixColors } from "@/styles/tokens";

import { HALFTONE_DOT, OUTPUT, STAGE_UNIFORMS } from "../materials";
import { HALFTONE } from "../paint";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "../stage-context";
import { glslFloat } from "./media";
import { particlesFor } from "./modes";
import { useParticleMesh } from "./particle-field";
import { crestRadius, ringCentre, ringClock, ringStrength, RING, RING_DEF, splashField } from "./ring-plan";
import { useTransitionMode, usePrecompile } from "./transition-stage";

/**
 * The ring's ripple (`ring-plan.ts`), part of the falling orange's scene: a plane just behind the
 * orange, centred on it, where a wave runs out from the strike. The leading crest and a train of
 * smaller crests behind it dying away, drawn in the halftone layer: a dot grid at 45 degrees in the
 * plane (soft paint where its cells are too small to draw cleanly), the dots swelling on the crests and
 * the grid bent on the slopes as water bends what is under it; a thin, soft spectral sheen on the
 * leading crest, violet inside to red outside, the story's one soft spectral colour. Drops of light
 * jump from the strike and fall back in. In front of the old picture and the orchard, behind the
 * orange (scene layer `RIPPLE_LAYER`).
 */

/** Stacking in the fall scene: over the rows and the gardener's picture, under the orange (30). */
export const RIPPLE_LAYER = 24;

/** The dot cell on the ripple (world units): about a cloud's dot on the screen. */
const CELL = 0.009;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uRadius;
uniform float uSize;
uniform float uAge;
uniform float uStrength;
uniform float uCell;
uniform float uOpacity;
uniform float quality;
uniform vec3 uDot;
varying vec2 vUv;
${OUTPUT}
${HALFTONE_DOT}
const float WAVELENGTH = ${glslFloat(RING.wavelength)};
const float MIN_WAVELENGTH = ${glslFloat(RING.minWavelength)};
const float FALLOFF = ${glslFloat(RING.falloff)};
const float DECAY = ${glslFloat(RING.decay)};

/* A soft spectrum: 0 violet (inside) to 1 red (outside), as in a rainbow, paled toward white. */
vec3 spectrum(float x) {
  float h = mix(0.78, 0.0, x);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(c, vec3(1.0), 0.35);
}

/* The water's height at a distance r from the strike: the leading crest at uRadius, a train behind it. */
float height(float r) {
  float lambda = max(MIN_WAVELENGTH, WAVELENGTH * uRadius);
  float x = (uRadius - r) / lambda;
  if (x < -0.6) return 0.0;
  return cos(6.2831853 * x) * exp(-max(x, 0.0) * FALLOFF) * smoothstep(-0.6, 0.1, x);
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = length(p);
  float h = height(r) * exp(-uAge * DECAY) * uStrength;
  // The slope bends the grid under it, as water bends what is beneath: by a share of a cell at most (the
  // slope taken per wavelength, so a short wave does not bend it more), so the dots stay dots.
  float lambda = max(MIN_WAVELENGTH, WAVELENGTH * uRadius);
  float e = 0.08 * lambda;
  float slope = (height(r + e) - height(r - e)) / (2.0 * e) * lambda / 6.2831853 * exp(-uAge * DECAY) * uStrength;
  vec2 dir = r > 1e-5 ? p / r : vec2(0.0);
  vec2 g = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678) * ((p + dir * clamp(slope, -1.0, 1.0) * 0.22 * uCell) / uCell);
  float perPixel = length(fwidth(g));
  float aa = clamp(perPixel * 0.75, 0.01, 0.5);
  float lod = quality > 0.5 ? smoothstep(${HALFTONE.minCellPx.toFixed(2)}, ${HALFTONE.fullCellPx.toFixed(2)}, 1.0 / max(perPixel, 1e-4)) : 0.0;
  // Crests catch the light: dots of it (soft paint where the dots would be too fine).
  float tone = clamp(h, 0.0, 1.0) * 0.7;
  float dots = mix(tone * 0.5, halftoneDot(g, tone, aa), lod);
  vec4 color = vec4(uDot * dots, dots);
  // The thin spectral sheen on the leading crest.
  float band = max(0.012, 0.045 * uRadius);
  float sheen = exp(-pow((r - uRadius) / band, 2.0)) * uStrength * exp(-uAge * DECAY * 0.5);
  vec3 tint = spectrum(clamp((r - uRadius) / (2.4 * band) + 0.5, 0.0, 1.0));
  float sa = sheen * 0.42;
  color = vec4(tint * sa, sa) + color * (1.0 - sa);
  gl_FragColor = toOutput(color, uOpacity);
  if (gl_FragColor.a < 0.002) discard;
}
`;

const SPLASH_LOOK = {
  colorA: mixColors("white", "milk", 0.4),
  colorB: mixColors("white", "orange", 0.25),
  lit: colors.white,
  litAmount: 0.6,
  shade: mixColors("white", "skySoft", 0.5),
  round: 0.6,
};

export function RingRipple() {
  const progress = useStageProgress();
  const scene = useSceneLayer();
  const mode = useTransitionMode();
  const mesh = React.useMemo(() => {
    const material = new ShaderMaterial({
      name: "transition:ring",
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      uniforms: {
        uRadius: { value: 0 },
        uSize: { value: 1 },
        uAge: { value: 0 },
        uStrength: { value: 0 },
        uCell: { value: CELL },
        uOpacity: { value: 1 },
        uDot: { value: new Color(mixColors("white", "orange", 0.15)) },
        quality: STAGE_UNIFORMS.quality,
      },
    });
    const m = new Mesh(new PlaneGeometry(1, 1), material);
    m.frustumCulled = false;
    m.visible = false;
    m.name = "ring-ripple";
    m.renderOrder = plateRenderOrder(scene, RIPPLE_LAYER);
    return m;
  }, [scene]);
  const splash = React.useMemo(() => splashField(), []);
  const splashMesh = useParticleMesh(splash, SPLASH_LOOK, "ring-splash");
  React.useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  usePrecompile([mesh, splashMesh]);

  const meshRef = useMutable(mesh);
  const splashRef = useMutable(splashMesh);

  useFrame(() => {
    const mesh = meshRef.current;
    const splashMesh = splashRef.current;
    const p = progress?.get() ?? 0;
    const m = mode();
    const strength = ringStrength(p);
    const shown = strength > 0 && m !== "calm" && (scene?.presence(p) ?? 1) > 0;
    mesh.visible = shown;
    splashMesh.visible = shown && p < RING_DEF.end;
    if (!shown) return;
    const [x, y] = ringCentre(p);
    const radius = crestRadius(p);
    const size = 2 * (radius * 1.15 + 0.2);
    mesh.position.set(x, y, -0.03);
    mesh.scale.set(size, size, 1);
    const u = mesh.material.uniforms;
    u.uRadius.value = radius;
    u.uSize.value = size;
    u.uAge.value = Math.max(0, ringClock(p));
    u.uStrength.value = strength;

    const s = splashMesh.material.uniforms;
    s.uTime.value = Math.max(0, ringClock(p));
    s.uGravity.value = PHYSICS.gravity;
    (s.uWind.value as Vector3).set(0, 0, 0);
    (s.uTravel.value as Vector3).set(0, 0, 0);
    s.uFocus.value = 1.2;
    s.uAperture.value = 0.3;
    splashMesh.renderOrder = plateRenderOrder(scene, RIPPLE_LAYER + 1);
    splashMesh.geometry.instanceCount = particlesFor(splash.count, m);
  });

  return (
    <>
      <primitive object={mesh} />
      <primitive object={splashMesh} />
    </>
  );
}
