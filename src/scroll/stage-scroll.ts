import Lenis from "lenis";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MotionValue } from "motion/react";

import { clamp01, ease } from "@/lib/progress";
import { EASE, EASE_GSAP_NAME } from "@/styles/tokens";

/**
 * The one scroll system (browser only):
 * - native window scrolling on the tall stage section, smoothed by Lenis on wheel input only
 *   (touch keeps its native momentum; nothing hijacks wheel or touch events beyond smoothing);
 * - Lenis runs on the GSAP ticker and tells ScrollTrigger about every scroll (`lagSmoothing(0)`);
 * - one ScrollTrigger maps the section to `progress` (0 to 1) and `velocity` (screens per second).
 *   Both are motion values, so nothing sets React state per frame. Instant jumps (a seek, the
 *   restore after a resize) are not motion: velocity reads 0 through them;
 * - a resize or orientation change keeps the same progress, not the same pixel offset.
 */

export interface ScrollToProgressOptions {
  /** Jump without animating. */
  immediate?: boolean;
  /** Seconds. Default: scales with the distance, 0.6 to 2.4. */
  duration?: number;
}

export interface StageScroll {
  /** Scroll so the story sits at progress `p`. */
  scrollTo(p: number, options?: ScrollToProgressOptions): void;
  /** Window scroll offset (px) of progress `p`. */
  offsetOf(p: number): number;
  destroy(): void;
}

export interface StageScrollOptions {
  /** The tall section (height `STAGE_VH`). */
  section: HTMLElement;
  /** The sticky full-viewport frame inside it. */
  frame: HTMLElement;
  progress: MotionValue<number>;
  velocity: MotionValue<number>;
}

/** Wait after the last resize event before re-measuring. */
const RESIZE_SETTLE_MS = 120;
/** Velocity eases back to 0 once scroll updates stop for this long (seconds). */
const VELOCITY_IDLE = 0.08;
/**
 * After an instant jump (a seek, or restoring progress after a resize) velocity reads 0 for this
 * long (ms): the jump is not motion, and must not register as hundreds of screens per second.
 */
const JUMP_QUIET_MS = 150;

let registered = false;

/**
 * Registers the GSAP plugins once, and the story's one easing curve as a named GSAP ease, so
 * GSAP tweens (the camera moves) use `ease: "story"` (`EASE_GSAP_NAME`) and match CSS and motion.
 */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create(EASE_GSAP_NAME, EASE.join(","));
  registered = true;
}

export function createStageScroll({ section, frame, progress, velocity }: StageScrollOptions): StageScroll {
  registerGsap();
  // Resizes are handled below (keeping progress); the mobile address bar never changes the stage.
  ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: "visibilitychange,DOMContentLoaded,load" });

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false,
    lerp: 0.1,
    anchors: false,
    autoResize: true,
  });

  const measure = () => ({ section: section.offsetHeight, frame: frame.offsetHeight });
  let geometry = measure();
  let frameHeight = geometry.frame || window.innerHeight;

  /** While frozen (between a resize and the re-measure), scroll updates do not move the story. */
  let frozen = false;
  let saved = 0;
  let lastUpdate = 0;
  let resizeTimer = 0;
  let quietUntil = 0;

  /** Marks an instant jump: velocity stays 0 until the jump has passed through ScrollTrigger. */
  const jumped = () => {
    quietUntil = performance.now() + JUMP_QUIET_MS;
    velocity.set(0);
  };

  const trigger = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: () => `+=${Math.max(1, section.offsetHeight - frame.offsetHeight)}`,
    invalidateOnRefresh: true,
    onUpdate(self) {
      if (frozen) return;
      progress.set(self.progress);
      velocity.set(performance.now() < quietUntil ? 0 : self.getVelocity() / frameHeight);
      lastUpdate = gsap.ticker.time;
    },
  });

  const offsetOf = (p: number) => trigger.start + clamp01(p) * (trigger.end - trigger.start);

  const freeze = () => {
    if (frozen) return;
    frozen = true;
    saved = progress.get();
    velocity.set(0);
  };

  const onResize = () => {
    const next = measure();
    if (next.section === geometry.section && next.frame === geometry.frame) return;
    freeze();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => ScrollTrigger.refresh(), RESIZE_SETTLE_MS);
  };

  const onRefreshInit = () => freeze();

  const onRefresh = () => {
    geometry = measure();
    frameHeight = geometry.frame || window.innerHeight;
    if (!frozen) return;
    if (Math.abs(trigger.progress - saved) > 1e-5) {
      jumped();
      lenis.resize();
      lenis.scrollTo(offsetOf(saved), { immediate: true, force: true });
    }
    frozen = false;
    progress.set(saved);
  };

  const raf = (time: number) => lenis.raf(time * 1000);

  const settleVelocity = () => {
    const v = velocity.get();
    if (v === 0 || gsap.ticker.time - lastUpdate < VELOCITY_IDLE) return;
    const next = v * 0.85;
    velocity.set(Math.abs(next) < 1e-3 ? 0 : next);
  };

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(raf);
  gsap.ticker.add(settleVelocity);
  gsap.ticker.lagSmoothing(0);
  window.addEventListener("resize", onResize);
  ScrollTrigger.addEventListener("refreshInit", onRefreshInit);
  ScrollTrigger.addEventListener("refresh", onRefresh);

  progress.set(trigger.progress);

  return {
    offsetOf,
    scrollTo(p, { immediate = false, duration } = {}) {
      const target = offsetOf(p);
      const distance = Math.abs(target - lenis.scroll) / frameHeight;
      if (immediate) jumped();
      lenis.scrollTo(target, {
        immediate,
        force: true,
        duration: duration ?? Math.min(2.4, Math.max(0.6, 0.6 + Math.sqrt(distance) * 0.3)),
        easing: ease,
      });
    },
    destroy() {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      ScrollTrigger.removeEventListener("refreshInit", onRefreshInit);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      gsap.ticker.remove(raf);
      gsap.ticker.remove(settleVelocity);
      gsap.ticker.lagSmoothing(500, 33);
      trigger.kill();
      lenis.destroy();
      velocity.set(0);
    },
  };
}
