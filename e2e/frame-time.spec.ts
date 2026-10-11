// docs/CHECKS.md, the frame-time test: on a mid-range phone (390x844 at dpr 3, Chrome's 4x CPU
// slowdown standing in for its CPU), every frame through every cut stays under the 16.7 ms budget
// and frames at rest in the hero and the sheet under 4 ms. frameMs() is the main thread's time for a
// frame (the scroll clock, texture uploads, the draw call, the DOM layers): the throttle slows the
// CPU, and it is the CPU's share this measures.
//
// The desktop project runs it only against a real GPU (E2E_GPU, playwright.config.ts). Under
// SwiftShader a desktop frame that brings a new 1440-tier frame of a sequence waits 30-70 ms for the
// software rasterizer to take the upload in (150-300 MB/s), which is that rasterizer's speed and
// not the page's work; on a real GPU the same run stays under budget (docs/PERF.md has both).
//
// Real time, not page.clock: performance.now() is what measures the frames. The loops play.
import { expect, test } from "@playwright/test";
import { pAtCut, readCuts } from "./lib/cuts";
import { land, openStage } from "./lib/stage";

const BUDGET_MS = 16.7;
const REST_MS = 4;
/** Frames driven across a cut, one new p per frame (docs/CHECKS.md's 40 increments). */
const STEPS = 40;
const REST_WINDOW_MS = 3000;

interface Row {
  where: string;
  frames: number;
  mean: number;
  p95: number;
  max: number;
}

function summarize(where: string, times: number[]): Row {
  const sorted = [...times].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  return { where, frames: times.length, mean: +mean.toFixed(2), p95: +pick(0.95).toFixed(2), max: +(sorted[sorted.length - 1] ?? 0).toFixed(2) };
}

test.describe("frame time, 4x CPU throttle", () => {
  test("every frame through every cut under 16.7 ms; at rest in the hero and the sheet under 4 ms", async ({ page }, info) => {
    test.skip(info.project.name === "desktop" && !process.env.E2E_GPU, "desktop frame time needs a real GPU (E2E_GPU=metal|vulkan|gl)");
    info.setTimeout(15 * 60_000);
    await openStage(page, { p: 0.02, fixedClock: false, holdLoops: false });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const cuts: Row[] = [];
    for (const cut of readCuts()) {
      await land(page, cut.from);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__stage!.frameTimes(true));
      const ps = Array.from({ length: STEPS + 1 }, (_, i) => pAtCut(cut, i / STEPS));
      await page.evaluate(async (list) => {
        const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        for (const p of list) {
          window.__stage!.setP(p);
          await frame();
        }
        await frame();
        await frame();
      }, ps);
      cuts.push(summarize(cut.slug, await page.evaluate(() => window.__stage!.frameTimes(true))));
    }

    const rest: Row[] = [];
    for (const [where, p] of [
      ["hero at rest", 0.02],
      ["sheet at rest", 0.41],
    ] as const) {
      await land(page, p);
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__stage!.frameTimes(true));
      await page.waitForTimeout(REST_WINDOW_MS);
      rest.push(summarize(where, await page.evaluate(() => window.__stage!.frameTimes(true))));
    }

    const table = [...cuts, ...rest].map((r) => `${r.where}: ${r.frames} frames, mean ${r.mean}, p95 ${r.p95}, max ${r.max} ms`);
    info.annotations.push({ type: "frame time (4x throttle)", description: table.join("; ") });
    console.log(`[${info.project.name}] frame time, 4x CPU throttle\n  ${table.join("\n  ")}`);

    for (const r of cuts) expect(r.frames, `${r.where}: frames recorded`).toBeGreaterThanOrEqual(STEPS);
    for (const r of rest) expect(r.frames, `${r.where}: frames recorded`).toBeGreaterThan(10);
    expect(cuts.filter((r) => r.max >= BUDGET_MS), `cuts with a frame over ${BUDGET_MS} ms`).toEqual([]);
    expect(rest.filter((r) => r.max >= REST_MS), `rest states with a frame over ${REST_MS} ms`).toEqual([]);
  });
});
