import { defineConfig, devices } from "@playwright/test";

/**
 * The scroll test (`npm run test:story`): builds the site, serves the production build and walks the
 * whole story in Chromium on a laptop screen and on a phone (see `e2e/story.spec.ts`). Screenshots
 * of every scene land in `test-results/story/`.
 *
 * `channel: "chromium"` runs the full browser in its new headless mode, which draws WebGL on the
 * GPU where there is one (the headless shell would fall back to software rendering). Install the
 * browser once with `npx playwright install chromium`.
 */

const PORT = Number(process.env.STORY_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chromium" } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
