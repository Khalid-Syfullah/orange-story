// docs/CHECKS.md, the reduced-motion test: with prefers-reduced-motion, each cut collapses to its
// t = 1 frame with a 300 ms dissolve, and nothing else moves (breath and parallax stop: uStill = 1).
// The scroll enters each cut at t = 0.2, 0.5 and 0.8 from just before it; 300 ms later the
// dissolve's ghost has faded and the canvas holds the cut's end frame. Real time (the dissolve is a
// CSS transition); the video loops are held so frames compare exactly.
import { expect, test, type Page } from "@playwright/test";
import { pAtCut, readCuts } from "./lib/cuts";
import { diffStats } from "./lib/image";
import { frame, land, openStage, settle } from "./lib/stage";

test.use({ reducedMotion: "reduce" });

/** Two frames of the stage at the same p: "the same frame" means rounding at most. */
const SAME_MEAN = 0.5;
const SAME_VISIBLE = 0.001;
const DISSOLVE_MS = 300;

const frames = (page: Page, n: number) =>
  page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, n);

/** Wait until the ghost has no dissolve running (a dissolve a later one replaced counts as over). */
const ghostAtRest = (page: Page) =>
  page.evaluate(async () => {
    const ghost = document.querySelector<HTMLCanvasElement>("canvas.ghost");
    for (let running = ghost?.getAnimations() ?? []; running.length > 0; running = ghost?.getAnimations() ?? []) {
      await Promise.allSettled(running.map((a) => a.finished));
    }
  });

test.describe("reduced motion", () => {
  test("each cut sits at its end frame 300 ms after the scroll enters it", async ({ page }, info) => {
    info.setTimeout(15 * 60_000);
    await openStage(page, { p: 0.001, fixedClock: false, holdLoops: true });
    const st = await page.evaluate(() => window.__stage!.state());
    expect(st.reduced, "prefers-reduced-motion is on").toBe(true);
    expect(st.still, "uStill is 1: breath, parallax and drift stop").toBe(1);

    const failures: string[] = [];
    // The Model's beats stay under the reader's hand under reduced motion (docs/PERF.md), so a row of the cuts
    // table that lies inside the model segment (the push-through) has no end frame to collapse to.
    for (const cut of readCuts().filter((c) => c.slug !== "model")) {
      // The cut's end frame, as the stage shows it under reduced motion.
      await land(page, cut.to - 1e-5);
      const end = await frame(page);
      for (const t of [0.2, 0.5, 0.8]) {
        // From just before the cut (its own dissolve over), the scroll enters it.
        await land(page, Math.max(0, cut.from - 0.004));
        await frames(page, 3);
        await ghostAtRest(page);
        await page.evaluate((p) => window.__stage!.setP(p), pAtCut(cut, t));
        // The dissolve: the ghost's opacity transition, measured on the document timeline (on a
        // software GPU the frame that starts it can be slow; its 300 ms are the page's own).
        const dissolve = await page.evaluate(async () => {
          const ghost = document.querySelector<HTMLCanvasElement>("canvas.ghost");
          if (!ghost) return { found: false, duration: 0 };
          const since = performance.now();
          let running = ghost.getAnimations();
          while (running.length === 0 && performance.now() - since < 3000) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            running = ghost.getAnimations();
          }
          if (running.length === 0) return { found: false, duration: 0 };
          const duration = Number(running[0].effect?.getTiming().duration);
          for (; running.length > 0; running = ghost.getAnimations()) await Promise.allSettled(running.map((a) => a.finished));
          return { found: true, duration };
        });
        await frames(page, 2);
        const after = await page.evaluate(() => window.__stage!.state());
        await settle(page);
        const d = diffStats(await frame(page), end);
        const where = `${cut.slug} at t ${t} (p ${pAtCut(cut, t).toFixed(4)}, drawn at segment ${after.segment} t ${after.t.toFixed(3)})`;
        if (!dissolve.found) failures.push(`${where}: no dissolve`);
        else if (dissolve.duration !== DISSOLVE_MS) failures.push(`${where}: the dissolve lasts ${dissolve.duration} ms, not ${DISSOLVE_MS}`);
        if (after.ghostOpacity > 0.01) failures.push(`${where}: the ghost is still on screen after the dissolve (opacity ${after.ghostOpacity})`);
        if (d.mean > SAME_MEAN || d.over8 > SAME_VISIBLE) failures.push(`${where}: not the end frame (mean difference ${d.mean.toFixed(2)}, ${(d.over8 * 100).toFixed(2)}% of pixels)`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("nothing moves at rest: the canvas and the page hold still", async ({ page }, info) => {
    info.setTimeout(10 * 60_000);
    await openStage(page, { p: 0.001, fixedClock: false, holdLoops: true });
    const failures: string[] = [];
    // A rest in every chapter and every cut's end frame.
    const positions: [string, number][] = [
      ["hero", 0.02],
      ["model", 0.13],
      ["work", 0.3],
      ["sheet", 0.41],
      ["panel", 0.49],
      ["coda", 0.555],
      ["questions", 0.7],
      ["application", 0.85],
      ["finale", 0.995],
      // (Not the Model's row: it ends mid-beat, with the copy part way through its ramp; the model is judged at rest above.)
      ...readCuts()
        .filter((c) => c.slug !== "model")
        .map((c): [string, number] => [`${c.slug} end`, c.to - 1e-5]),
    ];
    for (const [where, p] of positions) {
      await land(page, p);
      await frames(page, 3);
      await page.waitForTimeout(DISSOLVE_MS + 100);
      const a = await frame(page);
      const shotA = await page.screenshot();
      await page.waitForTimeout(1500);
      const b = await frame(page);
      const shotB = await page.screenshot();
      const d = diffStats(a, b);
      if (d.mean > SAME_MEAN || d.over8 > SAME_VISIBLE) failures.push(`${where}: the canvas moved over 1.5 s (mean ${d.mean.toFixed(2)})`);
      if (!shotA.equals(shotB)) failures.push(`${where}: the page changed over 1.5 s`);
    }
    expect(failures).toEqual([]);
  });
});
