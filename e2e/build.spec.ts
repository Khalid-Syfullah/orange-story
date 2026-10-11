// docs/CHECKS.md, the build test, the part the suite can hold: `npm start` serves on port 3000, and
// a production build (`npm run build`, into .next) does not ship the stage test hook. lint,
// typecheck and build themselves are the deploy contract's own steps (README.md, CI).
import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/cuts";

test.describe("build", () => {
  test("npm start serves on port 3000", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.start).toMatch(/^next start -p 3000$/);
    expect(pkg.scripts.e2e, "the suite runs as npm run e2e, not npm test (CI runs test --if-present)").toBeTruthy();
    expect(pkg.scripts.test, "no test script: CI's test step stays fast").toBeUndefined();
  });

  test("the production build does not ship the stage test hook", () => {
    const chunks = path.join(ROOT, ".next", "static", "chunks");
    test.skip(!existsSync(path.join(ROOT, ".next", "BUILD_ID")) || !existsSync(chunks), "no production build in .next (run npm run build)");
    const files = readdirSync(chunks, { recursive: true }).map(String).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);
    const shipping = files.filter((f) => /__stage|NEXT_PUBLIC_STAGE_TEST_HOOK/.test(readFileSync(path.join(chunks, f), "utf8")));
    expect(shipping, "chunks carrying the hook").toEqual([]);
  });
});
