"use client";

import * as React from "react";
import { useThree } from "@react-three/fiber";

/**
 * Stops a canvas from rendering while the tab is hidden, and wakes it with one frame when the tab
 * comes back. The canvases draw on demand (and the idle effects keep asking only while on screen),
 * so this is the explicit guarantee: a hidden tab runs no WebGL at all, whatever asks for a frame.
 * Put it inside a `Canvas`.
 */
export function PauseWhenHidden() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);

  React.useEffect(() => {
    const update = () => {
      setFrameloop(document.hidden ? "never" : "demand");
      if (!document.hidden) invalidate();
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [setFrameloop, invalidate]);

  return null;
}
