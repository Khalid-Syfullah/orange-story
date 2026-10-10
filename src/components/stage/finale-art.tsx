"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { motionValue, useMotionValue, useTransform, type MotionValue } from "motion/react";

import { plateEntry, type PlateId } from "@/art/manifest";

import {
  armBobAt,
  astronomerOffset,
  CAN_TIP,
  cutFruitAt,
  DROP_COUNT,
  dropAt,
  finaleCloudShift,
  loopWeight,
  manAt,
  oldCloudOpacity,
  oldCloudShift,
  shearsAt,
  starsLift,
  starsOpacity,
  treeAt,
  wateringAt,
  womanAt,
  type FruitFrame,
} from "./finale-plan";
import { useIdleClock } from "./idle";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { StarEdges } from "./star-edges";
import { useSceneLayer, useStageProgress } from "./stage-context";
import { constellation, starReveal } from "./stars-plan";
import { Twinkle } from "./twinkle";
import { driftX } from "./work-sky";

/**
 * Scene 14, the finale: the orchard keepers (`finale-plan.ts`, timings in `FINALE`).
 *
 * Scrubbed by scroll, so scrolling back plays it in reverse: the astronomer and his platform sink
 * the rest of the way out of the bottom (from where the apply scene left them), the constellation
 * drifts up and away, the old cloud slides right, the tree rises from the bottom center, and the
 * woman with the watering can (from the left) and the man with the shears (from the right) walk in
 * and settle either side of it.
 *
 * Then the loop, which runs on idle time and no longer follows the scroll: she waters (three stream
 * frames), he snips and cuts an orange free, oranges drop now and then, and three cloud plates drift
 * to the right. It pauses with the idle clock (offscreen, hidden tab, reduced motion) and fades out
 * when the story is scrolled back before the keepers have settled. The wordmark, the subtitle and the
 * footer are DOM (`Wordmark` in `beat-content.tsx`) inside the closing viewfinder.
 */

const CLOUDS = ["finale/cloud-1", "finale/cloud-2", "finale/cloud-3"] as const satisfies readonly PlateId[];

/** Stacking inside the scene, back to front. */
const LAYER = { sky: 0, cloud: 1, stars: 2, edges: 3, oldCloud: 4, platform: 5, astronomer: 6, tree: 7, body: 8, arm: 9, stream: 10, fruit: 11 } as const;

/** A cloud that drifts right on idle time, and a little further with the scroll. */
function Cloud({ id }: { id: (typeof CLOUDS)[number] }) {
  const entry = plateEntry(id);
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const idle = useMotionValue(driftX(entry.position[0], entry.depth, clock.time()));

  React.useEffect(() => () => clock.drop(key), [clock, key]);
  useFrame(() => {
    const p = progress?.get() ?? 1;
    if ((scene?.presence(p) ?? 1) > 0.001) clock.hold(key);
    else clock.drop(key);
    idle.set(driftX(entry.position[0], entry.depth, clock.time()) + finaleCloudShift(p, entry.depth));
  });

  return <Plate id={id} x={idle} layer={LAYER.cloud} sway={false} />;
}

/** The motion values of one falling orange. */
interface FruitMotion {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  opacity: MotionValue<number>;
  scale: MotionValue<number>;
}

const newFruit = (): FruitMotion => ({ x: motionValue(0), y: motionValue(0), rotate: motionValue(0), opacity: motionValue(0), scale: motionValue(1) });

function setFruit(m: FruitMotion, frame: FruitFrame, weight: number) {
  m.x.set(frame.x);
  m.y.set(frame.y);
  m.rotate.set(frame.rotate);
  m.opacity.set(frame.opacity * weight);
  m.scale.set(frame.scale);
}

function Fruit({ motion }: { motion: FruitMotion }) {
  return <Plate id="finale/falling-orange" position={[0, 0]} x={motion.x} y={motion.y} rotate={motion.rotate} opacity={motion.opacity} scale={motion.scale} layer={LAYER.fruit} sway={false} />;
}

