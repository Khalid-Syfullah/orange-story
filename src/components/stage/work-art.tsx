"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, type PlateId } from "@/art/manifest";

import { useIdleClock } from "./idle";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { builderAt, cloudShiftAt, driftX, giantOrangeAt } from "./work-sky";

/**
 * Scene 6, services in the clouds (`work-sky.ts`, timings in `WORK`).
 *
 * - Six halftone cloud plates drift from the center toward the right on idle time (paused offscreen
 *   and with reduced motion) and shift right with the scroll, at their own depths; the camera dollies
 *   upward through them (camera script).
 * - During card 3 the giant orange on its minaret rises into view, the builder with it, working.
 */
const CLOUDS = ["work/cloud-1", "work/cloud-2", "work/cloud-3", "work/cloud-4", "work/cloud-5", "work/cloud-6"] as const satisfies readonly PlateId[];

function Cloud({ id, progress }: { id: (typeof CLOUDS)[number]; progress: MotionValue<number> }) {
  const entry = plateEntry(id);
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const base = entry.position[0];
  const idle = useMotionValue(driftX(base, entry.depth, clock.time()));
  const x = useTransform([idle, progress] as const, ([drift, p]: readonly number[]) => drift + cloudShiftAt(p, entry.depth));

  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useFrame(() => {
    clock.hold(key);
    idle.set(driftX(base, entry.depth, clock.time()));
  });

  return <Plate id={id} x={x} sway={false} />;
}

export function WorkArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const orange = useTransform(progress, giantOrangeAt);
  const orangeY = useTransform(orange, (o) => o.y);
  const orangeO = useTransform(orange, (o) => o.opacity);
  const builder = useTransform(progress, builderAt);
  const builderY = useTransform(builder, (b) => b.y);
  const builderO = useTransform(builder, (b) => b.opacity);
  const builderR = useTransform(builder, (b) => b.rotate);

  return (
    <>
      <Plate id="hero/sky" />
      {CLOUDS.slice(3).map((id) => (
        <Cloud key={id} id={id} progress={progress} />
      ))}
      <Plate id="work/giant-orange" y={orangeY} opacity={orangeO} sway={false} />
      <Plate id="work/builder" y={builderY} opacity={builderO} rotate={builderR} sway={false} />
      {CLOUDS.slice(0, 3).map((id) => (
        <Cloud key={id} id={id} progress={progress} />
      ))}
    </>
  );
}
