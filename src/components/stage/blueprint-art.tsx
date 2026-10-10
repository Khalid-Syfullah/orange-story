"use client";

import { useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, platePoint } from "@/art/manifest";
import { ease, remap } from "@/lib/progress";
import { BLUEPRINT } from "@/scroll/script";
import { mixColors } from "@/styles/tokens";

import { architectHeadAt } from "./acting";
import { useFigureLife, useHeldRide, type FigureHold, type PartRide } from "./figure-life";
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

/**
 * The folded plan moves with her hands while she holds it. She is one painting: her head bows on its
 * neck through her rig's head region (a small turn the mesh can make), her body leans about her feet.
 */
const plan = platePoint("blueprint/architect", "plan");
const ARCHITECT_HOLDS: readonly FigureHold[] = [{ at: [plan[0], plan[1]] }];

/** How much the plan is still in her hands: all of it until it is brought forward, none once it stands open in front of the scaffold. */
const inHands = (p: number) => 1 - ease(remap(p, BLUEPRINT.bring[0], BLUEPRINT.bring[1]));

function PlanPanel({ index, progress, ride }: { index: number; progress: MotionValue<number>; ride: PartRide }) {
  const pose = useTransform(progress, (p) => panelAt(index, p));
  const x = useTransform(pose, (v) => v.x);
  const y = useTransform(pose, (v) => v.y);
  const scaleX = useTransform(pose, (v) => v.scaleX);
  const shade = useTransform(pose, (v) => v.shade);
  return <Plate id={PANEL_IDS[index]} x={x} y={y} scaleX={scaleX} tint={PLAN_SHADE} tintAmount={shade} sway={false} ride={ride} />;
}

export function BlueprintArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  const swing = useTransform(progress, builderSwing);
  // The architect leans in as the plan opens, her head bowing toward it (scrubbed, `architectLean`, `architectHeadAt`).
  const architect = useFigureLife(plateEntry("blueprint/architect"), {
    holds: ARCHITECT_HOLDS,
    acting: (p, _t, _i, out) => {
      out.sway = architectLean(p);
      out.head = architectHeadAt(p);
    },
  });
  const held = useHeldRide(architect, 0, progress, inHands);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="blueprint/scaffold" sway={false} />
      <Plate id="blueprint/builder" rotate={swing} sway={false} />
      <Plate id="blueprint/architect" sway={false} life={architect} />
      {PANEL_IDS.map((id, i) => (
        <PlanPanel key={id} index={i} progress={progress} ride={held} />
      ))}
    </>
  );
}
