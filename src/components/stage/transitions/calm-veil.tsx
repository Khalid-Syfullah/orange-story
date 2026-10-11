"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from "three";

import { useMutable } from "@/lib/use-mutable";
import type { TransitionDef } from "@/scroll/types";

import { veilAmount } from "./choreography";
import { GRAIN_GLSL, MEDIA_GLSL } from "./media";
import { LensGroup, lensOrder, lensView } from "./lens";
import { STAGE_UNIFORMS } from "../materials";
import type { TransitionMode } from "./modes";

/**
 * The calm version of a covering transition (reduced motion): no medium moves. A still painted veil in
 * the medium's colours fades in over the old scene, the scenes swap under it, and it fades out over
 * the new one: a plain cross-fade through the medium's colour, with the canvas grain on it.
 */

export type VeilLook = "sand" | "paper" | "dust" | "cloth" | "cloud";

const LOOKS: Record<VeilLook, number> = { sand: 0, paper: 1, dust: 2, cloth: 3, cloud: 4 };

/** Where the veil stands in front of the lens. */
const VEIL_DEPTH = 0.4;

const FRAGMENT = /* glsl */ `
${MEDIA_GLSL}
${GRAIN_GLSL}
uniform float uLook;
uniform float uOpacity;
uniform vec2 uAspect;
varying vec2 vUv;
void main() {
  vec2 P = (vUv - 0.5) * uAspect;
  float soft = fbm(P * 2.2 + 3.1, 4);
  float fine = fbm(P * 14.0 + 7.7, 3);
  vec3 c;
  if (uLook < 0.5) {
    // Blue sand: a deep, grained blue with pale flecks.
    c = mix(SKY, INK, 0.12 + 0.1 * soft) ;
    c = mix(c, SKY_SOFT, 0.18 * fine * fine);
  } else if (uLook < 1.5) {
    // Milk paper with its fibre.
    c = MILK * (0.97 + 0.04 * soft + 0.02 * fine);
  } else if (uLook < 2.5) {
    // Dust: warm sand low, blue sky high.
    c = mix(mix(MARBLE, SKY_SOFT, 0.35), mix(SKY_SOFT, SKY, 0.4), clamp(vUv.y * 1.2 - 0.1 + 0.2 * soft, 0.0, 1.0));
  } else if (uLook < 3.5) {
    // Blue cloth, its folds still.
    float fold = sin((P.x * 1.4 + P.y * 2.3) * 4.0 + soft * 3.0);
    c = mix(SKY, SKY_SOFT, 0.18 + 0.12 * fold);
  } else {
    // Inside a cloud: white, a cool shade in it.
    c = mix(WHITE, SKY_SOFT, 0.08 + 0.3 * soft);
  }
  c *= 1.0 + 0.12 * canvasGrain(vUv * uAspect * 6.0);
  gl_FragColor = vec4(c * uOpacity, uOpacity);
}
`;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;


export function CalmVeil({ def, progress, mode, look }: { def: TransitionDef; progress: MotionValue<number>; mode: () => TransitionMode; look: VeilLook }) {
  const mesh = React.useMemo(() => {
    const material = new ShaderMaterial({
      name: `transition:veil:${look}`,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      uniforms: {
        uLook: { value: LOOKS[look] },
        uOpacity: { value: 0 },
        uAspect: { value: new Vector2(1.6, 1) },
        grainMap: STAGE_UNIFORMS.grainMap,
        quality: STAGE_UNIFORMS.quality,
      },
    });
    const m = new Mesh(new PlaneGeometry(1, 1), material);
    m.frustumCulled = false;
    m.renderOrder = lensOrder(VEIL_DEPTH, 40);
    m.position.set(0, 0, -VEIL_DEPTH);
    m.visible = false;
    m.name = `veil-${look}`;
    return m;
  }, [look]);
  React.useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  const veilRef = useMutable(mesh);
  const view = React.useRef<[number, number]>([0, 0]);
  useFrame(({ camera }) => {
    const veil = veilRef.current;
    const amount = mode() === "calm" ? veilAmount(def, progress.get()) : 0;
    veil.visible = amount > 0.001;
    if (!veil.visible) return;
    const [halfW, halfH] = lensView(camera, VEIL_DEPTH, view.current);
    veil.scale.set(halfW * 2.04, halfH * 2.04, 1);
    veil.material.uniforms.uOpacity.value = amount;
    (veil.material.uniforms.uAspect.value as Vector2).set(halfW / Math.max(1e-6, halfH), 1);
  });
  return (
    <LensGroup name={`veil-${def.id}`}>
      <primitive object={mesh} />
    </LensGroup>
  );
}
