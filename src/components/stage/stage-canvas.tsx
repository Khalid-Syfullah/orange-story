"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { gsap } from "gsap";
import { frameData, frameSteps, type MotionValue } from "motion/react";

import { CAMERA } from "@/scroll/script";
import { colors } from "@/styles/tokens";

import { CameraRig } from "./camera-rig";
import { IdleClockProvider } from "./idle";
import { useStacked } from "@/lib/use-stacked";

import { PauseWhenHidden } from "./pause-when-hidden";
import { ADAPTIVE, adaptDpr, newFrameBudget, qualityOverride, stageDpr } from "./quality";
import { SceneLayers } from "./scene-layers";
import { StageProgressContext } from "./stage-context";
import { StageSurface } from "./stage-surface";
import type { TransitionMode } from "./transitions/modes";
import { ForcedTransitionMode, TransitionStage } from "./transitions/transition-stage";

/**
 * The persistent WebGL canvas behind everything: the scenes' painted plates in depth, filmed by the
 * camera rig, and the transitions between them (`TransitionStage`: the media in front of the lens and
 * in the world). It renders on demand: once per progress change, plus every frame while an idle effect
 * (sway, twinkle) is on screen or a smear is settling. The pixel ratio is capped (`quality.ts`) and
 * lowered further on a device that cannot keep up (`AdaptiveQuality`). Loaded on the client only (see
 * the stage).
 */

/**
 * Runs first in every canvas frame (before the camera rig): settles the values the scene arts
 * derive from progress with `useTransform`. Motion updates derived values in its own frame step,
 * which the browser may run after this canvas has drawn; without this, the camera (which reads
 * progress itself) and the plates (which read derived values) could show two different moments in
 * one frame, and anything carried with the camera would shake while scrolling. `process` is safe to
 * call again: values derived from derived values settle in the same pass, and Motion's own frame
 * then finds nothing left to do.
 */
function SettleDerivedValues() {
  useFrame(() => frameSteps.preRender.process(frameData), -10);
  return null;
}

/**
 * Adaptive quality: watches the canvas's own frame times and lowers the pixel ratio a step at a time
 * on a device that cannot keep up, then raises it again when it can (`adaptDpr` in `quality.ts`),
 * never above the layout's cap or the screen's own ratio. The canvas draws on demand, so a gap
 * between two draws can simply mean nothing changed in between: only draws in consecutive animation
 * frames (counted by the GSAP ticker, which runs every frame while the stage is live) are measured.
 * A device that cannot keep up stretches the frames themselves, and that shows.
 */
function AdaptiveQuality({ cap, onChange }: { cap: number; onChange: (dpr: number) => void }) {
  const state = React.useRef({ budget: newFrameBudget(), dpr: 0, max: 1, frame: -1 });
  React.useEffect(() => {
    const max = Math.max(1, Math.min(window.devicePixelRatio || 1, cap));
    state.current = { budget: newFrameBudget(), dpr: max, max, frame: -1 };
  }, [cap]);
  useFrame((_, delta) => {
    const s = state.current;
    const frame = gsap.ticker.frame;
    const consecutive = frame - s.frame === 1;
    s.frame = frame;
    if (!s.dpr || !consecutive) return;
    const next = adaptDpr(s.budget, delta, s.dpr, s.max);
    if (next === s.dpr) return;
    s.dpr = next;
    // Through the canvas's own `dpr` prop: the canvas re-applies that prop whenever it re-renders.
    onChange(next);
  }, -9);
  return null;
}

function RenderOnProgress({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => progress.on("change", () => invalidate()), [progress, invalidate]);
  return null;
}

const FIRST = CAMERA[0];

export default function StageCanvas({ progress, velocity, transitionMode }: { progress: MotionValue<number>; velocity?: MotionValue<number> | null; transitionMode?: TransitionMode }) {
  // A lower pixel ratio on a phone, and lower still on a device that cannot keep up.
  const stacked = useStacked();
  const range = React.useMemo(() => stageDpr(stacked), [stacked]);
  const [adapted, setAdapted] = React.useState<{ stacked: boolean; dpr: number } | null>(null);
  // The lowest tier forced from the address (`?quality=low`) behaves as a device that could not keep up.
  const [forcedLow] = React.useState(() => qualityOverride(window.location.search) === 0);
  // A change of layout starts over from the layout's own range.
  const dpr = forcedLow ? ADAPTIVE.floor : adapted && adapted.stacked === stacked ? adapted.dpr : range;
  const onAdapt = React.useCallback((next: number) => setAdapted({ stacked, dpr: next }), [stacked]);
  const current = typeof dpr === "number" ? dpr : Math.min(window.devicePixelRatio || 1, dpr[1]);
  return (
    <Canvas
      frameloop="demand"
      dpr={dpr}
      flat
      resize={{ scroll: false }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [...FIRST.position], fov: FIRST.fov, near: 0.1, far: 200 }}
      aria-hidden
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={[colors.sky]} />
      <StageProgressContext value={progress}>
        <SettleDerivedValues />
        {!forcedLow && <AdaptiveQuality cap={range[1]} onChange={onAdapt} />}
        <StageSurface dpr={current} max={range[1]} />
        <RenderOnProgress progress={progress} />
        <PauseWhenHidden />
        <CameraRig progress={progress} />
        <IdleClockProvider>
          <ForcedTransitionMode value={transitionMode ?? null}>
            <SceneLayers progress={progress} />
            <TransitionStage progress={progress} velocity={velocity} />
          </ForcedTransitionMode>
        </IdleClockProvider>
      </StageProgressContext>
    </Canvas>
  );
}
