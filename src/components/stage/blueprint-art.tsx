"use client";

import { useMotionValue, useTransform } from "motion/react";

import { mixColors } from "@/styles/tokens";

import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { architectLean, builderSwing, panelAt } from "./blueprint-plan";

/**
 * Scene 7, the blueprint (`blueprint-plan.ts`, timings in `BLUEPRINT`).
 *
 * The minaret in its timber scaffold stands on the sky; the builder works on one platform and the
 * architect holds the folded drawing on another. The drawing is four fold panels that open one by
 * one as the camera pushes into them, shaded while shut. All scrubbed by progress.
 */
const PLAN_SHADE = mixColors("skySoft", "ink", 0.25);
const PANEL_IDS = ["blueprint/plan-1", "blueprint/plan-2", "blueprint/plan-3", "blueprint/plan-4"] as const;

function PlanPanel({ index }: { index: number }) {
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  const pose = useTransform(progress, (p) => panelAt(index, p));
  const x = useTransform(pose, (v) => v.x);
  const y = useTransform(pose, (v) => v.y);
  const scaleX = useTransform(pose, (v) => v.scaleX);
  const shade = useTransform(pose, (v) => v.shade);
  return <Plate id={PANEL_IDS[index]} x={x} y={y} scaleX={scaleX} tint={PLAN_SHADE} tintAmount={shade} sway={false} />;
}

export function BlueprintArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  const swing = useTransform(progress, builderSwing);
  const lean = useTransform(progress, architectLean);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="blueprint/scaffold" sway={false} />
      <Plate id="blueprint/builder" rotate={swing} sway={false} />
      <Plate id="blueprint/architect" rotate={lean} sway={false} />
      {PANEL_IDS.map((id, i) => (
        <PlanPanel key={id} index={i} />
      ))}
    </>
  );
}
