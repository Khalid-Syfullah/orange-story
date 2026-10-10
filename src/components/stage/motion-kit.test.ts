import { describe, expect, it } from "vitest";

import { plateEntry } from "@/art/manifest";
import { PHYSICS, SCREEN } from "@/scroll/script";

import {
  arcPoint,
  ballistic,
  beat,
  BLOW_PHASES,
  blows,
  dampedKick,
  dampedRelease,
  fromAnchor,
  glide,
  holdAt,
  newPose,
  perSecond,
  placeOn,
  poseThrough,
  smoother,
  solveArm,
  springStep,
  storyTime,
  strike,
  track,
  velocityJumps,
  type Limb,
  type Spring,
  type Throw,
} from "./motion-kit";

/** Speed of f at p, by a central difference. */
const speed = (f: (p: number) => number, p: number, h = 1e-7) => (f(p + h) - f(p - h)) / (2 * h);

/** Samples of [a, b], n + 1 of them. */
const steps = (a: number, b: number, n = 400) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

describe("story time", () => {
  it("runs PHYSICS.secondsPerScreen per screen of scrolling, and converts speeds", () => {
    expect(storyTime(0.5 + SCREEN, 0.5)).toBeCloseTo(PHYSICS.secondsPerScreen, 9);
    expect(storyTime(0.5 - SCREEN, 0.5)).toBeCloseTo(-PHYSICS.secondsPerScreen, 9);
    // One unit per screen of scrolling is 1 / secondsPerScreen units per second.
    expect(perSecond(1 / SCREEN)).toBeCloseTo(1 / PHYSICS.secondsPerScreen, 9);
  });
});

describe("curves with weight", () => {
  it("glides from rest to rest, with no jump in speed at either end", () => {
    expect(smoother(0)).toBe(0);
    expect(smoother(1)).toBe(1);
    expect(smoother(0.5)).toBeCloseTo(0.5, 12);
    expect(speed(smoother, 1e-6)).toBeCloseTo(0, 4);
    expect(speed(smoother, 1 - 1e-6)).toBeCloseTo(0, 4);
    expect(glide(0.15, [0.1, 0.2])).toBeCloseTo(0.5, 12);
    expect(velocityJumps((p) => glide(p, [0.3, 0.32]), 0.25, 0.4)).toEqual([]);
  });

  it("passes every key of a track, starts and ends at rest and holds beyond its ends", () => {
    const t = track([
      [0.1, 0],
      [0.2, 1],
      [0.3, 0.4],
      [0.5, 2],
    ]);
    expect(t(0.1)).toBe(0);
    expect(t(0.2)).toBeCloseTo(1, 12);
    expect(t(0.3)).toBeCloseTo(0.4, 12);
    expect(t(0.5)).toBe(2);
    expect(t(0)).toBe(0);
    expect(t(0.9)).toBe(2);
    expect(t.velocity(0.1)).toBe(0);
    expect(t.velocity(0.5)).toBe(0);
    // At a turning point it comes to rest; elsewhere the speed matches on both sides of a key.
    expect(t.velocity(0.2)).toBeCloseTo(0, 9);
    expect(velocityJumps(t, 0, 0.6)).toEqual([]);
    // Its velocity is the derivative of its value.
    for (const p of steps(0.11, 0.49, 37)) expect(t.velocity(p)).toBeCloseTo(speed(t, p), 3);
  });

  it("never overshoots a key where the value runs on, and keeps a given speed", () => {
    const t = track([
      [0, 0],
      [0.1, 0.2],
      [0.2, 1],
    ]);
    for (const p of steps(0, 0.2)) expect(t(p)).toBeGreaterThanOrEqual(-1e-12);
    for (const p of steps(0, 0.2)) expect(t(p)).toBeLessThanOrEqual(1 + 1e-12);
    const fast = track([
      [0, 0],
      [0.1, 0.5, 12],
      [0.2, 1],
    ]);
    expect(fast.velocity(0.1)).toBeCloseTo(12, 9);
  });

  it("merges keys repeated where one beat ends as the next begins, and refuses two values at one place", () => {
    const t = track([...beat([0, 0.1], 0, 1), ...beat([0.1, 0.2], 1, 0.5)]);
    expect(t.keys.length).toBe(3);
    expect(() =>
      track([
        [0, 0],
        [0, 1],
      ]),
    ).toThrow(/two values/);
  });

  it("winds up against the move first, then overshoots and settles back, with no jump in speed", () => {
    const keys = beat([0.2, 0.3], 0, 1, { anticipate: 0.1, overshoot: 0.08 });
    const t = track(keys);
    const values = steps(0.2, 0.3, 1000).map(t);
    expect(Math.min(...values)).toBeCloseTo(-0.1, 6);
    expect(Math.max(...values)).toBeCloseTo(1.08, 6);
    expect(t(0.3)).toBe(1);
    expect(velocityJumps(t, 0.15, 0.35)).toEqual([]);
  });

  it("strikes faster and faster, stops hard at the contact without a jump in speed, recoils and settles", () => {
    const t = track(strike([0.1, 0.2], 0, -1, { stop: 0.1, recoil: 0.15, settle: 0.05 }));
    // Speeding up all the way to the contact...
    const before = steps(0.1, 0.19, 50).map((p) => Math.abs(t.velocity(p)));
    for (let i = 1; i < before.length; i++) expect(before[i]).toBeGreaterThanOrEqual(before[i - 1] - 1e-9);
    // ...at twice the average speed, stopped within the last tenth of the swing.
    expect(Math.abs(t.velocity(0.19))).toBeCloseTo(20, 6);
    expect(t(0.2)).toBeCloseTo(-1, 12);
    expect(t.velocity(0.2)).toBeCloseTo(0, 9);
    // The recoil comes back 15% of the swing, then it settles.
    expect(Math.max(...steps(0.2, 0.25, 200).map(t))).toBeCloseTo(-0.85, 6);
    expect(t(0.25)).toBeCloseTo(-1, 12);
    expect(velocityJumps(t, 0.05, 0.3)).toEqual([]);
  });

  it("strikes a run of blows: each winds up, strikes, recoils and lifts back to rest, with no jump in speed", () => {
    const t = blows([0, 1], 3, { windUp: 0.1, hit: -0.2, recoil: 0.1 });
    const third = 1 / 3;
    for (let i = 0; i < 3; i++) {
      const c = i * third;
      expect(t(c)).toBeCloseTo(0, 12);
      expect(t(c + BLOW_PHASES.windUp * third)).toBeCloseTo(0.1, 12);
      expect(t(c + (BLOW_PHASES.windUp + BLOW_PHASES.swing) * third)).toBeCloseTo(-0.2, 12);
    }
    expect(t(1)).toBeCloseTo(0, 12);
    // The swing is far quicker than the wind-up.
    const windUp = Math.max(...steps(0, BLOW_PHASES.windUp * third, 100).map((p) => Math.abs(t.velocity(p))));
    const swing = Math.max(...steps(BLOW_PHASES.windUp * third, (BLOW_PHASES.windUp + BLOW_PHASES.swing) * third, 100).map((p) => Math.abs(t.velocity(p))));
    expect(swing).toBeGreaterThan(3 * windUp);
    expect(velocityJumps(t, -0.1, 1.1)).toEqual([]);
  });
});

