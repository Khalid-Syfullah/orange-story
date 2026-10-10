import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SCENES } from "@/scroll/script";
import type { SceneId } from "@/scroll/types";

import { drawnPlates, MANIFEST, plateEntry, platePoint, plateWorldSize, PLATES, preloadPlates, scenePlates, type PlateRole } from "./manifest";

const ROOT = path.resolve(__dirname, "../..");
const SCENE_IDS = SCENES.map((s) => s.id);
const ROLES: readonly PlateRole[] = ["plate", "backdrop", "texture", "sprite"];

/** Width and height from a WebP file header (lossy, lossless or extended). */
function webpSize(file: Buffer): [number, number] | null {
  if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = file.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + file.readUIntLE(24, 3), 1 + file.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = file.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
  }
  if (chunk === "VP8 ") return [file.readUInt16LE(26) & 0x3fff, file.readUInt16LE(28) & 0x3fff];
  return null;
}

const inUnit = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

describe("the art manifest", () => {
  it("has well-formed, unique entries", () => {
    const ids = new Set<string>();
    for (const plate of PLATES) {
      const name = `plate "${plate.id}"`;
      expect(ids.has(plate.id), `${name} appears twice`).toBe(false);
      ids.add(plate.id);
      expect(plate.id, name).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
      expect(plate.scenes.length, `${name} names no scene`).toBeGreaterThan(0);
      expect(plate.id.split("/")[0], `${name} lives in the folder of its first scene`).toBe(plate.scenes[0]);
      for (const scene of plate.scenes) expect(SCENE_IDS, `${name} names an unknown scene "${scene}"`).toContain(scene);
      expect(new Set(plate.scenes).size, `${name} lists a scene twice`).toBe(plate.scenes.length);
      expect(ROLES, name).toContain(plate.role);
      expect(plate.src, name).toBe(`/art/${plate.id}.webp`);
      for (const side of plate.size) {
        expect(Number.isInteger(side) && side > 0 && side <= MANIFEST.maxSize, `${name} size ${plate.size.join("x")}`).toBe(true);
      }
      expect(plate.depth, `${name} stands in front of the picture plane`).toBeGreaterThanOrEqual(0);
      expect(plate.anchor.every(inUnit), `${name} anchor`).toBe(true);
      expect(plate.position.every(Number.isFinite), `${name} position`).toBe(true);
      expect(plate.height, `${name} height`).toBeGreaterThan(0);
      if (plate.rotation) expect(plate.rotation.length === 3 && plate.rotation.every(Number.isFinite), `${name} rotation`).toBe(true);
      if (plate.repeat) expect(plate.repeat.every((r) => r > 0), `${name} repeat`).toBe(true);
      if (plate.repeat && (plate.repeat[0] !== 1 || plate.repeat[1] !== 1)) expect(plate.tile, `${name} repeats but does not tile`).toBe(true);
      if (plate.frame !== undefined) expect(Number.isInteger(plate.frame) && plate.frame >= 0, `${name} frame`).toBe(true);
      for (const [point, at] of Object.entries(plate.points ?? {})) {
        expect(point, `${name} point name`).toMatch(/^[a-z0-9-]+$/);
        expect(at.length === 2 && at.every(inUnit), `${name} point "${point}" lies on the image`).toBe(true);
      }
      expect(plate.note.length, `${name} needs a note`).toBeGreaterThan(0);
      if (plate.placeholder) expect(typeof plate.placeholder.kind, `${name} placeholder kind`).toBe("string");
    }
  });

  it("has a file of the listed size for every entry", () => {
    const problems: string[] = [];
    for (const plate of PLATES) {
      let file: Buffer;
      try {
        file = readFileSync(path.join(ROOT, "public", plate.src));
      } catch {
        problems.push(`${plate.src} is missing (run npm run art:placeholders)`);
        continue;
      }
      const size = webpSize(file);
      if (!size) problems.push(`${plate.src} is not a WebP image`);
      else if (size[0] !== plate.size[0] || size[1] !== plate.size[1]) problems.push(`${plate.src} is ${size.join("x")}, the manifest says ${plate.size.join("x")}`);
    }
    expect(problems).toEqual([]);
  });

  it("lists plates for every scene of docs/ART-PLATES.md", () => {
    const doc = readFileSync(path.join(ROOT, "docs/ART-PLATES.md"), "utf8");
    const rows = [...doc.matchAll(/^\| ([a-z]+) \| (.+) \|$/gm)].map((m) => m[1]).filter((id) => id !== "scene");
    expect(rows.length).toBeGreaterThanOrEqual(13);
    for (const scene of rows) {
      expect(SCENE_IDS, `ART-PLATES.md names an unknown scene "${scene}"`).toContain(scene);
      expect(PLATES.some((p) => p.scenes[0] === scene), `no plate owned by "${scene}"`).toBe(true);
    }
  });

  it("gives every scene something to draw", () => {
    for (const scene of SCENE_IDS) expect(drawnPlates(scene).length, `scene "${scene}" draws nothing`).toBeGreaterThan(0);
  });

  it("draws only placed plates and backdrops, first frame of a set", () => {
    const drawn = drawnPlates("graft").map((p) => p.id);
    expect(drawn).toContain("graft/knot-1");
    expect(drawn).not.toContain("graft/knot-2");
    expect(drawnPlates("ascent").map((p) => p.id)).not.toContain("ascent/stone");
  });

  it("preloads the current scene and the next one only", () => {
    const ids = SCENE_IDS as SceneId[];
    for (let i = 0; i < ids.length; i++) {
      const allowed = new Set([...scenePlates(ids[i]), ...(ids[i + 1] ? scenePlates(ids[i + 1]) : [])].map((p) => p.src));
      const preloaded = preloadPlates(ids, i);
      expect(preloaded.length).toBe(allowed.size);
      for (const plate of preloaded) expect(allowed.has(plate.src)).toBe(true);
    }
  });

  it("sizes plates in world units from the image aspect and repeat", () => {
    const statue = plateEntry("hero/statue");
    expect(plateWorldSize(statue)).toEqual([statue.height / 2, statue.height]);
    const minaret = plateEntry("hero/minaret");
    const [w, h] = plateWorldSize(minaret);
    expect(h).toBe(8);
    expect(w).toBeCloseTo(0.8, 9);
    // Twice as tall with twice the tiles keeps the same width.
    expect(plateWorldSize(minaret, 16, [1, 20])[0]).toBeCloseTo(w, 9);
  });

  it("throws on an unknown plate", () => {
    expect(() => plateEntry("hero/nowhere")).toThrow(/Unknown plate/);
  });

  it("places named points on the plate in the world", () => {
    const row = plateEntry("fall/trees-left-near");
    const [w, h] = plateWorldSize(row);
    for (const [name, [u, v]] of Object.entries(row.points ?? {})) {
      const [x, y, z] = platePoint(row.id, name);
      expect(x).toBeCloseTo(row.position[0] + (u - row.anchor[0]) * w, 9);
      expect(y).toBeCloseTo(row.position[1] + (row.anchor[1] - v) * h, 9);
      expect(z).toBe(-row.depth);
    }
    expect(Object.keys(row.points ?? {}).length).toBeGreaterThan(0);
    expect(() => platePoint(row.id, "nowhere")).toThrow(/has no point/);
  });
});
