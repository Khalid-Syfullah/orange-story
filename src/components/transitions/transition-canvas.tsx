"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { Mesh, NoBlending, PlaneGeometry, ShaderMaterial, Vector2, Vector4, type IUniform } from "three";

import { plateEntry } from "@/art/manifest";
import { idleHeld } from "@/components/stage/idle";
import { IDLE_MAX_STEP, TRANSITION_PRELOAD_SCREENS, transitionDpr } from "@/components/stage/quality";
import { PauseWhenHidden } from "@/components/stage/pause-when-hidden";
import { useStacked } from "@/lib/use-stacked";
import { useLazyPlateTexture } from "@/components/stage/textures";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { SCREEN } from "@/scroll/script";
import { useProgressState } from "@/scroll/story-scroll";
import type { TransitionDef } from "@/scroll/types";

import {
  CANVAS_KINDS,
  canvasTransitionAt,
  dustFrame,
  fabricFrame,
  isCanvasKind,
  ringFrame,
  sandFrame,
  transitionPhase,
  unfoldFrame,
  type CanvasKind,
} from "./choreography";
import { FRAGMENTS, VERTEX } from "./shaders";

/**
 * The transition canvas: a transparent WebGL layer above the scene plates that draws the covering
 * and sweeping transitions (sand, paper unfold, rising dust, rainbow ring, fabric sky) as one
 * full-screen shader pass each. It renders only while one of them runs (plus one clearing frame as
 * it ends); while a transition with idle drift is on screen (grains, specks, the cloth) it keeps
 * rendering on idle time, and stops when it ends. Shaders compile while the browser is idle, and art
 * (the ring mask, the fabric sky, the cloud) loads only a few screens before it is needed; until
 * then the shaders draw a procedural stand-in.
 *
 * Everything is a function of `progress` (see `choreography.ts`), so it plays backwards exactly.
 */

export interface TransitionCanvasProps {
  progress: MotionValue<number>;
  /** The transitions to draw (canvas kinds only; others are ignored). At most one runs at a time. */
  transitions: readonly TransitionDef[];
}

/** One clip-space quad for every effect (shared, never disposed). */
const QUAD = new PlaneGeometry(2, 2);

/** Effects that move on idle time while they cover the screen. */
const DRIFTS: Record<CanvasKind, boolean> = { sand: true, unfold: false, dust: true, ring: false, fabric: true };

const ART = {
  ringMask: plateEntry("fall/ring-mask"),
  fabricSky: plateEntry("stars/fabric-sky"),
  cloud: plateEntry("stars/cloud"),
};

type Uniforms = Record<string, IUniform>;

const KIND_UNIFORMS: Record<CanvasKind, () => Uniforms> = {
  sand: () => ({ uFront: { value: 0 }, uBack: { value: 0 } }),
  dust: () => ({ uTop: { value: 0 }, uBottom: { value: 0 } }),
  unfold: () => ({
    uMilk: { value: 0 },
    uOpening: { value: 0 },
    uPacket: { value: 0 },
    uCenter: { value: Math.PI },
    uLeft: { value: Math.PI / 2 },
    uRight: { value: Math.PI / 2 },
    uCrease: { value: 0 },
  }),
  ring: () => ({ uRing: { value: new Vector4() }, uMask: { value: null }, uHasMask: { value: 0 } }),
  fabric: () => ({
    uFabric: { value: 0 },
    uSpread: { value: 0 },
    uCloud: { value: 0 },
    uCloudAlpha: { value: 0 },
    uFill: { value: 0 },
    uHole: { value: -1 },
    uRipple: { value: 0 },
    uSky: { value: null },
    uHasSky: { value: 0 },
    uCloudMap: { value: null },
    uHasCloud: { value: 0 },
    uCloudAspect: { value: ART.cloud.size[0] / ART.cloud.size[1] },
  }),
};

