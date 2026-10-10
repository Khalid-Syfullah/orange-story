import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/** Unit tests (`npm test`): pure modules such as the scroll script, and the art tools in `scripts/`, run in Node. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
