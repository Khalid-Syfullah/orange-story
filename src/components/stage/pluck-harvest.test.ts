import { describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { CAMERA, PLUCK, SCENES } from "@/scroll/script";

import { carryAt, foliageAt, handAt, harvesterAt, heroOrangeAt, HELD, HELD_SCALE, HERO_SCALE } from "./pluck-harvest";

const pluck = SCENES.find((s) => s.id === "pluck")!;

describe("the pluck", () => {
  it("starts where the graft ended: the hand below the frame, the orange on its branch, no harvester", () => {
    const p = pluck.start;
    const hand = handAt(p);
    const hand0 = plateEntry("pluck/hand");
    // The hand's fingertips are below the bottom of the first camera frame.
    const bottom = CAMERA.find((k) => k.scene === "pluck")!.target[1] - 4;
    expect(hand0.position[1] + hand.y).toBeLessThan(bottom);
    const orange = heroOrangeAt(p);
    expect(orange.x).toBeCloseTo(0);
    expect(orange.y).toBeCloseTo(0);
    expect(orange).toMatchObject({ scale: HERO_SCALE, opacity: 1 });
    expect(harvesterAt(p).opacity).toBe(0);
    expect(foliageAt(p)).toEqual({ near: { opacity: 1, scale: 1 }, mid: { opacity: 1 } });
  });

  it("rises to the orange and closes on it before the camera moves", () => {
    const risen = handAt(PLUCK.grasp[0]);
    expect(risen.y).toBeGreaterThan(-0.3);
    expect(risen.scaleX).toBeCloseTo(1);
    const closed = handAt(PLUCK.grasp[1]);
    expect(closed.scaleX).toBeLessThan(0.9);
    // Nothing is carried yet.
    expect(heroOrangeAt(PLUCK.tug[0] - 1e-6).y).toBeCloseTo(0);
    expect(carryAt(PLUCK.dolly[0])).toBe(0);
  });

  it("carries the fruit down with the camera and ends with it in the harvester's hand", () => {
    const end = heroOrangeAt(PLUCK.dolly[1]);
    const rest = plateEntry("pluck/hero-orange");
    expect(rest.position[0] + end.x).toBeCloseTo(HELD[0], 1);
    expect(rest.position[1] + end.y).toBeCloseTo(HELD[1], 0);
    expect(end.scale).toBeCloseTo(HELD_SCALE);
    // The camera key at the end of the dolly frames that spot.
    const key = CAMERA.find((k) => k.scene === "pluck" && k.at === PLUCK.dolly[1])!;
    expect(Math.abs(key.target[1] - HELD[1])).toBeLessThan(1);
  });

  it("pulls the fruit free with a tug, then lets go and hands over to the harvester", () => {
    const mid = (PLUCK.tug[0] + PLUCK.tug[1]) / 2;
    expect(heroOrangeAt(mid).y).toBeLessThan(heroOrangeAt(PLUCK.tug[0]).y);
    const gone = handAt(PLUCK.release[1]);
    expect(gone.opacity).toBe(0);
    expect(heroOrangeAt(PLUCK.handoff[1]).opacity).toBe(0);
    expect(harvesterAt(PLUCK.reveal[1]).opacity).toBe(1);
    expect(harvesterAt(PLUCK.reveal[1]).rise).toBeCloseTo(0);
    expect(harvesterAt(PLUCK.handoff[0]).arm).toBe(0);
    expect(harvesterAt(PLUCK.handoff[1]).arm).toBe(1);
    expect(foliageAt(PLUCK.foliage.mid[1]).mid.opacity).toBe(0);
    expect(foliageAt(PLUCK.foliage.near[1]).near.opacity).toBe(0);
  });

  it("is a pure function of progress (the same value both ways)", () => {
    const a = pluck.start + 0.3 * (pluck.end - pluck.start);
    const forward = [handAt(a), heroOrangeAt(a), harvesterAt(a)];
    handAt(pluck.end);
    handAt(pluck.start);
    expect([handAt(a), heroOrangeAt(a), harvesterAt(a)]).toEqual(forward);
  });

  it("keeps its timings inside the scene, in order", () => {
    const inside = (r: readonly [number, number]) => r[0] >= pluck.start && r[1] <= pluck.end && r[0] < r[1];
    for (const r of [PLUCK.rise, PLUCK.grasp, PLUCK.tug, PLUCK.dolly, PLUCK.foliage.near, PLUCK.foliage.mid, PLUCK.reveal, PLUCK.release, PLUCK.handoff]) expect(inside(r)).toBe(true);
    expect(PLUCK.rise[1]).toBeLessThanOrEqual(PLUCK.dolly[0]);
    // The fruit has all but reached the harvester's hand when his arm arrives.
    expect(carryAt(PLUCK.handoff[0])).toBeGreaterThan(0.97);
  });
});