/** The orchard keepers once they have settled: the idle-time loop (see `finale-plan.ts`). */
function Keepers() {
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const none = useMotionValue(1);
  const stage = progress ?? none;
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);

  const walkerW = useTransform(stage, womanAt);
  const womanX = useTransform(walkerW, (w) => w.x);
  const womanY = useTransform(walkerW, (w) => w.y);
  const walkerM = useTransform(stage, manAt);
  const manX = useTransform(walkerM, (w) => w.x);
  const manY = useTransform(walkerM, (w) => w.y);

  // Loop values, written on idle time every frame (and at rest while the loop is faded out).
  const tip = useMotionValue(0);
  const streams = React.useMemo(() => [motionValue(0), motionValue(0), motionValue(0)], []);
  const closed = useMotionValue(0);
  const bob = useMotionValue(0);
  const cut = React.useMemo(() => newFruit(), []);
  const drops = React.useMemo(() => Array.from({ length: DROP_COUNT }, newFruit), []);

  const armY = useTransform([manY, bob] as const, ([walking, working]: readonly number[]) => walking + working);

  React.useEffect(() => () => clock.drop(key), [clock, key]);

  // Before the plates (0) and after the idle clock (-1): the plates read this frame's values.
  useFrame(() => {
    const p = progress?.get() ?? 1;
    const weight = loopWeight(p);
    const running = weight > 0 && (scene?.presence(p) ?? 1) > 0.001;
    if (running) clock.hold(key);
    else clock.drop(key);

    const t = clock.time();
    const water = wateringAt(t);
    tip.set(-CAN_TIP * water.tilt * weight);
    streams.forEach((stream, i) => stream.set(i === water.frame ? water.stream * weight : 0));
    closed.set(shearsAt(t) * weight);
    bob.set(armBobAt(t) * weight);
    setFruit(cut, cutFruitAt(t), weight);
    drops.forEach((drop, i) => setFruit(drop, dropAt(i, t), weight));
  }, -0.5);

  return (
    <>
      <Plate id="finale/woman-body" x={womanX} y={womanY} layer={LAYER.body} />
      <Plate id="finale/woman-arm" x={womanX} y={womanY} rotate={tip} layer={LAYER.arm} />
      <Plate id="finale/water-1" x={womanX} y={womanY} opacity={streams[0]} layer={LAYER.stream} />
      <Plate id="finale/water-2" x={womanX} y={womanY} opacity={streams[1]} layer={LAYER.stream} />
      <Plate id="finale/water-3" x={womanX} y={womanY} opacity={streams[2]} layer={LAYER.stream} />

      <Plate id="finale/man-body" x={manX} y={manY} layer={LAYER.body} />
      <Plate id="finale/man-arms-1" x={manX} y={armY} layer={LAYER.arm} />
      <Plate id="finale/man-arms-2" x={manX} y={armY} opacity={closed} layer={LAYER.arm + 0.5} />

      <Fruit motion={cut} />
      {drops.map((drop, i) => (
        <Fruit key={i} motion={drop} />
      ))}
    </>
  );
}

export function FinaleArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(1);
  const progress = stage ?? none;

  const reveal = useTransform(progress, starReveal);
  const lift = useTransform(progress, starsLift);
  const starsAlpha = useTransform(progress, starsOpacity);
  const sink = useTransform(progress, astronomerOffset);
  const cloudX = useTransform(progress, oldCloudShift);
  const cloudAlpha = useTransform(progress, oldCloudOpacity);
  const tree = useTransform(progress, treeAt);
  const treeY = useTransform(tree, (t) => t.y);
  const treeScale = useTransform(tree, (t) => t.scale);
  const { nodes } = React.useMemo(() => constellation(), []);

  return (
    <>
      <Plate id="hero/sky" layer={LAYER.sky} />
      {CLOUDS.map((id) => (
        <Cloud key={id} id={id} />
      ))}

      {/* What the stargazer scene leaves behind, leaving: the stars up and away, the astronomer and his platform down. */}
      <Twinkle sprite="stars/star" points={nodes} reveal={reveal} y={lift} opacity={starsAlpha} additive layer={LAYER.stars} name="constellation" />
      <StarEdges layer={LAYER.edges} y={lift} opacity={starsAlpha} />
      <Plate id="stars/cloud" x={cloudX} opacity={cloudAlpha} layer={LAYER.oldCloud} sway={false} />
      <Plate id="stars/platform" y={sink} layer={LAYER.platform} />
      <Plate id="stars/astronomer" y={sink} layer={LAYER.astronomer} />

      <Plate id="finale/tree" y={treeY} scale={treeScale} layer={LAYER.tree} />
      <Keepers />
    </>
  );
}
