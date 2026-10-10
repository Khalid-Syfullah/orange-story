import { describe, expect, it } from "vitest";

import { beatArrivedAt, beatOf } from "./helpers";
import {
  anchorAt,
  anchorFromHash,
  BEAT_STOPS,
  PROGRESS_STORAGE_KEY,
  RESTORE_SCRIPT,
  restoreTarget,
  stepBeat,
} from "./navigation";
import { ANCHORS, BEATS, CHAPTERS, SCENES, SCREEN } from "./script";

describe("beat stops", () => {
  it("has one stop per beat group, in order, with every beat fully on screen at its stop", () => {
    for (let i = 1; i < BEAT_STOPS.length; i++) expect(BEAT_STOPS[i]).toBeGreaterThan(BEAT_STOPS[i - 1]);
    for (const beat of BEATS) {
      const stop = BEAT_STOPS.find((s) => Math.abs(s - beatArrivedAt(beat)) < 0.5 * SCREEN + 1e-9);
      expect(stop! >= beat.hold[0] && stop! <= beat.hold[1] + 0.5 * SCREEN, `${beat.id} is on screen at its stop`).toBe(true);
      expect(stop, beat.id).toBeDefined();
    }
    expect(BEAT_STOPS.length).toBeGreaterThan(10);
    expect(BEAT_STOPS[0]).toBeLessThan(SCREEN);
  });

  it("steps forward and back one beat at a time", () => {
    const first = stepBeat(0, 1)!;
    expect(first).toBe(BEAT_STOPS[1]);
    expect(stepBeat(first, -1)).toBe(BEAT_STOPS[0]);
    // From a stop, J goes to the next one and K to the one before, never to the same.
    for (let i = 1; i < BEAT_STOPS.length - 1; i++) {
      expect(stepBeat(BEAT_STOPS[i], 1)).toBe(BEAT_STOPS[i + 1]);
      expect(stepBeat(BEAT_STOPS[i], -1)).toBe(BEAT_STOPS[i - 1]);
    }
  });

  it("stops at both ends of the story", () => {
    expect(stepBeat(1, 1)).toBeNull();
    expect(stepBeat(BEAT_STOPS[BEAT_STOPS.length - 1], 1)).toBeNull();
    expect(stepBeat(0, -1)).toBeNull();
  });

  it("goes to the next beat from the middle of a long stretch without text", () => {
    const next = stepBeat(0.08, 1)!;
    expect(next).toBeGreaterThan(0.08);
    expect(next).toBe(BEAT_STOPS.find((s) => s > 0.08));
    expect(stepBeat(0.08, -1)).toBeLessThan(0.08);
  });

  it("includes the form and the question cards", () => {
    const near = (id: string) => BEAT_STOPS.some((s) => Math.abs(s - beatArrivedAt(beatOf(id as never))) < SCREEN);
    expect(near("apply-form")).toBe(true);
    for (let n = 1; n <= 5; n++) expect(near(`question-${n}`)).toBe(true);
  });
});

describe("the hash", () => {
  it("names the five places, with or without the #", () => {
    for (const id of ["model", "work", "terms", "questions", "apply"] as const) {
      expect(anchorFromHash(`#${id}`)).toBe(id);
      expect(anchorFromHash(id)).toBe(id);
    }
    expect(anchorFromHash("")).toBeNull();
    expect(anchorFromHash("#nope")).toBeNull();
    expect(anchorFromHash("#Work")).toBeNull();
  });

  it("follows the chapters, and the hero has none", () => {
    expect(anchorAt(0)).toBeNull();
    expect(anchorAt(CHAPTERS[0].start - 1e-4)).toBeNull();
    expect(anchorAt(CHAPTERS[0].start)).toBe("model");
    expect(anchorAt(0.1)).toBe("model");
    expect(anchorAt(CHAPTERS[1].start)).toBe("work");
    expect(anchorAt(CHAPTERS[2].start)).toBe("terms");
    expect(anchorAt(CHAPTERS[3].start)).toBe("questions");
    expect(anchorAt(SCENES.find((s) => s.id === "stars")!.start)).toBe("questions");
    expect(anchorAt(SCENES.find((s) => s.id === "apply")!.start)).toBe("apply");
    expect(anchorAt(1)).toBe("apply");
  });

  it("a link lands inside the place its own hash names", () => {
    for (const id of ["work", "terms", "questions", "apply"] as const) expect(anchorAt(ANCHORS[id])).toBe(id);
  });
});

