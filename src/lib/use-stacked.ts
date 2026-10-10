"use client";

import * as React from "react";

import { MOBILE } from "@/scroll/script";

/**
 * The stacked layout: one column, the stage shorter, text above and below the art. It applies under
 * `MOBILE.stackedMaxWidth` px wide (Tailwind's `max-md`), so CSS (`max-md:`) and script agree on
 * the same breakpoint.
 */
export const STACKED_QUERY = `(max-width: ${MOBILE.stackedMaxWidth}px)`;

/** True on a stacked screen. Browser only; false on the server and where there is no window. */
export function isStacked(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(STACKED_QUERY).matches;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STACKED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the page is laid out stacked; follows rotation and resizing. False during server render and hydration. */
export function useStacked(): boolean {
  return React.useSyncExternalStore(subscribe, isStacked, () => false);
}
