import { describe, expect, it } from "vitest";

import { plateEntry, plateWorldSize } from "@/art/manifest";

import { FigureLife } from "./figure-life";
import { SPOUT } from "./finale-plan";
import { rigFigures } from "./rig";

/** The world point of a plate's fractions (a facing plate at its manifest place). */
function world(id: string, [u, v]: readonly [number, number]): [number, number] {
  const e = plateEntry(id);
  const [w, h] = plateWorldSize(e);
  return [e.position[0] + (u - e.anchor[0]) * w, e.position[1] + (e.anchor[1] - v) * h];
}

const SWAY = 0.02;

describe("a figure's life", () => {
  it("keeps still with no life and no acting", () => {
    const life = new FigureLife(plateEntry("finale/woman-body"), [{ id: "finale/woman-arm" }]);
    life.step(0.95, 12, 0, () => {});
    expect(life.ride("finale/woman-arm")).toEqual({ x: 0, y: 0, rotate: 0 });
    for (const s of life.samples) expect(Math.abs(s.breath) + Math.abs(s.head) + Math.abs(s.sway)).toBeCloseTo(0, 12);
  });

  it("carries a part on its body: a weight shift turns the joint about the feet", () => {
    const body = plateEntry("finale/woman-body");
    const arm = plateEntry("finale/woman-arm");
    const life = new FigureLife(body, [{ id: arm.id }]);
    life.step(0.95, 0, 0, (_p, _t, _i, out) => {
      out.sway = SWAY;
    });
    const feet = world(body.id, rigFigures(body.rig)[0].pivot);
    const joint = world(arm.id, arm.rig?.pivot ?? arm.anchor);
    const dx = joint[0] - feet[0];
    const dy = joint[1] - feet[1];
    const ride = life.ride(arm.id);
    expect(ride.x).toBeCloseTo(Math.cos(SWAY) * dx - Math.sin(SWAY) * dy - dx, 9);
    expect(ride.y).toBeCloseTo(Math.sin(SWAY) * dx + Math.cos(SWAY) * dy - dy, 9);
    expect(ride.rotate).toBeCloseTo(SWAY, 12);
  });

  it("holds things on a part: the stream hangs from the jug however the arm turns", () => {
    const tip = 0.1;
    const arm = plateEntry("finale/woman-arm");
    const life = new FigureLife(plateEntry("finale/woman-body"), [{ id: arm.id }], [{ at: SPOUT, on: arm.id, turn: () => tip }]);
    life.step(0.95, 0, 0, () => {});
    const joint = world(arm.id, arm.rig?.pivot ?? arm.anchor);
    const dx = SPOUT[0] - joint[0];
    const dy = SPOUT[1] - joint[1];
    const held = life.held(0);
    expect(held.x).toBeCloseTo(Math.cos(tip) * dx - Math.sin(tip) * dy - dx, 9);
    expect(held.y).toBeCloseTo(Math.sin(tip) * dx + Math.cos(tip) * dy - dy, 9);
  });

  it("gives each person on a shared plate a life of their own", () => {
    const crowd = new FigureLife(plateEntry("hero/crowd-near"));
    crowd.step(0, 7.3, 1, () => {});
    const heads = crowd.samples.map((s) => s.head);
    expect(heads.length).toBeGreaterThan(1);
    expect(new Set(heads.map((h) => h.toFixed(5))).size).toBe(heads.length);
  });
});
