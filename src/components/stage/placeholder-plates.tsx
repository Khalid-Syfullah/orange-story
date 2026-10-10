"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Mesh, type MeshBasicMaterial } from "three";

import { chrome, story, storyScenes } from "@/content/copy";
import { ease, remap } from "@/lib/progress";
import { sceneProgress } from "@/scroll/helpers";
import { SCENES, SCREEN, TRANSITIONS } from "@/scroll/script";
import { useSceneIndex } from "@/scroll/story-scroll";
import type { SceneDef } from "@/scroll/types";

import { drawPlaceholder, type PlateLabel } from "./placeholder-art";

/**
 * One labelled placeholder plate per scene, filling the view, so the whole story can be scrolled end
 * to end before the plate system and the painted art exist. Only the scene on stage and its two
 * neighbours are mounted (state changes only when the scene changes). The incoming plate fades in
 * across the boundary (over its transition when one hands over to it), and every plate pushes in
 * slightly through its own scene. Everything is scrubbed by progress.
 */

/** Crossfade across a plain scene boundary, in screens to each side. */
const PLAIN_FADE = 0.2;
/** Gentle push through a scene (scale gained from its start to its end). */
const PUSH = 0.035;
/** Longest side of a plate texture, in px. */
const TEXTURE_SIZE = 1024;

/** Progress range over which a scene's plate fades in. The first scene is always there. */
function fadeIn(scene: SceneDef): readonly [number, number] | null {
  if (scene.number === 1) return null;
  const handover = TRANSITIONS.find((t) => t.layer === "canvas" && t.to === scene.id && t.from !== t.to);
  if (handover) return [handover.start, handover.end];
  return [scene.start - PLAIN_FADE * SCREEN, scene.start + PLAIN_FADE * SCREEN];
}

const FALLBACK_FONTS: Pick<PlateLabel, "monoFont"> = {
  monoFont: "ui-monospace, monospace",
};

/** The page's mono family (`--font-mono`), once the page fonts have loaded. */
function readFonts(pageFonts: boolean): Pick<PlateLabel, "monoFont"> {
  if (!pageFonts) return FALLBACK_FONTS;
  const style = getComputedStyle(document.documentElement);
  return {
    monoFont: style.getPropertyValue("--font-mono").trim() || FALLBACK_FONTS.monoFont,
  };
}

function partName(scene: SceneDef): string {
  return scene.part === "end" ? story.endPart : (chrome.chapters.find((c) => c.id === scene.part)?.name ?? "");
}

function createPlateTexture(scene: SceneDef, aspect: number, pageFonts: boolean): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = aspect >= 1 ? TEXTURE_SIZE : Math.max(2, Math.round(TEXTURE_SIZE * aspect));
  canvas.height = aspect >= 1 ? Math.max(2, Math.round(TEXTURE_SIZE / aspect)) : TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawPlaceholder(ctx, scene.id, canvas.width, canvas.height, {
      number: String(scene.number).padStart(2, "0"),
      name: storyScenes[scene.id].name,
      meta: [story.sceneNumber(scene.number, SCENES.length), partName(scene), story.placeholder].join("  ·  "),
      ...readFonts(pageFonts),
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

function PlaceholderPlate({ scene, progress, aspect, fontsReady }: { scene: SceneDef; progress: MotionValue<number>; aspect: number; fontsReady: boolean }) {
  // Redrawn when the aspect bucket changes, and once the page fonts have loaded.
  const texture = React.useMemo(() => createPlateTexture(scene, aspect, fontsReady), [scene, aspect, fontsReady]);
  React.useEffect(() => () => texture.dispose(), [texture]);

  const mesh = React.useRef<Mesh>(null);
  const material = React.useRef<MeshBasicMaterial>(null);
  const viewport = useThree((s) => s.viewport);
  const fade = React.useMemo(() => fadeIn(scene), [scene]);

  useFrame(() => {
    const p = progress.get();
    if (material.current) material.current.opacity = fade ? ease(remap(p, fade[0], fade[1])) : 1;
    if (mesh.current) {
      const push = 1 + PUSH * sceneProgress(scene.id, p);
      mesh.current.scale.set(viewport.width * push, viewport.height * push, 1);
    }
  });

  return (
    <mesh ref={mesh} renderOrder={scene.number}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function PlaceholderPlates({ progress }: { progress: MotionValue<number> }) {
  const index = useSceneIndex(progress);
  const size = useThree((s) => s.size);
  const aspect = Math.round((size.width / Math.max(1, size.height)) * 10) / 10 || 1;
  const [fontsReady, setFontsReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      if (alive) setFontsReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mounted = SCENES.filter((_, i) => Math.abs(i - index) <= 1);
  return (
    <>
      {mounted.map((scene) => (
        <PlaceholderPlate key={scene.id} scene={scene} progress={progress} aspect={aspect} fontsReady={fontsReady} />
      ))}
    </>
  );
}
