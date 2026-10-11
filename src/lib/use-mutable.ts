"use client";

import * as React from "react";

/**
 * A ref that holds a value made during render (a three.js mesh from `useMemo`, a particle field's
 * mesh), for a frame loop to move and restyle. React's rules let a callback change what a ref holds,
 * not a value a hook returned or was given, so the frame loop reaches the object through the ref. It
 * follows the value when the value changes (a new texture, a new field). Name it `somethingRef`: the
 * React compiler knows a ref by its name.
 */
export function useMutable<T>(value: T): React.RefObject<T> {
  const ref = React.useRef(value);
  React.useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