describe("arcs and bones", () => {
  it("bows an arc to the side asked, through both ends", () => {
    const a = [0, 0] as const;
    const b = [1, 0] as const;
    expect(arcPoint(a, b, 0.2, 0)).toEqual([0, 0]);
    expect(arcPoint(a, b, 0.2, 1)).toEqual([1, 0]);
    // Its middle is a fifth of the chord off it, to the left of a to b (up), or to the right.
    expect(arcPoint(a, b, 0.2, 0.5)[1]).toBeCloseTo(0.2, 12);
    expect(arcPoint(a, b, -0.2, 0.5)[1]).toBeCloseTo(-0.2, 12);
  });

  const arm: Limb = { shoulder: [0, 0], upper: 0.3, fore: 0.25, bend: -1 };

  it("reaches a target with the hand, the elbow on the bend side, both bones their own length", () => {
    const pose = solveArm(arm, [0.35, 0.2]);
    expect(pose.hand[0]).toBeCloseTo(0.35, 9);
    expect(pose.hand[1]).toBeCloseTo(0.2, 9);
    expect(Math.hypot(pose.elbow[0], pose.elbow[1])).toBeCloseTo(0.3, 9);
    expect(Math.hypot(pose.hand[0] - pose.elbow[0], pose.hand[1] - pose.elbow[1])).toBeCloseTo(0.25, 9);
    // Bending to the right of the shoulder-to-hand line: the elbow is below it here.
    const cross = 0.35 * pose.elbow[1] - 0.2 * pose.elbow[0];
    expect(cross).toBeLessThan(0);
    expect(solveArm({ ...arm, bend: 1 }, [0.35, 0.2]).elbow[1]).toBeGreaterThan(pose.elbow[1]);
  });

  it("stops short of a locked elbow, softly, for a target out of reach", () => {
    const far = solveArm(arm, [2, 0]);
    expect(far.reach).toBeLessThan(1);
    expect(far.reach).toBeGreaterThan(0.98);
    expect(far.hand[1]).toBeCloseTo(0, 9);
    // Smooth as a target is pulled out past the reach: the elbow never snaps.
    const elbowX = (d: number) => solveArm(arm, [d, 0]).elbow[0];
    expect(velocityJumps(elbowX, 0.3, 0.7, { step: 1e-4 })).toEqual([]);
  });

  it("swings the forearm about the elbow as the hand moves along an arc", () => {
    const a = [0.4, 0.1] as const;
    const b = [0.3, 0.3] as const;
    const fore = (s: number) => solveArm(arm, arcPoint(a, b, 0.15, s)).fore;
    expect(velocityJumps(fore, 0, 1, { step: 1e-4 })).toEqual([]);
    expect(Math.abs(fore(1) - fore(0))).toBeGreaterThan(0.1);
  });
});

