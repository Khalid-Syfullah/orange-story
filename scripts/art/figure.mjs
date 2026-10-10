/**
 * The stand-in painter's figures: a person (or the marble statue) built from a skeleton, cloth
 * outlines with folds, and rounded forms (head, hands, bare limbs, held objects) as signed distance
 * fields. The output is a list of layers in painter's order (2D cloth parts and traced 3D scenes)
 * plus painted marks (eyes, brows, lips) and blush, all in the plate's pixels, ready for
 * `paint.mjs` to light and paint.
 *
 * Every figure is posed in world units (the story's own space, see `src/art/manifest.ts`), so a
 * body, its arm plate and its head plate are cut from one figure and meet exactly where the
 * manifest places them.
 */

import { HEADS, PIGMENTS } from "./cast.mjs";
import { clamp, hex, lerp, mixRgb, rng } from "./raster.mjs";
import { capsule, disc, ellipsoid, group, rotation, roundBox, roundCone, sphere, torus, transpose3 } from "./sdf.mjs";

const DEG = Math.PI / 180;

export const pigment = (name) => hex(PIGMENTS[name] ?? name);

/* ------------------------------------------------------------------ */
/* Plate view: world units <-> plate pixels                            */
/* ------------------------------------------------------------------ */

export function plateView(entry) {
  const [W, H] = entry.size;
  const h = entry.height;
  const w = (h * W) / H;
  return {
    W,
    H,
    /** Pixels per world unit. */
    s: H / h,
    entry,
    toPx: ([x, y]) => [(entry.anchor[0] + (x - entry.position[0]) / w) * W, (entry.anchor[1] - (y - entry.position[1]) / h) * H],
    toWorld: ([X, Y]) => [entry.position[0] + (X / W - entry.anchor[0]) * w, entry.position[1] + (entry.anchor[1] - Y / H) * h],
  };
}

/* ------------------------------------------------------------------ */
/* Small vector helpers (3D, plate pixels: x right, y down, z to us)    */
/* ------------------------------------------------------------------ */

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / (len(a) || 1));
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/** Materials: how a surface takes the light and the brush (see `paint.mjs`). */
export const MATERIALS = ["skin", "marble", "linen", "wool", "leather", "hair", "straw", "metal", "gold", "wood", "bone", "fruit", "leaf", "paper", "terracotta", "twine"];

function builder(view, seed) {
  const parts = [];
  const layers = [];
  const marks = [];
  const blush = [];
  return {
    view,
    rand: rng(seed),
    parts,
    layers,
    marks,
    blush,
    part(name, mat, color, extra = {}) {
      const p = { id: parts.length, name, mat, color, folds: [], bumps: [], ...extra };
      parts.push(p);
      return p;
    },
    path(part, pts, extra = {}) {
      Object.assign(part, { kind: "path", pts, ...extra });
      layers.push({ type: "path", part });
      return part;
    },
    scene(groups) {
      if (groups.length) layers.push({ type: "sdf", groups });
    },
  };
}

/* ------------------------------------------------------------------ */
/* The body frame                                                      */
/* ------------------------------------------------------------------ */

/**
 * The person's body frame: head units (HU), y up from the ground, bx toward the person's left, bz
 * toward the person's front. `turn` rotates the body about its vertical axis (degrees; negative
 * faces the viewer's left). Contrapposto sways the pelvis over the weight leg and tilts the hips
 * and shoulders against each other.
 */
function bodyFrame(pose, view, heads) {
  const s = view.s;
  const hu = (pose.height / heads) * s; // px per HU
  const [bx0, by0] = view.toPx(pose.base);
  const th = (pose.turn ?? 0) * DEG;
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const w = pose.weight === "right" ? -1 : 1; // +1: weight on the person's left leg (bx > 0)
  const contra = pose.contra ?? 0.5;
  const k = heads / HEADS;
  const sway = (y) => w * contra * 0.16 * Math.exp(-(((y / k - 3.9) / 1.6) ** 2)) - w * contra * 0.05 * Math.exp(-(((y / k - 6.0) / 0.8) ** 2));
  const tilt = (y, bx) => bx * contra * w * (0.07 * Math.exp(-(((y / k - 3.9) / 0.8) ** 2)) - 0.06 * Math.exp(-(((y / k - 6.0) / 0.7) ** 2)));
  const lean = Math.tan(((pose.lean ?? 0) * Math.PI) / 180);
  /** A body point (HU) to plate pixels with depth [X, Y, Z]. */
  const P = (x, y0, z0 = 0) => {
    let y = y0;
    const X3 = x + sway(y);
    const Y3c = tilt(y, x);
    const z = z0 + Math.max(0, y - 3.9 * k) * lean;
    if (pose.seated) y -= 1.75 * k * clamp((y / k - 2.6) / 0.8);
    // `lift` raises the upper body (a longer waist), so shoulders can meet a fixed arm plate.
    if (pose.lift) y += pose.lift * clamp((y / k - 3.4) / 0.8);
    return [bx0 + (X3 * ct + z * st) * hu, by0 - (y + Y3c) * hu, (-X3 * st + z * ct) * hu];
  };
  /** Visible range of surface angles φ (degrees around the body from the front, + toward the person's left). */
  const visible = (phi) => clamp(phi, -88 - (pose.turn ?? 0), 88 - (pose.turn ?? 0));
  return { hu, P, ct, st, th, w, k, turn: pose.turn ?? 0, visible, base: [bx0, by0] };
}

/** Half-width (a) and half-depth (b) of the body at height y (HU), before clothes. */
function torsoSection(y, sex, build, k) {
  const u = y / k;
  const f = sex === "female";
  const sh = (f ? 0.88 : 1.0) * (build.shoulder ?? 1);
  const rows = [
    [6.45, 0.27 * (build.neck ?? 1), 0.27],
    [6.22, 0.42, 0.33],
    [6.08, 0.88 * sh, 0.4],
    [5.92, 0.97 * sh, 0.44],
    [5.6, 0.88 * sh, 0.5],
    [5.25, (f ? 0.74 : 0.8) * sh, f ? 0.58 : 0.52],
    [4.65, (f ? 0.56 : 0.64) * (build.waist ?? 1), 0.46],
    [3.95, (f ? 0.86 : 0.78) * (build.hip ?? 1), 0.52],
    [3.3, (f ? 0.84 : 0.76) * (build.hip ?? 1), 0.5],
  ];
  if (u >= rows[0][0]) return [rows[0][1], rows[0][2]];
  for (let i = 1; i < rows.length; i++) {
    if (u >= rows[i][0]) {
      const t = (u - rows[i][0]) / (rows[i - 1][0] - rows[i][0]);
      const e = t * t * (3 - 2 * t);
      return [lerp(rows[i][1], rows[i - 1][1], e), lerp(rows[i][2], rows[i - 1][2], e)];
    }
  }
  return [rows[rows.length - 1][1], rows[rows.length - 1][2]];
}

/** A surface point at height y and angle φ (degrees) of a cross-section (a, b) offset by `ease`. */
const surface = (F, y, phi, a, b, ease = 0) => {
  const p = phi * DEG;
  return F.P((a + ease) * Math.sin(p), y, (b + ease) * Math.cos(p));
};

/** The projected left and right edges of a cross-section at height y. */
function silhouette(F, y, a, b) {
  const c = F.P(0, y, 0);
  const e = Math.sqrt((a * F.ct) ** 2 + (b * F.st) ** 2) * F.hu;
  return [
    [c[0] - e, c[1]],
    [c[0] + e, c[1]],
  ];
}

/* ------------------------------------------------------------------ */
/* Cloth                                                               */
/* ------------------------------------------------------------------ */

const LENGTHS = { floor: 0.14, ankle: 0.4, calf: 1.05, knee: 1.95, hip: 3.55 };

/** Cross-section of a garment worn over the body: the torso plus ease above, falling free below the hips. */
function clothSection(y, person, k, spec) {
  const [a0, b0] = torsoSection(y, person.sex, person.build ?? {}, k);
  const u = y / k;
  const hipY = 3.9;
  let ease = spec.ease ?? 0.05;
  // A belt or cord cinches the cloth at the waist; it blouses out a little above it.
  if (spec.cinch) ease += 0.07 * Math.exp(-(((u - 4.86) / 0.2) ** 2)) - (ease - 0.005) * Math.exp(-(((u - 4.62) / 0.12) ** 2));
  if (u >= hipY) return [a0 + ease, b0 + ease * 0.6];
  // Below the hips the cloth hangs and flares toward the hem.
  const [ah, bh] = torsoSection(hipY * k, person.sex, person.build ?? {}, k);
  const t = clamp((hipY - u) / (hipY - 0.1));
  const flare = spec.flare ?? 0.32;
  return [ah + ease + flare * t ** 1.3, bh + ease * 0.6 + flare * 0.5 * t];
}

/**
 * A garment that covers the body from `top` to `bottom` (HU heights): outline (smooth closed points)
 * and folds. `cap` keeps sleeve caps at the shoulders (arms drawn elsewhere or not at all).
 */
