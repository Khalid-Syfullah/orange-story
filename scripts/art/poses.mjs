/**
 * How the stand-in painter poses each character plate, in world units (the story's own space), so
 * the plates of one figure (body, arms, head) are cut from one pose and meet exactly where the
 * manifest places them. Points the story ties things to (the orange in a hand, a fingertip, the tips
 * of the shears, the jug's spout) are read from the manifest's `points`, so the painted hand lands
 * on the point.
 *
 * Each entry: `cast` (the character), `render` ("figure", "hand" or "custom"), `show` (what the plate
 * draws of the figure) and `pose(ctx)`, which gets `{ point(id, name), entry(id) }` and returns the
 * pose for `buildFigure` / `buildHand` (`figure.mjs`). `edgeFade` softens limbs that run out of the
 * plate into a neighbouring one.
 */

import { builder, buildFigure, objects } from "./figure.mjs";
import { rng } from "./raster.mjs";

const { shearsGroups, knifeGroups, malletGroups, planGroups, jugGroups, orangeGroup, capsuleGroup } = objects;

/** A standing figure on a plate anchored at its feet: the base point and the crown height (world). */
function standing(ctx, id, crown, shift = 0) {
  const e = ctx.entry(id);
  return { base: [e.position[0] + shift, e.position[1] + 0.004 * e.height], height: crown * e.height };
}

/** A world point `dx`, `dy` head units from a base. */
const at = (base, hu) => (dx, dy) => [base[0] + dx * hu, base[1] + dy * hu];

/** Plate pixels (with depth in head units) of a world point, inside a hold callback. */
const px = (b, p, z, hu) => [...b.view.toPx(p), z * hu];

/* ------------------------------------------------------------------ */
/* The statue                                                          */
/* ------------------------------------------------------------------ */

