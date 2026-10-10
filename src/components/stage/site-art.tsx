"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMotionValue, useTransform } from "motion/react";
import type { Group, PerspectiveCamera } from "three";

import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { builderSwing, seaOpacity, sideOpacity, siteShift, tileField, tilesOpacity, topDownOpacity } from "./site-plan";

/**
 * Scene 8, the building site by the sea (`site-plan.ts`, timings in `SITE`).
 *
 * - Side view: the sea and level ground, the low marble platform, the timber stage with its steps,
 *   the large orange under construction and the three builders (left, right, and seated with the
 *   plan). The builders work a little while the camera is near the ground.
 * - As the camera rises (camera script) to straight above, the side plates cross-fade into the
 *   matching top-down set: the crown of the orange, the marble, the stage, the tops of the heads.
 *   The sea and its sky leave last, so the top-down view has no sky; the plain ground under the
 *   tiled field fills everything beyond it.
 * - The top-down view zooms out (camera pull) and the whole site shifts into the middle of the left
 *   half of the screen (`SiteFrame`), while the tiled ground grows into a large field around it.
 *   The milk panel and its leaf shadows on the right are DOM (`SitePanel`).
 *
 * All scrubbed by progress, so it plays backwards exactly.
 */

/** Everything in the scene sits in one group that slides left as the top-down view shrinks into the left half. */
function SiteFrame({ children }: { children: React.ReactNode }) {
  const group = React.useRef<Group>(null);
  const progress = useStageProgress();
  const invalidate = useThree((s) => s.invalidate);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const camera = state.camera as PerspectiveCamera;
    // Straight above, the ground under the camera is camera.position.y away: half the view width there.
    const halfWidth = Math.abs(camera.position.y) * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    g.position.x = siteShift(progress?.get() ?? 0, halfWidth);
  });
  React.useEffect(() => {
    invalidate();
  }, [invalidate]);

  return <group ref={group} name="site-frame">{children}</group>;
}

export function SiteArt({ scene }: SceneArtProps) {
  void scene;
  const stage = useStageProgress();
  const none = useMotionValue(0);
  const progress = stage ?? none;

  const side = useTransform(progress, sideOpacity);
  const sea = useTransform(progress, seaOpacity);
  const topDown = useTransform(progress, topDownOpacity);
  const tilesO = useTransform(progress, tilesOpacity);
  const field = useTransform(progress, tileField);
  const fieldSize = useTransform(field, (f) => f.size);
  const fieldTiles = useTransform(field, (f) => f.tiles);
  const leftSwing = useTransform(progress, (p) => builderSwing(0, p));
  const rightSwing = useTransform(progress, (p) => builderSwing(1, p));
  const seatedSwing = useTransform(progress, (p) => builderSwing(2, p) * 0.5);

  return (
    <SiteFrame>
      <Plate id="site/ground" opacity={topDown} layer={19} focus={false} sway={false} />
      <Plate id="site/tiles" opacity={tilesO} height={fieldSize} uvRepeat={[fieldTiles, fieldTiles]} layer={20} focus={false} sway={false} />
      <Plate id="site/sea" opacity={sea} sway={false} />
      <Plate id="site/platform" opacity={side} sway={false} />
      <Plate id="site/stage" opacity={side} sway={false} />
      <Plate id="site/orange" opacity={side} sway={false} />
      <Plate id="site/builder-left" opacity={side} rotate={leftSwing} sway={false} />
      <Plate id="site/builder-right" opacity={side} rotate={rightSwing} sway={false} />
      <Plate id="site/builder-seated" opacity={side} rotate={seatedSwing} sway={false} />
      <Plate id="site/top-down" opacity={topDown} layer={21} focus={false} sway={false} />
    </SiteFrame>
  );
}
