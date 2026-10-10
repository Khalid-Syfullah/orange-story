"use client";

import * as React from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The visitor's reduced-motion preference: null on the server and during hydration (the CSS
 * `motion-reduce:` variants pick the right page before any script runs), then true or false, and
 * it follows changes to the setting.
 *
 * Use this instead of motion's `useReducedMotion()` in anything that renders on the server: that
 * hook reads the media query on the client's first render, so server-rendered markup would not
 * match it during hydration.
 */
export function usePrefersReducedMotion(): boolean | null {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => null,
  );
}
