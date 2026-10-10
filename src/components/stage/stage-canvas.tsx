"use client";

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";

import { CAMERA } from "@/scroll/script";
import { colors } from "@/styles/tokens";

import { CameraRig } from "./camera-rig";
import { IdleClockProvider } from "./idle";
import { MAX_DPR, MIN_DPR } from "./quality";
import { SceneLayers } from "./scene-layers";
import { StageProgressContext } from "./stage-context";

/**
 * The persistent WebGL canvas behind everything: the scenes' painted plates in depth, filmed by the
 * camera rig. It renders on demand: once per progress change, plus every frame while an idle effect
 * (sway, twinkle) is on screen. The pixel ratio is capped (`quality.ts`). Loaded on the client only
 * (see the stage).
 */

function RenderOnProgress({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => progress.on("change", () => invalidate()), [progress, invalidate]);
  return null;
}

const FIRST = CAMERA[0];

export default function StageCanvas({ progress }: { progress: MotionValue<number> }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[MIN_DPR, MAX_DPR]}
      flat
      resize={{ scroll: false }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [...FIRST.position], fov: FIRST.fov, near: 0.1, far: 200 }}
      aria-hidden
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={[colors.sky]} />
      <StageProgressContext value={progress}>
        <RenderOnProgress progress={progress} />
        <CameraRig progress={progress} />
        <IdleClockProvider>
          <SceneLayers progress={progress} />
        </IdleClockProvider>
      </StageProgressContext>
    </Canvas>
  );
}
