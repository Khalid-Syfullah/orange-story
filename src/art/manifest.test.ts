import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HELD as PACKET_HELD } from "@/components/stage/blueprint-plan";
import { BRANCH_FRUIT } from "@/components/stage/fall-plan";
import { CUT_POINT, SPOUT } from "@/components/stage/finale-plan";
import { CAMERA } from "@/scroll/script";
import { poseOf, projectPoint } from "@/components/stage/camera-path";
import { crowdFacing, ORANGE } from "@/components/stage/hero-art";
import { HELD } from "@/components/stage/pluck-harvest";
import { HALF_EDGE } from "@/components/stage/share-cut";
import { SCENES } from "@/scroll/script";
import type { SceneId } from "@/scroll/types";

import { rigFigures, rigProblems } from "@/components/stage/rig";

import { drawnPlates, MANIFEST, plateEntry, platePaint, platePoint, plateWorldSize, PLATES, preloadPlates, rigMoves, scenePlates, type PlateRole } from "./manifest";

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
      // Every file comes from somewhere: the generator (a placeholder spec) or a painting (painted).
      expect(Boolean(plate.placeholder) !== Boolean(plate.painted), `${name} has a placeholder spec or is painted, not both`).toBe(true);
      expect(rigProblems(plate.rig), `${name} rig`).toEqual([]);
      for (const key of Object.keys(plate.paint ?? {})) expect(["figure", "grain", "craquelure", "halftone", "contact", "life", "cell"], `${name} paint.${key}`).toContain(key);
      if (plate.paint?.halftone) expect(["cloud", "water"], `${name} paint.halftone`).toContain(plate.paint.halftone);
      if (plate.paint?.contact !== undefined) expect(plate.paint.contact > 0 && plate.paint.figure, `${name} contact is for a standing figure`).toBe(true);
      if (plate.paint?.cell !== undefined) expect(plate.paint.cell > 0 && Boolean(plate.paint.halftone), `${name} cell is for the halftone layer`).toBe(true);
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

  it("takes the places on painted figures from their points, where the story had them", () => {
    // Where the figures hold things at the world scale (phase 24), read from the art: the places the
    // scenes were tuned on, moved with their figures to life size.
    expect(HELD[0]).toBeCloseTo(2.5924, 3);
    expect(HELD[1]).toBeCloseTo(4.3125, 3);
    expect(PACKET_HELD[0]).toBeCloseTo(1.05, 5);
    expect(PACKET_HELD[1]).toBeCloseTo(-0.18, 5);
    expect(CUT_POINT[0]).toBeCloseTo(0.7542, 3);
    expect(CUT_POINT[1]).toBeCloseTo(5.215, 3);
    expect(BRANCH_FRUIT.x).toBeCloseTo(0.4813, 3);
    expect(BRANCH_FRUIT.y).toBeCloseTo(1.0518, 3);
    expect(HALF_EDGE.left).toBeCloseTo(0.12, 9);
    expect(HALF_EDGE.right).toBeCloseTo(0.12, 9);
    // The orange stands in the statue's hand, the water hangs from the jug's spout, the blade tip is the knife plate's pivot.
    expect(ORANGE[0]).toBeCloseTo(plateEntry("hero/statue-orange").position[0], 5);
    expect(ORANGE[1]).toBeCloseTo(plateEntry("hero/statue-orange").position[1], 5);
    for (const id of ["finale/water-1", "finale/water-2", "finale/water-3"]) {
      expect(SPOUT[0]).toBeCloseTo(plateEntry(id).position[0], 5);
      expect(SPOUT[1]).toBeCloseTo(plateEntry(id).position[1], 5);
    }
    expect(plateEntry("share/knife-hand").points?.["knife-tip"]).toEqual(plateEntry("share/knife-hand").anchor);
    // Both frames of a set agree, and each cut face matches its peel.
    expect(plateEntry("finale/man-arms-2").points).toEqual(plateEntry("finale/man-arms-1").points);
    expect(plateEntry("prune/gardener-arms-2").points).toEqual(plateEntry("prune/gardener-arms-1").points);
    expect(plateEntry("share/arm-open").points).toEqual(plateEntry("pluck/harvester-arm").points);
    expect(plateEntry("share/face-left").points).toEqual(plateEntry("share/peel-left").points);
    expect(plateEntry("share/face-right").points).toEqual(plateEntry("share/peel-right").points);
  });

  it("paints the canvas on stand-ins and backdrops, never over a finished painting", () => {
    for (const plate of PLATES) {
      const paint = platePaint(plate);
      if (plate.painted) {
        expect(paint.grain, `${plate.id} is painted: no grain of the stage's`).toBe(false);
        expect(paint.craquelure, `${plate.id} is painted: it carries its own craquelure`).toBe(plate.paint?.craquelure ?? 0);
      }
      if (paint.halftone) expect(paint.grain || paint.craquelure > 0, `${plate.id} is the graphic layer, not canvas`).toBe(false);
    }
    expect(platePaint(plateEntry("hero/sky")).grain).toBe(plateEntry("hero/sky").painted !== true);
    // The shared canvas: one small tileable data texture each, for every scene.
    for (const id of ["hero/canvas-grain", "hero/craquelure"]) {
      const entry = plateEntry(id);
      expect(entry.role).toBe("texture");
      expect(entry.tile && entry.linear, `${id} tiles and is data`).toBe(true);
      expect(entry.scenes.length).toBe(SCENE_IDS.length);
      expect(Math.max(...entry.size)).toBeLessThanOrEqual(512);
    }
  });

  it("draws the clouds and the water as halftone", () => {
    for (const id of ["work/cloud-1", "work/cloud-6", "finale/cloud-1", "stars/cloud"]) expect(platePaint(plateEntry(id)).halftone, id).toBe("cloud");
    for (const id of ["finale/water-1", "finale/water-2", "finale/water-3"]) expect(platePaint(plateEntry(id)).halftone, id).toBe("water");
  });

  it("gives every living figure a rig, and every standing figure its feet", () => {
    // The bodies the scenes bring to life, and the crowds (one person per head).
    const bodies = ["pluck/harvester-body", "work/builder", "blueprint/builder", "blueprint/architect", "site/builder-left", "site/builder-right", "site/builder-seated", "prune/gardener", "stars/astronomer", "finale/woman-body", "finale/man-body"];
    for (const id of bodies) {
      const entry = plateEntry(id);
      expect(platePaint(entry).figure, `${id} is a figure`).toBe(true);
      expect(rigMoves(entry.rig), `${id} has a rig that moves`).toBe(true);
      expect(platePaint(entry).life, `${id} lives`).toBe(true);
    }
    for (const id of ["hero/crowd-far", "hero/crowd-mid", "hero/crowd-near"]) expect(rigFigures(plateEntry(id).rig).length, `${id} people`).toBeGreaterThanOrEqual(2);
    // The marble statue keeps still; the parts carry their joint.
    expect(platePaint(plateEntry("hero/statue")).life).toBe(false);
    for (const id of ["pluck/harvester-head", "pluck/harvester-arm", "share/arm-open", "prune/gardener-arms-1", "prune/gardener-arms-2", "finale/woman-arm", "finale/man-arms-1", "finale/man-arms-2"]) expect(plateEntry(id).rig?.pivot, `${id} pivot`).toBeDefined();
    for (const plate of PLATES) if ((plate.paint?.contact ?? 0) > 0) expect(rigFigures(plate.rig)[0]?.pivot, `${plate.id} stands on its feet`).toBeDefined();
    expect(plateEntry("hero/contact-shadow").role).toBe("sprite");
  });

  it("turns every onlooker in the hero's frame toward the statue, as the camera sees them", () => {
    // In front of her, nearer the camera, the onlookers stand where the frame wants them: what matters
    // is that each one in the frame turns the way she is on screen.
    const pose = poseOf(CAMERA[0]);
    const statue = plateEntry("hero/statue");
    const statueX = projectPoint(pose, [statue.position[0], statue.position[1], -statue.depth], 1440, 900).x;
    let seen = 0;
    for (const id of ["hero/crowd-far", "hero/crowd-mid", "hero/crowd-near"] as const) {
      const entry = plateEntry(id);
      const [w] = plateWorldSize(entry);
      const facing = crowdFacing(id);
      rigFigures(entry.rig).forEach((person, i) => {
        if (!person.head) return;
        const u = (person.head[0] + person.head[2]) / 2;
        const head = projectPoint(pose, [entry.position[0] + (u - entry.anchor[0]) * w, entry.position[1], -entry.depth], 1440, 900);
        if (head.x < 0 || head.x > 1440) return;
        seen++;
        expect(facing[i], `${id} person ${i + 1}`).toBe(Math.sign(statueX - head.x));
      });
    }
    expect(seen).toBeGreaterThanOrEqual(3);
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
