"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera } from "three";

import { useMutable } from "@/lib/use-mutable";
import { PHYSICS } from "@/scroll/script";
import { colors, mixColors } from "@/styles/tokens";

import { STAGE_UNIFORMS } from "../materials";
import { CalmVeil } from "./calm-veil";
import { LensGroup, lensOrder } from "./lens";
import { GRAIN_GLSL, MEDIA_GLSL, NOISE_GLSL } from "./media";
import { noiseTexture } from "./noise-texture";
import { LAYER_LIMIT, particlesFor } from "./modes";
import { useParticleMesh } from "./particle-field";
import { poseAt } from "./match-cut";
import { driftField, nearField, PILE_RAGGED, PILE_SOFT, pileLevel, pourField, SAND, SAND_DEF, sandClock, sandSource, sandThin, sandTravel, sandWind, streamDensity } from "./sand-plan";
import { transitionShows, usePrecompile, type TransitionEffectProps } from "./transition-stage";

/**
 * Share to work: the sand (`sand-plan.ts`). In front of the lens, far to near:
 * - the drift sheets: three layers of the drift at their own depths, each the dune piling up from the
 *   bottom of the frame (its crest lit, spindrift blowing off it), the streams of grains across the
 *   frame and, as it thins, the holes the wind opens in it; nearer layers are coarser, darker and move
 *   faster (parallax);
 * - the grains poured from the halves (instanced: born on the cut faces, carried by the camera's push
 *   until the cover);
 * - the grains streaming close past the lens.
 * Everything is a function of progress; the smear stretches the grains when scrolled fast.
 */

const [COVERED] = SAND_DEF.peak!;

/** The halves in the medium (between the two cut faces). */
const SOURCE = sandSource();

/** The drift's layers: distance in front of the lens, and its scale (nearer: coarser). */
const LAYERS = [
  { depth: 1.6, scale: 1, far: 1, glint: 260 },
  { depth: 0.8, scale: 0.7, far: 0.5, glint: 150 },
  { depth: 0.36, scale: 0.42, far: 0, glint: 70 },
] as const;


