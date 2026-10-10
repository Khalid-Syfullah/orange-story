import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { chrome } from "@/content/copy";
import { currentChapter, currentScene, visibleBeats } from "@/scroll/helpers";
import { scrollMapFor } from "@/scroll/mobile";
import { BEATS, CHAPTERS, MOBILE, SCENES, SCREEN } from "@/scroll/script";
import type { SceneDef } from "@/scroll/types";

/**
 * The scroll test. It walks the whole story the way a reader's scroll reaches it (window scrolling,
 * which the stage maps to story progress) and checks it against the script itself
 * (`src/scroll/script.ts`), so retuning the pacing never needs this file to change:
 *
 * - at the start, the middle and the end of every scene: the scene and the chapter the stage reports,
 *   the text beats on stage, the ruler (its active chapter and its segmented progress line) and the
 *   percent counter;
 * - in the middle of every scene, that the WebGL stage actually drew the scene (not an empty sky), and
 *   a screenshot in `test-results/story/` (`phone/` for the phone), plus the opening frame
 *   (`00-opening.png`) and the end of the page (`15-end.png`);
 * - the way back: every point again in reverse, where the text layer, the hairlines and the ruler must
 *   be exactly as they were on the way down (everything is a function of progress);
 * - no console errors and no WebGL warnings on the way;
 * - on top: the end of the page, the reduced-motion page, the fonts, and layout shift on load.
 *
 * Run it with `npm run test:story` (it builds and serves the site). Scenes are numbered in the file
 * names in story order.
 */

const SHOTS = path.join(process.cwd(), "test-results", "story");

/** Sample points keep this far from any boundary where the expected state flips (a scene, a chapter, a beat). */
const CLEAR = 0.12 * SCREEN;
const BOUNDARIES = [...SCENES.flatMap((s) => [s.start, s.end]), ...CHAPTERS.map((c) => c.start), ...BEATS.flatMap((b) => [b.in, b.out])];

/** `p`, moved off any nearby boundary in `direction`, kept inside the scene. */
function clearPoint(p: number, direction: 1 | -1, scene: SceneDef): number {
  let q = p;
  for (let i = 0; i < 50; i++) {
    const near = BOUNDARIES.find((b) => Math.abs(b - q) < CLEAR);
    if (near === undefined) break;
    q = near + direction * CLEAR * 1.05;
  }
  return Math.min(Math.max(q, scene.start + CLEAR), Math.min(scene.end, 1) - CLEAR);
}

/** The start, the middle and the end of a scene. */
function samplePoints(scene: SceneDef): { label: "start" | "middle" | "end"; p: number }[] {
  return [
    { label: "start", p: clearPoint(scene.start + 0.2 * SCREEN, 1, scene) },
    { label: "middle", p: clearPoint((scene.start + scene.end) / 2, 1, scene) },
    { label: "end", p: clearPoint(scene.end - 0.2 * SCREEN, -1, scene) },
  ];
}

interface Geometry {
  top: number;
  span: number;
  stacked: boolean;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate((stackedMaxWidth) => {
    const section = document.querySelector<HTMLElement>("[data-stage]")!;
    const frame = section.firstElementChild as HTMLElement;
    return {
      top: section.getBoundingClientRect().top + window.scrollY,
      span: section.offsetHeight - frame.offsetHeight,
      stacked: window.matchMedia(`(max-width: ${stackedMaxWidth}px)`).matches,
    };
  }, MOBILE.stackedMaxWidth);
}

/** Lets the stage catch up: two animation frames and a moment for motion and the canvas. */
async function settle(page: Page, ms = 80) {
  await page.evaluate((wait) => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, wait)))), ms);
}

/** Waits until no art (or anything else) has been loading for a moment. */
async function quiet(page: Page, pending: Set<unknown>, ms = 300, limit = 10_000) {
  const until = Date.now() + limit;
  let calmSince = Date.now();
  while (Date.now() < until) {
    if (pending.size > 0) calmSince = Date.now();
    else if (Date.now() - calmSince >= ms) return;
    await page.waitForTimeout(50);
  }
}

/** Scrolls the window so the story sits at progress `p` (through the layout's own scroll map); returns the progress the stage now has. */
async function scrollToProgress(page: Page, g: Geometry, p: number): Promise<number> {
  const map = scrollMapFor(g.stacked);
  const y = Math.round(g.top + map.toScroll(p) * g.span);
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await settle(page);
  const actual = await page.evaluate(() => window.scrollY);
  return map.toProgress(Math.min(1, Math.max(0, (actual - g.top) / g.span)));
}

interface StageState {
  scene: string | null;
  chapter: string | null;
  beats: string[];
  ruler: { active: string | null; segments: { start: number; end: number; fill: number }[] } | null;
  percent: string | null;
}

