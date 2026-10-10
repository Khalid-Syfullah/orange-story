"use client";

import { useEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Measures an element with a ResizeObserver. Returns a callback ref and the latest size.
 * State changes only when the size really changes (resize, orientation), never per scroll frame.
 */
export function useElementSize<T extends Element>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, size] as const;
}