function robeOutline(b, F, person, spec) {
  const k = F.k;
  const top = (spec.top ?? 6.36) * k;
  const bottom = (LENGTHS[spec.length] ?? spec.length ?? 0.14) * k;
  const left = [];
  const right = [];
  const steps = 28;
  const collar = top - (spec.neckline ?? 0.14) * k;
  for (let i = 0; i <= steps; i++) {
    const y = lerp(collar, bottom, i / steps);
    let [a, bb] = clothSection(y, person, k, spec);
    if (spec.cap === false && y / k > 5.4 && y / k < 6.15) a = Math.min(a, lerp(torsoSection(5.4 * k, person.sex, person.build ?? {}, k)[0], a, clamp((y / k - 5.4) / 0.75)) + 0.02);
    const [l, r] = silhouette(F, y, a, bb);
    left.push(l);
    right.push(r);
  }
  // The hem: a wavy line between the two lowest points, lower where folds hang.
  const hem = [];
  const n = 9;
  const [hl, hr] = [left[left.length - 1], right[right.length - 1]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = lerp(hl[0], hr[0], t);
    const sag = Math.sin(t * Math.PI) * 0.06 * F.hu;
    const wave = Math.sin(t * Math.PI * (spec.waves ?? 4) + (spec.phase ?? 0)) * 0.035 * F.hu;
    hem.push([x, lerp(hl[1], hr[1], t) + sag + wave]);
  }
  // The neckline: round the neck, dropping toward the front of the body.
  const neck = [];
  const [nl, nr] = [left[0], right[0]];
  const drop = spec.neckline ?? 0.14;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const phi = F.visible(lerp(F.visible(200), F.visible(-200), t));
    const y = top - drop * k * Math.max(0, Math.cos((phi * Math.PI) / 180));
    const p = surface(F, y, phi, 0.36 * (person.build?.neck ?? 1), 0.34, 0);
    neck.push([p[0], p[1]]);
  }
  void nl;
  void nr;
  return [...left, ...hem, ...right.reverse(), ...neck];
}

/** Folds hanging from the waist (or the shoulders) to the hem, on the visible side of the body. */
function hangingFolds(b, F, person, spec, from, to, count, { width = 0.12, depth = 1, spread = 0.18, phiRange = null } = {}) {
  const k = F.k;
  const folds = [];
  const [p0, p1] = phiRange ?? [F.visible(-80), F.visible(80)];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5 + b.rand.jitter(0.35)) / count;
    const phi = lerp(p0, p1, t);
    const pts = [];
    const segs = 5;
    const drift = b.rand.jitter(10);
    for (let j = 0; j <= segs; j++) {
      const v = j / segs;
      const y = lerp(from, to, v) * k;
      const [a, bb] = clothSection(y, person, k, spec);
      const ph = F.visible(phi * (1 + spread * v) + drift * v);
      pts.push(surface(F, y, ph, a, bb, 0.01).slice(0, 2));
    }
    folds.push({ pts, w: width * F.hu * lerp(0.7, 1.3, b.rand.next()), a: (i % 2 ? -1 : 1) * depth * lerp(0.6, 1, b.rand.next()) });
  }
  return folds;
}

/** Folds radiating from a point of tension (a shoulder, a knee, a hand) to points on a line. */
function radiatingFolds(b, F, from, toPts, { width = 0.1, depth = 0.8 } = {}) {
  return toPts.map((to, i) => {
    const mid = [lerp(from[0], to[0], 0.5) + b.rand.jitter(0.05 * F.hu), lerp(from[1], to[1], 0.5) + b.rand.jitter(0.05 * F.hu)];
    return { pts: [from, mid, to], w: width * F.hu * lerp(0.7, 1.2, b.rand.next()), a: (i % 2 ? -0.7 : 1) * depth };
  });
}

/** A region of the body surface given by (φ, y) pairs (degrees, HU), clamped to the visible side. */
function surfacePatch(F, person, spec, pairs, ease = 0.06) {
  const k = F.k;
  return pairs.map(([phi, yy]) => {
    const y = yy * k;
    const [a, bb] = clothSection(y, person, k, spec);
    return surface(F, y, F.visible(phi), a, bb, ease).slice(0, 2);
  });
}

/* ------------------------------------------------------------------ */
/* Head                                                                */
/* ------------------------------------------------------------------ */

/** A group of primitives in a local frame (HU, y up), placed at `c` (px) with rotation `m` and scale `hu`. */
function localGroup(part, prims, { c, m, hu, k = 0, cut = [], kc = 0, clip = null }) {
  const mt = transpose3(m);
  const toLocal = (x, y, z) => {
    const dx = (x - c[0]) / hu;
    const dy = -(y - c[1]) / hu;
    const dz = (z - c[2]) / hu;
    return [mt[0] * dx + mt[1] * dy + mt[2] * dz, mt[3] * dx + mt[4] * dy + mt[5] * dz, mt[6] * dx + mt[7] * dy + mt[8] * dz];
  };
  const inner = group(part, prims, { k, cut, kc, clip });
  const [bx, by, bz, br] = inner.bound;
  const wc = [m[0] * bx + m[1] * by + m[2] * bz, m[3] * bx + m[4] * by + m[5] * bz, m[6] * bx + m[7] * by + m[8] * bz];
  return {
    part,
    bound: [c[0] + wc[0] * hu, c[1] - wc[1] * hu, c[2] + wc[2] * hu, br * hu],
    d: (x, y, z) => {
      const [u, v, w] = toLocal(x, y, z);
      return inner.d(u, v, w) * hu;
    },
  };
}

/** A local point (HU, y up) to plate pixels. */
const fromLocal = (c, m, hu, [u, v, w]) => [c[0] + (m[0] * u + m[1] * v + m[2] * w) * hu, c[1] - (m[3] * u + m[4] * v + m[5] * w) * hu, c[2] + (m[6] * u + m[7] * v + m[8] * w) * hu];

/**
 * A head with a turned face: cranium, face mass, jaw, cheekbones, brow, eyelids in their sockets,
 * nose with its wings, lips, chin, ears and neck, then hair, beard and head cover as their own
 * materials. Returns the groups, and adds marks (lash lines, brows, mouth) and blush to the builder.
 */