describe("attachment", () => {
  it("places a point of a plate and finds the pose that puts a point where asked", () => {
    const pose = newPose(1, 2, Math.PI / 2, 2);
    const at = placeOn(pose, [0.5, 0]);
    expect(at[0]).toBeCloseTo(1, 12);
    expect(at[1]).toBeCloseTo(3, 12);
    const back = poseThrough(at, [0.5, 0], Math.PI / 2, 2);
    expect(back.x).toBeCloseTo(1, 12);
    expect(back.y).toBeCloseTo(2, 12);
  });

  it("keeps a held thing's grip on the hand's grip, however the hand moves and turns", () => {
    const handGrip = [0.12, 0.05] as const;
    const itemGrip = [-0.03, 0.02] as const;
    for (const [x, y, r] of [
      [0, 0, 0],
      [0.4, -0.2, 0.7],
      [-1, 3, -2.1],
    ]) {
      const hand = newPose(x, y, r);
      const item = holdAt(hand, handGrip, itemGrip, { turn: 0.3 });
      const a = placeOn(hand, handGrip);
      const b = placeOn(item, itemGrip);
      expect(b[0]).toBeCloseTo(a[0], 12);
      expect(b[1]).toBeCloseTo(a[1], 12);
      expect(item.rotate).toBeCloseTo(r + 0.3, 12);
    }
  });

  it("reads a plate's points from the manifest, from its anchor", () => {
    const e = plateEntry("graft/hand-left");
    // The grip is the hand plate's anchor.
    expect(fromAnchor("graft/hand-left", "grip")).toEqual([0, 0]);
    const corner = fromAnchor("graft/hand-left", [1, 1]);
    expect(corner[0]).toBeCloseTo((1 - e.anchor[0]) * e.height, 9);
    expect(corner[1]).toBeCloseTo((e.anchor[1] - 1) * e.height, 9);
    expect(() => fromAnchor("graft/hand-left", "nowhere")).toThrow(/has no point/);
  });
});

describe("ballistics", () => {
  const toss: Throw = { from: [0, 1], velocity: [0.5, 1.2], gravity: 9.81, drag: 0, spin: 3 };

  it("flies a parabola from the release: the hand's speed, then gravity", () => {
    const t = 0.3;
    const at = ballistic(toss, t);
    expect(at.x).toBeCloseTo(0.5 * t, 9);
    expect(at.y).toBeCloseTo(1 + 1.2 * t - 0.5 * 9.81 * t * t, 9);
    expect(at.vy).toBeCloseTo(1.2 - 9.81 * t, 9);
    expect(at.rotate).toBeCloseTo(3 * t, 9);
    // Before the release it is still in the hand.
    expect(ballistic(toss, -0.2)).toMatchObject({ x: 0, y: 1, rotate: 0 });
  });

  it("is slowed by the air: drag shortens the throw and slows the spin", () => {
    const free = ballistic(toss, 0.6);
    const air = ballistic({ ...toss, drag: 0.8 }, 0.6);
    expect(air.x).toBeLessThan(free.x);
    expect(Math.abs(air.vx)).toBeLessThan(Math.abs(free.vx));
    expect(air.rotate).toBeLessThan(free.rotate);
  });

  it("lands, bounces a little and settles on the floor, with no jump in speed", () => {
    const drop: Throw = { from: [0, 1], velocity: [0.4, 0], gravity: 9.81, drag: 0.2, spin: 2, floor: 0, bounce: 0.35, contact: 0.05 };
    const y = (t: number) => ballistic(drop, t).y;
    const x = (t: number) => ballistic(drop, t).x;
    for (const t of steps(0, 3, 600)) expect(y(t)).toBeGreaterThan(-0.05);
    const end = ballistic(drop, 3);
    expect(end.y).toBeCloseTo(0, 4);
    expect(end.resting).toBe(true);
    // It came back up after the first contact.
    const landing = Math.sqrt(2 / 9.81);
    expect(Math.max(...steps(landing + 0.06, landing + 0.4, 200).map(y))).toBeGreaterThan(0.01);
    expect(velocityJumps(y, 0, 2, { step: 1e-4 })).toEqual([]);
    expect(velocityJumps(x, 0, 2, { step: 1e-4 })).toEqual([]);
    // It squashes at a contact and not in the air.
    expect(ballistic(drop, 0.2).squash).toBe(0);
    expect(Math.max(...steps(landing, landing + 0.05, 50).map((t) => ballistic(drop, t).squash))).toBeGreaterThan(0.5);
  });

  it("is a function of time alone: scrubbed back, it flies back up into the hand", () => {
    const drop: Throw = { from: [0, 1], velocity: [0.4, 0.5], floor: 0 };
    const down = steps(0, 2, 300).map((t) => ({ ...ballistic(drop, t) }));
    const up = steps(0, 2, 300)
      .reverse()
      .map((t) => ({ ...ballistic(drop, t) }))
      .reverse();
    expect(up).toEqual(down);
  });
});

