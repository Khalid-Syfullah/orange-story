"use client";

import * as React from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";

import { colors } from "@/styles/tokens";

import { PlaceholderPlates } from "./placeholder-plates";

/**
 * The persistent WebGL canvas behind everything: the scene plates. It renders on demand, once per
 * progress change (plus whatever later idle effects request), with the pixel ratio capped.
 * Loaded on the client only (see the stage).
 */

function RenderOnProgress({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => progress.on("change", () => invalidate()), [progress, invalidate]);
  return null;
}

export default function StageCanvas({ progress }: { progress: MotionValue<number> }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      flat
      resize={{ scroll: false }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 10], fov: 35, near: 0.1, far: 200 }}
      aria-hidden
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={[colors.sky]} />
      <RenderOnProgress progress={progress} />
      <PlaceholderPlates progress={progress} />
    </Canvas>
  );
}
