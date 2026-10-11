// docs/CHECKS.md, the speed test, its first half: crest effects scale with the scroll's speed. The
// three cuts whose crest reads the scroll's velocity (uVel: the static's tear, the Split's zest, the
// burn's ember and sparks) are drawn at the same p at rest, at a slow wheel's speed and at a flick's,
// through the hook, at the clock page.clock holds: the change from rest grows with the speed, and it
// is the crest that changes (the picture away from it does not know the scroll is moving). The
// second half, the settle taking the same time at every speed, is the scroll-stop kick's 1.2 s decay
// (src/stage/pointer.ts), a function of time alone; docs/CHECKS.md records it as a check by hand.
import { expect, test } from "@playwright/test";
import { pAtCut, readCuts } from "./lib/cuts";
import { count, crestMask, delta, dilate } from "./lib/image";
import { frame, land, openStage, probe } from "./lib/stage";

/** Scroll speeds, px per frame: at rest, a slow wheel, a trackpad flick (the shaders saturate at 40). */
const SLOW = 8;
const FLICK = 40;
/** A pixel counts as changed by the speed when a channel moves by more than this. */
const CHANGED = 8;
/** Share of the pixels the speed changes that must lie in the crest zone (grown 8 px). */
const IN_CREST = 0.95;

const CUTS = [
  { slug: "bridge", t: 0.3 },
  { slug: "split", t: 0.4 },
  { slug: "close", t: 0.5 },
] as const;

test.describe("speed", () => {
  for (const { slug, t } of CUTS) {
    test(`${slug}: crest effects scale with the scroll's speed, and only the crest's`, async ({ page }) => {
      const cut = readCuts().find((c) => c.slug === slug);
      expect(cut, `docs/TRANSITIONS.md lists the ${slug} cut`).toBeTruthy();
      const p = pAtCut(cut!, t);
      await openStage(page, { p });
      await land(page, p);
      const rest = await frame(page, 0);
      const slow = await frame(page, SLOW);
      const flick = await frame(page, FLICK);
      const zone = crestMask(await probe(page), 1);
      expect(zone, `${slug}: the crest is on screen`).not.toBeNull();
      const crest = dilate(zone!, rest.width, rest.height, 8);

      const measure = (d: Uint8Array) => {
        let sum = 0;
        let changed = 0;
        let inCrest = 0;
        for (let i = 0; i < d.length; i++) {
          sum += d[i];
          if (d[i] > CHANGED) {
            changed++;
            inCrest += crest[i];
          }
        }
        return { mean: sum / d.length, changed, inCrest: changed > 0 ? inCrest / changed : 1 };
      };
      const s = measure(delta(rest, slow));
      const f = measure(delta(rest, flick));
      const line = `${slug} at t ${t}: slow (${SLOW} px/frame) mean change ${s.mean.toFixed(3)}, ${s.changed} px; flick (${FLICK}) ${f.mean.toFixed(3)}, ${f.changed} px, ${(f.inCrest * 100).toFixed(1)}% at the crest (crest band ${((count(crest) / crest.length) * 100).toFixed(1)}% of the frame)`;
      test.info().annotations.push({ type: "speed", description: line });
      console.log(`[speed] ${line}`);
      expect(s.changed, "a slow wheel already moves the crest's effects").toBeGreaterThan(0);
      expect(f.mean, "a flick moves them more than a slow wheel").toBeGreaterThan(s.mean);
      expect(f.changed, "and over more pixels").toBeGreaterThan(s.changed);
      expect(f.inCrest, "the speed changes the crest, not the picture away from it").toBeGreaterThan(IN_CREST);
    });
  }
});
