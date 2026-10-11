// Pointer and breath state for the shaders (docs/MOTION-RULES.md, rest states).
//
//   - uMouse: the pointer as -1..1 on each axis (y down), approached with
//     current += (target - current) * 0.06 per frame; it returns to 0 when the pointer leaves.
//     Touch does not drive it (a finger scrolling is not a hover).
//   - uKick: an exp decay from the last scroll stop, 1 at the stop and about 0.05 after 1.2 s, for
//     the "scroll stop adds a kick to whatever breathes" rule.
//   - Under reduced motion both stay at 0 and uStill is 1.

const APPROACH = 0.06;
/** Decay constant so the kick is at ~5% after 1.2 s. */
const KICK_TAU_S = 0.4;
/** Below this speed (px per frame) the scroll counts as stopped. */
const STOP_SPEED = 0.5;

export interface PointerState {
  /** Smoothed pointer, -1..1, y down. */
  readonly x: number;
  readonly y: number;
  /** Exp decay from the last scroll stop. */
  readonly kick: number;
  /** Advance one frame with the current scroll velocity and time in seconds. */
  tick(vel: number, time: number): void;
  destroy(): void;
}

export function createPointer(reduced: boolean): PointerState {
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let kick = 0;
  let moving = false;
  let stoppedAt = Number.NEGATIVE_INFINITY;

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onLeave = () => {
    tx = 0;
    ty = 0;
  };

  if (!reduced) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
  }

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get kick() {
      return kick;
    },
    tick(vel: number, time: number) {
      if (reduced) return;
      x += (tx - x) * APPROACH;
      y += (ty - y) * APPROACH;
      const isMoving = Math.abs(vel) > STOP_SPEED;
      if (moving && !isMoving) stoppedAt = time;
      moving = isMoving;
      kick = Math.exp(-(time - stoppedAt) / KICK_TAU_S);
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    },
  };
}
