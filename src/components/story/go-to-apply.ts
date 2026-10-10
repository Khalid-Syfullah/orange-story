import { chrome } from "@/content/copy";
import { ANCHORS } from "@/scroll/script";
import type { Story } from "@/scroll/story-scroll";

import { APPLY_FIELD_SELECTOR } from "./apply-form-ids";

/**
 * "Apply", "Start a partnership" and the skip link: take the visitor to the application form and
 * put the cursor in its first field (without moving the page again).
 *
 * - On the pinned stage the form is a beat: scroll to it, and focus once the scroll arrives. Gives
 *   up after a few seconds, or if the reader scrolls somewhere else first.
 * - On the reduced-motion page the form is part of the stacked page: scroll it into view and focus.
 *
 * Which one applies is decided when called: the stage registers itself while it is live
 * (`registerLiveStory`), so links anywhere on the page (the skip link, the screen reader outline)
 * need no context.
 */

type LiveStory = Pick<Story, "progress" | "scrollTo">;

let live: LiveStory | null = null;

/** The live stage calls this with its story while it runs, and with null when it stops. */
export function registerLiveStory(story: LiveStory | null): void {
  live = story;
}

/** Frames to wait for the field to become focusable (the form fades in with the scroll). */
const FOCUS_FRAMES = 40;

/** The first field that can take focus right now (visible), across the stage's form and the reduced page's form. */
function focusableField(): HTMLElement | null {
  for (const field of document.querySelectorAll<HTMLElement>(APPLY_FIELD_SELECTOR)) {
    if (field.getClientRects().length > 0 && getComputedStyle(field).visibility !== "hidden") return field;
  }
  return null;
}

/** Focus the first field as soon as it can take it, without scrolling. Resolves true if it did. */
export function focusApplyField(frames = FOCUS_FRAMES): Promise<boolean> {
  return new Promise((resolve) => {
    const attempt = (left: number) => {
      const field = focusableField();
      if (field) {
        field.focus({ preventScroll: true });
        resolve(document.activeElement === field);
      } else if (left > 0) requestAnimationFrame(() => attempt(left - 1));
      else resolve(false);
    };
    attempt(frames);
  });
}

export function goToApply(story: LiveStory | null = live): void {
  if (!story) {
    // The stacked page: the form is just there.
    document.getElementById(chrome.apply.target)?.scrollIntoView({ block: "start" });
    void focusApplyField();
    return;
  }

  const target = ANCHORS.apply;
  if (Math.abs(story.progress.get() - target) < 1e-3) {
    void focusApplyField();
    return;
  }
  let done = false;
  const stop = (unsubscribe: () => void, timer: ReturnType<typeof setTimeout>) => {
    done = true;
    unsubscribe();
    clearTimeout(timer);
  };
  const unsubscribe = story.progress.on("change", (p) => {
    if (done || Math.abs(p - target) >= 1e-3) return;
    stop(unsubscribe, timer);
    void focusApplyField();
  });
  const timer = setTimeout(() => stop(unsubscribe, timer), 5000);
  story.scrollTo(target);
}