const SHEET_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHEET_FRAGMENT = /* glsl */ `
${MEDIA_GLSL}
${NOISE_GLSL}
${GRAIN_GLSL}
uniform vec2 uAspect;
uniform float uScale;
uniform float uFar;
uniform float uShift;     // how far the wind has carried this layer's pattern (frame widths)
uniform float uFall;      // how far it has fallen as the camera rises (frame heights)
uniform float uPile;      // the dune's top (share of the frame from the bottom); far below for the near layer
uniform float uStream;    // how dense the streams are, 0 to 1
uniform float uThin;      // how far the wind has thinned it, 0 to 1
uniform float uSeed;
uniform float uGlint;     // glint cells per unit of the pattern (finer far away)
uniform vec2 uSource;     // where the halves are on the frame (0 to 1, y up): the streams start from them
uniform float uOpacity;
varying vec2 vUv;

const float PILE_RAGGED = ${PILE_RAGGED.toFixed(3)};
const float PILE_SOFT = ${PILE_SOFT.toFixed(3)};

/*
 * Thresholds that turn a share u (0 to 1) into a share of the frame: the noise compared with them is
 * spread like a bell around 0.5, so a logit puts about u of the pixels past the threshold, and the
 * clamps make the ends exact (none at 0, all at 1: the noise lies between 0 and 1).
 */
float logitAt(float u, float middle, float spread, float lo, float hi) {
  float q = clamp(u, 1e-4, 1.0 - 1e-4);
  return clamp(middle + spread * log(q / (1.0 - q)), lo, hi);
}
/* The holes open where the noise is below it: whole at 0, gone at 1. */
float thinAt(float u) {
  return logitAt(u, 0.5, 0.09, -0.13, 1.13);
}
/* The streams cover where the blend is above it: none at 0, every pixel at 1. */
float streamAt(float u) {
  return logitAt(1.0 - u, 0.33, 0.09, -0.36, 1.02);
}

void main() {
  // Frame units (x across in frame heights, y up from the bottom); the pattern rides the wind and falls.
  vec2 P = vec2(vUv.x * uAspect.x, vUv.y);
  vec2 Q = (P + vec2(-uShift * uAspect.x, uFall)) / uScale;
  vec2 T = Q * 0.62 + vec2(uSeed, uSeed * 0.37);
  // A churning mass: two billowing fields drifting at their own rates, curled by a slow warp; streaks
  // along the wind inside it.
  vec2 warp = (tnoise(T * 0.3 + vec2(uShift * 0.25, 0.0)).xy - 0.5) * vec2(0.24, 0.12);
  float m1 = tnoise(T * vec2(0.3, 0.95) + warp).x;
  float m2 = tnoise(T * vec2(0.3, 0.95) * 1.7 + warp * 1.4 + vec2(uShift * 0.35 + 0.5, 0.21)).y;
  float mass = 0.6 * m1 + 0.4 * m2;
  float lines = tnoise(vec2(T.x * 0.3, T.y * 3.2) + warp * 2.0).z;
  float holes = tnoise(T * vec2(0.5, 0.9) + vec2(0.71, 0.13) - warp).w;

  // The dune piling up from the bottom: a ragged top edge, rippled by the wind.
  float edge = (tnoise(vec2(T.x * 0.5, 0.37 + uSeed)).w - 0.5) * 2.0;
  float top = uPile + PILE_RAGGED * edge;
  float pile = 1.0 - smoothstep(top - PILE_SOFT, top + PILE_SOFT, vUv.y);
  // Spindrift: grains blown off the crest, downwind.
  float drift = smoothstep(top + 0.18, top, vUv.y) * smoothstep(0.4, 0.8, mass) * step(-0.5, uPile) * 0.7;
  // The drift fills in as the wind builds: first downwind of the pour and off the dune's crest, then
  // everywhere (none at 0, every pixel at 1).
  float s = (vUv.x - uSource.x) * uAspect.x;
  float centre = uSource.y - 0.12 * s;
  float width = 0.08 + 0.36 * max(s, 0.0);
  float plume = exp(-pow((vUv.y - centre) / width, 2.0)) * smoothstep(-0.1, 0.06, s);
  float crestBand = smoothstep(top + 0.35, top, vUv.y) * step(-0.5, uPile);
  float u = max(uStream * uStream * uStream, clamp(uStream * (0.25 + 1.3 * plume + 0.7 * crestBand), 0.0, 1.0));
  float lo = streamAt(u);
  float stream = smoothstep(lo, lo + 0.34, mass);

  float d = max(max(pile, drift), stream);
  // The wind thins it in patches: holes open where it is thinnest and widen until it is gone.
  float t = thinAt(uThin);
  d *= smoothstep(t - 0.12, t + 0.12, holes);
  if (d <= 0.002) discard;

  // The paint: a soft ultramarine haze of grains, deeper where the mass is dense, lighter streaks in
  // it along the wind, the sun on the side of each billow toward it, grit all through.
  float toward = 0.6 * tnoise(T * vec2(0.3, 0.95) + warp + vec2(-0.02, 0.024)).x + 0.4 * m2;
  float lit = clamp(0.5 + (mass - toward) * 5.0, 0.0, 1.0);
  vec3 body = mix(mix(SKY, INK, 0.2), mix(SKY, SKY_SOFT, 0.3), smoothstep(0.25, 0.75, mass));
  body = mix(body, mix(SKY_SOFT, MILK, 0.3), 0.32 * smoothstep(0.5, 0.9, lines) * smoothstep(0.3, 0.6, mass));
  body = mix(body, mix(SKY_SOFT, MILK, 0.45), 0.18 * lit);
  float grit = tnoise(Q * uGlint * 0.035 + uSeed).z;
  body *= 0.93 + 0.14 * grit;
  // Sand is grains: a stipple of soft grains riding with the drift (finer far away), each a little
  // lighter or darker than the mass around it.
  vec2 sc = Q * uGlint * 0.9;
  vec3 sh = hash32(floor(sc) + uSeed * 5.0);
  float grain = 1.0 - smoothstep(0.16, 0.42, length(fract(sc) - 0.5 - (sh.xy - 0.5) * 0.3));
  body *= 1.0 + (sh.z - 0.45) * 0.34 * grain;
  // The crest of the dune catches the sun.
  float crest = exp(-pow((vUv.y - top) / 0.028, 2.0)) * step(-0.5, uPile);
  body = mix(body, mix(MILK, ORANGE, 0.35), 0.55 * crest);
  // Single grains glinting, carried with the drift: milk, and now and then the orange's own.
  vec2 cell = Q * uGlint;
  vec3 g = hash32(floor(cell) + uSeed * 13.0);
  float glint = step(0.988, g.x) * (1.0 - smoothstep(0.15, 0.4, length(fract(cell) - 0.5)));
  body = mix(body, mix(MILK, ORANGE, step(0.75, g.y) * 0.8), glint * 0.85);
  // Hazier with distance, and the canvas under it all.
  body = mix(body, SKY_SOFT, 0.18 * uFar);
  body *= 1.0 + 0.1 * canvasGrain(vUv * uAspect * (5.0 / uScale));
  // Thin sand is grains with air between them: a little stippled (solid where it is dense).
  float a = d * mix(0.7 + 0.3 * grit, 1.0, smoothstep(0.55, 0.95, d)) * uOpacity;
  gl_FragColor = vec4(body * a, a);
}
`;

