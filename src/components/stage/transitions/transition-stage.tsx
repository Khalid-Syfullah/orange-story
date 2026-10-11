"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MotionValue } from "motion/react";
import type { Object3D } from "three";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useStacked } from "@/lib/use-stacked";
import { SCREEN, TRANSITIONS } from "@/scroll/script";
import { useProgressState } from "@/scroll/story-scroll";
import type { TransitionDef, TransitionKind } from "@/scroll/types";

import { idleHeld } from "../idle";
import { STAGE_UNIFORMS } from "../materials";
import { TRANSITION_PRELOAD_SCREENS } from "../quality";

import { CloudPass } from "./cloud-pass";
import { DustRise } from "./dust";
import { FabricSky } from "./fabric";
import { LeafPass } from "./leaf-pass";
import { setStageTransitionMode, transitionMode, transitionsOverride, type TransitionMode } from "./modes";
import { SandStorm } from "./sand";
import { useSmear } from "./smear";
import { PaperUnfold } from "./unfold";

/**
 * The transitions on the stage canvas. Each medium is mounted a few screens before its transition
 * (its art loads and its shaders compile while the browser is idle) and stays a screen after it, then
 * unmounts; React state changes only when that set changes. While mounted, a medium draws only while
 * its transition runs, every value a function of progress. The ring is part of the falling orange's
 * scene (`fall-art.tsx`), not mounted here.
 */

export interface TransitionEffectProps {
  def: TransitionDef;
  progress: MotionValue<number>;
  /** The mode right now (read in the frame loop: the quality tier can change). */
  mode: () => TransitionMode;
  /** The smear (0 to 1) right now. */
  smear: React.RefObject<number>;
}

const EFFECTS: Partial<Record<TransitionKind, React.ComponentType<TransitionEffectProps>>> = {
  leaves: LeafPass,
  sand: SandStorm,
  cloud: CloudPass,
  unfold: PaperUnfold,
  dust: DustRise,
  fabric: FabricSky,
};

const LENS_TRANSITIONS = TRANSITIONS.filter((t) => t.layer === "canvas" && EFFECTS[t.kind]);

/** The transitions mounted at p: within a few screens before their start and a screen after their end. */
function nearIds(p: number): string {
  const ahead = TRANSITION_PRELOAD_SCREENS * SCREEN;
  return LENS_TRANSITIONS.filter((t) => p >= t.start - ahead && p <= t.end + SCREEN)
    .map((t) => t.id)
    .join(" ");
}

/** True while a transition draws at p: `[start, end)` (and its end, for one that ends the page). */
export function transitionShows(def: TransitionDef, p: number): boolean {
  return p >= def.start && (p < def.end || (def.end >= 1 && p <= 1));
}

/** A mode the page forces on the stage it holds (the design lab's choice), over the address's: provide it around the stage's scenes and transitions. */
export const ForcedTransitionMode = React.createContext<TransitionMode | null>(null);

/**
 * The transition mode as a getter, for frame loops: the layout, reduced motion and a forced mode are
 * React state, the quality tier a uniform.
 */
export function useTransitionMode(): () => TransitionMode {
  const stacked = useStacked();
  const reduced = usePrefersReducedMotion() === true;
  const forced = React.useContext(ForcedTransitionMode);
  const [fromAddress] = React.useState(() => (typeof window === "undefined" ? null : transitionsOverride(window.location.search)));
  const override = forced ?? fromAddress;
  return React.useCallback(() => transitionMode({ stacked, tier: STAGE_UNIFORMS.quality.value, reduced, override }), [stacked, reduced, override]);
}

/**
 * Compiles an object's shaders while the browser is idle (in parallel where it can), so a transition
 * never waits for its shader on its first frame; and asks the on-demand canvas for a frame when the
 * medium mounts.
 */
export function usePrecompile(objects: readonly (Object3D | null)[]): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  // A medium that mounts (or whose art arrives) while the story stands still draws at once, not at the next scroll.
  React.useEffect(() => invalidate(), [invalidate]);
  const key = objects.map((o) => o?.uuid ?? "").join(" ");
  React.useEffect(() => {
    const list = objects.filter((o): o is Object3D => o !== null);
    if (!list.length) return;
    let cancelled = false;
    const idle = typeof window.requestIdleCallback === "function";
    // Where the driver compiles in parallel, start at once (it does not hold up a frame); else wait for an idle moment.
    const parallel = gl.extensions.has("KHR_parallel_shader_compile");
    const run = () => {
      if (cancelled) return;
      for (const object of list) {
        // Compiling collects what to build right away: the object is shown only for that moment.
        const visible: boolean[] = [];
        object.traverse((o) => {
          visible.push(o.visible);
          o.visible = true;
        });
        if (parallel) void gl.compileAsync(object, camera, scene).catch(() => {});
        else gl.compile(object, camera, scene);
        let i = 0;
        object.traverse((o) => {
          o.visible = visible[i++];
        });
      }
    };
    const handle = parallel ? window.setTimeout(run, 0) : idle ? window.requestIdleCallback(run, { timeout: 1500 }) : window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      if (!parallel && idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // `key` stands for the objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene, key]);
}

export function TransitionStage({ progress, velocity }: { progress: MotionValue<number>; velocity?: MotionValue<number> | null }) {
  const near = useProgressState(progress, nearIds);
  const mode = useTransitionMode();
  // Plates read the mode in their own frame loop (the ring's calm cross-fade): before them.
  useFrame(() => setStageTransitionMode(mode()), -1.6);
  const [held] = React.useState(idleHeld);
  // The smear only where it may run: a full mode, idle time not held.
  const smearOn = !held && mode() === "full";
  const smear = useSmear(velocity, smearOn);
  const ids = near ? near.split(" ") : [];
  return (
    <>
      {LENS_TRANSITIONS.filter((t) => ids.includes(t.id)).map((def) => {
        const Effect = EFFECTS[def.kind]!;
        return (
          <React.Suspense key={def.id} fallback={null}>
            <Effect def={def} progress={progress} mode={mode} smear={smear} />
          </React.Suspense>
        );
      })}
    </>
  );
}
