import { SCENES, SCREEN } from "@/scroll/script";
import type { SceneId } from "@/scroll/types";

import { ACTING_MOTION } from "./acting";
import { APPLY_MOTION } from "./apply-plan";
import { ASCENT_MOTION } from "./ascent-tree";
import { BLUEPRINT_MOTION } from "./blueprint-plan";
import { FALL_MOTION } from "./fall-plan";
import { FINALE_MOTION } from "./finale-plan";
import { CROSSFADE_SCREENS } from "./presence";
import type { MotionChannel, SceneMotion } from "./motion-kit";
import { GRAFT_MOTION } from "./graft-hands";
import { PLUCK_MOTION } from "./pluck-harvest";
import { PRUNE_MOTION } from "./prune-plan";
import { SHARE_MOTION } from "./share-cut";
import { SITE_MOTION } from "./site-plan";
import { STARS_MOTION } from "./stars-plan";
import { WORK_MOTION } from "./work-sky";

/**
 * Every value the stage's scene arts drive from progress, scene by scene: the positions, turns,
 * scales and opacities of their figures, hands and things (each scene plan's `*_MOTION`), with the
 * skeletons and paths the motion lab on `/design` draws. `motion-channels.test.ts` walks the whole
 * script with it and fails where any of them jumps in speed.
 *
 * Not here, on purpose: the camera (one smooth path through its keys, checked in
 * `camera-path.test.ts`), whole scenes fading into each other (`presence.ts`), the art receding
 * behind words (it follows the words' own curve, `text-haze.ts`), the transitions (their own
 * choreography), and anything on idle time (breathing, sway, the finale's loop).
 */
const PLANS: Readonly<Partial<Record<SceneId, SceneMotion>>> = {
  ascent: ASCENT_MOTION,
  graft: GRAFT_MOTION,
  pluck: PLUCK_MOTION,
  share: SHARE_MOTION,
  work: WORK_MOTION,
  blueprint: BLUEPRINT_MOTION,
  site: SITE_MOTION,
  prune: PRUNE_MOTION,
  fall: FALL_MOTION,
  stars: STARS_MOTION,
  apply: APPLY_MOTION,
  finale: FINALE_MOTION,
};

/** Each scene's plan with its figures' acting (`acting.ts`) added to its channels. */
export const SCENE_MOTION: Readonly<Partial<Record<SceneId, SceneMotion>>> = Object.fromEntries(
  SCENES.flatMap((scene) => {
    const plan = PLANS[scene.id];
    const acting = ACTING_MOTION[scene.id] ?? [];
    if (!plan && !acting.length) return [];
    return [[scene.id, { ...plan, channels: [...(plan?.channels ?? []), ...acting] } satisfies SceneMotion]];
  }),
);

/** A channel with the scene it belongs to. */
export interface SceneChannel extends MotionChannel {
  scene: SceneId;
}

/** Every channel of every scene. */
export const MOTION_CHANNELS: readonly SceneChannel[] = SCENES.flatMap((scene) => (SCENE_MOTION[scene.id]?.channels ?? []).map((c) => ({ ...c, scene: scene.id })));

/** Where a scene's values can be seen: the scene, and the crossfades on either side of it. */
export function channelSpan(scene: SceneId): [number, number] {
  const s = SCENES.find((x) => x.id === scene);
  if (!s) throw new Error(`Unknown scene "${scene}"`);
  const margin = (CROSSFADE_SCREENS + 0.05) * SCREEN;
  return [Math.max(0, s.start - margin), Math.min(1, s.end + margin)];
}
