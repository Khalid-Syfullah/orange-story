"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import type { Group } from "three";

import { drawnPlates, preloadPlates } from "@/art/manifest";
import { SCENES } from "@/scroll/script";
import { useSceneIndex } from "@/scroll/story-scroll";
import type { SceneDef, SceneId } from "@/scroll/types";

import { AscentArt } from "./ascent-art";
import { GraftArt } from "./graft-art";
import { HeroArt } from "./hero-art";
import { Plate } from "./plate";
import { PluckArt } from "./pluck-art";
import { mountedScenes, scenePresence } from "./presence";
import { SceneLayerContext, type SceneLayer } from "./stage-context";
import { configureTextures, preloadTextures } from "./textures";

/**
 * The scenes on the stage canvas. Only the current scene and its two neighbours are mounted (React
 * state changes only when the scene changes); each stacks over the one before it and fades with its
 * presence (`presence.ts`). Each scene loads inside its own Suspense boundary, so it appears whole.
 * The textures of the current scene and the next one are preloaded and uploaded ahead of time.
 *
 * Scene art: a component registered in `SCENE_ART` for the scene, or `ManifestScene`, which places
 * every plate the manifest lists for the scene where the manifest says.
 */

export interface SceneArtProps {
  scene: SceneDef;
}

/** Custom art per scene, registered by the scene phases. Unlisted scenes draw their manifest plates. */
export const SCENE_ART: Partial<Record<SceneId, React.ComponentType<SceneArtProps>>> = {
  hero: HeroArt,
  ascent: AscentArt,
  graft: GraftArt,
  pluck: PluckArt,
};

const SCENE_IDS: readonly SceneId[] = SCENES.map((s) => s.id);

/** Every placed plate and backdrop of a scene at its manifest place, with its manifest sway. */
export function ManifestScene({ scene }: SceneArtProps) {
  return (
    <>
      {drawnPlates(scene.id).map((plate) => (
        <Plate key={plate.id} id={plate.id} />
      ))}
    </>
  );
}

function SceneLayerGroup({ scene, progress }: { scene: SceneDef; progress: MotionValue<number> }) {
  const group = React.useRef<Group>(null);
  const layer = React.useMemo<SceneLayer>(() => ({ scene, order: scene.number, presence: (p) => scenePresence(scene, p) }), [scene]);
  const Art = SCENE_ART[scene.id] ?? ManifestScene;

  useFrame(() => {
    if (group.current) group.current.visible = layer.presence(progress.get()) > 0;
  });

  return (
    <SceneLayerContext value={layer}>
      <group ref={group} name={`scene:${scene.id}`}>
        <React.Suspense fallback={null}>
          <Art scene={scene} />
        </React.Suspense>
      </group>
    </SceneLayerContext>
  );
}

function Preloader({ index }: { index: number }) {
  const gl = useThree((s) => s.gl);
  React.useEffect(() => configureTextures(gl), [gl]);
  React.useEffect(() => preloadTextures(preloadPlates(SCENE_IDS, index), gl), [gl, index]);
  return null;
}

export function SceneLayers({ progress }: { progress: MotionValue<number> }) {
  const index = useSceneIndex(progress);
  return (
    <>
      <Preloader index={index} />
      {mountedScenes(index).map((scene) => (
        <SceneLayerGroup key={scene.id} scene={scene} progress={progress} />
      ))}
    </>
  );
}