/** What the page says about itself: the stage's data attributes, the beats with a visible box, the ruler. */
async function readStage(page: Page): Promise<StageState> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("[data-stage]")!;
    const beats = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>("[data-beat]")) {
      // A beat's own box is its first child (a question card is its own box).
      const box = el.hasAttribute("data-question-card") ? el : (el.firstElementChild as HTMLElement | null);
      if (box && getComputedStyle(box).visibility === "visible") beats.add(el.dataset.beat!);
    }
    const rulerEl = document.querySelector<HTMLElement>("[data-ruler]");
    const shown = rulerEl ? getComputedStyle(rulerEl).display !== "none" : false;
    const ruler = shown
      ? {
          active: rulerEl!.querySelector('button[aria-current="location"]')?.textContent ?? null,
          segments: [...rulerEl!.querySelectorAll<SVGPathElement>("path[data-segment]")].map((el) => {
            const length = Number(el.getAttribute("stroke-dasharray"));
            const offset = Number(el.style.strokeDashoffset || el.getAttribute("stroke-dashoffset"));
            return { start: Number(el.dataset.start), end: Number(el.dataset.end), fill: length > 0 ? 1 - offset / length : 0 };
          }),
        }
      : null;
    return {
      scene: stage.dataset.scene ?? null,
      chapter: stage.dataset.chapter ?? null,
      beats: [...beats].sort(),
      ruler,
      percent: document.querySelector("[data-percent]")?.textContent ?? null,
    };
  });
}

/**
 * Everything scroll-driven that the reader sees outside the canvas, to compare the way down with the
 * way back up: for each beat on stage, the computed look of every element the stage moves (opacity,
 * transform, blur, smoke mask) and how much of its text shows (typed lines); the hairlines; the
 * ruler's progress line; the percent counter. Computed values, rounded, so how a style happens to
 * be written (server markup or a later update) does not matter.
 */
async function fingerprint(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const round = (value: string) => value.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, (n) => String(Math.round(Number(n) * 100) / 100));
    const parts: string[] = [];
    for (const beat of document.querySelectorAll<HTMLElement>("[data-beat]")) {
      const id = beat.dataset.beat!;
      // The hero copy plays a timed intro once per page view; on the way back it is scrubbed only.
      if (id === "hero" || id === "hero-intro") continue;
      const box = beat.hasAttribute("data-question-card") ? beat : (beat.firstElementChild as HTMLElement | null);
      if (!box || getComputedStyle(box).visibility !== "visible") continue;
      for (const el of [beat, ...beat.querySelectorAll<HTMLElement>("*")]) {
        if (!el.getAttribute("style")) continue;
        const cs = getComputedStyle(el);
        // Idle effects (the cards' sparkles, the caret) run on time, as they should.
        if (cs.animationName && cs.animationName !== "none") continue;
        parts.push(`${id} ${el.tagName} ${round(cs.opacity)} ${round(cs.transform)} ${round(cs.filter)} ${round(cs.maskPosition || "")}`);
      }
      parts.push(`${id} shows ${beat.textContent?.length ?? 0} characters`);
    }
    for (const el of document.querySelectorAll('[data-layer="hairlines"] path')) parts.push(round(el.getAttribute("d") ?? ""));
    for (const el of document.querySelectorAll<SVGPathElement>("[data-ruler] path[data-segment]")) parts.push(round(el.style.strokeDashoffset));
    parts.push(document.querySelector("[data-percent]")?.textContent ?? "");
    return parts;
  });
}

/** The share of a screenshot's pixels that differ clearly from its most common color: an empty sky is close to 0. */
async function paintedShare(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().resize(240, null).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<number, number>();
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [dominant] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [dr, dg, db] = [(dominant >> 8) * 16 + 8, ((dominant >> 4) & 15) * 16 + 8, (dominant & 15) * 16 + 8];
  let painted = 0;
  for (let i = 0; i < data.length; i += 3) if (Math.abs(data[i] - dr) + Math.abs(data[i + 1] - dg) + Math.abs(data[i + 2] - db) > 60) painted++;
  return painted / pixels;
}

const chapterName = (id: string) => chrome.chapters.find((c) => c.id === id)?.name ?? id;
const percentOf = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100);

