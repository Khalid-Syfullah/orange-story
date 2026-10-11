// The scroll clock: smoothed scroll progress, exactly as docs/MOTION-RULES.md specifies.
//
//   - Wheel is intercepted (preventDefault unless ctrlKey) and accumulated into `target`.
//   - Each frame: current += (target - current) * (1 - exp(-dt / 180 ms)); snap under 0.08 px.
//   - velocity = current - previous, in px per frame, exposed to the shader as uVel.
//   - On `pointer: coarse` or `prefers-reduced-motion` native scroll stays on, smoothed with 60 ms.
//   - Keyboard, scrollbar and anchor jumps set `target`, never `current`.
//
// In smooth mode the window's scroll position is written to `current` every frame, so the scrollbar,
// restoration and assistive tech see the same position the stage draws. Scroll events that did not
// come from those writes are external (keyboard, scrollbar drag, anchors) and move `target`.
//
// Everything downstream reads `p` (0..1); nothing is keyed to raw scrollY.

export type ScrollMode = "smooth" | "native";

export interface ScrollClockOptions {
  /** prefers-reduced-motion: native scroll with the 60 ms constant. */
  reduced: boolean;
  /** pointer: coarse (touch): native scroll with the 60 ms constant. */
  coarse: boolean;
}

export interface ScrollClock {
  readonly mode: ScrollMode;
  readonly reduced: boolean;
  /** Smoothed progress 0..1. */
  readonly p: number;
  /** Smoothed scroll position in px and where it is heading. */
  readonly current: number;
  readonly target: number;
  /** px moved this frame, signed (+ = down). */
  readonly vel: number;
  /** ms since the previous frame, clamped to 64 so a hidden tab does not jump. */
  readonly dt: number;
  /** Total scrollable distance in px (0 when the page does not scroll). */
  readonly max: number;
  /** `p` at creation: a reload lands here at once, so the intro is skipped when it is not 0. */
  readonly restoredP: number;
  /** Advance one frame. `now` is the requestAnimationFrame timestamp. */
  tick(now: number): void;
  /** Re-read the document's scrollable height (after a resize). */
  measure(): void;
  /** Set the target in px (keyboard and anchor semantics: the clock glides there). */
  jumpTo(px: number): void;
  /** Set the target as progress; `immediate` also sets current (restoration, deep links). */
  setP(p: number, immediate?: boolean): void;
  destroy(): void;
}

const SMOOTH_TAU_MS = 180;
const NATIVE_TAU_MS = 60;
const SNAP_PX = 0.08;
const MAX_DT_MS = 64;
/** Scroll events this soon after creation are the browser restoring the position: land, do not glide. */
const SETTLE_MS = 400;
/** Keyboard steps, as browsers use them. */
const ARROW_PX = 40;
const PAGE_FRACTION = 0.875;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export function createScrollClock(opts: ScrollClockOptions): ScrollClock {
  const mode: ScrollMode = opts.reduced || opts.coarse ? "native" : "smooth";
  const tau = mode === "native" ? NATIVE_TAU_MS : SMOOTH_TAU_MS;
  const createdAt = performance.now();

  let max = 0;
  let target = 0;
  let current = 0;
  let vel = 0;
  let dt = 16.7;
  let p = 0;
  let last = -1;
  /** Positions written by the clock itself; a scroll event near one of them is not external. */
  const written: number[] = [];

  const measure = () => {
    const doc = document.documentElement;
    max = Math.max(0, doc.scrollHeight - window.innerHeight);
    target = clamp(target, 0, max);
    current = clamp(current, 0, max);
    p = max > 0 ? current / max : 0;
  };

  measure();
  current = target = clamp(window.scrollY, 0, max);
  p = max > 0 ? current / max : 0;
  const restoredP = p;

  const isOurs = (y: number) => {
    for (let i = 0; i < written.length; i++) if (Math.abs(written[i] - y) < 1.5) return true;
    return false;
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // pinch-zoom on trackpads
    const el = e.target as Element | null;
    if (el && typeof el.closest === "function" && el.closest("[data-native-scroll]")) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    const lim = window.innerHeight * 1.5;
    target = clamp(target + clamp(dy, -lim, lim), 0, max);
  };

  const onScroll = () => {
    const y = window.scrollY;
    if (mode === "native") {
      target = clamp(y, 0, max);
      return;
    }
    if (isOurs(y)) return;
    target = clamp(y, 0, max);
    // A late scroll restoration should land, not glide (and not play the intro).
    if (performance.now() - createdAt < SETTLE_MS) current = target;
  };

  // Keyboard scrolling sets the target: the browser's own keyboard scroll animation would be cut
  // short by the per-frame scrollTo, so the keys are handled here when nothing else wants them.
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && t !== document.body && t !== document.documentElement) return;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowDown":
        next = target + ARROW_PX;
        break;
      case "ArrowUp":
        next = target - ARROW_PX;
        break;
      case "PageDown":
        next = target + window.innerHeight * PAGE_FRACTION;
        break;
      case "PageUp":
        next = target - window.innerHeight * PAGE_FRACTION;
        break;
      case " ":
        next = target + window.innerHeight * PAGE_FRACTION * (e.shiftKey ? -1 : 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    target = clamp(next, 0, max);
  };

  if (mode === "smooth") {
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", measure);

  const clock: ScrollClock = {
    mode,
    reduced: opts.reduced,
    get p() {
      return p;
    },
    get current() {
      return current;
    },
    get target() {
      return target;
    },
    get vel() {
      return vel;
    },
    get dt() {
      return dt;
    },
    get max() {
      return max;
    },
    restoredP,

    tick(now: number) {
      dt = last < 0 ? 16.7 : clamp(now - last, 0, MAX_DT_MS);
      last = now;
      if (mode === "native") target = clamp(window.scrollY, 0, max);

      const prev = current;
      current += (target - current) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - current) < SNAP_PX) current = target;
      vel = current - prev;

      if (mode === "smooth" && Math.abs(window.scrollY - current) >= 0.5) {
        window.scrollTo({ top: current, left: 0, behavior: "instant" });
        written.push(current);
        if (written.length > 4) written.shift();
      }
      p = max > 0 ? current / max : 0;
    },

    measure,

    jumpTo(px: number) {
      target = clamp(px, 0, max);
    },

    setP(value: number, immediate = false) {
      target = clamp(value, 0, 1) * max;
      if (immediate) {
        current = target;
        p = max > 0 ? current / max : 0;
        if (mode === "smooth") {
          window.scrollTo({ top: current, left: 0, behavior: "instant" });
          written.push(current);
        } else {
          window.scrollTo({ top: current, left: 0, behavior: "instant" });
        }
      }
    },

    destroy() {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    },
  };

  return clock;
}
