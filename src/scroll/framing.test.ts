import { afterEach, describe, expect, it } from "vitest";

import { PLATES, plateEntry, WORLD_SCALE } from "@/art/manifest";
import { createCameraPath, projectPoint, setStageAspect } from "@/components/stage/camera-path";

import { FIGURE_SPANS, WORLD_SCALE as IMPORTER_SCALE } from "../../scripts/art/world-scale.mjs";
import { DESKTOP, FRAMING, PHONE, plateBox, shot, type Framing, type WorldBox } from "./framing";
import { CAMERA, FRAMED } from "./script";

/** A box's screen rectangle (px) filmed from the path at p on a stage. */
function onStage(box: WorldBox, p: number, stage: { width: number; height: number }) {
  setStageAspect(stage.width / stage.height);
  const path = createCameraPath(CAMERA);
  const pose = path.seek(p);
  const a = projectPoint(pose, [box.x0, box.y1, box.z], stage.width, stage.height);
  const b = projectPoint(pose, [box.x1, box.y0, box.z], stage.width, stage.height);
  path.kill();
  return { left: a.x, top: a.y, right: b.x, bottom: b.y, depth: Math.min(a.depth, b.depth) };
}

describe("the framing", () => {
  afterEach(() => setStageAspect(0));

  it("puts a subject at its share of the stage and its place", () => {
    const box: WorldBox = { x0: 1, x1: 2, y0: 0, y1: 2, z: -1 };
    const s = shot({ box, height: 0.5, at: [0.25, 0.4], fov: 35 });
    const pose = { px: s.position[0], py: s.position[1], pz: s.position[2], tx: s.target[0], ty: s.target[1], tz: s.target[2], fov: s.fov };
    const top = projectPoint(pose, [1.5, 2, -1], DESKTOP.width, DESKTOP.height);
    const bottom = projectPoint(pose, [1.5, 0, -1], DESKTOP.width, DESKTOP.height);
    expect((bottom.y - top.y) / DESKTOP.height).toBeCloseTo(0.5, 6);
    expect(top.x / DESKTOP.width).toBeCloseTo(0.25, 6);
    expect((top.y + bottom.y) / 2 / DESKTOP.height).toBeCloseTo(0.4, 6);
  });

  it("meets every target of the framing table at its key, on a laptop and on a phone", () => {
    expect(FRAMED.length).toBe(Object.keys(FRAMING).length);
    for (const { framing, at } of FRAMED) {
      const row: Framing = FRAMING[framing];
      for (const [stage, placement] of [
        [DESKTOP, row.desktop],
        [PHONE, row.phone],
      ] as const) {
        if (!placement) continue;
        const r = onStage(row.box(), at, stage);
        expect(r.depth, `${framing} in front of the camera`).toBeGreaterThan(0.1);
        const value = row.measure === "width" ? (r.right - r.left) / stage.width : row.measure === "top" ? r.top / stage.height : (r.bottom - r.top) / stage.height;
        const where = `${framing} on ${stage === DESKTOP ? "a laptop" : "a phone"}: ${value.toFixed(3)}`;
        expect(value, where).toBeGreaterThanOrEqual(placement.range[0] - 0.005);
        expect(value, where).toBeLessThanOrEqual(placement.range[1] + 0.005);
      }
    }
  });

  it("keeps the onlookers' heads along the bottom, cropped by its edge, right of the hero's words", () => {
    const at = FRAMED.find((f) => f.framing === "onlookers")!.at;
    const r = onStage(FRAMING.onlookers.box(), at, DESKTOP);
    expect(r.bottom).toBeGreaterThan(DESKTOP.height);
    for (const id of ["hero/crowd-near", "hero/crowd-mid", "hero/crowd-far"]) {
      const head = onStage(plateBox(id, [0, 0, 0.3, 0.2]), at, DESKTOP);
      // The people in the frame stand right of the bottom-left words.
      if (head.right > 0 && head.left < DESKTOP.width) expect(head.right / DESKTOP.width, id).toBeGreaterThan(0.6);
    }
  });
});

describe("the world scale", () => {
  it("is the same for the stage and the importer", () => {
    expect(IMPORTER_SCALE).toEqual(WORLD_SCALE);
  });

  it("sizes every figure plate by its visible painting", () => {
    const spans = FIGURE_SPANS as Record<string, { span?: number; sameAs?: string }>;
    for (const entry of PLATES.filter((p) => p.paint?.figure)) {
      const rule = spans[entry.id];
      expect(rule, `${entry.id} has a span in scripts/art/world-scale.mjs`).toBeDefined();
      expect(entry.box, `${entry.id} has its visible box`).toBeDefined();
      const [, top, , bottom] = entry.box!;
      if (rule.span) expect(Math.abs(entry.height * (bottom - top) - rule.span) / rule.span, entry.id).toBeLessThan(0.01);
      if (rule.sameAs) expect(entry.height, entry.id).toBe(plateEntry(rule.sameAs).height);
    }
  });

  it("makes a standing adult 1.75 tall and a head 0.23", () => {
    // The keepers stand crown to soles in their boxes; the harvester's head is crown to chin.
    for (const id of ["finale/woman-body", "finale/man-body"]) expect(plateBox(id).y1 - plateBox(id).y0).toBeCloseTo(WORLD_SCALE.adult, 1);
    const head = plateBox("pluck/harvester-head");
    expect(head.y1 - head.y0).toBeCloseTo(WORLD_SCALE.head, 1);
  });
});
