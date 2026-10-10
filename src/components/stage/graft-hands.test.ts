import { describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { CAMERA, GRAFT, SCENES } from "@/scroll/script";

import { createCameraPath } from "./camera-path";
import { cuttingAt, fruitAt, knotAt, knotScale, leftHandAt, rightHandAt, SEATED_AT, stemBend, STEM_LEAN, twineAt, type HandPose } from "./graft-hands";
import { fromAnchor, newPose, placeOn } from "./motion-kit";

const graft = SCENES.find((s) => s.id === "graft")!;
const path = createCameraPath(CAMERA);
const steps = (a: number, b: number, n = 400) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;

/** World y of the bottom of the frame at a plate's depth, at progress p (the graft's camera looks straight ahead). */
function frameBottom(p: number, depth: number): number {
  const pose = path.seek(p);
  return pose.py - (pose.pz + depth) * Math.tan((pose.fov * Math.PI) / 360);
}

/** Where a point of a hand plate is, at its pose. */
function onHand(id: string, hand: HandPose, uv: readonly [number, number]): [number, number] {
  const e = plateEntry(id);
  return placeOn(newPose(e.position[0] + hand.x, e.position[1] + hand.y, hand.rotate), fromAnchor(id as "graft/hand-left", uv));
}

/** The cut ends of the painted sleeves: where each plate's image edge cuts its sleeve. */
const CUTS = {
  "graft/hand-left": [
    [0.01, 0.83],
    [0.01, 0.99],
    [0.2, 0.99],
  ],
  "graft/hand-right": [
    [0.99, 0.78],
    [0.99, 0.99],
    [0.82, 0.99],
  ],
} as const;

describe("the graft", () => {
  it("starts empty: the hands below the frame, no twine, no knot, no fruit", () => {
    const p = graft.start;
    for (const [id, at] of [
      ["graft/hand-left", leftHandAt],
      ["graft/hand-right", rightHandAt],
    ] as const) {
      // The hand's highest point (its fingers) is under the bottom of the frame.
      const top = onHand(id, at(p), [0.5, 0.2])[1];
      expect(top).toBeLessThan(frameBottom(p, plateEntry(id).depth));
    }
    expect(twineAt(p)).toBe(0);
    expect(knotAt(p)).toEqual([0, 0, 0]);
    expect(fruitAt(p)).toBe(0);
  });

  it("keeps the cut ends of the sleeves below the frame while the hands are in it", () => {
    for (const id of ["graft/hand-left", "graft/hand-right"] as const) {
      const at = id === "graft/hand-left" ? leftHandAt : rightHandAt;
      const depth = plateEntry(id).depth;
      for (const p of steps(graft.start, GRAFT.exit[1], 1200)) {
        const hand = at(p);
        const bottom = frameBottom(p, depth);
        if (onHand(id, hand, [0.5, 0.2])[1] < bottom) continue;
        for (const cut of CUTS[id]) expect(onHand(id, hand, cut)[1], `${id} at ${p.toFixed(4)}`).toBeLessThan(bottom);
        // The elbow (the forearm's root) is under the frame too.
        expect(hand.bones.elbow[1]).toBeLessThan(bottom);
      }
    }
  });

  it("holds the cutting at the left hand's grip until it is seated, then leaves it in the cleft", () => {
    const grip = fromAnchor("graft/cutting", "grip");
    const seat = plateEntry("graft/cutting").position;
    for (const p of steps(GRAFT.enter[0], SEATED_AT - 1e-6, 60)) {
      const c = cuttingAt(p);
      const hand = leftHandAt(p);
      // The cutting's own grip sits exactly on the hand's.
      const at = placeOn(newPose(seat[0] + c.x, seat[1] + c.y, c.rotate), grip);
      expect(at[0]).toBeCloseTo(hand.grip[0], 9);
      expect(at[1]).toBeCloseTo(hand.grip[1], 9);
    }
    // Seated, it only leans with the pulls; the hand has gone to steady the branch.
    const seated = cuttingAt(SEATED_AT);
    const later = cuttingAt(GRAFT.exit[1]);
    expect(later.x).toBeCloseTo(seated.x, 12);
    expect(later.y).toBeCloseTo(seated.y, 12);
    const away = leftHandAt(GRAFT.steady[1]).grip;
    expect(Math.hypot(away[0] - (seat[0] + seated.x), away[1] - (seat[1] + seated.y))).toBeGreaterThan(0.04);
    // Upright once seated.
    expect(seated.rotate).toBeCloseTo(0, 6);
  });

  it("winds the twine turn by turn with the circling hand, then ties the knot in three pulls", () => {
    expect(twineAt(GRAFT.wrap[0])).toBe(0);
    expect(twineAt(mid(GRAFT.wrap))).toBeGreaterThan(0.2);
    expect(twineAt(GRAFT.wrap[1])).toBe(1);
    expect(knotAt(GRAFT.knot[0][1])[0]).toBeCloseTo(1);
    expect(knotAt(GRAFT.knot[1][1])[1]).toBeCloseTo(1);
    expect(knotAt(GRAFT.knot[2][1])).toEqual([0, 0, 1]);
    // The frames swap during the pulls (where the hand moves fastest), never while it rests.
    for (const [i, step] of GRAFT.knot.entries()) {
      const pull = [step[0] + GRAFT.knotBeats.pull[0] * (step[1] - step[0]), step[0] + GRAFT.knotBeats.pull[1] * (step[1] - step[0])];
      expect(knotAt(pull[0])[i]).toBe(0);
      expect(knotAt(pull[1])[i]).toBeCloseTo(1, 9);
    }
  });

  it("closes the fingers on the twine before each pull, and the stem leans with the pull and springs back", () => {
    for (const step of GRAFT.knot) {
      const s = (t: number) => step[0] + t * (step[1] - step[0]);
      const before = rightHandAt(s(GRAFT.knotBeats.grasp[0])).fingers;
      const closed = rightHandAt(s(GRAFT.knotBeats.grasp[1])).fingers;
      // Closing turns the fingers clockwise (toward the palm).
      expect(closed).toBeLessThan(before - 0.05);
      // The hand has hardly moved while the fingers closed (the grip shifts only as they close round the twine): then it pulls.
      const a = rightHandAt(s((GRAFT.knotBeats.grasp[0] + GRAFT.knotBeats.grasp[1]) / 2)).grip;
      const b = rightHandAt(s(GRAFT.knotBeats.grasp[1])).grip;
      const c = rightHandAt(s(GRAFT.knotBeats.pull[1])).grip;
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.25 * Math.hypot(c[0] - b[0], c[1] - b[1]));
      // The stem leans toward the pull at its height, then swings back past upright and settles.
      expect(stemBend(s(GRAFT.knotBeats.pull[1]))).toBeLessThan(-0.9 * STEM_LEAN);
    }
    const after = Array.from({ length: 200 }, (_, i) => stemBend(GRAFT.knot[2][1] + i * 2e-5));
    expect(Math.max(...after)).toBeGreaterThan(0);
    // Ringing down as the hands leave.
    expect(Math.abs(stemBend(GRAFT.exit[1]))).toBeLessThan(0.15 * STEM_LEAN);
    expect(knotScale(GRAFT.exit[1])).toBeCloseTo(1, 2);
  });

  it("lets go and leaves, then the tree fruits", () => {
    for (const [id, at] of [
      ["graft/hand-left", leftHandAt],
      ["graft/hand-right", rightHandAt],
    ] as const) {
      const p = GRAFT.exit[1];
      expect(onHand(id, at(p), [0.5, 0.2])[1]).toBeLessThan(frameBottom(p, plateEntry(id).depth));
    }
    expect(fruitAt(GRAFT.fruit[1])).toBe(1);
  });

  it("is a pure function of progress (the same value both ways)", () => {
    const p = mid(GRAFT.wrap);
    const down = [leftHandAt(p), rightHandAt(p), cuttingAt(p), twineAt(p)].map((v) => JSON.stringify(v));
    leftHandAt(graft.end);
    rightHandAt(graft.start);
    expect([leftHandAt(p), rightHandAt(p), cuttingAt(p), twineAt(p)].map((v) => JSON.stringify(v))).toEqual(down);
  });
});
