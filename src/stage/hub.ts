// The hub: the tiny subscribe API through which the stage talks to React.
//
// The engine owns the requestAnimationFrame loop and emits one FrameCtx per frame. DOM layers
// subscribe (in an effect) and write to their elements directly; no React state per frame. The hub
// exists before the engine does, so components can subscribe on mount and ask for scroll targets
// (the Apply pill, the rail) without caring whether WebGL is up yet.
import { createContext, useContext, useEffect } from "react";
import type { Engine } from "./engine";
import type { FrameCtx } from "./frame";
import { pAt, type SegmentId } from "./script";

export type FrameListener = (frame: FrameCtx) => void;

export interface StageControls {
  /** Set the scroll target so the clock glides to local `t` of a segment. */
  scrollToSegment(id: SegmentId, t?: number): void;
  /** Set the scroll target as progress; `immediate` also lands there (restoration, deep links). */
  setP(p: number, immediate?: boolean): void;
}

export interface StageHub {
  subscribe(listener: FrameListener): () => void;
  /** Called by the engine once per frame. */
  emit(frame: FrameCtx): void;
  /** The most recent frame, for late subscribers. */
  readonly last: FrameCtx | null;
  /** The engine once it is up (dev readouts: the HUD reads texture stats from it). */
  readonly engine: Engine | null;
  /** The engine's controls once it is up; calls before that are queued and applied on attach. */
  attach(controls: StageControls, engine: Engine): void;
  detach(): void;
  scrollToSegment(id: SegmentId, t?: number): void;
  setP(p: number, immediate?: boolean): void;
}

export function createHub(): StageHub {
  const listeners = new Set<FrameListener>();
  let last: FrameCtx | null = null;
  let controls: StageControls | null = null;
  let engine: Engine | null = null;
  let queued: (() => void) | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (last) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(frame) {
      last = frame;
      for (const l of listeners) l(frame);
    },
    get last() {
      return last;
    },
    get engine() {
      return engine;
    },
    attach(c, e) {
      controls = c;
      engine = e;
      if (queued) {
        const run = queued;
        queued = null;
        run();
      }
    },
    detach() {
      controls = null;
      engine = null;
    },
    scrollToSegment(id, t = 0) {
      if (controls) controls.scrollToSegment(id, t);
      else queued = () => controls?.scrollToSegment(id, t);
    },
    setP(p, immediate) {
      if (controls) controls.setP(p, immediate);
      else queued = () => controls?.setP(p, immediate);
    },
  };
}

/** Where a segment starts, as progress (for layers that want a target without the hub). */
export const segmentStart = (id: SegmentId): number => pAt(id, 0);

export const StageContext = createContext<StageHub | null>(null);

/** The hub of the enclosing <Stage>. */
export function useStage(): StageHub {
  const hub = useContext(StageContext);
  if (!hub) throw new Error("useStage() must be used inside <Stage>");
  return hub;
}

/**
 * Run `listener` every frame. Pass a stable function (useCallback with no deps, or a module-level
 * one) and write to elements through refs inside it; never set React state from it.
 */
export function useFrame(listener: FrameListener): void {
  const hub = useStage();
  useEffect(() => hub.subscribe(listener), [hub, listener]);
}
