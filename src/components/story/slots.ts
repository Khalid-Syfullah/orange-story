import type { SlotId } from "@/scroll/types";

/**
 * Where each text slot sits on the stage, on the layout grid from DESIGN.md (column A 8%, column B
 * 24%, the right column from about 52% to the right hairline). Layout only: when a slot is in use is
 * decided by the beats in `src/scroll/script.ts`.
 *
 * Every box spans the full stage width, so percentages inside it land on the grid lines.
 * `origin` is where the box's own transforms (zoom, dock, swing, sink) pivot.
 */
export interface SlotLayout {
  box: string;
  origin: string;
  /** The column inside the box that holds the text. */
  column: string;
}

/**
 * The stage grid as CSS grid tracks: margin | column A | column B to the right hairline | margin.
 * Tags and titles go in track 2 (`col-start-2`), paragraphs and typed lines in track 3.
 */
export const STAGE_COLUMNS =
  "grid grid-cols-[var(--col-a)_calc(var(--col-b)_-_var(--col-a))_minmax(0,1fr)_calc(100%_-_var(--grid-right))]";

const TOP = "top-[calc(var(--grid-top)_+_clamp(1.5rem,5svh,3.5rem))]";

export const SLOTS: Record<SlotId, SlotLayout> = {
  "center-left": {
    box: "absolute inset-x-0 top-[54%] -translate-y-1/2",
    origin: "8% 50%",
    column: "ml-col-a max-w-[min(40rem,46%)]",
  },
  "bottom-left": {
    box: "absolute inset-x-0 bottom-[max(2.5rem,9svh)]",
    origin: "8% 100%",
    // Full width: each row lays itself out on STAGE_COLUMNS (tag in column A, text in column B).
    column: "w-full",
  },
  right: {
    box: "absolute inset-x-0 top-1/2 -translate-y-1/2",
    origin: "70% 50%",
    column: "ml-[52%] mr-[calc(100%_-_var(--grid-right)_+_1.5rem)] max-w-[34rem]",
  },
  "top-left": {
    box: `absolute inset-x-0 ${TOP}`,
    origin: "8% 0%",
    column: "ml-col-a mr-[calc(100%_-_var(--grid-right))] max-w-[min(44rem,58%)]",
  },
  "top-center": {
    box: `absolute inset-x-0 ${TOP} text-center`,
    origin: "50% 0%",
    column: "mx-auto max-w-[min(40rem,70%)]",
  },
  center: {
    box: "absolute inset-0 grid place-items-center",
    origin: "50% 50%",
    column: "w-[min(34rem,calc(100%_-_3rem))]",
  },
};