function sheetMaterial(layer: number): ShaderMaterial {
  return new ShaderMaterial({
    name: `transition:sand:${layer}`,
    vertexShader: SHEET_VERTEX,
    fragmentShader: SHEET_FRAGMENT,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      uAspect: { value: new Vector2(1.6, 1) },
      uScale: { value: LAYERS[layer].scale },
      uFar: { value: LAYERS[layer].far },
      uShift: { value: 0 },
      uFall: { value: 0 },
      uPile: { value: -1 },
      uStream: { value: 0 },
      uThin: { value: 0 },
      uSeed: { value: 0.31 + layer * 0.173 },
      uGlint: { value: LAYERS[layer].glint },
      uSource: { value: new Vector2(0.5, 0.5) },
      uOpacity: { value: 1 },
      uNoise: { value: noiseTexture() },
      grainMap: STAGE_UNIFORMS.grainMap,
      quality: STAGE_UNIFORMS.quality,
    },
  });
}

/** How far the wind has carried things by p (world units): the integral of its speed. */
function windTravel(p: number): number {
  // The wind's speed is SAND.wind times a glide over the gust: integrate the quintic in closed form.
  const t = sandClock(p);
  const [a, b] = SAND.gust;
  if (t <= a) return 0;
  const span = b - a;
  const x = Math.min(1, (t - a) / span);
  const ramp = span * (x ** 6 - 3 * x ** 5 + 2.5 * x ** 4);
  return SAND.wind[0] * (ramp + Math.max(0, t - b));
}

/** Grains from the halves: the flesh's orange where the sun is on them, the sky's blue as they fall out of it. */
const POUR_LOOK = {
  colorA: colors.orange,
  colorB: mixColors("sky", "skySoft", 0.2),
  lit: mixColors("milk", "orange", 0.25),
  litAmount: 0.5,
  shade: mixColors("white", "skySoft", 0.55),
  round: 0.25,
  toneDrift: 1.6,
};

/** Grains lifted off the pour and the pile: the drift's own grains, sky blue, a few still warm from the flesh. */
const DRIFT_LOOK = {
  colorA: mixColors("orange", "milk", 0.35),
  colorB: mixColors("sky", "skySoft", 0.45),
  lit: mixColors("milk", "skySoft", 0.25),
  litAmount: 0.5,
  shade: mixColors("white", "skySoft", 0.5),
  round: 0.2,
  toneDrift: 2.5,
};

/** Grains close past the lens: lit flecks of the drift, soft and out of focus. */
const NEAR_LOOK = {
  colorA: mixColors("milk", "skySoft", 0.35),
  colorB: mixColors("skySoft", "sky", 0.35),
  lit: colors.milk,
  litAmount: 0.4,
  shade: mixColors("white", "skySoft", 0.4),
  round: 0.2,
};