function statuePose(ctx) {
  const orange = ctx.point("hero/statue", "orange");
  const base = [3.4, 1.506];
  const height = 1.94;
  const P = at(base, height / 7.75);
  return {
    base,
    height,
    turn: 22,
    weight: "right",
    contra: 0.7,
    head: { turn: 32, tilt: 26, gaze: "up" },
    arms: {
      left: { grip: [orange[0] - 0.005, orange[1] - 0.085], z: 0.15, bend: 1, hand: { grip: "cup", u: [-0.3, -0.15, 0.95], w: [0, -1, 0] } },
      right: { wrist: P(-0.95, 3.95), z: 0.2, bend: 1, hand: { grip: "fist" } },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The harvester (pluck, share)                                        */
/* ------------------------------------------------------------------ */

function harvesterPose(ctx, { orange }) {
  const held = ctx.point("pluck/harvester-arm", "orange");
  return {
    base: [2.98, 0.216],
    height: 5.98,
    heads: 8.3,
    lift: 0.36,
    turn: -34,
    weight: "left",
    contra: 0.5,
    head: { turn: -42, tilt: -18, gaze: "down", scale: 0.84, offset: [0, -0.24] },
    capsOnly: ["left"],
    arms: {
      right: {
        grip: [held[0] + 0.02, held[1] - 0.1],
        z: 0.6,
        bend: -1,
        foreshorten: 0.66,
        hand: { grip: "cup", u: [-0.45, 0.1, 0.88], w: [0.05, -1, 0.1] },
        holds: orange ? [(b, hand, hu) => orangeGroup(b, px(b, held, 0.65, hu), 0.165 * b.view.s, { leaf: false })] : [],
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The gardener (prune)                                                */
/* ------------------------------------------------------------------ */

function gardenerPose(ctx, { shearsOpen }) {
  const tip = ctx.point("prune/gardener-arms-1", "shears-tip");
  // The shears: handles in both hands in front of his chest, elbows out toward us, blades running on to the tip.
  const gripFar = [tip[0] + 0.34, tip[1] - 0.17];
  const gripNear = [tip[0] + 0.31, tip[1] - 0.07];
  return {
    base: [0.66, -0.695],
    height: 2.75,
    turn: -76,
    lean: 6,
    weight: "right",
    contra: 0.45,
    head: { turn: -80, tilt: -3, gaze: "level" },
    capsOnly: ["left"],
    arms: {
      right: {
        grip: gripFar,
        z: 0.3,
        bend: -1,
        foreshorten: 0.72,
        hand: { grip: "handle", turn: -0.3, w: [0, 1, -0.4] },
        holds: [(b, hand, hu) => shearsGroups(b, { gripA: px(b, gripFar, 0.3, hu), gripB: px(b, gripNear, 0.65, hu), tip: px(b, tip, 0.45, hu), open: shearsOpen, hu })],
      },
      left: { grip: gripNear, z: 0.65, bend: -1, foreshorten: 0.72, hand: { grip: "handle", turn: -0.3, w: [0, 1, 0.4] } },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The builder (work, blueprint, site)                                 */
/* ------------------------------------------------------------------ */

function chisel(b, grip, tip, hu) {
  const steel = b.part("chisel", "metal", [0.66, 0.68, 0.7], { detail: 0.4, flow: { kind: "axis", dir: [1, 0] } });
  const wood = b.part("chisel-handle", "wood", [0.48, 0.32, 0.2], { detail: 0.4, flow: { kind: "axis", dir: [1, 0] } });
  const d = [tip[0] - grip[0], tip[1] - grip[1], tip[2] - grip[2]];
  const l = Math.hypot(...d) || 1;
  const n = d.map((v) => v / l);
  const along = (t) => [grip[0] + n[0] * t * hu, grip[1] + n[1] * t * hu, grip[2] + n[2] * t * hu];
  return [capsuleGroup(wood, along(-0.25), along(0.18), 0.06 * hu), capsuleGroup(steel, along(0.18), tip, 0.03 * hu)];
}

/** At work: mallet raised in his right hand, a chisel held forward in his left. `facing` -1 left, +1 right. */
function builderPose(ctx, id, facing) {
  const { base, height } = standing(ctx, id, 0.84, -facing * 0.04 * ctx.entry(id).height);
  const hu = height / 7.2;
  const P = at(base, hu);
  const malletHand = P(facing * 0.95, 7.0);
  const chiselHand = P(facing * 1.35, 5.15);
  const zMallet = facing > 0 ? 0.4 : -0.1;
  const zChisel = facing > 0 ? 0.2 : 0.7;
  return {
    base,
    height,
    turn: facing * 38,
    weight: facing < 0 ? "right" : "left",
    contra: 0.4,
    head: { turn: facing * 45, tilt: -8, gaze: "down" },
    arms: {
      right: {
        grip: malletHand,
        z: zMallet,
        bend: facing,
        hand: { grip: "handle", turn: facing * 0.4, w: [facing, 0, 0.3] },
        holds: [(b, hand, h) => malletGroups(b, { grip: hand.grip, head: px(b, P(facing * 1.45, 7.6), 0.2, h), hu: h })],
      },
      left: {
        grip: chiselHand,
        z: zChisel,
        bend: facing,
        foreshorten: 0.85,
        hand: { grip: "handle", turn: -facing * 0.6, w: [0, 1, 0.3] },
        holds: [(b, hand, h) => chisel(b, hand.grip, px(b, P(facing * 2.05, 5.0), zChisel, h), h)],
      },
    },
  };
}

function seatedBuilderPose(ctx) {
  const e = ctx.entry("site/builder-seated");
  const base = [e.position[0] + 0.14, e.position[1] + 0.004 * e.height];
  const height = 1.06 * (7.2 / 5.45);
  const hu = height / 7.2;
  const P = at(base, hu);
  const plan = P(-1.0, 2.25);
  return {
    base,
    height,
    seated: true,
    turn: -38,
    weight: "right",
    contra: 0.1,
    lean: 10,
    head: { turn: -40, tilt: -26, gaze: "down" },
    arms: {
      right: { grip: [plan[0] - 0.42 * hu, plan[1] + 0.02 * hu], z: 0.5, bend: -1, foreshorten: 0.8, hand: { grip: "flat", turn: 0.4, w: [0, 1, 0.2] } },
      left: {
        grip: [plan[0] + 0.4 * hu, plan[1] - 0.02 * hu],
        z: 0.75,
        bend: -1,
        foreshorten: 0.8,
        hand: { grip: "flat", turn: 0.2, w: [0, 1, 0.3] },
        holds: [(b, hand, h) => planGroups(b, { centre: px(b, plan, 0.65, h), width: 0.95 * h, height: 0.6 * h, hu: h, tilt: 1.15 })],
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The architect, the astronomer                                       */
/* ------------------------------------------------------------------ */

function architectPose(ctx) {
  const plan = ctx.point("blueprint/architect", "plan");
  const { base, height } = standing(ctx, "blueprint/architect", 0.86, 0.05);
  return {
    base,
    height,
    turn: -40,
    weight: "left",
    contra: 0.45,
    head: { turn: -52, tilt: -4, gaze: "level" },
    arms: {
      right: { grip: [plan[0] - 0.105, plan[1] + 0.01], z: 0.55, bend: -1, foreshorten: 0.85, hand: { grip: "flat", u: [-0.35, 0.05, 0.93], w: [1, 0, 0.2] } },
      left: { grip: [plan[0] + 0.105, plan[1] - 0.01], z: 0.75, bend: -1, foreshorten: 0.85, hand: { grip: "flat", u: [-0.3, 0.05, 0.95], w: [-1, 0, 0.3] } },
    },
  };
}

function astronomerPose(ctx) {
  const tip = ctx.point("stars/astronomer", "fingertip");
  const { base, height } = standing(ctx, "stars/astronomer", 0.84, -0.1);
  const P = at(base, height / 7.7);
  return {
    base,
    height,
    turn: 62,
    weight: "left",
    contra: 0.4,
    head: { turn: 55, tilt: 30, gaze: "up" },
    arms: {
      right: { tip, z: 0.55, bend: 1, hand: { grip: "point", turn: -0.15, w: [0.3, 0, 1] } },
      left: { wrist: P(0.55, 4.5), z: 0.3, bend: -1, hand: { grip: "fist" } },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The orchard keepers (finale)                                        */
/* ------------------------------------------------------------------ */

function keeperWomanPose(ctx) {
  const spout = ctx.point("finale/woman-arm", "spout");
  const base = [-2.464, 3.855];
  const height = 3.25;
  const hu = height / 7.5;
  const R = 0.3 * hu;
  const jug = [spout[0] - 0.55 * R, spout[1] - 1.44 * R];
  const handle = [jug[0] - 0.85 * R, jug[1] + 0.5 * R];
  const P = at(base, hu);
  return {
    base,
    height,
    turn: 68,
    weight: "left",
    contra: 0.55,
    head: { turn: 64, tilt: -6, gaze: "down" },
    arms: {
      left: {
        grip: handle,
        z: 0.4,
        bend: -1,
        foreshorten: 0.85,
        hand: { grip: "handle", turn: 0.9, w: [1, 0, 0] },
        holds: [(b, hand, h) => jugGroups(b, { centre: px(b, jug, 0.4, h), hu: h, spoutDir: [1, 0.3] })],
      },
      right: { wrist: P(0.5, 4.75), z: 0.55, bend: 1, foreshorten: 0.9, hand: { grip: "hang", turn: 0.8, w: [0, 0, -1] } },
    },
  };
}

function keeperManPose(ctx, { shearsOpen }) {
  const tip = ctx.point("finale/man-arms-1", "shears-tip");
  const gripFar = [tip[0] + 0.36, tip[1] - 0.15];
  const gripNear = [tip[0] + 0.33, tip[1] - 0.06];
  return {
    base: [2.32, 3.855],
    height: 3.25,
    turn: -74,
    weight: "right",
    contra: 0.45,
    head: { turn: -78, tilt: 4, gaze: "level" },
    capsOnly: ["left"],
    arms: {
      right: {
        grip: gripFar,
        z: 0.3,
        bend: -1,
        foreshorten: 0.68,
        hand: { grip: "handle", turn: -0.3, w: [0, 1, -0.4] },
        holds: [(b, hand, hu) => shearsGroups(b, { gripA: px(b, gripFar, 0.3, hu), gripB: px(b, gripNear, 0.65, hu), tip: px(b, tip, 0.45, hu), open: shearsOpen, hu })],
      },
      left: { grip: gripNear, z: 0.65, bend: -1, foreshorten: 0.68, hand: { grip: "handle", turn: -0.3, w: [0, 1, 0.4] } },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The crowd                                                           */
/* ------------------------------------------------------------------ */

/** Everyone on a crowd plate, back to front, each turned up toward the plate's `look-at` point. */
function crowdFigures(ctx, id, people, seed) {
  const e = ctx.entry(id);
  const [W, H] = e.size;
  const w = (e.height * W) / H;
  const left = e.position[0] - e.anchor[0] * w;
  const bottom = e.position[1] - (1 - e.anchor[1]) * e.height;
  const look = ctx.point(id, "look-at");
  const r = rng(seed);
  const n = people.length;
  return people
    .map((person, i) => {
      const x = left + w * (0.08 + (0.84 * (i + 0.5)) / n) + r.jitter(w * 0.03);
      const ageScale = person.age < 14 ? 0.76 : person.age < 18 ? 0.93 : 1;
      const height = e.height * r.range(0.9, 0.95) * ageScale;
      const toward = look[0] < x ? -1 : 1;
      const P = at([x, bottom], height / 7.5);
      const chest = r.chance(0.35);
      return {
        person,
        depth: height,
        pose: {
          base: [x, bottom + 0.004 * e.height],
          height,
          turn: toward * r.range(22, 48),
          weight: r.chance(0.5) ? "left" : "right",
          contra: r.range(0.3, 0.7),
          head: { turn: toward * r.range(40, 62), tilt: r.range(24, 36), gaze: "up" },
          arms: {
            right: chest ? { wrist: P(-0.05, 5.1), z: 0.55, bend: 1, foreshorten: 0.8, hand: { grip: "flat", turn: 1.4, w: [0, 0, -1] } } : { z: 0.1 },
            left: { z: 0.1 },
          },
        },
      };
    })
    .sort((a, b) => a.depth - b.depth);
}

function paintCrowd({ entry, view, ctx, person: group, seed }) {
  const people = group.people.filter((p) => p.plate === entry.id).map((p) => ({ ...p, heads: 7.5, build: p.build ?? {}, face: p.face ?? { age: p.age > 50 ? 0.7 : p.age < 20 ? 0 : 0.25 } }));
  const b = builder(view, seed);
  b.seed = seed;
  let hu = 0;
  for (const fig of crowdFigures(ctx, entry.id, people, seed)) {
    const built = buildFigure({ person: fig.person, pose: fig.pose, view, show: ["body", "head", "arm-right", "arm-left"], seed: `${seed}:${fig.person.id}`, into: b });
    hu = Math.max(hu, built.hu);
  }
  return { ...b, hu };
}

function twine(b, from, to, hu) {
  const t = b.part("twine-end", "twine", [0.75, 0.6, 0.38], { detail: 0.4, flow: { kind: "axis", dir: [1, 0] } });
  return [capsuleGroup(t, from, to, 0.028 * hu)];
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

export const POSES = {
  "hero/statue": { cast: "statue", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: statuePose },
  "hero/statue-orange": {
    cast: "statue",
    render: "custom",
    build: ({ view, seed }) => {
      const b = builder(view, seed);
      b.seed = seed;
      const s = Math.min(view.W, view.H);
      b.scene(orangeGroup(b, [view.W / 2, view.H * 0.57, 0], s * 0.36, { leaf: true, gold: true }));
      return { ...b, hu: s * 0.8 };
    },
  },
  "hero/crowd-far": { cast: "crowd", render: "custom", build: paintCrowd, haze: 0.3 },
  "hero/crowd-mid": { cast: "crowd", render: "custom", build: paintCrowd, haze: 0.12 },
  "hero/crowd-near": { cast: "crowd", render: "custom", build: paintCrowd },

  "graft/hand-left": {
    cast: "grafter",
    render: "hand",
    edgeFade: 40,
    pose: (ctx) => ({ elbow: [0.05, 6.75], at: ctx.point("graft/hand-left", "grip"), target: "grip", scale: 0.78, hand: { side: "left", grip: "pinch", turn: 0.35, w: [0.35, 0.3, 0.9] }, cuff: { pigment: "milkLinen", from: 1.7, to: 0.55 } }),
  },
  "graft/hand-right": {
    cast: "grafter",
    render: "hand",
    edgeFade: 40,
    pose: (ctx) => {
      const grip = ctx.point("graft/hand-right", "grip");
      return {
        elbow: [4.05, 6.75],
        at: grip,
        target: "grip",
        scale: 0.78,
        hand: { side: "right", grip: "pinch", turn: -0.35, w: [-0.35, 0.3, 0.9] },
        cuff: { pigment: "milkLinen", from: 1.7, to: 0.55 },
        holds: [(b, hand, hu) => twine(b, hand.grip, px(b, [grip[0] - 0.3, grip[1] + 0.05], 0.15, hu), hu)],
      };
    },
  },

  "pluck/hand": {
    cast: "harvester",
    render: "hand",
    edgeFade: 60,
    pose: (ctx) => ({ elbow: [1.72, 6.0], at: ctx.point("pluck/hand", "fingertips"), target: "tips", scale: 1.0, z: 0.2, hand: { side: "right", grip: "cup", turn: 0.05, w: [0.25, -0.2, 0.95] } }),
  },
  "pluck/harvester-body": { cast: "harvester", render: "figure", show: ["body", "neck", "caps"], pose: (ctx) => harvesterPose(ctx, { orange: false }) },
  "pluck/harvester-arm": { cast: "harvester", render: "figure", show: ["arm-right", "holdout"], edgeFade: 12, pose: (ctx) => harvesterPose(ctx, { orange: true }) },
  "pluck/harvester-head": { cast: "harvester", render: "figure", show: ["head"], edgeFade: 14, pose: (ctx) => harvesterPose(ctx, { orange: false }) },
  "share/arm-open": { cast: "harvester", render: "figure", show: ["arm-right", "holdout"], edgeFade: 12, seedFrom: "pluck/harvester-arm", pose: (ctx) => harvesterPose(ctx, { orange: false }) },
  "share/knife-hand": {
    cast: "harvester",
    render: "hand",
    edgeFade: 30,
    pose: (ctx) => {
      const tip = ctx.point("share/knife-hand", "knife-tip");
      return {
        elbow: [2.95, 4.42],
        at: [tip[0] + 0.4, tip[1] + 0.01],
        target: "grip",
        scale: 0.62,
        z: 0.15,
        hand: { side: "left", grip: "handle", turn: -1.15, w: [0, 0.4, 1] },
        holds: [(b, hand, hu) => knifeGroups(b, { grip: hand.grip, tip: px(b, tip, 0.15, hu), hu })],
      };
    },
  },
  "share/second-hand": {
    cast: "sharer",
    render: "hand",
    edgeFade: 30,
    pose: (ctx) => ({ elbow: [-0.05, 4.24], at: ctx.point("share/second-hand", "fingertips"), target: "tips", scale: 0.55, hand: { side: "right", grip: "open", turn: -0.1, w: [0, -1, 0.35], ring: true }, cuff: { pigment: "milkLinen", from: 1.8, to: 0.6 } }),
  },

  "work/builder": { cast: "builder", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: (ctx) => builderPose(ctx, "work/builder", -1) },
  "blueprint/builder": { cast: "builder", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: (ctx) => builderPose(ctx, "blueprint/builder", 1) },
  "site/builder-left": { cast: "builder", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: (ctx) => builderPose(ctx, "site/builder-left", 1) },
  "site/builder-right": { cast: "builder", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: (ctx) => builderPose(ctx, "site/builder-right", -1) },
  "site/builder-seated": { cast: "builder", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: seatedBuilderPose },
  "blueprint/architect": { cast: "architect", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: architectPose },

  "prune/gardener": { cast: "gardener", render: "figure", show: ["body", "head", "caps"], pose: (ctx) => gardenerPose(ctx, { shearsOpen: true }) },
  "prune/gardener-arms-1": { cast: "gardener", render: "figure", show: ["arm-right", "holdout", "arm-left"], edgeFade: 10, pose: (ctx) => gardenerPose(ctx, { shearsOpen: true }) },
  "prune/gardener-arms-2": { cast: "gardener", render: "figure", show: ["arm-right", "holdout", "arm-left"], edgeFade: 10, seedFrom: "prune/gardener-arms-1", pose: (ctx) => gardenerPose(ctx, { shearsOpen: false }) },

  "stars/astronomer": { cast: "astronomer", render: "figure", show: ["body", "head", "arm-left", "arm-right"], pose: astronomerPose },

  "finale/woman-body": { cast: "keeper-woman", render: "figure", show: ["body", "head", "arm-right"], pose: keeperWomanPose },
  "finale/woman-arm": { cast: "keeper-woman", render: "figure", show: ["arm-left", "holdout"], edgeFade: 10, pose: keeperWomanPose },
  "finale/man-body": { cast: "keeper-man", render: "figure", show: ["body", "head", "caps"], pose: (ctx) => keeperManPose(ctx, { shearsOpen: true }) },
  "finale/man-arms-1": { cast: "keeper-man", render: "figure", show: ["arm-right", "holdout", "arm-left"], edgeFade: 10, pose: (ctx) => keeperManPose(ctx, { shearsOpen: true }) },
  "finale/man-arms-2": { cast: "keeper-man", render: "figure", show: ["arm-right", "holdout", "arm-left"], edgeFade: 10, seedFrom: "finale/man-arms-1", pose: (ctx) => keeperManPose(ctx, { shearsOpen: false }) },
};
