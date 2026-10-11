"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial, type PerspectiveCamera } from "three";

import { useMutable } from "@/lib/use-mutable";
import { plateEntry } from "@/art/manifest";

import { OUTPUT, STAGE_UNIFORMS } from "../materials";
import { usePlateTexture } from "../textures";
import { CalmVeil } from "./calm-veil";
import { clothAt, clothSteps, computeNormals, type ClothFrames } from "./cloth";
import { clothClock, clothCrossings, FABRIC_CLOTH, FABRIC_COVERED } from "./fabric-plan";
import { LensGroup, lensOrder } from "./lens";
import { GRAIN_GLSL, MEDIA_GLSL } from "./media";
import { poseAt } from "./match-cut";
import { transitionShows, usePrecompile, type TransitionEffectProps } from "./transition-stage";

/**
 * Questions to stars: the fabric sky (`fabric-plan.ts`). A cloth simulated once (`cloth.ts`, run across
 * idle moments a few screens ahead), read back by story time and drawn in front of the lens: a grid
 * mesh whose vertices and normals are written every frame, the painted fabric as its weave, lit by the
 * story's sun per pixel: the crowns of the folds warm and catching a little sheen, the troughs cool, the
 * back of the cloth in its own shade. Calm: a still blue cloth veil.
 */

const VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${MEDIA_GLSL}
${GRAIN_GLSL}
uniform sampler2D map;
uniform float uOpacity;
varying vec3 vNormal;
varying vec2 vUv;
${OUTPUT}
void main() {
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  float diff = dot(n, SUN_DIR);
  // The painted fabric, once across the whole cloth (no tiling, so no repeated or mirrored pattern), its
  // own painted folds softened so the cloth's real folds lead; the canvas grain is its weave.
  vec4 tex = texture2D(map, vUv);
  vec3 straight = tex.a > 0.0 ? tex.rgb / tex.a : vec3(0.0);
  vec3 cloth = mix(mix(SKY, INK, 0.12), linearToOutputTexel(vec4(straight, 1.0)).rgb, 0.55);
  // Folds: crowns to the sun warm and a touch of sheen, troughs in the sky's cool shade.
  float light = clamp(0.2 + 1.35 * diff, 0.0, 1.3);
  vec3 c = cloth * mix(0.5, 1.25, clamp(light, 0.0, 1.0));
  c = mix(c, mix(SKY, INK, 0.35), 0.35 * (1.0 - smoothstep(0.0, 0.45, diff)));
  c += mix(MILK, ORANGE, 0.25) * pow(clamp(diff, 0.0, 1.0), 6.0) * 0.28;
  if (!gl_FrontFacing) c *= 0.82;
  c *= 1.0 + 0.08 * canvasGrain(vUv * vec2(9.0, 7.0));
  gl_FragColor = vec4(c * uOpacity, uOpacity);
}
`;

/** The cloth's grid: its own geometry, positions and normals written every frame. */
function clothGeometry(nx: number, ny: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(nx * ny * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  const normals = new BufferAttribute(new Float32Array(nx * ny * 3), 3);
  normals.setUsage(DynamicDrawUsage);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      uvs[2 * k] = i / (nx - 1);
      uvs[2 * k + 1] = 1 - j / (ny - 1);
    }
  }
  const index: number[] = [];
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      // Counter-clockwise seen from the front (+z): the camera sees the cloth's face.
      index.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
  }
  geometry.setAttribute("position", positions);
  geometry.setAttribute("normal", normals);
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Runs the cloth across idle moments (a few steps per moment), then hands its frames over. */
function useClothFrames(): ClothFrames | null {
  const [frames, setFrames] = React.useState<ClothFrames | null>(null);
  React.useEffect(() => {
    const run = clothSteps(FABRIC_CLOTH);
    let cancelled = false;
    let handle = 0;
    const idle = typeof window.requestIdleCallback === "function";
    const slice = (deadline?: IdleDeadline) => {
      if (cancelled) return;
      const until = performance.now() + Math.min(8, deadline ? Math.max(2, deadline.timeRemaining()) : 6);
      for (;;) {
        const r = run.next();
        if (r.done) {
          setFrames(r.value);
          return;
        }
        if (performance.now() > until) break;
      }
      handle = idle ? window.requestIdleCallback(slice, { timeout: 200 }) : window.setTimeout(slice, 16);
    };
    handle = idle ? window.requestIdleCallback(slice, { timeout: 200 }) : window.setTimeout(slice, 16);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);
  return frames;
}

export function FabricSky({ def, progress, mode }: TransitionEffectProps) {
  const map = usePlateTexture(plateEntry("stars/fabric-sky"));
  const frames = useClothFrames();
  // The cloth arrives from idle moments: draw it at once, even if the story stands still.
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => {
    if (frames) invalidate();
  }, [frames, invalidate]);
  const lead = React.useMemo(() => (frames ? clothCrossings(frames).enters : 0), [frames]);
  const mesh = React.useMemo(() => {
    const m = new Mesh(
      clothGeometry(FABRIC_CLOTH.nx, FABRIC_CLOTH.ny),
      new ShaderMaterial({
        name: "transition:fabric",
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
        uniforms: { map: { value: map }, uOpacity: { value: 1 }, grainMap: STAGE_UNIFORMS.grainMap, quality: STAGE_UNIFORMS.quality },
      }),
    );
    m.frustumCulled = false;
    m.visible = false;
    m.name = "fabric";
    return m;
  }, [map]);
  React.useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  usePrecompile([mesh]);

  const covered = React.useMemo(() => poseAt(FABRIC_COVERED).fov, []);
  const hold = React.useCallback(() => (progress.get() > FABRIC_COVERED ? covered : null), [progress, covered]);
  const normals = React.useRef(new Float32Array(FABRIC_CLOTH.nx * FABRIC_CLOTH.ny * 3));

  const meshRef = useMutable(mesh);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const p = progress.get();
    const on = transitionShows(def, p) && mode() !== "calm" && frames !== null;
    mesh.visible = on;
    if (!on || !frames) return;
    // The cloth is laid out in frame heights: it hangs where the frame is one unit tall.
    const fov = hold() ?? (camera as PerspectiveCamera).fov;
    const distance = 0.5 / Math.tan((fov * Math.PI) / 360);
    mesh.position.set(0, 0, -distance);
    mesh.renderOrder = lensOrder(distance * 0.6);
    const position = mesh.geometry.getAttribute("position") as BufferAttribute;
    clothAt(frames, clothClock(p, lead), position.array as Float32Array);
    position.needsUpdate = true;
    const normal = mesh.geometry.getAttribute("normal") as BufferAttribute;
    computeNormals(position.array as Float32Array, FABRIC_CLOTH.nx, FABRIC_CLOTH.ny, normals.current);
    (normal.array as Float32Array).set(normals.current);
    normal.needsUpdate = true;
  });

  return (
    <>
      <LensGroup name="fabric" holdFov={hold}>
        <primitive object={mesh} />
      </LensGroup>
      <CalmVeil def={def} progress={progress} mode={mode} look="cloth" />
    </>
  );
}
