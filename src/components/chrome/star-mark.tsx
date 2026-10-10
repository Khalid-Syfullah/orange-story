import * as React from "react";

import { cn } from "@/lib/utils";

/** The four-point star drawn where hairlines cross, in a 12 by 12 box centered on the origin. */
export const STAR_PATH =
  "M0 -6 C0.4 -2.4 2.4 -0.4 6 0 C2.4 0.4 0.4 2.4 0 6 C-0.4 2.4 -2.4 0.4 -6 0 C-2.4 -0.4 -0.4 -2.4 0 -6 Z";

/** Stand-alone star mark (an absolutely placed SVG centered on its left/top point). */
export function StarMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="-6 -6 12 12"
      aria-hidden
      className={cn("absolute size-3 -translate-x-1/2 -translate-y-1/2", className)}
      style={style}
    >
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  );
}
