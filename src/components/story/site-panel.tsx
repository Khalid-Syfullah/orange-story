"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

import { leavesOpacity, panelMounted, panelOpacity } from "@/components/stage/site-plan";
import { useProgressState } from "@/scroll/story-scroll";

/**
 * Scene 8's right half: a calm milk-white panel with very soft, heavily blurred shadows of leaves
 * moving across it, felt more than seen. The panel and the shadows fade in with progress (and out
 * again under the dust), so it plays backwards exactly; the shadows' own slow drift runs on time
 * (CSS, an idle effect) and exists only while the panel does. Decorative: it sits under the text
 * layer, so the terms block reads on it, and takes no pointer events.
 *
 * On a stacked (phone) screen the panel is the lower half instead, and the picture shrinks into the upper half.
 *
 * The leaf shapes come from the `site/leaf-shadow` plate, used as a mask over ink, so any final art
 * with an alpha channel works unchanged.
 */

const LEAF_SHADOW = "url(/art/site/leaf-shadow.webp)";

/** A masked layer inside a blurred wrapper (a filter runs before a mask, so the wrapper carries the blur). */
function Leaves({ className, blur, size, opacity }: { className: string; blur: number; size: string; opacity: number }) {
  return (
    <div className="absolute -inset-[25%]" style={{ filter: `blur(${blur}px)` }}>
      <div
        className={`absolute inset-0 bg-ink ${className}`}
        style={{
          opacity,
          maskImage: LEAF_SHADOW,
          WebkitMaskImage: LEAF_SHADOW,
          maskSize: size,
          WebkitMaskSize: size,
          maskRepeat: "repeat",
          WebkitMaskRepeat: "repeat",
        }}
      />
    </div>
  );
}

export function SitePanel({ progress }: { progress: MotionValue<number> }) {
  const mounted = useProgressState(progress, (p) => panelMounted(p));
  const milk = useTransform(progress, panelOpacity);
  const leaves = useTransform(progress, leavesOpacity);

  return (
    <motion.div aria-hidden data-site-panel className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden bg-milk max-md:inset-x-0 max-md:top-1/2 max-md:w-full" style={{ opacity: milk, visibility: mounted ? "visible" : "hidden" }}>
      {mounted ? (
        <motion.div className="absolute inset-0" style={{ opacity: leaves }}>
          <Leaves className="leaf-drift-a" blur={34} size="64%" opacity={0.2} />
          <Leaves className="leaf-drift-b" blur={52} size="90%" opacity={0.13} />
        </motion.div>
      ) : null}
    </motion.div>
  );
}
