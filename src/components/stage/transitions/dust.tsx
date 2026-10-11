"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera } from "three";

import { useMutable } from "@/lib/use-mutable";
import { useStacked } from "@/lib/use-stacked";
import { PHYSICS } from "@/scroll/script";
import { colors, mixColors } from "@/styles/tokens";

import { STAGE_UNIFORMS } from "../materials";
import { CalmVeil } from "./calm-veil";
import { DUST_COVERED, dustApproach, dustClimb, dustClock, dustCool, dustDensity, dustLift, dustOrigin, gritField, LIFT_RAGGED, LIFT_SOFT } from "./dust-plan";
import { LensGroup, lensOrder } from "./lens";
import { GRAIN_GLSL, MEDIA_GLSL, NOISE_GLSL } from "./media";
import { LAYER_LIMIT, particlesFor } from "./modes";
import { noiseTexture } from "./noise-texture";
import { useParticleMesh } from "./particle-field";
import { poseAt } from "./match-cut";
import { transitionShows, usePrecompile, type TransitionEffectProps } from "./transition-stage";

/**
 * Site to prune: the wind lifts the dust (`dust-plan.ts`). Three plume sheets in front of the lens, far
 * to near: billowing dust, the sand's warm colour as it lifts off the site, cooling to the blue of the
 * sky it is lit by as it rises (`dustCool`), its shade cooler still. Before the swap they come up toward
 * the lens from the site; after it they climb the frame and lift off its top, the gardener showing below
 * them. White specks of grit swirl up through them, glinting.
 */

const LAYERS = [
  { depth: 1.6, scale: 1, warm: 0.9, far: 1 },
  { depth: 0.9, scale: 0.72, warm: 0.78, far: 0.5 },
  { depth: 0.45, scale: 0.5, warm: 0.62, far: 0 },
] as const;


const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${MEDIA_GLSL}
${NOISE_GLSL}
${GRAIN_GLSL}
uniform vec2 uAspect;
uniform float uScale;
uniform float uFar;
uniform float uWarm;
uniform float uCool;
uniform vec2 uOrigin;
uniform float uZoom;
uniform float uClimb;
uniform float uChurn;
uniform float uDensity;
uniform float uLift;
uniform float uSeed;
uniform float uOpacity;
varying vec2 vUv;

const float LIFT_RAGGED = ${LIFT_RAGGED.toFixed(3)};
const float LIFT_SOFT = ${LIFT_SOFT.toFixed(3)};

/* About u of the pixels past it (the noise is a bell around 0.5), clamped to none at 0 and all at 1. */
float coverAt(float u) {
  float q = clamp(1.0 - u, 1e-4, 1.0 - 1e-4);
  return clamp(0.38 + 0.09 * log(q / (1.0 - q)), -0.32, 1.02);
}

