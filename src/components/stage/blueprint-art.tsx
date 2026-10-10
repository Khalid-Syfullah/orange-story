"use client";

import { useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, platePoint } from "@/art/manifest";
import { PLAN_DEPTH } from "@/scroll/script";
import { mixColors } from "@/styles/tokens";

import { architectActing, BUILDERS, malletActing } from "./acting";
import { useFigureLife, type FigureHold, type PartRide } from "./figure-life";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { HELD_PANEL, HINGE_ANCHOR, PANEL_IDS, panelAt } from "./blueprint-plan";

/**
 * Scene 7, the blueprint (`blueprint-plan.ts`, timings in `BLUEPRINT`).
 *
 * The minaret in its timber scaffold stands on the sky. The builder works on his platform with his
 * mallet (his forearm turning on the elbow: wind-up, strike, recoil, his body and head following).
 * The architect holds the folded drawing on another platform, its last panel at her grip points, and
 * it unfolds in her hands panel by panel on its hinges as the camera pushes in: each panel turns about
 * its vertical hinge in perspective, darkening as it turns from the light and showing the paper's
 * plain back when turned away. All scrubbed by progress.
 */
const PLAN_SHADE = mixColors("skySoft", "ink", 0.25);
/** The paper's back: plain, the drawing faintly through it. */
const PAPER_BACK = { color: mixColors("marble", "ink", 0.2), amount: 0.8 } as const;

/** She holds the plan at her left hand's grip (the plan rides her body: her breathing and her lean). */
const grip = platePoint("blueprint/architect", "grip-left");
const ARCHITECT_HOLDS: readonly FigureHold[] = [{ at: [grip[0], grip[1]] }];

function PlanPanel({ index, progress, ride }: { index: number; progress: MotionValue<number>; ride: PartRide }) {
  const pose = useTransform(progress, (p) => panelAt(index, p));
  const x = useTransform(pose, (v) => v.x);
  const y = useTransform(pose, (v) => v.y);
  const z = useTransform(pose, (v) => v.z);
  const turn = useTransform(pose, (v) => v.turn);
  const shade = useTransform(pose, (v) => v.shade);
  const anchor = index === HELD_PANEL ? undefined : HINGE_ANCHOR;
  return (
    <Plate
      id={PANEL_IDS[index]}
      position={[0, 0]}
      anchor={anchor}
      depth={PLAN_DEPTH}
      x={x}
      y={y}
      z={z}
      turnY={turn}
      tint={PLAN_SHADE}
      tintAmount={shade}
      backTint={PAPER_BACK}
      sway={false}
      ride={ride}
    />
  );
}

export function BlueprintArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;
  // The builder's mallet: his forearm on the elbow, his body and head a beat behind it.
  const builder = useFigureLife(plateEntry("blueprint/builder"), {
    acting: (p, _t, _i, out) => malletActing(BUILDERS.blueprint, p, out),
  });
  // The architect leans in as the plan opens, her head bowing toward it.
  const architect = useFigureLife(plateEntry("blueprint/architect"), {
    holds: ARCHITECT_HOLDS,
    acting: (p, _t, _i, out) => {
      const a = architectActing(p);
      out.sway = a.sway;
      out.head = a.head;
    },
  });
  const held = architect.held(0);

  return (
    <>
      <Plate id="hero/sky" />
      <Plate id="blueprint/scaffold" sway={false} />
      <Plate id="blueprint/builder" sway={false} life={builder} />
      <Plate id="blueprint/architect" sway={false} life={architect} />
      {PANEL_IDS.map((id, i) => (
        <PlanPanel key={id} index={i} progress={progress} ride={held} />
      ))}
    </>
  );
}
