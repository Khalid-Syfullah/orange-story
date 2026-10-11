// The e2e suite (docs/CHECKS.md): `npm run e2e`. Chromium only, WebGL through SwiftShader so the
// stage renders headless anywhere, against a production build with the stage test hook
// (`window.__stage`, src/stage/dev/testHook.ts) served on a free port by scripts/e2e-server.mjs.
//
// One worker: the frame-time test needs the machine to itself, and every test drives a software
// GPU. The port is chosen once in the runner and handed to the workers through the environment
// (each worker loads this file again).
import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function freePort(): string {
  // A server on port 0 gets a free port from the system; it is closed again at once.
  return execFileSync(
    process.execPath,
    ["-e", "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});"],
    { encoding: "utf8" },
  ).trim();
}

const port = (process.env.E2E_PORT ||= freePort());
const baseURL = `http://127.0.0.1:${port}`;

/**
 * WebGL headless: ANGLE on SwiftShader, the same on a laptop and on a CI box with no GPU. E2E_GPU
 * names a real GPU backend instead (`E2E_GPU=metal` on a Mac, `vulkan` or `gl` elsewhere): for
 * measurements against a real GPU (docs/PERF.md), never for the suite's own run.
 */
const gpu = process.env.E2E_GPU ? [`--use-angle=${process.env.E2E_GPU}`] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const launchOptions = { args: ["--use-gl=angle", ...gpu, "--autoplay-policy=no-user-gesture-required"] };

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /phone\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, launchOptions },
    },
    {
      name: "phone",
      testMatch: /(phone|frame-time)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `node scripts/e2e-server.mjs ${port}`,
    url: `${baseURL}/`,
    timeout: 10 * 60_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
