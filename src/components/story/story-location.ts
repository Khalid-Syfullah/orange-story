"use client";

import * as React from "react";
import {
  anchorAt,
  anchorFromHash,
  PROGRESS_STORAGE_KEY,
  restoreTarget,
  stepBeat,
} from "@/scroll/navigation";
import { ANCHORS } from "@/scroll/script";
import type { Story } from "@/scroll/story-scroll";

import { focusApplyField, goToApply } from "./go-to-apply";

/**
 * Where the page is, for the browser: the same place after a reload, deep links, the hash, the
 * keyboard, and a tab that is not on screen. All of it hangs off the one `progress`; none of it
 * runs per frame (writes are debounced, and the rest listens to discrete events).
 *
 * - Restoration: the browser's own scroll restoration is off (`history.scrollRestoration =
 *   "manual"`, also set by the head script before the first paint). Once the stage has a layout the
 *   saved progress (after a reload) or the hash (a deep link) is applied through the scroll engine
 *   with an instant jump, then the cover the head script put over the stage is lifted.
 * - The hash follows the chapter (`replaceState`, once scrolling settles), and a `hashchange`
 *   (a link, the address bar, back/forward) scrolls to that place.
 * - Keys: Space, Page Up and Down, Home, End and the arrows are the browser's own and just work
 *   (the page is natively scrolled). J and K jump to the next and previous text beat.
 * - A hidden tab is marked on the page (`data-tab-hidden`), which pauses the CSS idle effects; the
 *   canvases stop themselves (`PauseWhenHidden`, the idle clock).
 */

/** Wait this long (ms) after the last progress change before writing it down or touching the hash. */
const SETTLE_MS = 180;

const COVER_ATTRIBUTE = "data-restore";

function liftCover() {
  document.documentElement.removeAttribute(COVER_ATTRIBUTE);
}

function navigationType(): string | undefined {
  const entry = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  return entry?.type;
}

function readSaved(): string | null {
  try {
    return sessionStorage.getItem(PROGRESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSaved(p: number) {
  try {
    sessionStorage.setItem(PROGRESS_STORAGE_KEY, p.toFixed(5));
  } catch {
    // Private mode and full storage: the page just opens at the top next time.
  }
}

/** True when the key is meant for something being typed in, or for an open dialog (the chapter menu). */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest('[role="dialog"]') !== null;
}

/** `live`: whether the pinned stage is running (false with reduced motion). */
export function useStoryLocation(story: Story, live: boolean) {
  const { progress } = story;
  const storyRef = React.useRef(story);
  React.useEffect(() => {
    storyRef.current = story;
  }, [story]);

  // Restoration, once the engine (created by the stage's own effect, which runs first) has a layout.
  React.useEffect(() => {
    if (!live) {
      liftCover();
      return;
    }
    history.scrollRestoration = "manual";
    const target = restoreTarget(navigationType(), readSaved(), window.location.hash);
    if (target !== null) storyRef.current.scrollTo(target, { immediate: true });
    // A link straight to the application lands on the form, ready to type in (as a later #apply does).
    if (target !== null && target === ANCHORS.apply && anchorFromHash(window.location.hash) === "apply") void focusApplyField();
    // Two frames: the move has been drawn under the cover before the cover lifts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(liftCover);
    });
    return () => {
      cancelAnimationFrame(frame);
      history.scrollRestoration = "auto";
    };
  }, [live]);

  // Remember where the reader is, and keep the hash on the chapter.
  React.useEffect(() => {
    if (!live) return;
    let timer = 0;
    const settle = () => {
      const p = progress.get();
      writeSaved(p);
      const anchor = anchorAt(p);
      const current = anchorFromHash(window.location.hash);
      if (anchor !== current) {
        const url = `${window.location.pathname}${window.location.search}${anchor ? `#${anchor}` : ""}`;
        window.history.replaceState(window.history.state, "", url);
      }
    };
    const unsubscribe = progress.on("change", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    });
    const flush = () => writeSaved(progress.get());
    const onVisibility = () => {
      document.documentElement.toggleAttribute("data-tab-hidden", document.hidden);
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      document.documentElement.removeAttribute("data-tab-hidden");
    };
  }, [live, progress]);

  // A link, the address bar or back/forward changed the hash: go there.
  React.useEffect(() => {
    if (!live) return;
    const onHashChange = () => {
      const anchor = anchorFromHash(window.location.hash);
      if (!anchor) return;
      if (anchor === "apply") goToApply(storyRef.current);
      else storyRef.current.scrollTo(ANCHORS[anchor]);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [live]);

  // J and K jump between beats.
  React.useEffect(() => {
    if (!live) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      if (isTyping(event)) return;
      const stop = stepBeat(progress.get(), key === "j" ? 1 : -1);
      if (stop === null) return;
      event.preventDefault();
      storyRef.current.scrollTo(stop);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, progress]);
}