function headScene(b, person, { c, hu, yaw, pitch, roll = 0, neck = true, neckLength = 1.15, mat = "skin", gaze = "level" }) {
  const m = rotation(yaw, pitch, roll);
  const f = person.face ?? {};
  const male = person.sex === "male";
  const marble = mat === "marble";
  const skinColor = pigment(person.skin ?? "skinWarm");
  const age = f.age ?? 0.2;
  const groups = [];
  const at = { c, m, hu };

  const skin = b.part("skin-head", mat, skinColor, { detail: 1, flow: { kind: "around" } });
  const jaw = male ? 0.04 + 0.04 * (f.jaw ?? 0.5) : 0.01 + 0.02 * (f.jaw ?? 0.5);
  const prims = [
    ellipsoid([0, 0.1, -0.05], [0.36, 0.42, 0.46]),
    ellipsoid([0, -0.15, 0.1], [0.27 + jaw, 0.33, 0.3]),
    ellipsoid([0.19, -0.27, -0.01], [0.1 + jaw, 0.13, 0.17]),
    ellipsoid([-0.19, -0.27, -0.01], [0.1 + jaw, 0.13, 0.17]),
    ellipsoid([0, -0.42, 0.25], [0.09 + jaw * 0.6, 0.075, 0.08]),
    ellipsoid([0.19, -0.05, 0.21], [0.09, 0.06 + 0.02 * (f.cheek ?? 0.5), 0.09]),
    ellipsoid([-0.19, -0.05, 0.21], [0.09, 0.06 + 0.02 * (f.cheek ?? 0.5), 0.09]),
    capsule([-0.16, 0.085, 0.3], [0.16, 0.085, 0.3], 0.045 + 0.025 * (f.brow ?? 0.5) * (male ? 1 : 0.6)),
    ellipsoid([0.12, 0.015, 0.3], [0.068, 0.048, 0.055]),
    ellipsoid([-0.12, 0.015, 0.3], [0.068, 0.048, 0.055]),
    roundCone([0, 0.05, 0.36], [0, -0.165, 0.45 + 0.05 * (f.nose ?? 0.5)], 0.032, 0.048),
    sphere([0.043, -0.175, 0.405], 0.033),
    sphere([-0.043, -0.175, 0.405], 0.033),
    ellipsoid([0, -0.255, 0.365], [0.085, 0.028 + 0.012 * (f.lips ?? 0.5), 0.045]),
    ellipsoid([0, -0.31, 0.35], [0.075, 0.028 + 0.014 * (f.lips ?? 0.5), 0.045]),
    ellipsoid([0.345, -0.03, -0.04], [0.04, 0.11, 0.07], rotation(0, 0, 0.12)),
    ellipsoid([-0.345, -0.03, -0.04], [0.04, 0.11, 0.07], rotation(0, 0, -0.12)),
  ];
  if (neck) prims.push(roundCone([0, -0.3, -0.12], [0, -neckLength, -0.06], 0.2 * (person.build?.neck ?? 1), 0.24 * (person.build?.neck ?? 1)));
  const sockets = [sphere([0.12, 0.02, 0.37], 0.06), sphere([-0.12, 0.02, 0.37], 0.06), ellipsoid([0, -0.285, 0.41], [0.07, 0.012, 0.03])];
  groups.push(localGroup(skin, prims, { ...at, k: 0.07, cut: sockets, kc: 0.05 }));

  // Hair
  const hairSpec = person.hair;
  if (hairSpec && hairSpec.style !== "bald") {
    const hairColor = marble ? skinColor : pigment(hairSpec.color);
    const hair = b.part("hair", marble ? "marble" : "hair", hairColor, { detail: 0.8, flow: { kind: "around" } });
    const thick = { cropped: 0.025, short: 0.045, tousled: 0.07, curls: 0.06, knot: 0.04, "braid-coil": 0.04 }[hairSpec.style] ?? 0.05;
    const cap = [ellipsoid([0, 0.12, -0.06], [0.37 + thick, 0.43 + thick, 0.47 + thick])];
    const r = rng(`${b.seed}-hair`);
    if (hairSpec.style === "tousled" || hairSpec.style === "curls") {
      const n = hairSpec.style === "curls" ? 70 : 44;
      const rr = hairSpec.style === "curls" ? 0.06 : 0.055;
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2);
        const e = r.range(-0.15, 1.25);
        const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
        if (dir[2] > 0.45 && dir[1] < 0.45) continue; // keep the forehead clear
        cap.push(sphere([dir[0] * (0.38 + thick), 0.12 + dir[1] * (0.42 + thick), -0.06 + dir[2] * (0.46 + thick)], rr * r.range(0.7, 1.15)));
      }
      if (hairSpec.style === "tousled") for (let i = 0; i < 7; i++) cap.push(sphere([r.range(-0.24, 0.24), r.range(0.28, 0.36), r.range(0.3, 0.37)], r.range(0.045, 0.065)));
    }
    if (hairSpec.style === "knot") cap.push(ellipsoid([0, -0.1, -0.52], [0.17, 0.14, 0.13]));
    if (hairSpec.style === "braid-coil") cap.push(torus([0, -0.13, -0.47], 0.13, 0.065, rotation(0, 0, 0)));
    const nape = { cropped: -0.12, short: -0.18, tousled: -0.22, curls: -0.25, knot: -0.05, "braid-coil": -0.05 }[hairSpec.style] ?? -0.18;
    groups.push(
      localGroup(hair, cap, {
        ...at,
        k: hairSpec.style === "curls" ? 0.03 : 0.05,
        cut: [ellipsoid([0, -0.22, 0.32], [0.33, 0.44, 0.34]), ellipsoid([0.36, -0.08, 0.02], [0.08, 0.15, 0.12]), ellipsoid([-0.36, -0.08, 0.02], [0.08, 0.15, 0.12])],
        kc: 0.04,
        clip: (u, v, w) => Math.max(nape - v + 0.35 * Math.max(0, w) - 0.2 * Math.max(0, -w - 0.3), person.headCover?.kind === "straw-hat" || person.headCover?.kind === "cap" ? v - 0.16 : -1),
      }),
    );
    // Strands: fine ridges running from the crown, as relief for the light and the brush.
    hair.folds = [];
    const crown = [0, 0.55, -0.1];
    for (let i = 0; i < 70; i++) {
      const a = r.range(0, Math.PI * 2);
      const e = r.range(-0.35, 0.9);
      const end = [Math.sin(a) * Math.cos(e) * 0.47, 0.12 + Math.sin(e) * 0.5, -0.06 + Math.cos(a) * Math.cos(e) * 0.5];
      const mid = [(crown[0] + end[0]) * 0.55 + r.jitter(0.05), (crown[1] + end[1]) * 0.5 + 0.06, (crown[2] + end[2]) * 0.55];
      const pts = [crown, mid, end].map((q) => fromLocal(c, m, hu, q));
      if (pts[2][2] < c[2]) continue;
      hair.folds.push({ pts: pts.map((q) => [q[0], q[1]]), w: 0.025 * hu * r.range(0.6, 1.4), a: r.chance(0.5) ? 0.7 : -0.6 });
    }
    if (hairSpec.ribbon) {
      const ribbon = b.part("ribbon", marble ? "gold" : "linen", pigment(hairSpec.ribbon), { detail: 0.6, flow: { kind: "around" } });
      groups.push(localGroup(ribbon, [torus([0, -0.08, -0.44], 0.14, 0.025, rotation(0, 0.6, 0))], at));
    }
    b.marks.push(...browMarks(c, m, hu, hairColor, marble));
  }

  // Beard
  if (person.beard) {
    const color = pigment(person.beard.color);
    const beard = b.part("beard", "hair", color, { detail: 0.8, flow: { kind: "down" }, streak: person.beard.streak ? pigment(person.beard.streak) : null });
    const full = person.beard.style === "full";
    const prims2 = [ellipsoid([0, -0.3, 0.1], [0.285 + jaw, full ? 0.22 : 0.19, 0.29]), ellipsoid([0, full ? -0.47 : -0.43, 0.23], [full ? 0.14 : 0.11, full ? 0.12 : 0.085, 0.11]), ellipsoid([0, -0.225, 0.385], [0.11, 0.026, 0.045])];
    groups.push(
      localGroup(beard, prims2, {
        ...at,
        k: 0.06,
        cut: [ellipsoid([0, -0.28, 0.42], [0.075, 0.035, 0.08]), ellipsoid([0, 0.1, 0.25], [0.4, 0.28, 0.4])],
        kc: 0.03,
        clip: (u, v, w) => v - (-0.13 - 0.08 * Math.max(0, w)),
      }),
    );
  }

  // Head cover
  const cover = person.headCover;
  if (cover) {
    const color = pigment(cover.pigment);
    if (cover.kind === "headband") {
      const band = b.part("headband", "linen", color, { detail: 0.6, flow: { kind: "around" } });
      const t = { tousled: 0.07, curls: 0.06 }[person.hair?.style] ?? 0.045;
      groups.push(localGroup(band, [torus([0, 0.19, -0.05], 0.39 + t * 0.6, 0.028, rotation(0, Math.PI / 2 - 0.25, 0))], at));
    } else if (cover.kind === "cap") {
      const cap = b.part("cap", "wool", color, { detail: 0.6, flow: { kind: "around" } });
      groups.push(localGroup(cap, [ellipsoid([0, 0.22, -0.05], [0.42, 0.34, 0.49]), torus([0, 0.13, -0.04], 0.43, 0.045, rotation(0, Math.PI / 2 - 0.12, 0))], { ...at, k: 0.04, clip: (u, v) => 0.08 - v }));
    } else if (cover.kind === "straw-hat") {
      const hat = b.part("hat", "straw", color, { detail: 0.7, flow: { kind: "radial" } });
      groups.push(localGroup(hat, [ellipsoid([0, 0.3, -0.05], [0.43, 0.3, 0.5]), disc([0, 0.18, -0.04], 0.8, 0.02, rotation(0, Math.PI / 2 - 0.1, 0), 0.014)], { ...at, k: 0.06, clip: (u, v) => 0.15 - v }));
      groups.push(localGroup(b.part("hat-band", "wool", pigment("olive"), { detail: 0.5, flow: { kind: "around" } }), [torus([0, 0.215, -0.05], 0.43, 0.03, rotation(0, Math.PI / 2 - 0.1, 0))], at));
    } else if (cover.kind === "veil") {
      const veil = b.part("veil", "linen", color, { detail: 0.6, flow: { kind: "down" } });
      groups.push(localGroup(veil, [ellipsoid([0, 0.1, -0.09], [0.44, 0.5, 0.52])], { ...at, cut: [ellipsoid([0, -0.25, 0.4], [0.33, 0.52, 0.36])], kc: 0.05, clip: (u, v) => -0.55 - v }));
    }
  }

  // Marks: lash lines and the line between the lips; blush where the blood shows.
  if (!marble) {
    const lid = gaze === "down" ? -0.012 : gaze === "up" ? 0.022 : 0.006;
    for (const side of [1, -1]) {
      b.marks.push({ pts: [[side * 0.065, 0.02 + lid, 0.345], [side * 0.12, 0.04 + lid, 0.355], [side * 0.175, 0.02 + lid, 0.33]].map((p) => fromLocal(c, m, hu, p)), w: 0.022 * hu, color: mixRgb(pigment("darkBrown"), skinColor, 0.25), alpha: 0.8, normal: localNormal(m, [side * 0.2, 0.1, 1]) });
      if (gaze !== "down") b.marks.push({ pts: [fromLocal(c, m, hu, [side * 0.12, 0.015 + lid * 0.5, 0.36])], w: 0.035 * hu, color: mixRgb(pigment("darkBrown"), [0.25, 0.2, 0.18], 0.5), alpha: 0.55, normal: localNormal(m, [side * 0.2, 0, 1]), dot: true });
    }
    b.marks.push({ pts: [[-0.06, -0.283, 0.385], [0, -0.29, 0.4], [0.06, -0.283, 0.385]].map((p) => fromLocal(c, m, hu, p)), w: 0.016 * hu, color: mixRgb(pigment("terracotta"), [0.2, 0.1, 0.08], 0.55), alpha: 0.65, normal: localNormal(m, [0, 0, 1]) });
    const blood = mixRgb(pigment("terracotta"), [0.85, 0.35, 0.3], 0.4);
    for (const [p, r, a] of [
      [[0.2, -0.12, 0.27], 0.12, 0.28],
      [[-0.2, -0.12, 0.27], 0.12, 0.28],
      [[0, -0.15, 0.47], 0.06, 0.25],
      [[0.36, -0.02, -0.03], 0.09, 0.35],
      [[-0.36, -0.02, -0.03], 0.09, 0.35],
      [[0, -0.28, 0.37], 0.07, 0.4],
    ])
      b.blush.push({ p: fromLocal(c, m, hu, p), r: r * hu, color: blood, amount: a * (1 - age * 0.3) });
    if (age > 0.4)
      for (const side of [1, -1]) b.marks.push({ pts: [[side * 0.18, 0.0, 0.3], [side * 0.23, -0.04, 0.27]].map((p) => fromLocal(c, m, hu, p)), w: 0.012 * hu, color: mixRgb(skinColor, [0.3, 0.18, 0.12], 0.5), alpha: 0.35 * age, normal: localNormal(m, [side * 0.6, 0, 1]) });
  }
  return { groups, m };
}

const localNormal = (m, n) => {
  const [x, y, z] = [m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[3] * n[0] + m[4] * n[1] + m[5] * n[2], m[6] * n[0] + m[7] * n[1] + m[8] * n[2]];
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / l, -y / l, z / l];
};