void main() {
  vec2 P = vec2(vUv.x * uAspect.x, vUv.y);
  vec2 O = vec2(uOrigin.x * uAspect.x, uOrigin.y);
  // The plumes grow about the site as they come up to the lens, then climb the frame.
  vec2 Q = ((P - O) / uZoom + O - vec2(0.0, uClimb)) / uScale;
  vec2 T = Q * 0.55 + vec2(uSeed, uSeed * 0.61);
  // Billows: big soft puffs with smaller ones on their edges, a little curl as they rise.
  vec2 warp = (tnoise(T * 0.35 + vec2(0.0, -uChurn * 0.1)).xy - 0.5) * 0.16;
  float m1 = tnoise(T * 0.7 + warp).x;
  float m2 = tnoise(T * 1.9 + warp * 2.0 + vec2(0.3, -uChurn * 0.25)).y;
  float mass = 0.7 * m1 + 0.3 * m2;
  // It lifts off the site first, then fills the frame (none at 0, every pixel at 1).
  float r = length(P - O);
  float nearSite = exp(-pow(r / (0.2 + 1.2 * uDensity), 2.0));
  float u = max(uDensity * uDensity * uDensity, clamp(uDensity * (0.25 + 1.45 * nearSite), 0.0, 1.0));
  float lo = coverAt(u);
  float d = smoothstep(lo, lo + 0.3, mass);
  // After the swap it lifts off the top: below its bottom edge it has gone. The edge is the billows'
  // own: the dense puffs hang lower, the thin dust between them has lifted first.
  float edge = clamp(0.45 * (tnoise(vec2(T.x * 0.7, 0.53 + uSeed)).w - 0.5) * 2.0 + 1.6 * (mass - 0.5), -1.0, 1.0);
  d *= smoothstep(uLift - LIFT_SOFT, uLift + LIFT_SOFT, vUv.y + LIFT_RAGGED * edge);
  if (d <= 0.002) discard;

  // The paint: sand-warm where the sun is on the puffs, the sky's blue in their shade, grit through it.
  float toward = 0.7 * tnoise(T * 0.7 + warp + vec2(-0.03, 0.035)).x + 0.3 * m2;
  float lit = clamp(0.55 + (mass - toward) * 3.6, 0.0, 1.0);
  float puffs = tnoise(T * 3.4 + warp * 3.0 + vec2(0.0, -uChurn * 0.3)).z;
  vec3 warm = mix(MARBLE, ORANGE, 0.16);
  // In its own shade dust is the sand cooled and greyed by the sky; risen into the light, it is the sky's blue.
  vec3 shade = mix(MARBLE * 0.78, mix(SKY_SOFT, SKY, 0.35), mix(0.42, 0.78, uCool));
  vec3 lifted = mix(mix(SKY_SOFT, MARBLE, mix(0.55, 0.22, uCool)), warm, uWarm);
  vec3 body = mix(shade, lifted, smoothstep(0.1, 0.95, lit * (0.8 + 0.4 * puffs)));
  // Denser and a little deeper inside a billow.
  body = mix(body, shade * 0.9, 0.2 * smoothstep(0.55, 0.85, mass) * (1.0 - lit));
  body *= 0.97 + 0.06 * tnoise(Q * 2.3 + uSeed).z;
  body = mix(body, SKY_SOFT, 0.12 * uFar);
  body *= 1.0 + 0.08 * canvasGrain(vUv * uAspect * (5.0 / uScale));
  float a = d * uOpacity;
  gl_FragColor = vec4(body * a, a);
}
`;

function plumeMaterial(i: number): ShaderMaterial {
  return new ShaderMaterial({
    name: `transition:dust:${i}`,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      uAspect: { value: new Vector2(1.6, 1) },
      uScale: { value: LAYERS[i].scale },
      uFar: { value: LAYERS[i].far },
      uWarm: { value: LAYERS[i].warm },
      uCool: { value: 0 },
      uOrigin: { value: new Vector2(0.25, 0.5) },
      uZoom: { value: 1 },
      uClimb: { value: 0 },
      uChurn: { value: 0 },
      uDensity: { value: 0 },
      uLift: { value: -1 },
      uSeed: { value: 0.23 + i * 0.29 },
      uOpacity: { value: 1 },
      uNoise: { value: noiseTexture() },
      grainMap: STAGE_UNIFORMS.grainMap,
      quality: STAGE_UNIFORMS.quality,
    },
  });
}

/** White specks: grit of the site lifted with the dust, catching the sun. */
const GRIT_LOOK = {
  colorA: mixColors("white", "milk", 0.5),
  colorB: mixColors("milk", "marble", 0.5),
  lit: colors.white,
  litAmount: 0.5,
  shade: mixColors("marble", "skySoft", 0.45),
  round: 0.3,
};

export function DustRise({ def, progress, mode, smear }: TransitionEffectProps) {
  const stacked = useStacked();
  const grit = React.useMemo(() => gritField(), []);
  const gritMesh = useParticleMesh(grit, GRIT_LOOK, "dust-grit");
  const sheets = React.useMemo(
    () =>
      LAYERS.map((layer, i) => {
        const m = new Mesh(new PlaneGeometry(1, 1), plumeMaterial(i));
        m.frustumCulled = false;
        m.position.set(0, 0, -layer.depth);
        m.renderOrder = lensOrder(layer.depth, 1);
        m.visible = false;
        m.name = `dust-plume-${i}`;
        return m;
      }),
    [],
  );
  React.useEffect(
    () => () => {
      for (const s of sheets) {
        s.geometry.dispose();
        s.material.dispose();
      }
    },
    [sheets],
  );
  usePrecompile([gritMesh, ...sheets]);

  const covered = React.useMemo(() => poseAt(DUST_COVERED).fov, []);
  const hold = React.useCallback(() => (progress.get() > DUST_COVERED ? covered : null), [progress, covered]);
  const gritRef = useMutable(gritMesh);
  const sheetsRef = useMutable(sheets);

  useFrame(({ camera, size }) => {
    const gritMesh = gritRef.current;
    const sheets = sheetsRef.current;
    const p = progress.get();
    const m = mode();
    const on = transitionShows(def, p) && m !== "calm";
    const aspect = size.width / Math.max(1, size.height);
    const fov = hold() ?? (camera as PerspectiveCamera).fov;
    const tan = Math.tan((fov * Math.PI) / 360);
    const [ox, oy] = dustOrigin(stacked);
    const density = dustDensity(p);
    const zoom = dustApproach(p);
    const climb = dustClimb(p);
    const lift = dustLift(p);
    const churn = dustClock(p);
    const cool = dustCool(p);

    const keep = Math.min(LAYERS.length, LAYER_LIMIT[m]);
    sheets.forEach((sheet, i) => {
      const layer = LAYERS[i];
      sheet.visible = on && i >= LAYERS.length - keep;
      if (!sheet.visible) return;
      const halfH = layer.depth * tan;
      sheet.scale.set(halfH * aspect * 2.06, halfH * 2.06, 1);
      const u = sheet.material.uniforms;
      (u.uAspect.value as Vector2).set(aspect, 1);
      (u.uOrigin.value as Vector2).set(ox, oy);
      // Nearer layers come up faster, and climb faster (parallax).
      u.uZoom.value = 1 + (zoom - 1) * (1.6 - layer.far * 0.8);
      u.uClimb.value = climb * (1.4 - 0.5 * layer.far);
      u.uChurn.value = churn;
      // Each sheet covers its share so that all of them together cover about `density` of the frame (the
      // sheets are independent noise): the frame is full only at the cover, not well before it.
      u.uDensity.value = density >= 1 ? 1 : 1 - Math.pow(1 - density, 1 / keep);
      u.uLift.value = lift;
      // As it rises into the light the dust cools from the sand's colour to the sky's blue.
      u.uWarm.value = layer.warm * (1 - 0.8 * cool);
      u.uCool.value = cool;
    });

    gritMesh.visible = on;
    const g = gritMesh.material.uniforms;
    g.uTime.value = churn;
    g.uGravity.value = PHYSICS.gravity;
    (g.uWind.value as Vector3).set(0.15, 0.35, 0.5);
    // After the swap the grit climbs the frame with the dust.
    (g.uTravel.value as Vector3).set(0, -climb * 0.8 * tan * 2, 0);
    g.uSmear.value = smear.current ?? 0;
    g.uFocus.value = 0.9;
    g.uAperture.value = 0.7;
    // The grit goes with the dust: a few motes linger below it as it lifts off, then none.
    const gone = Math.max(0, Math.min(1, (lift + 0.2) / 0.7));
    g.uOpacity.value = 1 - gone * gone * (3 - 2 * gone);
    gritMesh.renderOrder = lensOrder(0.3, 4);
    gritMesh.geometry.instanceCount = particlesFor(grit.count, m);
  });

  return (
    <>
      <LensGroup name="dust" holdFov={hold}>
        {sheets.map((s) => (
          <primitive key={s.name} object={s} />
        ))}
        <primitive object={gritMesh} />
      </LensGroup>
      <CalmVeil def={def} progress={progress} mode={mode} look="dust" />
    </>
  );
}
