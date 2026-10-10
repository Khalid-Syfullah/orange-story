import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Decorative chip: radius 4px, 10% tint of the text color, mono caps (the `tag` utility).
 * It looks a little like a button and must never act like one: always a `span`, never focusable,
 * no handlers, no hover state, `pointer-events: none`.
 */
type TagProps = Omit<
  React.ComponentProps<"span">,
  "onClick" | "onKeyDown" | "onKeyUp" | "onPointerDown" | "onPointerUp" | "tabIndex" | "role"
>;

function Tag({ className, ...props }: TagProps) {
  return <span data-slot="tag" className={cn("tag", className)} {...props} />;
}

export { Tag };
