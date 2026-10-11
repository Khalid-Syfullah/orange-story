"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMotionValue, useTransform } from "motion/react";
import type { Group, PerspectiveCamera } from "three";

import { plateEntry } from "@/art/manifest";
import { useStacked } from "@/lib/use-stacked";

import { BUILDERS, malletActing } from "./acting";
import { useFigureLife } from "./figure-life";
import { Plate } from "./plate";
import type { SceneArtProps } from "./scene-layers";
import { useStageProgress } from "./stage-context";
import { SitePage } from "./site-page";
import { seaOpacity, sideOpacity, siteShift, siteShiftStacked, tileField, tilesOpacity, topDownOpacity } from "./site-plan";

/**
 * Scene 8, the building site by the sea (`site-plan.ts`, timings in `SITE`).
 *
 * - Side view: the sea and level ground, the low marble platform, the timber stage with its steps,
 *   the large orange under construction and the three builders (left, right, and seated with the
 *   plan). The two standing builders work with their mallets while the camera is near the ground,
 *   half a blow apart (their forearms turning on the elbow, `acting.ts`); the seated one reads.
 * - As the camera rises (camera script) to straight above, the side plates cross-fade into the
 *   matching top-down set: the crown of the orange, the marble, the stage, the tops of the heads.
 *   The sea and its sky leave last, so the top-down view has no sky; the plain ground under the
 *   tiled field fills everything beyond it.
 * - The top-down view zooms out (camera pull) and the whole site shifts into the middle of the left
 *   half of the screen (`SiteFrame`), while the tiled ground grows into a large field around it.
 *   The milk page with its leaf shadows on the right is `SitePage` (in front of the lens), which the
 *   wind lifts away when the dust rises.
 *
 * All scrubbed by progress, so it plays backwards exactly.
 */

/** Everything in the scene sits in one group that slides left as the top-down view shrinks into the left half. */
function SiteFrame({ children }: { children: React.ReactNode }) {
  const group = React.useRef<Group>(null);
  const progress = useStageProgress();
  const invalidate = useThree((s) => s.invalidate);
  const stacked = useStacked();

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const camera = state.camera as PerspectiveCamera;
    const p = progress?.get() ?? 0;
    // Straight above, the ground under the camera is camera.position.y away: that is half the view height there.
    const halfHeight = Math.abs(camera.position.y) * Math.tan((camera.fov * Math.PI) / 360);
    if (stacked) {
      // A phone: into the upper half (up on the screen is -z when looking straight down).
      g.position.x = 0;
      g.position.z = siteShiftStacked(p, halfHeight);
    } else {
      g.position.x = siteShift(p, halfHeight * camera.aspect);
      g.position.z = 0;
    }
  });
  React.useEffect(() => {
    invalidate();
  }, [invalidate, stacked]);

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
  const left = useFigureLife(plateEntry("site/builder-left"), { acting: (p, _t, _i, out) => malletActing(BUILDERS.siteLeft, p, out) });
  const right = useFigureLife(plateEntry("site/builder-right"), { acting: (p, _t, _i, out) => malletActing(BUILDERS.siteRight, p, out) });

  return (
    <SiteFrame>
      <Plate id="site/ground" opacity={topDown} layer={19} focus={false} sway={false} />
      <Plate id="site/tiles" opacity={tilesO} height={fieldSize} uvRepeat={[fieldTiles, fieldTiles]} layer={20} focus={false} sway={false} />
      <Plate id="site/sea" opacity={sea} sway={false} />
      <Plate id="site/platform" opacity={side} sway={false} />
      <Plate id="site/stage" opacity={side} sway={false} />
      <Plate id="site/orange" opacity={side} sway={false} />
      <Plate id="site/builder-left" opacity={side} sway={false} life={left} />
      <Plate id="site/builder-right" opacity={side} sway={false} life={right} />
      <Plate id="site/builder-seated" opacity={side} sway={false} />
      <Plate id="site/top-down" opacity={topDown} layer={21} focus={false} sway={false} />
    </SiteFrame>
  );
}

/** The site, and its milk page beside it (in front of the lens: it is laid out on the screen). */
export function SiteScene(props: SceneArtProps) {
  return (
    <>
      <SiteArt {...props} />
      <SitePage />
    </>
  );
}