export function SandStorm({ def, progress, mode, smear }: TransitionEffectProps) {
  const pour = React.useMemo(() => pourField(), []);
  const drift = React.useMemo(() => driftField(), []);
  const near = React.useMemo(() => nearField(), []);
  const pourMesh = useParticleMesh(pour, POUR_LOOK, "sand-pour");
  const driftMesh = useParticleMesh(drift, DRIFT_LOOK, "sand-drift");
  const nearMesh = useParticleMesh(near, NEAR_LOOK, "sand-near");
  const sheets = React.useMemo(
    () =>
      LAYERS.map((layer, i) => {
        const m = new Mesh(new PlaneGeometry(1, 1), sheetMaterial(i));
        m.frustumCulled = false;
        m.position.set(0, 0, -layer.depth);
        m.renderOrder = lensOrder(layer.depth, 1);
        m.visible = false;
        m.name = `sand-sheet-${i}`;
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
  usePrecompile([pourMesh, driftMesh, nearMesh, ...sheets]);

  const covered = React.useMemo(() => poseAt(COVERED).fov, []);
  const hold = React.useCallback(() => (progress.get() > COVERED ? covered : null), [progress, covered]);
  const travel = React.useRef<[number, number, number]>([0, 0, 0]);
  const source = React.useRef<[number, number]>([0.5, 0.5]);

  const pourRef = useMutable(pourMesh);
  const driftRef = useMutable(driftMesh);
  const nearRef = useMutable(nearMesh);
  const sheetsRef = useMutable(sheets);

  useFrame(({ camera, size }) => {
    const pourMesh = pourRef.current;
    const driftMesh = driftRef.current;
    const nearMesh = nearRef.current;
    const sheets = sheetsRef.current;
    const p = progress.get();
    const m = mode();
    const on = transitionShows(def, p) && m !== "calm";
    const aspect = size.width / Math.max(1, size.height);
    const fov = hold() ?? (camera as PerspectiveCamera).fov;
    const tan = Math.tan((fov * Math.PI) / 360);
    const t = sandClock(p);
    sandTravel(p, travel.current);
    const [tx, ty, tz] = travel.current;
    const wind = sandWind(p);
    const blow = windTravel(p);
    // Where the halves are on the frame: the streams start from them (in the medium, carried by the travel).
    const mx = SOURCE[0] - tx;
    const my = SOURCE[1] - ty;
    const mz = Math.min(-0.05, SOURCE[2] - tz);
    source.current[0] = 0.5 + mx / (-mz * tan * aspect * 2);
    source.current[1] = 0.5 + my / (-mz * tan * 2);

    // The poured grains: their own flight in the medium, the medium carried by the travel.
    pourMesh.visible = on;
    const pu = pourMesh.material.uniforms;
    pu.uTime.value = t;
    pu.uGravity.value = PHYSICS.gravity;
    (pu.uWind.value as Vector3).set(wind[0], wind[1], wind[2]);
    (pu.uTravel.value as Vector3).set(tx, ty, tz);
    pu.uSmear.value = smear.current ?? 0;
    pu.uFocus.value = 0.9;
    pu.uAperture.value = 0.35;
    pourMesh.renderOrder = lensOrder(1.0, 3);
    pourMesh.geometry.instanceCount = particlesFor(pour.count, m);

    // The drift: grains the wind lifts off the pour and the pile and carries across, in the medium too.
    driftMesh.visible = on;
    const du = driftMesh.material.uniforms;
    du.uTime.value = t;
    du.uGravity.value = PHYSICS.gravity;
    (du.uWind.value as Vector3).set(wind[0] * 1.5, wind[1] * 2, 0);
    (du.uTravel.value as Vector3).set(tx, ty, tz);
    du.uSmear.value = smear.current ?? 0;
    du.uFocus.value = 0.9;
    du.uAperture.value = 0.6;
    driftMesh.renderOrder = lensOrder(0.7, 3);
    driftMesh.geometry.instanceCount = particlesFor(drift.count, m);

    // The grains close past the lens: lens space, the wind's own.
    nearMesh.visible = on;
    const nu = nearMesh.material.uniforms;
    nu.uTime.value = t;
    nu.uGravity.value = PHYSICS.gravity;
    (nu.uWind.value as Vector3).set(2.8, 0.1, 0);
    (nu.uTravel.value as Vector3).set(0, Math.max(0, ty - travel0y(p)), 0);
    nu.uSmear.value = smear.current ?? 0;
    nu.uFocus.value = 1.4;
    nu.uAperture.value = 0.9;
    nu.uOpacity.value = 0.7;
    nearMesh.renderOrder = lensOrder(0.1, 5);
    nearMesh.geometry.instanceCount = particlesFor(near.count, m);

    // The sheets, far to near: the light mode keeps the two nearest.
    const keep = Math.min(LAYERS.length, LAYER_LIMIT[m]);
    sheets.forEach((sheet, i) => {
      const layer = LAYERS[i];
      sheet.visible = on && i >= LAYERS.length - keep;
      if (!sheet.visible) return;
      const halfH = layer.depth * tan;
      sheet.scale.set(halfH * aspect * 2.06, halfH * 2.06, 1);
      const u = sheet.material.uniforms;
      (u.uAspect.value as Vector2).set(aspect, 1);
      // The wind carries the pattern across this layer's frame; nearer layers move faster.
      u.uShift.value = blow / (2 * halfH * aspect);
      // As the camera rises, the drift falls away below, nearer layers faster.
      u.uFall.value = Math.max(0, ty - travel0y(p)) / (2 * halfH);
      u.uPile.value = i === LAYERS.length - 1 ? -1 : pileLevel(p);
      // The sheets are independent noise: each takes its share so that together the streams cover about
      // `streamDensity` of the frame, and a hole goes through all of them about `sandThin` of it.
      const stream = streamDensity(p);
      u.uStream.value = stream >= 1 ? 1 : 1 - Math.pow(1 - stream, 1 / keep);
      u.uThin.value = Math.pow(sandThin(p), 1 / keep);
      (u.uSource.value as Vector2).set(source.current[0], source.current[1]);
    });
  });

  return (
    <>
      <LensGroup name="sand" holdFov={hold}>
        {sheets.map((s) => (
          <primitive key={s.name} object={s} />
        ))}
        <primitive object={driftMesh} />
        <primitive object={pourMesh} />
        <primitive object={nearMesh} />
      </LensGroup>
      <CalmVeil def={def} progress={progress} mode={mode} look="sand" />
    </>
  );
}

/** The travel's height at the cover: after it, anything above this is the rise with The Work's dolly. */
let coveredY: number | null = null;

/** The travel's height that is not the rise (the camera's own small move until the cover). */
function travel0y(p: number): number {
  coveredY ??= sandTravel(COVERED)[1];
  return p > COVERED ? coveredY : sandTravel(p)[1];
}
