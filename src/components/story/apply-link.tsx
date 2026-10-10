"use client";

import * as React from "react";

import { chrome } from "@/content/copy";
import { cn } from "@/lib/utils";

import { goToApply } from "./go-to-apply";

/**
 * A link to the application form that works on the pinned stage and on the stacked page. It keeps
 * its `href` (so it works without script, and shows where it goes), and with script it scrolls and
 * puts the cursor in the first field instead of just jumping.
 */
export function ApplyLink({ children, className, ...props }: Omit<React.ComponentProps<"a">, "href" | "onClick">) {
  return (
    <a
      {...props}
      href={`#${chrome.apply.target}`}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        goToApply();
      }}
    >
      {children}
    </a>
  );
}

/** The first thing to tab to: hidden until it has focus, then a pill at the top left. */
export function SkipLink() {
  return (
    <ApplyLink
      className={cn("skip-link type-label rounded-pill bg-press text-milk outline-none focus-visible:ring-2 focus-visible:ring-milk")}
    >
      {chrome.skip.label}
    </ApplyLink>
  );
}
