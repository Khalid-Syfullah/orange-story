// docs/CHECKS.md, the phone test, at 390x844 (dpr 3, touch): texture fields drop to 2 octaves; no
// horizontal overflow anywhere in the story; every copy block that is on screen sits inside the
// viewport while its segment is active; the application form can be filled in and sent. Real time
// (the DOM layers are written by the frame loop); the loops are held. Each cut's middle frame is
// saved beside the desktop stills (docs/screenshots/cuts/phone-<cut>-0.5.png), for the check by eye
// that a cut looks the same on a phone at arm's length.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { application } from "../src/content/copy";
import { segments } from "../src/stage/script";
import { pAtCut, readCuts, ROOT } from "./lib/cuts";
import { pictureStats } from "./lib/image";
import { decode, framePng, land, openStage } from "./lib/stage";

const frames = (page: Page, n: number) =>
  page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, n);

interface Block {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Overflow, and every copy block in the DOM layers that is shown (opacity 0.98 or more, visible) and lies outside the viewport. */
function inspect(): { scrollWidth: number; bodyWidth: number; shown: number; outside: Block[] } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const selector = ["h1", "h2", "h3", "p", "li", "label", "button", "input", "textarea", "article"].map((t) => `.layers ${t}`).join(",");
  const outside: Block[] = [];
  let shown = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (el.closest('[aria-hidden="true"], .sr-only')) continue;
    if (getComputedStyle(el).visibility !== "visible") continue;
    let opacity = 1;
    for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none") opacity = 0;
      opacity *= Number.parseFloat(cs.opacity);
    }
    if (opacity < 0.98) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    shown++;
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
      outside.push({ text: (el.textContent ?? "").trim().slice(0, 48), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, shown, outside };
}

test.describe("phone, 390x844", () => {
  test("2 octaves; no horizontal overflow; every copy block inside the viewport while its segment is active", async ({ page }, info) => {
    info.setTimeout(15 * 60_000);
    await openStage(page, { p: 0.001, fixedClock: false, holdLoops: true });
    const st = await page.evaluate(() => window.__stage!.state());
    expect(st.view, "the viewport").toEqual([390, 844]);
    expect(st.octaves, "texture fields at 2 octaves on a phone (motion fields keep 4)").toBe(2);
    expect(st.mode, "touch scrolls natively").toBe("native");

    const problems: string[] = [];
    let shownTotal = 0;
    for (const seg of segments) {
      for (const k of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const p = seg.start + (seg.end - seg.start) * k;
        await land(page, p);
        await frames(page, 3);
        const r = await page.evaluate(inspect);
        shownTotal += r.shown;
        const where = `${seg.id} p ${p.toFixed(4)}`;
        if (r.scrollWidth > 390 || r.bodyWidth > 390) problems.push(`${where}: horizontal overflow (document ${r.scrollWidth} px, body ${r.bodyWidth} px)`);
        for (const b of r.outside) problems.push(`${where}: "${b.text}" at ${b.left},${b.top} to ${b.right},${b.bottom}`);
      }
    }
    expect(shownTotal, "copy is shown along the story").toBeGreaterThan(40);
    expect(problems).toEqual([]);
  });

  test("the application form can be filled in and sent", async ({ page }) => {
    await openStage(page, { p: 0.82, fixedClock: false, holdLoops: true });
    await frames(page, 5);
    const name = page.locator("#apply-name");
    const email = page.locator("#apply-email");
    const grow = page.locator("#apply-grow");
    const send = page.getByRole("button", { name: application.submit });
    for (const field of [name, email, grow, send]) {
      await expect(field).toBeVisible();
      await expect(field).toBeInViewport({ ratio: 1 });
    }

    // Empty: every field says what it needs, and the first one takes the focus.
    await send.tap();
    await expect(page.getByText(application.errors.name)).toBeVisible();
    await expect(page.getByText(application.errors.email)).toBeVisible();
    await expect(page.getByText(application.errors.grow)).toBeVisible();
    await expect(name).toBeFocused();

    // Filled in: it sends (no endpoint is set in the e2e build, so it validates and shows the message).
    await name.tap();
    await name.fill("Ada Lovelace");
    await email.tap();
    await email.fill("ada@example.com");
    await grow.tap();
    await grow.fill("Online bookings for our cooking school.");
    await expect(page.getByText(application.errors.name)).toHaveCount(0);
    await send.tap();
    await expect(page.getByText(application.success)).toBeVisible();
    await expect(page.getByText(application.success)).toBeInViewport();
  });

  test("each cut's middle frame on a phone, for the arm's-length comparison with desktop", async ({ page }) => {
    await openStage(page, { p: 0.001 });
    const dir = path.join(ROOT, "docs", "screenshots", "cuts");
    mkdirSync(dir, { recursive: true });
    for (const cut of readCuts()) {
      await land(page, pAtCut(cut, 0.5));
      const png = await framePng(page);
      const file = path.join(dir, `phone-${cut.slug}-0.5.png`);
      writeFileSync(file, png);
      expect((pictureStats(await decode(png))).blockStd, `${file} is a picture`).toBeGreaterThan(1);
    }
  });
});
