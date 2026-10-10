"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, type PlateId } from "@/art/manifest";
import { useStacked } from "@/lib/use-stacked";

import { useIdleClock } from "./idle";
import { Plate, type PlateClearing } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { builderAt, CARD_CLEARING, CLOUD_COPY, cloudClearing, cloudShiftAt, driftX, giantOrangeAt } from "./work-sky";

/**
 * Scene 6, services in the clouds (`work-sky.ts`, timings in `WORK`).
 *
 * - Six halftone cloud plates, each drawn twice (`CLOUD_COPY`), drift from the center toward the right
 *   on idle time (paused offscreen and with reduced motion) and shift right with the scroll, at their
 *   own depths; the camera dollies upward through them (camera script). While the cards are up the
 *   clouds part around the card text (`cloudClearing`), so it always sits on clear sky.
 * - During card 3 the giant orange on its minaret rises into view, the builder with it, working.
 */
const CLOUDS = ["work/cloud-1", "work/cloud-2", "work/cloud-3", "work/cloud-4", "work/cloud-5", "work/cloud-6"] as const satisfies readonly PlateId[];

function Cloud({ id, progress, clearing, copy = false }: { id: (typeof CLOUDS)[number]; progress: MotionValue<number>; clearing: PlateClearing; copy?: boolean }) {
  const entry = plateEntry(id);
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  // The copy starts half a wrap away (its offset from the manifest place is carried in `shift`).
  const shift = copy ? CLOUD_COPY.x : 0;
  const base = entry.position[0] + shift;
  const idle = useMotionValue(driftX(base, entry.depth, clock.time()) + shift);
  const x = useTransform([idle, progress] as const, ([drift, p]: readonly number[]) => drift + cloudShiftAt(p, entry.depth));

  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useFrame(() => {
    clock.hold(key);
    idle.set(driftX(base, entry.depth, clock.time()) + shift);
  });

  return <Plate id={id} x={x} y={copy ? CLOUD_COPY.y : 0} flipX={copy} sway={false} clearing={clearing} name={copy ? `${id}-copy` : id} />;
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

  // The clouds part around the card column while the cards are up.
  const stacked = useStacked();
  const amount = useTransform(progress, cloudClearing);
  const clearing = React.useMemo<PlateClearing>(() => ({ ...(stacked ? CARD_CLEARING.stacked : CARD_CLEARING.wide), amount }), [stacked, amount]);

  return (
    <>
      <Plate id="hero/sky" />
      {CLOUDS.slice(3).map((id) => (
        <React.Fragment key={id}>
          <Cloud id={id} progress={progress} clearing={clearing} />
          <Cloud id={id} progress={progress} clearing={clearing} copy />
        </React.Fragment>
      ))}
      <Plate id="work/giant-orange" y={orangeY} opacity={orangeO} sway={false} />
      <Plate id="work/builder" y={builderY} opacity={builderO} rotate={builderR} sway={false} />
      {CLOUDS.slice(0, 3).map((id) => (
        <React.Fragment key={id}>
          <Cloud id={id} progress={progress} clearing={clearing} />
          <Cloud id={id} progress={progress} clearing={clearing} copy />
        </React.Fragment>
      ))}
    </>
  );
}
