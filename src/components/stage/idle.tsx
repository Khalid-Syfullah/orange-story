"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Frustum, Matrix4, type Group, type Object3D } from "three";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { IDLE_MAX_STEP } from "./quality";

/**
 * Idle time for the small time-driven effects (sway, twinkle, glow ripple). Everything else on the
 * stage is driven by scroll progress. The clock only runs while at least one effect is on screen,
 * the canvas is visible, the tab is visible and reduced motion is off; while it runs it keeps the
 * on-demand canvas rendering. When it stops, idle time freezes (it never jumps on resume).
 */

export interface IdleClock {
  /** Idle seconds so far. */
  time(): number;
  /** An effect is on screen this frame (keeps the clock running). */
  hold(key: object): void;
  /** An effect left the screen or unmounted. */
  drop(key: object): void;
  /** True when the object (with its geometry bounds) is inside the camera view this frame. */
  inView(object: Object3D): boolean;
}

const STILL_CLOCK: IdleClock = {
  time: () => 0,
  hold: () => {},
  drop: () => {},
  inView: () => true,
};

const IdleContext = React.createContext<IdleClock>(STILL_CLOCK);

/** The idle clock of the stage canvas (a frozen clock outside one). */
export function useIdleClock(): IdleClock {
  return React.useContext(IdleContext);
}

export function IdleClockProvider({ children }: { children: React.ReactNode }) {
  const invalidate = useThree((s) => s.invalidate);
  const canvas = useThree((s) => s.gl.domElement);
  // `?idle=off` holds idle time still, as reduced motion does (to compare frames of the scrubbed story).
  const [held] = React.useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("idle") === "off");
  const reduced = usePrefersReducedMotion() === true || held;
  const state = React.useRef({ time: 0, holders: new Set<object>(), onScreen: true, frustum: new Frustum(), matrix: new Matrix4() });

  React.useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      state.current.onScreen = entry?.isIntersecting ?? true;
      if (state.current.onScreen) invalidate();
    });
    observer.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canvas, invalidate]);

  // After the camera rig (-2), before the plates (0): fresh frustum, then advance time.
  useFrame(({ camera }, delta) => {
    const s = state.current;
    s.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    s.frustum.setFromProjectionMatrix(s.matrix);
    const running = s.holders.size > 0 && !reduced && s.onScreen && !document.hidden;
    if (!running) return;
    s.time += Math.min(Math.max(delta, 0), IDLE_MAX_STEP);
    invalidate();
  }, -1);

  const clock = React.useMemo<IdleClock>(
    () => ({
      time: () => state.current.time,
      hold(key) {
        const { holders } = state.current;
        if (holders.has(key)) return;
        holders.add(key);
        invalidate();
      },
      drop(key) {
        state.current.holders.delete(key);
      },
      inView: (object) => state.current.frustum.intersectsObject(object),
    }),
    [invalidate],
  );

  return <IdleContext value={clock}>{children}</IdleContext>;
}

/* Sway */

export interface SwayOptions {
  /** Largest angle in degrees. Default 1.5. */
  amplitude?: number;
  /** Cycles per second. Default 0.22. */
  speed?: number;
  /** Phase in radians, so neighbours do not move in step. */
  phase?: number;
}

const DEG = Math.PI / 180;

/** Sway angle in radians at idle time t: a slow sine with a faint second harmonic, so it never looks mechanical. */
export function swayAngle(time: number, { amplitude = 1.5, speed = 0.22, phase = 0 }: SwayOptions): number {
  const t = time * speed * Math.PI * 2 + phase;
  return amplitude * DEG * (0.78 * Math.sin(t) + 0.22 * Math.sin(2.3 * t + 1.3));
}

/** A stable phase from a name, so every leaf or fruit sways out of step with its neighbours. */
export function phaseOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return ((h >>> 0) % 6283) / 1000;
}

/** True when the object and all its parents are visible. */
export function shownInTree(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** True when a visible mesh under `root` is in the camera view (a plain walk: no callback allocated per frame). */
function anyMeshInView(root: Object3D, clock: IdleClock): boolean {
  if (!root.visible) return false;
  if ("geometry" in root && clock.inView(root)) return true;
  const children = root.children;
  for (let i = 0; i < children.length; i++) if (anyMeshInView(children[i], clock)) return true;
  return false;
}

/**
 * Sways its children around its own origin (put the origin where the stem or branch attaches), on
 * idle time. Paused offscreen and with reduced motion.
 */
export function Sway({ amplitude, speed, phase, name = "sway", children, ...props }: SwayOptions & { name?: string; children?: React.ReactNode } & Omit<React.ComponentProps<"group">, "ref">) {
  const ref = React.useRef<Group>(null);
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const options = React.useMemo(() => ({ amplitude, speed, phase: phase ?? phaseOf(name) }), [amplitude, speed, phase, name]);

  React.useEffect(() => () => clock.drop(key), [clock, key]);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    if (shownInTree(group) && anyMeshInView(group, clock)) clock.hold(key);
    else clock.drop(key);
    group.rotation.z = swayAngle(clock.time(), options);
  });

  return (
    <group ref={ref} name={name} {...props}>
      {children}
    </group>
  );
}
