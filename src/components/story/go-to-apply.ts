import { ANCHORS } from "@/scroll/script";
import type { Story } from "@/scroll/story-scroll";

import { APPLY_FIELD_ID } from "./apply-form-ids";

/**
 * "Apply" and "Start a partnership": scroll to the application form, and once the scroll arrives
 * focus its first field (without moving the page). Gives up after a few seconds, or if the reader
 * scrolls somewhere else first.
 */
export function goToApply(story: Pick<Story, "progress" | "scrollTo">): void {
  const target = ANCHORS.apply;
  const focus = () => document.getElementById(APPLY_FIELD_ID)?.focus({ preventScroll: true });
  if (Math.abs(story.progress.get() - target) < 1e-3) {
    focus();
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
    focus();
  });
  const timer = setTimeout(() => stop(unsubscribe, timer), 5000);
  story.scrollTo(target);
}