function browMarks(c, m, hu, color, marble) {
  if (marble) return [];
  return [1, -1].map((side) => ({ pts: [[side * 0.05, 0.1, 0.355], [side * 0.12, 0.125, 0.35], [side * 0.19, 0.1, 0.31]].map((p) => fromLocal(c, m, hu, p)), w: 0.03 * hu, color, alpha: 0.55, normal: localNormal(m, [side * 0.2, 0.3, 1]) }));
}

/* ------------------------------------------------------------------ */
/* Hands                                                               */
/* ------------------------------------------------------------------ */

const GRIPS = {
  open: { curl: [0.1, 0.12, 0.08], thumb: "out", spread: 0.08 },
  cup: { curl: [0.32, 0.45, 0.35], thumb: "side", spread: 0.04 },
  hang: { curl: [0.25, 0.4, 0.3], thumb: "side", spread: 0.02 },
  fist: { curl: [1.25, 1.35, 0.9], thumb: "over", spread: 0 },
  handle: { curl: [1.05, 1.2, 0.8], thumb: "over", spread: 0 },
  point: { curl: [1.3, 1.35, 0.9], thumb: "over", spread: 0, index: [0.02, 0.03, 0.02] },
  pinch: { curl: [0.55, 0.6, 0.4], thumb: "pinch", spread: 0.02, index: [0.45, 0.4, 0.3] },
  flat: { curl: [0.06, 0.08, 0.05], thumb: "side", spread: 0.01 },
};

/**
 * A hand: palm, four fingers of three segments grouped side by side, and a thumb, posed by `grip`.
 * Frame: `wrist` (px), u toward the fingers, w out of the palm; `side` is "right" or "left".
 * Returns its groups and where the grip centre is.
 */
function handGroups(b, { wrist, u, w, side, grip = "hang", hu, skin, mat = "skin", size = 1, female = false }) {
  const U = norm(u);
  const Wn = norm(sub(w, mul(U, dot(w, U))));
  // Thumb side: right hands have it on w x u, left hands on u x w.
  const V = side === "right" ? norm(cross(Wn, U)) : norm(cross(U, Wn));
  const g = GRIPS[grip] ?? GRIPS.hang;
  const S = hu * size * (female ? 0.92 : 1);
  const P = (uu, vv, ww) => add(wrist, add(mul(U, uu * S), add(mul(V, vv * S), mul(Wn, ww * S))));
  const part = b.part(`hand-${side}`, mat, skin, { detail: 1, flow: { kind: "axis", dir: [U[0], U[1]] } });
  const prims = [roundBox(P(0.22, 0, 0), [0.2 * S, 0.165 * S, 0.06 * S], 0.05 * S, frameRows(U, V, Wn)), roundCone(P(-0.15, 0, 0), P(0.06, 0, 0), 0.115 * S, 0.135 * S)];
  const fingers = [
    { v: 0.12, len: [0.19, 0.11, 0.09], r: 0.043 },
    { v: 0.04, len: [0.21, 0.13, 0.1], r: 0.045 },
    { v: -0.045, len: [0.2, 0.12, 0.09], r: 0.043 },
    { v: -0.125, len: [0.15, 0.09, 0.08], r: 0.038 },
  ];
  const tips = [];
  fingers.forEach((fg, i) => {
    const curl = i === 0 && g.index ? g.index : g.curl;
    const sp = (fg.v - 0.0) * g.spread * 4;
    let p = P(0.4 + (i === 3 ? -0.03 : 0), fg.v, 0);
    let angle = 0;
    let r = fg.r;
    for (let j = 0; j < 3; j++) {
      angle += curl[j] * (1 + 0.08 * (i - 1.5) * (j === 0 ? 1 : 0));
      // Fingers curl toward the palm side (+w), where a held thing sits.
      const dir = norm(add(mul(U, Math.cos(angle)), add(mul(Wn, Math.sin(angle)), mul(V, sp))));
      const q = add(p, mul(dir, fg.len[j] * S));
      prims.push(roundCone(p, q, r * S, r * 0.88 * S));
      p = q;
      r *= 0.9;
    }
    tips.push(p);
  });
  // Thumb
  const tb = P(0.07, 0.15, 0.03);
  const tm = P(0.2, 0.25, 0.07);
  let tdir;
  if (g.thumb === "out") tdir = norm(add(mul(U, 0.7), mul(V, 0.7)));
  else if (g.thumb === "side") tdir = norm(add(mul(U, 0.85), add(mul(V, 0.3), mul(Wn, 0.25))));
  else if (g.thumb === "pinch") tdir = norm(sub(tips[0], tm));
  else tdir = norm(add(mul(U, 0.55), add(mul(V, -0.45), mul(Wn, 0.6))));
  const t1 = add(tm, mul(tdir, 0.13 * S));
  const t2 = add(t1, mul(tdir, 0.1 * S));
  prims.push(roundCone(tb, tm, 0.07 * S, 0.055 * S), roundCone(tm, t1, 0.05 * S, 0.046 * S), roundCone(t1, t2, 0.046 * S, 0.04 * S));
  const handGroup = group(part, prims, { k: 0.018 * S });
  // Knuckles and finger joints flush warm.
  for (const tip of tips) b.blush.push({ p: tip, r: 0.05 * S, color: hex("#c76b55"), amount: 0.25 });
  b.blush.push({ p: P(0.42, 0, 0.04), r: 0.12 * S, color: hex("#c76b55"), amount: 0.15 });
  const gripCentre = grip === "cup" || grip === "open" || grip === "flat" ? P(0.32, 0, 0.22) : grip === "pinch" ? lerp3(tips[0], t2, 0.5) : grip === "point" ? tips[0] : P(0.45, 0.02, 0.12);
  return { group: handGroup, tips, thumb: t2, grip: gripCentre, frame: { U, V, W: Wn, S }, P };
}

const frameRows = (U, V, W) => [U[0], U[1], U[2], V[0], V[1], V[2], W[0], W[1], W[2]];

/* ------------------------------------------------------------------ */
/* Arms                                                                */
/* ------------------------------------------------------------------ */

/**
 * An arm from the shoulder to the hand: bare skin or a sleeve over it, the elbow placed by a
 * two-bone solve toward `hand` (px, with depth), bending to `bend` (+1 / -1).
 */
/** Two-bone solve: the elbow between a shoulder and a wrist (px), bending to `bend` (+1 / -1), a little toward the viewer. */
function solveArm(person, hu, shoulder, wrist, bend = 1, foreshorten = 1) {
  const L1 = 1.45 * hu * (person.build?.limb ?? 1) * foreshorten;
  const L2 = 1.22 * hu * (person.build?.limb ?? 1) * foreshorten;
  const d = sub(wrist, shoulder);
  const dist = Math.min(len(d), (L1 + L2) * 0.999);
  const dir = norm(d);
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const along = L1 * cosA;
  const off = L1 * Math.sqrt(1 - cosA * cosA);
  const perp = norm([-dir[1] * bend, dir[0] * bend, 0.35]);
  return { elbow: add(shoulder, add(mul(dir, along), mul(perp, off))), wristP: add(shoulder, mul(dir, dist)), dir };
}

function armScene(b, person, F, { shoulder, wrist, bend = 1, sleeve, skin, mat = "skin", foreshorten = 1, upperR = 0.2, foreR = 0.16, wristR = 0.1 }) {
  const hu = F.hu;
  const { elbow, wristP, dir } = solveArm(person, hu, shoulder, wrist, bend, foreshorten);
  const thick = person.build?.limb ?? 1;
  const groups = [];
  const flesh = b.part("arm", mat, skin, { detail: 0.7, flow: { kind: "axis", dir: [dir[0], dir[1]] } });
  const prims = [roundCone(shoulder, elbow, upperR * hu * thick, foreR * 0.95 * hu * thick), roundCone(elbow, wristP, foreR * hu * thick, wristR * hu * thick)];
  // The forearm's muscle swell near the elbow.
  prims.push(ellipsoid(lerp3(elbow, wristP, 0.25), [0.15 * hu * thick, 0.15 * hu * thick, 0.15 * hu * thick]));
  groups.push(group(flesh, prims, { k: 0.08 * hu }));
  if (sleeve) {
    const cloth = b.part("sleeve", sleeve.material ?? "linen", sleeve.color, { detail: 0.5, flow: { kind: "axis", dir: [dir[0], dir[1]] }, folds: [] });
    const reach = { long: 1, cap: 0.3, short: 0.6 }[sleeve.length] ?? 0.6;
    const s2 = lerp3(shoulder, elbow, reach);
    const sl = [roundCone(add(shoulder, mul(norm(sub(shoulder, elbow)), 0.15 * hu)), s2, (upperR + 0.07) * hu * thick, (lerp(upperR, foreR, reach) + 0.06) * hu * thick)];
    if (sleeve.length === "long") sl.push(roundCone(elbow, lerp3(elbow, wristP, 0.92), (foreR + 0.06) * hu * thick, (wristR + 0.06) * hu * thick));
    groups.push(group(cloth, sl, { k: 0.05 * hu }));
    // Folds wrap the sleeve at the elbow and run along it.
    const axis = norm(sub(elbow, shoulder));
    const across = [-axis[1], axis[0]];
    for (let i = 0; i < 4; i++) {
      const c0 = lerp3(shoulder, s2, 0.3 + i * 0.18);
      const w0 = (upperR + 0.08) * hu;
      cloth.folds.push({ pts: [[c0[0] - across[0] * w0, c0[1] - across[1] * w0], [c0[0] + axis[0] * 0.1 * hu, c0[1] + axis[1] * 0.1 * hu], [c0[0] + across[0] * w0, c0[1] + across[1] * w0]], w: 0.07 * hu, a: i % 2 ? -0.6 : 0.8 });
    }
  }
  return { groups, elbow, wrist: wristP };
}

