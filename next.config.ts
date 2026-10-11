import type { NextConfig } from "next";

// The e2e test hook (`window.__stage`, src/stage/dev/testHook.ts) is built only when
// NEXT_PUBLIC_STAGE_TEST_HOOK=1 (the e2e build, playwright.config.ts). An unset NEXT_PUBLIC_ variable
// is left as a runtime lookup rather than inlined, so the flag is pinned here: "0" in every other
// build is a constant, and the bundler drops the hook and its import from the production bundle.
const stageTestHook = process.env.NEXT_PUBLIC_STAGE_TEST_HOOK === "1" ? "1" : "0";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root to this repo so a stray lockfile in a parent folder is never picked up.
  turbopack: { root: process.cwd() },
  // The e2e build (with the hook) goes to its own directory, so it never replaces the production
  // build in .next that `npm start` serves.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_STAGE_TEST_HOOK: stageTestHook },
};

export default nextConfig;