describe("secondary motion", () => {
  const ring = { frequency: 2.5, decay: 3 };

  it("lets a bent spring go from rest: it swings through rest, overshoots and rings out", () => {
    expect(dampedRelease(0.2, -1, ring)).toBe(0.2);
    expect(dampedRelease(0.2, 0, ring)).toBeCloseTo(0.2, 12);
    const f = (t: number) => dampedRelease(0.2, t, ring);
    expect(Math.min(...steps(0, 1, 400).map(f))).toBeLessThan(-0.02);
    expect(Math.abs(f(3))).toBeLessThan(1e-4);
    expect(velocityJumps(f, -0.5, 2, { step: 1e-4 })).toEqual([]);
  });

  it("kicks from rest without a jump in speed, and dies away", () => {
    const f = (t: number) => dampedKick(0.1, t, ring);
    expect(f(-0.1)).toBe(0);
    expect(f(0)).toBe(0);
    expect(Math.max(...steps(0, 0.5, 200).map(f))).toBeGreaterThan(0.04);
    expect(Math.abs(f(3))).toBeLessThan(1e-4);
    expect(velocityJumps(f, -0.5, 2, { step: 1e-4 })).toEqual([]);
  });
});

describe("live lag", () => {
  it("follows its target without ringing and settles back to nothing at rest", () => {
    const s: Spring = { x: 0, v: 0 };
    let most = 0;
    for (let i = 0; i < 30; i++) {
      springStep(s, 1, 1 / 60, 14);
      most = Math.max(most, s.x);
    }
    expect(most).toBeLessThanOrEqual(1);
    expect(s.x).toBeGreaterThan(0.5);
    for (let i = 0; i < 240; i++) springStep(s, 0, 1 / 60, 14);
    expect(s.x).toBe(0);
    expect(s.v).toBe(0);
  });

  it("takes the same path at any frame rate", () => {
    const a: Spring = { x: 0.3, v: -1 };
    const b: Spring = { x: 0.3, v: -1 };
    for (let i = 0; i < 12; i++) springStep(a, 0, 1 / 120, 10);
    for (let i = 0; i < 4; i++) springStep(b, 0, 1 / 40, 10);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.v).toBeCloseTo(b.v, 9);
  });
});

describe("the velocity check", () => {
  it("finds a jump in speed (a ramp that starts at full speed, a kink, a bounce off the floor)", () => {
    const ramp = (p: number) => Math.min(1, Math.max(0, (p - 0.3) / 0.1));
    const found = velocityJumps(ramp, 0.2, 0.5);
    expect(found.length).toBe(2);
    expect(found[0].at).toBeCloseTo(0.3, 4);
    expect(found[1].at).toBeCloseTo(0.4, 4);
    expect(velocityJumps((p) => Math.abs(Math.sin(p * 40)), 0, 0.2).length).toBeGreaterThan(1);
  });

  it("passes smooth curves, however quick, and values that do not move", () => {
    expect(velocityJumps((p) => Math.sin(p * 300), 0, 0.1)).toEqual([]);
    expect(velocityJumps((p) => glide(p, [0.3, 0.3005]), 0.29, 0.31, { step: 1e-6 })).toEqual([]);
    expect(velocityJumps(() => 4, 0, 1)).toEqual([]);
  });
});