test.describe("the scroll story", () => {
  test("walks every scene down and back up, as the script says", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    const problems: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" || /WebGL|GL_INVALID|INVALID_OPERATION/.test(text)) problems.push(`[${message.type()}] ${text}`);
    });
    page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));
    const pending = new Set<unknown>();
    page.on("request", (request) => pending.add(request));
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => {
      pending.delete(request);
      problems.push(`[requestfailed] ${request.url()}`);
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("[data-stage]")).toBeVisible();
    // The hero's timed intro.
    await page.waitForTimeout(3500);

    const g = await geometry(page);
    const folder = g.stacked ? path.join(SHOTS, testInfo.project.name) : SHOTS;
    mkdirSync(folder, { recursive: true });
    // The page as it opens: the hero with its copy, before any scroll.
    await quiet(page, pending);
    await page.screenshot({ path: path.join(folder, "00-opening.png") });

    const points = SCENES.flatMap((scene) => samplePoints(scene).map((point) => ({ scene, ...point })));
    const seen = new Map<number, string[]>();

    for (const point of points) {
      const p = await scrollToProgress(page, g, point.p);
      await quiet(page, pending);
      await settle(page, 200);
      const where = `${point.scene.id} ${point.label} (p ${p.toFixed(4)})`;
      const state = await readStage(page);

      expect.soft(state.scene, `${where}: scene`).toBe(currentScene(p).id);
      expect.soft(state.chapter, `${where}: chapter`).toBe(currentChapter(p).id);
      expect.soft(state.beats, `${where}: beats on stage`).toEqual(visibleBeats(p).map((b) => b.id).sort());
      expect.soft(Math.abs(Number.parseInt(state.percent ?? "-9", 10) - percentOf(p)), `${where}: percent counter`).toBeLessThanOrEqual(1);
      if (!g.stacked) {
        expect.soft(state.ruler, `${where}: ruler shown`).not.toBeNull();
        expect.soft(state.ruler?.active ?? "", `${where}: ruler chapter`).toContain(chapterName(currentChapter(p).id));
        for (const segment of state.ruler?.segments ?? []) {
          const want = Math.min(1, Math.max(0, (p - segment.start) / (segment.end - segment.start)));
          expect.soft(Math.abs(segment.fill - want), `${where}: ruler segment ${segment.start} to ${segment.end}`).toBeLessThan(0.02);
        }
      }

      if (point.label === "middle") {
        const number = String(point.scene.number).padStart(2, "0");
        const shot = await page.screenshot({ path: path.join(folder, `${number}-${point.scene.id}.png`) });
        expect.soft(await paintedShare(shot), `${where}: the stage drew the scene`).toBeGreaterThan(0.04);
      }
      seen.set(point.p, await fingerprint(page));
    }

    // The end of the page: the finale holds, and there is nowhere further to go.
    const end = await scrollToProgress(page, g, 1);
    await quiet(page, pending);
    await settle(page, 200);
    const last = await readStage(page);
    expect.soft(end).toBeCloseTo(1, 3);
    expect.soft(last.scene).toBe("finale");
    expect.soft(last.beats).toContain("finale");
    await page.screenshot({ path: path.join(folder, "15-end.png") });

    // And back up: every point again, in reverse, exactly as it was on the way down.
    for (const point of [...points].reverse()) {
      const p = await scrollToProgress(page, g, point.p);
      await quiet(page, pending);
      await settle(page, 200);
      const where = `${point.scene.id} ${point.label} on the way back (p ${p.toFixed(4)})`;
      const state = await readStage(page);
      expect.soft(state.scene, `${where}: scene`).toBe(currentScene(p).id);
      expect.soft(state.beats, `${where}: beats on stage`).toEqual(visibleBeats(p).map((b) => b.id).sort());
      expect.soft(await fingerprint(page), `${where}: text, hairlines and ruler as on the way down`).toEqual(seen.get(point.p));
    }

    expect(problems, "console errors or WebGL warnings").toEqual([]);
  });

  test("uses only the three fonts, and nothing shifts while they load", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shift: number }).__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) (window as unknown as { __shift: number }).__shift += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3500);

    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    expect(shift, "cumulative layout shift while the page and its fonts load").toBeLessThan(0.02);

    const families = await page.evaluate(() => {
      const used = new Set<string>();
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
        if (!el.getClientRects().length) continue;
        used.add(getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/["']/g, ""));
      }
      const loaded = new Set<string>();
      document.fonts.forEach((face) => {
        if (face.status === "loaded") loaded.add(face.family.replace(/["']/g, ""));
      });
      return { used: [...used], loaded: [...loaded] };
    });
    const allowed = /^(Newsreader|Geist|Geist Mono)( Fallback)?$/;
    for (const family of families.used) expect(family, "a rendered text element's font").toMatch(allowed);
    for (const family of families.loaded) expect(family, "a loaded font face").toMatch(allowed);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the calm stacked page: every chapter, the stills, the questions as a list", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("[data-stage]")).toBeHidden();
    const reduced = page.locator("[data-reduced-story]");
    await expect(reduced).toBeVisible();
    for (const chapter of chrome.chapters) await expect(reduced.getByRole("heading", { name: new RegExp(chapter.name) }).first()).toBeVisible();
    await expect(reduced.locator("article")).toHaveCount(SCENES.length);
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `reduced-motion-${test.info().project.name}.png`) });
  });
});