function createMaterial(kind: CanvasKind): ShaderMaterial {
  return new ShaderMaterial({
    name: `transition:${kind}`,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENTS[kind],
    uniforms: {
      uResolution: { value: new Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uEnter: { value: 0 },
      uExit: { value: 0 },
      ...KIND_UNIFORMS[kind](),
    },
    // One opaque-or-clear pass over a cleared canvas: write premultiplied color as is.
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Kinds of the transitions running or coming up within a few screens of p, as a stable key. */
function nearKinds(p: number, defs: readonly TransitionDef[]): string {
  const ahead = TRANSITION_PRELOAD_SCREENS * SCREEN;
  const kinds = new Set<string>();
  for (const def of defs) if (isCanvasKind(def.kind) && p >= def.start - ahead && p <= def.end + SCREEN) kinds.add(def.kind);
  return [...kinds].sort().join(" ");
}

function TransitionEffect({ progress, transitions }: TransitionCanvasProps) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  // `?idle=off` holds the drift still too, so a frame of a transition is a function of progress alone.
  const [held] = React.useState(idleHeld);
  const reduced = usePrefersReducedMotion() === true || held;
  const materials = React.useMemo(() => Object.fromEntries(CANVAS_KINDS.map((kind) => [kind, createMaterial(kind)])) as Record<CanvasKind, ShaderMaterial>, []);
  const quad = React.useRef<Mesh>(null);
  const idle = React.useRef(0);

  // Art only for the transitions about to run.
  const near = useProgressState(progress, (p) => nearKinds(p, transitions));
  const ringMask = useLazyPlateTexture(near.includes("ring") ? ART.ringMask : null);
  const fabricSky = useLazyPlateTexture(near.includes("fabric") ? ART.fabricSky : null);
  const cloud = useLazyPlateTexture(near.includes("fabric") ? ART.cloud : null);

  React.useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  // Render only while a transition runs, plus once as it ends (a clear frame for next time).
  React.useEffect(() => {
    let running = canvasTransitionAt(progress.get(), transitions) !== null;
    invalidate();
    return progress.on("change", (p) => {
      const now = canvasTransitionAt(p, transitions) !== null;
      if (now || running) invalidate();
      running = now;
    });
  }, [progress, transitions, invalidate]);

  // Art that arrives mid-transition shows at once.
  React.useEffect(() => invalidate(), [ringMask, fabricSky, cloud, invalidate]);

  // Compile the effects while the browser is idle, one per idle moment, so no transition ever waits
  // for its shader (in parallel where the browser can compile in the background).
  React.useEffect(() => {
    const queue = Object.values(materials);
    const parallel = gl.extensions.has("KHR_parallel_shader_compile");
    const idle = typeof window.requestIdleCallback === "function";
    let cancelled = false;
    let handle = 0;
    const schedule = () => {
      if (cancelled || queue.length === 0) return;
      handle = idle ? window.requestIdleCallback(step, { timeout: 4000 }) : window.setTimeout(step, 600);
    };
    const step = () => {
      const material = queue.shift();
      if (cancelled || !material) return;
      const mesh = new Mesh(QUAD, material);
      if (parallel) void gl.compileAsync(mesh, camera).then(schedule, schedule);
      else {
        gl.compile(mesh, camera);
        schedule();
      }
    };
    schedule();
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [gl, camera, materials]);

  useFrame((state, delta) => {
    const mesh = quad.current;
    if (!mesh) return;
    const p = progress.get();
    const def = canvasTransitionAt(p, transitions);
    if (!def || !isCanvasKind(def.kind)) {
      mesh.visible = false;
      return;
    }

    const kind = def.kind;
    mesh.material = materials[kind];
    mesh.visible = true;
    const material = mesh.material as ShaderMaterial;
    if (DRIFTS[kind] && !reduced && !document.hidden) {
      idle.current += Math.min(Math.max(delta, 0), IDLE_MAX_STEP);
      invalidate();
    }

    const u = material.uniforms;
    const { width, height } = state.size;
    const buffer = u.uResolution.value as Vector2;
    state.gl.getDrawingBufferSize(buffer);
    u.uDpr.value = buffer.x / Math.max(1, width);
    u.uTime.value = idle.current;
    const phase = transitionPhase(def, p);
    u.uT.value = phase.t;
    u.uEnter.value = phase.enter;
    u.uExit.value = phase.exit;

    switch (kind) {
      case "sand": {
        const frame = sandFrame(phase);
        u.uFront.value = frame.front;
        u.uBack.value = frame.back;
        break;
      }
      case "dust": {
        const frame = dustFrame(phase);
        u.uTop.value = frame.top;
        u.uBottom.value = frame.bottom;
        break;
      }
      case "unfold": {
        const frame = unfoldFrame(phase);
        u.uMilk.value = frame.milk;
        u.uOpening.value = frame.opening;
        u.uPacket.value = frame.packet;
        u.uCenter.value = frame.center;
        u.uLeft.value = frame.left;
        u.uRight.value = frame.right;
        u.uCrease.value = frame.crease;
        break;
      }
      case "ring": {
        const ring = ringFrame(def, p, width, height);
        (u.uRing.value as Vector4).set(ring.x, ring.y, ring.outer, ring.intensity);
        u.uMask.value = ringMask;
        u.uHasMask.value = ringMask ? 1 : 0;
        break;
      }
      case "fabric": {
        const frame = fabricFrame(phase, width / Math.max(1, height));
        u.uFabric.value = frame.fabric;
        u.uSpread.value = frame.spread;
        u.uCloud.value = frame.cloud;
        u.uCloudAlpha.value = frame.cloudAlpha;
        u.uFill.value = frame.fill;
        u.uHole.value = frame.hole;
        u.uRipple.value = frame.ripple;
        u.uSky.value = fabricSky;
        u.uHasSky.value = fabricSky ? 1 : 0;
        u.uCloudMap.value = cloud;
        u.uHasCloud.value = cloud ? 1 : 0;
        break;
      }
    }
  });

  return <mesh ref={quad} geometry={QUAD} material={materials.sand} frustumCulled={false} visible={false} />;
}

export default function TransitionCanvas(props: TransitionCanvasProps) {
  const dpr = transitionDpr(useStacked());
  return (
    <Canvas
      frameloop="demand"
      dpr={dpr}
      flat
      resize={{ scroll: false }}
      gl={{ alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" }}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <PauseWhenHidden />
      <TransitionEffect {...props} />
    </Canvas>
  );
}
