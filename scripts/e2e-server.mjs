#!/usr/bin/env node
// The e2e suite's server (playwright.config.ts webServer): `npm run build && npm start` on the port
// given as the first argument, with the stage test hook built in (NEXT_PUBLIC_STAGE_TEST_HOOK=1).
//
// The build goes to .next-e2e (NEXT_DIST_DIR, next.config.ts), so the production build in .next
// that `npm start` serves on port 3000 is never replaced by one carrying the hook. A build rewrites
// the generated next-env.d.ts to point at its own directory; it is put back afterwards, so the next
// `npm run typecheck` reads .next's types as before.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) {
  console.error("usage: node scripts/e2e-server.mjs <port>");
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env, NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" };

const NEXT_ENV = "next-env.d.ts";
const saved = existsSync(NEXT_ENV) ? readFileSync(NEXT_ENV, "utf8") : null;
const build = spawnSync(npm, ["run", "build"], {
  stdio: "inherit",
  env: { ...env, NEXT_PUBLIC_STAGE_TEST_HOOK: "1" },
});
if (saved === null) rmSync(NEXT_ENV, { force: true });
else writeFileSync(NEXT_ENV, saved);
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(npm, ["start", "--", "-p", port], { stdio: "inherit", env });
const stop = (signal) => {
  if (!server.killed) server.kill(signal);
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
