import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { stackedGrid, DESKTOP_GRID_LINES, STACKED_GRID_LINES } from "@/styles/tokens";

import { MOBILE } from "./script";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("the stacked layout in CSS", () => {
  it("switches at the script's width", () => {
    const widths = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThanOrEqual(2);
    for (const width of widths) expect(width).toBe(MOBILE.stackedMaxWidth);
  });

  it("puts the hairlines where the tokens say", () => {
    expect(css).toContain(`--grid-right: ${(stackedGrid.right * 100).toFixed(1)}%`);
    expect(css).toContain(`--grid-top: ${stackedGrid.topPx / 16}rem`);
  });

  it("keeps the top line clear of the top row on a phone, and the grid as designed elsewhere", () => {
    expect(STACKED_GRID_LINES.top(390)).toBe(56);
    expect(DESKTOP_GRID_LINES.top(1440)).toBeCloseTo(76.3, 1);
    expect(STACKED_GRID_LINES.right(390)).toBeGreaterThan(DESKTOP_GRID_LINES.right(390));
  });
});