/* ------------------------------------------------------------------ */
/* Held objects                                                        */
/* ------------------------------------------------------------------ */

function orangeGroup(b, c, r, { leaf = true, gold = false } = {}) {
  const fruit = b.part("orange", "fruit", pigment("orange"), { detail: 0.8, flow: { kind: "around" } });
  const out = [group(fruit, [sphere(c, r)])];
  if (leaf) {
    const stem = add(c, [r * 0.05, -r * 0.98, r * 0.1]);
    const leafPart = b.part("leaf", gold ? "gold" : "leaf", gold ? pigment("gold") : pigment("leaf"), { detail: 0.6, flow: { kind: "axis", dir: [0.8, -0.6] } });
    out.push(group(leafPart, [ellipsoid(add(stem, [r * 0.45, -r * 0.28, 0]), [r * 0.48, r * 0.16, r * 0.05], rotation(0, 0, 0.55)), capsule(stem, add(stem, [r * 0.05, -r * 0.18, 0]), r * 0.05)], { k: r * 0.05 }));
  }
  return out;
}

/** Long-bladed garden shears between two grips (px), the blades running on to `tip`, open or shut. */
function shearsGroups(b, { gripA, gripB, tip, open, hu }) {
  const steel = b.part("shears-blade", "metal", pigment("steel"), { detail: 0.5, flow: { kind: "axis", dir: [1, 0] } });
  const wood = b.part("shears-handle", "wood", pigment("wood"), { detail: 0.5, flow: { kind: "axis", dir: [1, 0] } });
  const mid = lerp3(gripA, gripB, 0.5);
  const axis = norm(sub(tip, mid));
  const pivot = lerp3(mid, tip, 0.38);
  const bladeLen = len(sub(tip, pivot));
  const side = norm(cross(axis, [0, 0, 1]));
  const spread = open ? 0.24 : 0.02;
  const blades = [];
  for (const sgn of [1, -1]) {
    const dir = norm(add(axis, mul(side, sgn * spread)));
    const end = add(pivot, mul(dir, bladeLen * (sgn > 0 ? 1 : 0.98)));
    blades.push(roundCone(pivot, end, 0.06 * hu, 0.018 * hu));
  }
  const handles = [roundCone(pivot, gripA, 0.04 * hu, 0.055 * hu), roundCone(pivot, gripB, 0.04 * hu, 0.055 * hu), roundCone(gripA, add(gripA, mul(norm(sub(gripA, pivot)), 0.25 * hu)), 0.055 * hu, 0.05 * hu), roundCone(gripB, add(gripB, mul(norm(sub(gripB, pivot)), 0.25 * hu)), 0.055 * hu, 0.05 * hu)];
  return [group(wood, handles, { k: 0.02 * hu }), group(steel, [...blades, sphere(pivot, 0.05 * hu)], { k: 0.01 * hu })];
}

function knifeGroups(b, { grip, tip, hu }) {
  const steel = b.part("knife-blade", "metal", pigment("steel"), { detail: 0.4, flow: { kind: "axis", dir: [1, 0] } });
  const bone = b.part("knife-handle", "bone", pigment("bone"), { detail: 0.5, flow: { kind: "axis", dir: [1, 0] } });
  const axis = norm(sub(tip, grip));
  const guard = add(grip, mul(axis, 0.24 * hu));
  return [
    group(bone, [roundCone(add(grip, mul(axis, -0.24 * hu)), guard, 0.055 * hu, 0.05 * hu)], {}),
    group(steel, [roundCone(guard, tip, 0.06 * hu, 0.008 * hu)], {}),
  ];
}

function malletGroups(b, { grip, head, hu }) {
  const wood = b.part("mallet", "wood", mixRgb(pigment("wood"), pigment("sand"), 0.25), { detail: 0.5, flow: { kind: "axis", dir: [0, 1] } });
  const axis = norm(sub(head, grip));
  const across = norm(cross(axis, [0, 0, 1]));
  return [group(wood, [capsule(add(grip, mul(axis, -0.15 * hu)), head, 0.045 * hu), roundCone(add(head, mul(across, -0.2 * hu)), add(head, mul(across, 0.2 * hu)), 0.13 * hu, 0.13 * hu)], { k: 0.02 * hu })];
}

function planGroups(b, { centre, width, height, hu, tilt = 0 }) {
  const paper = b.part("plan", "paper", pigment("paper"), { detail: 0.5, flow: { kind: "axis", dir: [1, 0] } });
  return [group(paper, [roundBox(centre, [width / 2, height / 2, 0.02 * hu], 0.015 * hu, rotation(0, tilt, 0))], {})];
}

