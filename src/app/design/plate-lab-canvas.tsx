"use client";

import { Canvas } from "@react-three/fiber";
import { useTransform, type MotionValue } from "motion/react";
import * as React from "react";

import { IdleClockProvider } from "@/components/stage/idle";
import { MorphPlate } from "@/components/stage/morph-plate";
import { Plate } from "@/components/stage/plate";
import { MAX_DPR, MIN_DPR } from "@/components/stage/quality";
import { Twinkle, twinkleField } from "@/components/stage/twinkle";
import { colors } from "@/styles/tokens";

/**
 * The /design plate lab: the stage machinery on its own, outside the story. One value drives a
 * morph (stone to bark), a plate's tint and blur, and the reveal of a twinkling star field.
 */

const STARS = twinkleField("plate-lab", 48, { x: [2.4, 5.6], y: [-1.9, 1.9], size: [0.14, 0.34], grow: true });

export default function PlateLabCanvas({ amount }: { amount: MotionValue<number> }) {
  const blur = useTransform(amount, (t) => t * 0.012);
  const tint = useTransform(amount, (t) => t * 0.7);
  return (
    <Canvas frameloop="demand" dpr={[MIN_DPR, MAX_DPR]} flat gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 10], fov: 35 }} aria-hidden>
      <color attach="background" args={[colors.sky]} />
      <IdleClockProvider>
        <React.Suspense fallback={null}>
          <MorphPlate from="ascent/stone" to="ascent/bark" mask="ascent/morph-mask" progress={amount} edgeColor={colors.orange} position={[-4, 2.4]} height={4.8} uvRepeat={[1, 2]} />
          <Plate id="pluck/hero-orange" position={[0, 0]} depth={0} height={2.2} sway={{ amplitude: 6 }} tint={colors.white} tintAmount={tint} blur={blur} />
          <Twinkle sprite="stars/star" points={STARS} reveal={amount} additive />
        </React.Suspense>
      </IdleClockProvider>
    </Canvas>
  );
}