describe("restoration", () => {
  it("returns to the saved progress after a reload or back navigation", () => {
    expect(restoreTarget("reload", "0.42", "")).toBeCloseTo(0.42, 9);
    expect(restoreTarget("back_forward", "0.9", "#work")).toBeCloseTo(0.9, 9);
  });

  it("ignores saved progress on a fresh navigation, and uses the hash", () => {
    expect(restoreTarget("navigate", "0.42", "")).toBeNull();
    expect(restoreTarget("navigate", "0.42", "#terms")).toBe(ANCHORS.terms);
    expect(restoreTarget(undefined, null, "#apply")).toBe(ANCHORS.apply);
  });

  it("does nothing at the top, or for junk", () => {
    expect(restoreTarget("reload", "0", "")).toBeNull();
    expect(restoreTarget("reload", "nope", "")).toBeNull();
    expect(restoreTarget("reload", null, "")).toBeNull();
    expect(restoreTarget("navigate", null, "#model")).toBeNull();
    expect(restoreTarget("reload", "7", "")).toBe(1);
  });
});

/** Runs the head script against a fake browser and reports what it did. */
function runRestoreScript(options: { type?: string; saved?: string | null; hash?: string; reduced?: boolean }) {
  const attributes = new Map<string, string>();
  const timers: (() => void)[] = [];
  const history: { scrollRestoration?: string } = { scrollRestoration: "auto" };
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => attributes.set(k, v),
      removeAttribute: (k: string) => attributes.delete(k),
    },
  };
  const env = {
    document,
    history,
    window: { matchMedia: () => ({ matches: options.reduced ?? false }) },
    performance: { getEntriesByType: () => [{ type: options.type ?? "navigate" }] },
    sessionStorage: { getItem: (key: string) => (key === PROGRESS_STORAGE_KEY ? (options.saved ?? null) : null) },
    location: { hash: options.hash ?? "" },
    setTimeout: (fn: () => void) => timers.push(fn),
  };
  new Function(...Object.keys(env), RESTORE_SCRIPT)(...Object.values(env));
  return { attributes, history, timers };
}

describe("the head script", () => {
  it("takes the scroll restoration over and covers the stage when a place is to be restored", () => {
    const run = runRestoreScript({ type: "reload", saved: "0.5" });
    expect(run.history.scrollRestoration).toBe("manual");
    expect(run.attributes.has("data-restore")).toBe(true);
    run.timers[0]();
    expect(run.attributes.has("data-restore")).toBe(false);
  });

  it("covers the stage for a deep link, but not for the top of the page or the model", () => {
    expect(runRestoreScript({ hash: "#questions" }).attributes.has("data-restore")).toBe(true);
    expect(runRestoreScript({ hash: "#model" }).attributes.has("data-restore")).toBe(false);
    expect(runRestoreScript({}).attributes.has("data-restore")).toBe(false);
    expect(runRestoreScript({ type: "reload", saved: "0" }).attributes.has("data-restore")).toBe(false);
    expect(runRestoreScript({ type: "navigate", saved: "0.5" }).attributes.has("data-restore")).toBe(false);
  });

  it("agrees with restoreTarget", () => {
    const cases = [
      { type: "reload", saved: "0.3", hash: "" },
      { type: "navigate", saved: "0.3", hash: "#work" },
      { type: "navigate", saved: "0.3", hash: "" },
      { type: "back_forward", saved: "x", hash: "#apply" },
      { type: "reload", saved: null, hash: "#nope" },
    ];
    for (const c of cases) {
      const covered = runRestoreScript(c).attributes.has("data-restore");
      expect(covered, JSON.stringify(c)).toBe(restoreTarget(c.type, c.saved, c.hash) !== null);
    }
  });

  it("leaves the browser alone with reduced motion", () => {
    const run = runRestoreScript({ type: "reload", saved: "0.5", reduced: true });
    expect(run.history.scrollRestoration).toBe("auto");
    expect(run.attributes.has("data-restore")).toBe(false);
  });
});
