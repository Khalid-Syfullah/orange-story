"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { useMotionValue, type MotionValue } from "motion/react";

import type { PlateId } from "@/art/manifest";

import { Plate } from "../plate";
import { CalmVeil } from "./calm-veil";
import { cloudAt, CLOUD_PASS, type CloudPose } from "./cloud-plan";
import { lensOrder } from "./lens";
import type { TransitionEffectProps } from "./transition-stage";

/**
 * Work to blueprint: through the cloud (`cloud-plan.ts`). Three of The Work's halftone clouds drift in
 * on the wind, the nearest filling the lens as the scenes swap inside it; the pan to the scaffold
 * carries the camera out, the clouds sliding off to the left. They stand in the world, drawn after
 * both scenes, nearer ones later; the nearest takes a finer dot and smears a little when the story is
 * scrolled fast. Calm: a still cloud-white veil.
 */

/** Blur a passing cloud gains at full smear (a share of the view height), and the nearest one's own (it is out of focus). */
const SMEAR_BLUR = 0.01;
const NEAR_BLUR = 0.006;

function PassingCloud({ index, progress, smear, active }: { index: number; progress: MotionValue<number>; smear: React.RefObject<number>; active: () => boolean }) {
  const cloud = CLOUD_PASS.clouds[index];
  const pose = React.useRef<CloudPose>({ x: 0, y: 0, z: 0, height: 1, shown: false, opacity: 1 });
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const z = useMotionValue(0);
  const height = useMotionValue(1);
  const opacity = useMotionValue(0);
  const blur = useMotionValue(0);
  // Before the plate (0): its values for this frame.
  useFrame((state) => {
    const on = active();
    const aspect = state.size.width / Math.max(1, state.size.height);
    const c = cloudAt(index, progress.get(), aspect, pose.current);
    x.set(c.x);
    y.set(c.y);
    z.set(c.z);
    height.set(c.height);
    opacity.set(on && c.shown ? c.opacity : 0);
    const near = index === CLOUD_PASS.clouds.length - 1;
    blur.set((near ? NEAR_BLUR : 0) + (smear.current ?? 0) * SMEAR_BLUR * (index + 1) * 0.5);
  }, -0.6);
  return (
    <Plate
      id={cloud.id as PlateId}
      position={[0, 0]}
      depth={0}
      x={x}
      y={y}
      z={z}
      height={height}
      opacity={opacity}
      blur={blur}
      cell={cloud.cell}
      dots={cloud.dots}
      layer={lensOrder(cloud.distance)}
      sway={false}
      name={`cloud-pass-${index}`}
    />
  );
}

export function CloudPass({ def, progress, mode, smear }: TransitionEffectProps) {
  const running = React.useCallback(() => {
    const p = progress.get();
    return p >= def.start && p < def.end && mode() !== "calm";
  }, [progress, def, mode]);
  return (
    <>
      {CLOUD_PASS.clouds.map((_, i) => (
        <PassingCloud key={i} index={i} progress={progress} smear={smear} active={running} />
      ))}
      <CalmVeil def={def} progress={progress} mode={mode} look="cloud" />
    </>
  );
}