function jugGroups(b, { centre, hu, spoutDir = [1, 0] }) {
  const clay = b.part("jug", "terracotta", pigment("jug"), { detail: 0.6, flow: { kind: "around" } });
  const [dx, dy] = spoutDir;
  const c = centre;
  const R = 0.3 * hu;
  const neck = add(c, [0, -R * 1.05, 0]);
  const lip = add(c, [0, -R * 1.45, 0]);
  const spout = add(lip, [dx * R * 0.55, dy * R * 0.2 - R * 0.05, 0]);
  return [
    group(
      clay,
      [
        ellipsoid(c, [R, R * 1.05, R]),
        roundCone(neck, lip, R * 0.42, R * 0.48),
        roundCone(lip, spout, R * 0.22, R * 0.1),
        torus(add(c, [-dx * R * 0.85, -R * 0.55, 0]), R * 0.42, R * 0.08, rotation(0, 0, 0)),
      ],
      { k: R * 0.12, cut: [sphere(add(lip, [0, -R * 0.12, 0]), R * 0.3)], kc: R * 0.05 },
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* The figure                                                          */
/* ------------------------------------------------------------------ */

/**
 * Builds a figure for one plate.
 *
 * - `person`: the cast entry (face, hair, garments, build).
 * - `pose`: world units: `base` (ground between the feet), `height` (crown above it), `turn`,
 *   `weight`, `contra`, `head` ({ turn, tilt, roll, gaze }), `arms` ({ right, left }: each
 *   { wrist | grip, hand: { u, w, grip }, bend, z, hold }), `seated`.
 * - `show`: the components to draw ("body", "head", "neck", "arm-right", "arm-left", "caps").
 */
export function buildFigure({ person, pose, view, show, seed, into = null }) {
  const heads = pose.heads ?? person.heads ?? HEADS;
  const b = into ?? builder(view, seed);
  b.seed = seed;
  const F = bodyFrame(pose, view, heads);
  const k = F.k;
  const hu = F.hu;
  const marble = person.kind === "marble";
  const skin = marble ? pigment("marble") : pigment(person.skin ?? "skinWarm");
  const skinMat = marble ? "marble" : "skin";
  const female = person.sex === "female";
  const has = (c) => show.includes(c);
  const garments = person.garments ?? [];
  const main = garments.find((g) => ["tunic", "peplos", "robe", "underdress"].includes(g.kind)) ?? { kind: "robe", pigment: "milkLinen", material: "linen", length: "floor" };
  const mainLength = main.length ?? "floor";
  const seated = !!pose.seated;
  const facing = F.turn < 0 ? -1 : 1;

  // Arms first (they may stand behind the body), decided per arm.
  const arms = {};
  for (const side of ["right", "left"]) {
    const spec = pose.arms?.[side];
    if (!spec) continue;
    const bx = side === "left" ? 1 : -1;
    const [sa] = torsoSection(5.95 * k, person.sex, person.build ?? {}, k);
    const shoulder = F.P(bx * (sa - 0.2), 5.98 * k, -0.02);
    const depth = shoulder[2];
    arms[side] = { spec, shoulder, near: depth > 0 || Math.abs(F.turn) < 15 };
  }
  const sleeveFor = () => {
    const g = garments.find((x) => x.sleeves) ?? main;
    const len0 = g.sleeves ?? (main.kind === "peplos" ? "cap" : "short");
    return { color: marble ? skin : pigment(g.pigment), material: marble ? "marble" : (g.material ?? "linen"), length: len0 };
  };
  const drawArm = (side) => {
    const a = arms[side];
    if (!a || !has(`arm-${side}`)) return;
    const s = a.spec;
    const holdObjs = [];
    let wrist;
    let handInfo = null;
    const handSpec = s.hand ?? {};
    // The hand carries on from the forearm, turned by `handSpec.turn` (radians, in the picture) and
    // tipped by `handSpec.tip` toward the viewer; `handSpec.w` says which way the palm faces.
    let u = handSpec.u ?? [0, 1, 0];
    const fromForearm = (fore) => {
      const t = handSpec.turn ?? 0;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      return norm([fore[0] * c - fore[1] * sn, fore[0] * sn + fore[1] * c, fore[2] + (handSpec.tip ?? 0)]);
    };
    const handOpts = (w0) => ({ wrist: w0, u, w: handSpec.w ?? [0, 0, 1], side, grip: handSpec.grip ?? "hang", hu, skin, mat: skinMat, female });
    if (s.grip || s.tip) {
      // Place the hand so its grip centre (or its index fingertip) lands on the target, its
      // direction following the forearm.
      const target = [...view.toPx(s.grip ?? s.tip), (s.z ?? 0.4) * hu];
      u = fromForearm(norm(sub(target, a.shoulder)));
      for (let iter = 0; iter < 4; iter++) {
        const probe = handGroups(builder(view, `${seed}-probe`), handOpts([0, 0, 0]));
        wrist = sub(target, s.tip ? probe.tips[0] : probe.grip);
        const { elbow } = solveArm(person, hu, a.shoulder, wrist, s.bend ?? (side === "left" ? -1 : 1), s.foreshorten ?? 1);
        if (!handSpec.u) u = fromForearm(norm(sub(wrist, elbow)));
      }
    } else if (s.wrist) {
      wrist = [...view.toPx(s.wrist), (s.z ?? 0.3) * hu];
    } else {
      wrist = add(a.shoulder, [0, 2.55 * hu, 0.1 * hu]);
    }
    const arm = armScene(b, person, F, { shoulder: a.shoulder, wrist, bend: s.bend ?? (side === "left" ? -1 : 1), sleeve: s.bare ? null : sleeveFor(), skin, mat: skinMat, foreshorten: s.foreshorten ?? 1 });
    if (!s.grip && !s.tip && !handSpec.u) u = fromForearm(norm(sub(arm.wrist, arm.elbow)));
    handInfo = handGroups(b, handOpts(arm.wrist));
    for (const hold of s.holds ?? []) holdObjs.push(...hold(b, handInfo, hu));
    b.scene([...arm.groups, handInfo.group, ...holdObjs]);
    a.hand = handInfo;
  };

  // Arms behind the body.
  for (const side of ["right", "left"]) if (arms[side] && !arms[side].near && !arms[side].spec.front) drawArm(side);

  // A plate of arms alone still hides what passes behind the body: the torso as a holdout (it
  // occludes, then is cut away).
  if (has("holdout")) {
    const hold = b.part("holdout", "linen", [0, 0, 0], { holdout: true, z: 0, thick: 0.45 * hu });
    b.path(hold, robeOutline(b, F, person, { length: mainLength, flare: 0.3, ease: 0.05, cap: false, waves: 4, phase: 0, top: 6.75, neckline: 0 }));
    // ...and the shoulders and neck above it, so nothing behind them pokes out.
    const sh = F.P(0, 6.15 * k, 0);
    const [sa] = torsoSection(5.95 * k, person.sex, person.build ?? {}, k);
    const rx = Math.sqrt((sa * F.ct) ** 2 + (0.45 * F.st) ** 2) * hu;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push([sh[0] + Math.cos(a) * rx, sh[1] + Math.sin(a) * 0.55 * hu]);
    }
    b.path(b.part("holdout-shoulders", "linen", [0, 0, 0], { holdout: true, z: 0, thick: 0.3 * hu }), pts);
  }

  if (has("body")) {
    // Feet below the hem (and bare lower legs under a short tunic).
    const feet = b.part("feet", skinMat, skin, { detail: 0.6, flow: { kind: "axis", dir: [F.st, 0.2] } });
    const footGroups = [];
    const bare = (LENGTHS[mainLength] ?? 0) > 0.9;
    const fwdX = F.st;
    const fwdZ = F.ct;
    const footFrame = transpose3(rotation(F.th));
    for (const [bx, fwd] of [
      [F.w * 0.13, 0.0],
      [-F.w * 0.32, 0.36],
    ]) {
      if (seated) continue;
      const ground = F.P(bx, 0, fwd - 0.16);
      const along = (d, up) => add(ground, [fwdX * d * hu, -up * hu, fwdZ * d * hu]);
      const ankle = along(0.02, 0.3);
      footGroups.push(
        sphere(along(-0.02, 0.1), 0.1 * hu),
        ellipsoid(along(0.3, 0.085), [0.115 * hu, 0.085 * hu, 0.36 * hu], footFrame),
        ellipsoid(along(0.6, 0.05), [0.11 * hu, 0.05 * hu, 0.12 * hu], footFrame),
        sphere(ankle, 0.08 * hu),
      );
      if (bare) {
        const kneeP = F.P(bx * 0.9, 2.05 * k, fwd * 0.6 - 0.05);
        footGroups.push(roundCone(kneeP, ankle, 0.17 * hu, 0.085 * hu), ellipsoid(add(lerp3(kneeP, ankle, 0.3), [-fwdX * 0.05 * hu, 0, -fwdZ * 0.05 * hu]), [0.17 * hu, 0.3 * hu, 0.17 * hu]));
      }
      if (!marble) b.marks.push({ pts: [along(0.18, 0.2), along(0.32, 0.12)], w: 0.03 * hu, color: pigment("leather"), alpha: 0.6, normal: [0, 0, 1] }, { pts: [along(0.02, 0.28), along(0.12, 0.26)], w: 0.025 * hu, color: pigment("leather"), alpha: 0.55, normal: [0, 0, 1] });
    }
    if (footGroups.length) b.scene([group(feet, footGroups, { k: 0.05 * hu })]);

    // Back panels (a cloak or a veil hanging behind).
    const cloak = garments.find((g) => g.kind === "cloak");
    if (cloak) {
      const back = b.part("cloak-back", cloak.material ?? "wool", mixRgb(pigment(cloak.pigment), [0, 0, 0], 0.12), { z: -0.2 * hu, thick: 0.25 * hu, flow: { kind: "down" } });
      const pts = robeOutline(b, F, person, { length: "floor", flare: 0.55, ease: 0.12, top: 6.3, waves: 5, phase: 1 });
      b.path(back, pts);
      back.folds = hangingFolds(b, F, person, { flare: 0.55, ease: 0.12 }, 5.6, 0.2, 7, { width: 0.2, depth: 1.2 });
    }
    if (person.headCover?.kind === "veil") {
      const v = person.headCover;
      const drape = b.part("veil-drape", "linen", pigment(v.pigment), { z: -0.1 * hu, flow: { kind: "down" } });
      const hc = F.P(0, 6.95 * k, -0.05);
      const pts = [[hc[0] - 0.46 * hu, hc[1] - 0.2 * hu], [hc[0] + 0.46 * hu, hc[1] - 0.2 * hu], ...surfacePatch(F, person, { ease: 0.12 }, [[100, 6.0], [100, 5.0], [95, 4.4], [0, 4.2], [-95, 4.4], [-100, 5.0], [-100, 6.0]], 0.12)];
      b.path(drape, pts);
      drape.folds = radiatingFolds(b, F, [hc[0], hc[1]], surfacePatch(F, person, { ease: 0.12 }, [[95, 4.5], [70, 4.4], [-70, 4.4], [-95, 4.5]]), { width: 0.14, depth: 0.8 });
    }

    // The main garment.
    const cinch = garments.some((g) => ["apron", "belt", "sash"].includes(g.kind)) && main.kind !== "peplos";
    const mainSpec = { length: mainLength, flare: mainLength === "floor" ? 0.3 : mainLength === "knee" ? 0.14 : 0.22, ease: main.material === "wool" ? 0.08 : 0.06, cinch, waves: 4, phase: b.rand.range(0, 3) };
    if (seated) Object.assign(mainSpec, { length: "hip" });
    const robe = b.part(main.kind, marble ? "marble" : (main.material ?? "linen"), marble ? skin : pigment(main.pigment), { z: 0, flow: { kind: "down" }, trim: main.trim ? pigment(main.trim) : null });
    b.path(robe, robeOutline(b, F, person, mainSpec));
    const heavy = main.material === "wool";
    robe.folds.push(...hangingFolds(b, F, person, mainSpec, 4.4, LENGTHS[mainSpec.length] ?? 0.2, heavy ? 6 : 9, { width: heavy ? 0.17 : 0.1, depth: heavy ? 1.2 : 0.9 }));
    robe.folds.push(...radiatingFolds(b, F, F.P(F.w * 0.7, 5.95 * k, 0.3).slice(0, 2), surfacePatch(F, person, mainSpec, [[-20, 4.7], [0, 4.6], [20, 4.7]]), { width: 0.08, depth: 0.6 }));
    robe.folds.push(...radiatingFolds(b, F, F.P(-F.w * 0.7, 5.95 * k, 0.3).slice(0, 2), surfacePatch(F, person, mainSpec, [[-35, 4.8], [-10, 4.6]]), { width: 0.08, depth: 0.6 }));
    // The free knee pushes the cloth forward; folds run from the weight hip to it.
    const knee = F.P(-F.w * 0.36, 2.05 * k, 0.55);
    if (!seated && LENGTHS[mainLength] < 2) {
      robe.bumps.push({ x: knee[0], y: knee[1], rx: 0.32 * hu, ry: 0.42 * hu, a: 0.5 * hu });
      robe.folds.push(...radiatingFolds(b, F, knee.slice(0, 2), surfacePatch(F, person, mainSpec, [[F.w * 60, 3.9], [F.w * 30, 3.6]]), { width: 0.1, depth: 0.7 }));
    }
    if (female && !seated) for (const bx of [-0.36, 0.36]) {
      const p = F.P(bx, 5.25 * k, 0.5);
      robe.bumps.push({ x: p[0], y: p[1], rx: 0.3 * hu, ry: 0.26 * hu, a: 0.25 * hu });
    }

    // Seated: the lap over the thighs, lower legs, the stool.
    if (seated) {
      const lap = b.part("lap", main.material ?? "wool", pigment(main.pigment), { z: 0.1 * hu, thick: 0.4 * hu, flow: { kind: "axis", dir: [facing, 0.2] } });
      const hip = F.P(0, 3.4 * k, 0);
      const kneeP = add(hip, [facing * 1.6 * hu, 0.1 * hu, 0]);
      const lw = 0.42 * hu;
      lap.folds = [];
      b.path(lap, [[hip[0] - facing * 0.75 * hu, hip[1] - lw], [kneeP[0], kneeP[1] - lw * 0.8], [kneeP[0] + facing * 0.3 * hu, kneeP[1] + lw * 0.2], [kneeP[0] + facing * 0.1 * hu, kneeP[1] + lw * 1.4], [hip[0], hip[1] + lw * 1.1], [hip[0] - facing * 0.8 * hu, hip[1] + lw * 0.6]]);
      for (let i = 0; i < 4; i++) lap.folds.push({ pts: [[hip[0], hip[1] - lw * 0.6 + i * lw * 0.45], [kneeP[0], kneeP[1] - lw * 0.5 + i * lw * 0.35]], w: 0.1 * hu, a: i % 2 ? -0.8 : 1 });
      const legs = b.part("shins", skinMat, skin, { detail: 0.6, flow: { kind: "axis", dir: [0, 1] } });
      const stool = b.part("stool", "wood", pigment("wood"), { detail: 0.4, flow: { kind: "axis", dir: [1, 0] } });
      const ground = view.toPx(pose.base)[1];
      b.scene([group(stool, [roundBox([hip[0] - facing * 0.1 * hu, hip[1] + 0.75 * hu, -0.2 * hu], [0.7 * hu, 0.07 * hu, 0.5 * hu], 0.03 * hu), capsule([hip[0] - facing * 0.7 * hu, hip[1] + 0.8 * hu, -0.1 * hu], [hip[0] - facing * 0.75 * hu, ground, -0.1 * hu], 0.05 * hu), capsule([hip[0] + facing * 0.5 * hu, hip[1] + 0.8 * hu, -0.1 * hu], [hip[0] + facing * 0.55 * hu, ground, -0.1 * hu], 0.05 * hu)], { k: 0.02 * hu })]);
      const shinTop = add(kneeP, [0, 0.3 * hu, 0.2 * hu]);
      b.scene([group(legs, [roundCone(shinTop, [shinTop[0] - facing * 0.05 * hu, ground - 0.25 * hu, 0.2 * hu], 0.17 * hu, 0.1 * hu), roundCone([shinTop[0] - facing * 0.05 * hu, ground - 0.12 * hu, 0.2 * hu], [shinTop[0] + facing * 0.55 * hu, ground - 0.06 * hu, 0.35 * hu], 0.11 * hu, 0.09 * hu)], { k: 0.05 * hu })]);
    }

    // Overgarments, back to front: each lies on what is beneath it.
    const onMain = { ...mainSpec };
    for (const g of garments) {
      const color = marble ? skin : pigment(g.pigment);
      const material = marble ? "marble" : (g.material ?? "linen");
      if (g.kind === "overfold") {
        const over = b.part("overfold", material, color, { overlay: true, z: 0.02 * hu, thick: 0.1 * hu, flow: { kind: "down" }, trim: g.trim ? pigment(g.trim) : null });
        b.path(over, robeOutline(b, F, person, { length: 3.3, flare: 0.08, ease: 0.11, waves: 3, phase: 1.3 }));
        over.folds = hangingFolds(b, F, person, { flare: 0.08, ease: 0.11 }, 5.7, 3.4, 7, { width: 0.09, depth: 0.9 });
      } else if (g.kind === "apron") {
        const apron = b.part("apron", material, color, { overlay: true, z: 0.02 * hu, thick: 0.08 * hu, flow: { kind: "down" } });
        const top = g.material === "leather" ? 5.35 : 4.75;
        const bottom = seated ? 3.3 : 2.3;
        b.path(apron, surfacePatch(F, person, onMain, [[-34, top], [34, top], [50, top - 0.35], [58, 3.6], [62, bottom + 0.2], [40, bottom], [0, bottom - 0.08], [-40, bottom], [-62, bottom + 0.2], [-58, 3.6], [-50, top - 0.35]], 0.03));
        apron.folds = hangingFolds(b, F, person, onMain, top - 0.25, bottom + 0.05, g.material === "leather" ? 3 : 5, { width: g.material === "leather" ? 0.16 : 0.12, depth: 0.9, spread: 0.3, phiRange: [F.visible(-48), F.visible(48)] });
        if (g.material !== "leather") {
          const tie = b.part("apron-tie", "linen", mixRgb(color, pigment("sand"), 0.5), { overlay: true, z: 0.05 * hu, thick: 0.05 * hu, flow: { kind: "axis", dir: [1, 0] } });
          const pairs = [];
          for (let phi = -110; phi <= 110; phi += 20) pairs.push([phi, top + 0.05]);
          for (let phi = 110; phi >= -110; phi -= 20) pairs.push([phi, top - 0.04]);
          b.path(tie, surfacePatch(F, person, onMain, pairs, 0.05));
        }
        if (g.material === "leather") b.marks.push({ pts: [F.P(-0.35, 5.35 * k, 0.45), F.P(-0.18, 6.15 * k, 0.3)], w: 0.05 * hu, color: mixRgb(color, [0, 0, 0], 0.3), alpha: 0.8, normal: [0, 0, 1] }, { pts: [F.P(0.35, 5.35 * k, 0.45), F.P(0.18, 6.15 * k, 0.3)], w: 0.05 * hu, color: mixRgb(color, [0, 0, 0], 0.3), alpha: 0.8, normal: [0, 0, 1] });
      } else if (g.kind === "mantle") {
        const mantle = b.part("mantle", material, color, { overlay: true, z: 0.03 * hu, thick: 0.14 * hu, flow: { kind: "down" } });
        const s = 1; // over the person's left shoulder
        const pairs = [[s * 95, 6.1], [s * 40, 6.25], [s * 5, 5.6], [-s * 40, 4.75], [-s * 95, 4.3], [-s * 95, 2.4], [-s * 35, 2.0], [s * 30, 1.85], [s * 95, 2.0], [s * 100, 4.0], [s * 100, 5.5]];
        b.path(mantle, surfacePatch(F, person, onMain, pairs, 0.05));
        const sh = F.P(s * 0.75, 6.05 * k, 0.2).slice(0, 2);
        mantle.folds = [
          ...radiatingFolds(b, F, sh, surfacePatch(F, person, onMain, [[-s * 70, 4.4], [-s * 40, 4.0], [-s * 10, 3.7], [s * 20, 3.4]], 0.05), { width: 0.15, depth: 1.1 }),
          ...hangingFolds(b, F, person, onMain, 3.5, 2.05, 5, { width: 0.15, depth: 1 }),
        ];
      } else if (g.kind === "robe" && g !== main) {
        // An open robe over the underdress: two panels from the shoulders, the dress showing between.
        const robe2 = b.part("open-robe", material, color, { overlay: true, z: 0.03 * hu, thick: 0.12 * hu, flow: { kind: "down" } });
        const open = F.visible(F.turn < 0 ? -24 : 24);
        const len2 = (LENGTHS[g.length] ?? 1.0) + 0.05;
        const pairs = [];
        const near = F.turn < 0 ? [F.visible(200), open + 18] : [open - 18, F.visible(-200)];
        for (const y of [6.25, 5.6, 4.6, 3.4, 2.2, len2]) pairs.push([near[0], y]);
        for (const y of [len2 - 0.05, 2.2, 3.4, 4.6, 5.6, 6.3]) pairs.push([near[1], y]);
        b.path(robe2, surfacePatch(F, person, { ...onMain, flare: (onMain.flare ?? 0.3) + 0.08 }, pairs, 0.07));
        robe2.folds = hangingFolds(b, F, person, onMain, 5.4, len2 + 0.1, 5, { width: 0.1, depth: 1, phiRange: [Math.min(...near), Math.max(...near)] });
      } else if (g.kind === "cloak") {
        const front = b.part("cloak", material, color, { overlay: true, z: 0.03 * hu, thick: 0.16 * hu, flow: { kind: "down" } });
        // Two falling panels over both shoulders, open down the front (the tunic shows between them).
        const open = F.visible(F.turn < 0 ? -18 : 18);
        const panel = (from, to) => {
          const pairs = [];
          for (const y of [6.2, 5.6, 4.6, 3.4, 2.2, 1.0, 0.18]) pairs.push([from, y]);
          for (const y of [0.15, 1.0, 2.2, 3.4, 4.6, 5.8, 6.25]) pairs.push([to - (to - from) * 0.0, y]);
          return surfacePatch(F, person, { flare: 0.45, ease: 0.12 }, pairs, 0.13);
        };
        const near = F.turn < 0 ? [F.visible(200), open + 14] : [open - 14, F.visible(-200)];
        b.path(front, panel(near[0], near[1]));
        front.folds = hangingFolds(b, F, person, { flare: 0.45, ease: 0.13 }, 5.4, 0.25, 6, { width: 0.2, depth: 1.25, phiRange: [Math.min(...near), Math.max(...near)] });
        front.folds.push(...radiatingFolds(b, F, F.P(0.8 * (F.turn < 0 ? 1 : -1), 6.0 * k, 0.2).slice(0, 2), surfacePatch(F, person, { flare: 0.45, ease: 0.13 }, [[near[0] * 0.8, 4.2], [lerp(near[0], near[1], 0.5), 4.4]]), { width: 0.14, depth: 0.9 }));
      } else if (g.kind === "sash" || g.kind === "belt") {
        const band = b.part(g.kind, material, color, { overlay: true, z: 0.03 * hu, thick: 0.06 * hu, flow: { kind: "axis", dir: [1, 0.05] } });
        const y0 = g.kind === "sash" ? (female ? 4.95 : 4.6) : 4.55;
        const y1 = y0 + (g.kind === "sash" ? 0.24 : 0.2);
        const pairs = [];
        for (let phi = -100; phi <= 100; phi += 20) pairs.push([phi, y1]);
        for (let phi = 100; phi >= -100; phi -= 20) pairs.push([phi, y0]);
        b.path(band, surfacePatch(F, person, onMain, pairs, 0.04));
        if (g.kind === "sash") {
          const knot = surfacePatch(F, person, { ease: 0.1 }, [[F.visible(-60 * F.w), y0 + 0.1]], 0.12)[0];
          const ends = b.part("sash-ends", material, color, { overlay: true, z: 0.05 * hu, thick: 0.06 * hu, flow: { kind: "down" } });
          b.path(ends, [[knot[0] - 0.1 * hu, knot[1]], [knot[0] + 0.12 * hu, knot[1]], [knot[0] + 0.2 * hu, knot[1] + 1.1 * hu], [knot[0] + 0.05 * hu, knot[1] + 1.2 * hu], [knot[0] - 0.05 * hu, knot[1] + 0.9 * hu], [knot[0] - 0.18 * hu, knot[1] + 1.05 * hu], [knot[0] - 0.2 * hu, knot[1] + 0.95 * hu]]);
          ends.folds = [{ pts: [[knot[0], knot[1]], [knot[0] + 0.1 * hu, knot[1] + 1.0 * hu]], w: 0.06 * hu, a: -1 }];
        }
        if (g.tools) {
          const tools = b.part("tools", "metal", pigment("steel"), { detail: 0.4, flow: { kind: "axis", dir: [0, 1] } });
          const wood = b.part("tool-handles", "wood", pigment("wood"), { detail: 0.4, flow: { kind: "axis", dir: [0, 1] } });
          const t0 = F.P(-F.w * 0.55, 4.5 * k, 0.45);
          const t1 = F.P(-F.w * 0.3, 4.5 * k, 0.5);
          b.scene([group(wood, [capsule(t0, add(t0, [0.03 * hu, 0.35 * hu, 0.05 * hu]), 0.05 * hu)], {}), group(tools, [roundCone(add(t0, [0.03 * hu, 0.35 * hu, 0.05 * hu]), add(t0, [0.05 * hu, 0.75 * hu, 0.08 * hu]), 0.03 * hu, 0.02 * hu), roundBox(add(t1, [0.12 * hu, 0.3 * hu, 0.05 * hu]), [0.03 * hu, 0.32 * hu, 0.012 * hu], 0.01 * hu), roundBox(add(t1, [0.0, 0.6 * hu, 0.05 * hu]), [0.2 * hu, 0.03 * hu, 0.012 * hu], 0.01 * hu)], { k: 0.01 * hu })]);
        }
      }
    }

    // Sleeve caps at the shoulders, when the arms are not on this plate.
    if (has("caps")) {
      const sl = sleeveFor();
      const caps = b.part("sleeve-caps", sl.material, sl.color, { detail: 0.5, flow: { kind: "down" } });
      const prims = [];
      for (const side of ["right", "left"]) {
        if (pose.capsOnly && !pose.capsOnly.includes(side)) continue;
        const bx = side === "left" ? 1 : -1;
        const [sa] = torsoSection(5.95 * k, person.sex, person.build ?? {}, k);
        const sh = F.P(bx * (sa - 0.2), 5.98 * k, -0.02);
        prims.push(roundCone(sh, add(sh, [bx * F.ct * 0.08 * hu, 0.75 * hu, 0.05 * hu]), 0.27 * hu, 0.22 * hu));
      }
      if (prims.length) b.scene([group(caps, prims, { k: 0.05 * hu })]);
    }
  }

  // The neck stub of a body whose head is its own plate.
  if (has("neck") && !has("head")) {
    const neck = b.part("neck", skinMat, skin, { detail: 0.6, flow: { kind: "axis", dir: [0, 1] } });
    const n0 = F.P(0, 6.25 * k, -0.05);
    b.scene([group(neck, [roundCone(n0, add(n0, [0, -0.38 * hu, 0]), 0.23 * hu, 0.21 * hu)], {})]);
  }

  // Head
  if (has("head")) {
    const hp = pose.head ?? {};
    const neckTop = F.P(0, 6.55 * k, -0.02);
    const hs = hp.scale ?? 1;
    const c = [neckTop[0], neckTop[1] - 0.45 * hu * hs, neckTop[2] + 0.02 * hu];
    if (hp.offset) {
      c[0] += hp.offset[0] * hu;
      c[1] -= hp.offset[1] * hu;
    }
    c[1] += Math.max(0, hp.tilt ?? 0) * 0.006 * hu;
    const { groups } = headScene(b, person, { c, hu: hu * hs, neck: false, yaw: (hp.turn ?? F.turn) * DEG, pitch: -(hp.tilt ?? 0) * DEG, roll: (hp.roll ?? 0) * DEG, mat: skinMat, gaze: hp.gaze ?? "level", neckLength: hp.neckLength ?? 1.15 });
    // The neck stays upright in the body; the head turns and tips on top of it.
    const neckPart = b.part("neck", skinMat, skin, { detail: 0.7, flow: { kind: "axis", dir: [0, 1] } });
    const n0 = F.P(0, 6.05 * k, -0.08);
    const hm = rotation((hp.turn ?? F.turn) * DEG, -(hp.tilt ?? 0) * DEG, (hp.roll ?? 0) * DEG);
    const chin = fromLocal(c, hm, hu * hs, [0, -0.28, -0.1]);
    groups.unshift(group(neckPart, [roundCone(n0, chin, 0.21 * hu * (person.build?.neck ?? 1), 0.17 * hu * hs * (person.build?.neck ?? 1))], {}));
    b.scene(groups);
  }

  // Arms in front of the body.
  for (const side of ["right", "left"]) if (arms[side] && (arms[side].near || arms[side].spec.front)) drawArm(side);

  return { ...b, hu, frame: F, arms };
}

/**
 * A hand on its own (close-ups): a forearm from `elbow` (world, usually outside the plate) to the
 * wrist, then the hand, placed so that its grip centre (`target: "grip"`), its index fingertip
 * ("tip") or its middle fingertip ("tips") lands on `at` (world). `scale` is the head unit in world
 * units (the hand is about 0.75 of it).
 */
export function buildHand({ person, view, seed, elbow, at, target = "grip", hand, holds = [], cuff, scale = 1, z = 0.1 }) {
  const b = builder(view, seed);
  b.seed = seed;
  const hu = scale * view.s;
  const skin = pigment(person.skin ?? "skinWarm");
  const E = [...view.toPx(elbow), 0];
  const T = [...view.toPx(at), z * hu];
  const opts = (w0, u) => ({ wrist: w0, u, w: hand.w, side: hand.side ?? "right", grip: hand.grip ?? "hang", hu, skin, female: person.sex === "female", size: hand.size ?? 1 });
  const turn = (v) => {
    const t = hand.turn ?? 0;
    return norm([v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t), v[2] + (hand.tip ?? 0)]);
  };
  let u = turn(norm(sub(T, E)));
  let Wr = T;
  for (let iter = 0; iter < 4; iter++) {
    const probe = handGroups(builder(view, `${seed}-probe`), opts([0, 0, 0], u));
    const off = target === "tip" ? probe.tips[0] : target === "tips" ? probe.tips[1] : probe.grip;
    Wr = sub(T, off);
    u = turn(norm(sub(Wr, E)));
  }
  const fore = norm(sub(Wr, E));
  const arm = b.part("forearm", "skin", skin, { detail: 0.7, flow: { kind: "axis", dir: fore.slice(0, 2) } });
  const groups = [group(arm, [roundCone(E, Wr, 0.2 * hu, 0.11 * hu), ellipsoid(add(Wr, mul(fore, -0.95 * hu)), [0.19 * hu, 0.19 * hu, 0.17 * hu])], { k: 0.1 * hu })];
  if (cuff) {
    const c = b.part("cuff", cuff.material ?? "linen", pigment(cuff.pigment), { detail: 0.5, flow: { kind: "axis", dir: fore.slice(0, 2) }, folds: [] });
    const c0 = add(Wr, mul(fore, -(cuff.from ?? 1.6) * hu));
    const c1 = add(Wr, mul(fore, -(cuff.to ?? 0.55) * hu));
    groups.push(group(c, [roundCone(c0, c1, 0.25 * hu, 0.21 * hu), torus(c1, 0.17 * hu, 0.06 * hu, frameRows(...orthoFrame(fore)))], { k: 0.04 * hu }));
    const across = [-fore[1], fore[0]];
    for (let i = 0; i < 5; i++) {
      const p = lerp3(c0, c1, 0.1 + i * 0.18);
      c.folds.push({ pts: [[p[0] - across[0] * 0.25 * hu, p[1] - across[1] * 0.25 * hu], [p[0] + fore[0] * 0.08 * hu, p[1] + fore[1] * 0.08 * hu], [p[0] + across[0] * 0.25 * hu, p[1] + across[1] * 0.25 * hu]], w: 0.07 * hu, a: i % 2 ? -0.7 : 0.9 });
    }
  }
  const h = handGroups(b, opts(Wr, u));
  const extra = holds.flatMap((hold) => hold(b, h, hu));
  b.scene([...groups, h.group, ...extra]);
  if (hand.ring) {
    const ring = b.part("ring", "metal", pigment("silverMetal"), { detail: 0.3, flow: { kind: "around" } });
    const at2 = h.P(0.5, -0.045, 0.0);
    b.scene([group(ring, [torus(at2, 0.05 * hu, 0.014 * hu, frameRows(h.frame.V, h.frame.W, h.frame.U))], {})]);
  }
  return { ...b, hu, hand: h };
}

/** Two perpendicular unit vectors completing a frame around `n` (rows: a, b, n). */
function orthoFrame(n) {
  const a = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]));
  const c = cross(n, a);
  return [a, c, n];
}

const capsuleGroup = (part, a, b, r) => group(part, [capsule(a, b, r)]);

export const objects = { orangeGroup, shearsGroups, knifeGroups, malletGroups, planGroups, jugGroups, capsuleGroup };
export { builder };
export const vec = { add, sub, mul, dot, cross, len, norm, lerp3 };
