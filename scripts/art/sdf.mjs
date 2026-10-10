/**
 * Signed distance fields for the stand-in painter's rounded forms: heads (brow, nose, cheek, chin,
 * ear), hands with grouped fingers, bare limbs, sleeves, and held objects. A scene is a list of
 * groups (one material each) of primitives; it is sphere-traced orthographically, straight down the
 * view axis, into coverage, height (toward the viewer) and a surface normal per pixel.
 *
 * Coordinates are plate pixels: x right, y down, z toward the viewer.
 */

import { clamp } from "./raster.mjs";

/* ------------------------------------------------------------------ */
/* Primitives: each returns { d(x, y, z), bound: [cx, cy, cz, r] }      */
/* ------------------------------------------------------------------ */

export function sphere([cx, cy, cz], r) {
  return { d: (x, y, z) => Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r, bound: [cx, cy, cz, r] };
}

/** An ellipsoid with radii along the axes of an optional rotation `m` (3x3, rows), centred at c. */
export function ellipsoid([cx, cy, cz], [rx, ry, rz], m = null) {
  const r = Math.max(rx, ry, rz);
  return {
    d: (x, y, z) => {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (m) {
        const qx = m[0] * px + m[1] * py + m[2] * pz;
        const qy = m[3] * px + m[4] * py + m[5] * pz;
        const qz = m[6] * px + m[7] * py + m[8] * pz;
        px = qx;
        py = qy;
        pz = qz;
      }
      const ax = px / rx;
      const ay = py / ry;
      const az = pz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const k1 = Math.sqrt((ax / rx) ** 2 + (ay / ry) ** 2 + (az / rz) ** 2);
      return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
    bound: [cx, cy, cz, r],
  };
}

/** A cone with rounded ends: radius r1 at a, r2 at b (a tapered limb or finger segment). */
export function roundCone([ax, ay, az], [bx, by, bz], r1, r2) {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz || 1e-6;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return {
    d: (x, y, z) => {
      const pax = x - ax;
      const pay = y - ay;
      const paz = z - az;
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const xvx = pax * l2 - bax * yy;
      const xvy = pay * l2 - bay * yy;
      const xvz = paz * l2 - baz * yy;
      const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
    bound: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.sqrt(l2) / 2 + Math.max(r1, r2)],
  };
}

export const capsule = (a, b, r) => roundCone(a, b, r, r);

/** A box with rounded edges, half sizes [hx, hy, hz], radius rad, rotated by `m` (rows). */
export function roundBox([cx, cy, cz], [hx, hy, hz], rad, m = null) {
  return {
    d: (x, y, z) => {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (m) {
        const qx = m[0] * px + m[1] * py + m[2] * pz;
        const qy = m[3] * px + m[4] * py + m[5] * pz;
        const qz = m[6] * px + m[7] * py + m[8] * pz;
        px = qx;
        py = qy;
        pz = qz;
      }
      const qx = Math.abs(px) - hx + rad;
      const qy = Math.abs(py) - hy + rad;
      const qz = Math.abs(pz) - hz + rad;
      const o = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2);
      return o + Math.min(Math.max(qx, qy, qz), 0) - rad;
    },
    bound: [cx, cy, cz, Math.sqrt(hx * hx + hy * hy + hz * hz)],
  };
}

/** A torus of radius R (tube r) around the axis `m` row 2 (its normal), centred at c. */
export function torus([cx, cy, cz], R, r, m = null) {
  return {
    d: (x, y, z) => {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (m) {
        const qx = m[0] * px + m[1] * py + m[2] * pz;
        const qy = m[3] * px + m[4] * py + m[5] * pz;
        const qz = m[6] * px + m[7] * py + m[8] * pz;
        px = qx;
        py = qy;
        pz = qz;
      }
      const q = Math.sqrt(px * px + py * py) - R;
      return Math.sqrt(q * q + pz * pz) - r;
    },
    bound: [cx, cy, cz, R + r],
  };
}

/** A flat disc (cylinder) of radius R and half thickness h, axis along `m` row 2. */
export function disc([cx, cy, cz], R, h, m = null, round = 0) {
  return {
    d: (x, y, z) => {
      let px = x - cx;
      let py = y - cy;
      let pz = z - cz;
      if (m) {
        const qx = m[0] * px + m[1] * py + m[2] * pz;
        const qy = m[3] * px + m[4] * py + m[5] * pz;
        const qz = m[6] * px + m[7] * py + m[8] * pz;
        px = qx;
        py = qy;
        pz = qz;
      }
      const dx = Math.sqrt(px * px + py * py) - R + round;
      const dz = Math.abs(pz) - h + round;
      return Math.min(Math.max(dx, dz), 0) + Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dz, 0) ** 2) - round;
    },
    bound: [cx, cy, cz, R + h],
  };
}

/** Rotation matrix (rows) from yaw (about y), pitch (about x) and roll (about z), radians. Applied to local -> world. */
export function rotation(yaw = 0, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // R = Rz(roll) * Rx(pitch) * Ry(yaw)
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return mul3(rz, mul3(rx, ry));
}

export function mul3(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return out;
}

export const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const apply3 = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Smooth subtraction: a with b carved out. */
export const ssub = (a, b, k) => {
  const h = clamp(0.5 - (0.5 * (a + b)) / k);
  return a * (1 - h) + -b * h + k * h * (1 - h);
};

/**
 * A group: one material, the smooth union of `add` minus the smooth union of `cut`.
 * `part` is the painter's part (name, material, colour, ...).
 */
export function group(part, add, { k = 0, cut = [], kc = 0, clip = null } = {}) {
  const bounds = add.map((p) => p.bound);
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const b of bounds) {
    bx += b[0];
    by += b[1];
    bz += b[2];
  }
  bx /= bounds.length;
  by /= bounds.length;
  bz /= bounds.length;
  let br = 0;
  for (const b of bounds) br = Math.max(br, Math.sqrt((b[0] - bx) ** 2 + (b[1] - by) ** 2 + (b[2] - bz) ** 2) + b[3]);
  return {
    part,
    bound: [bx, by, bz, br + k],
    d: (x, y, z) => {
      let d = Infinity;
      for (const p of add) d = smin(d, p.d(x, y, z), k);
      for (const c of cut) d = ssub(d, c.d(x, y, z), kc || k || 1);
      if (clip) d = Math.max(d, clip(x, y, z));
      return d;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tracing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Sphere-traces a scene (a list of groups) into the image buffers, over whatever earlier layers
 * left (painter's order): `cover` (0..1), `height` (z of the front-most surface, px), `normal` (3
 * floats per pixel), `owner` (part id, the group's `part.id`).
 */
export function traceScene(groups, img) {
  if (!groups.length) return;
  const { W, H } = img;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let zTop = -Infinity;
  let zBottom = Infinity;
  for (const g of groups) {
    const [cx, cy, cz, r] = g.bound;
    x0 = Math.min(x0, cx - r);
    x1 = Math.max(x1, cx + r);
    y0 = Math.min(y0, cy - r);
    y1 = Math.max(y1, cy + r);
    zTop = Math.max(zTop, cz + r);
    zBottom = Math.min(zBottom, cz - r);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W - 1, Math.ceil(x1));
  y1 = Math.min(H - 1, Math.ceil(y1));
  zTop += 1;

  const sceneD = (x, y, z, out) => {
    let best = Infinity;
    let who = -1;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const [cx, cy, cz, r] = g.bound;
      const bd = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r;
      if (bd > best) continue;
      const d = bd > 4 ? bd : g.d(x, y, z);
      if (d < best) {
        best = d;
        who = i;
      }
    }
    if (out) out.who = who;
    return best;
  };

  const hit = { who: -1 };
  const e = 0.6;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let z = zTop;
      let minD = Infinity;
      let zMin = z;
      let found = false;
      for (let step = 0; step < 96 && z > zBottom; step++) {
        const d = sceneD(px, py, z, null);
        if (d < minD) {
          minD = d;
          zMin = z;
        }
        if (d < 0.35) {
          found = true;
          break;
        }
        z -= Math.max(d * 0.9, 0.3);
      }
      const i = y * W + x;
      const cover = found ? 1 : clamp(1 - minD / 1.1);
      if (cover <= 0.02) continue;
      // A near miss: the edge pixel takes the surface where the ray passed closest.
      if (!found) z = zMin;
      sceneD(px, py, z, hit);
      if (hit.who < 0) continue;
      const nx = sceneD(px + e, py, z) - sceneD(px - e, py, z);
      const ny = sceneD(px, py + e, z) - sceneD(px, py - e, z);
      const nz = sceneD(px, py, z + e) - sceneD(px, py, z - e);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      if (!found && img.cover[i] > 0) {
        // Keep whatever is already there; only soften its edge.
        img.cover[i] = Math.max(img.cover[i], cover);
        continue;
      }
      img.cover[i] = Math.max(img.cover[i] * (found ? 0 : 1), cover);
      img.height[i] = z;
      img.normal[i * 3] = nx / len;
      img.normal[i * 3 + 1] = ny / len;
      img.normal[i * 3 + 2] = Math.max(0.02, nz / len);
      img.owner[i] = groups[hit.who].part.id;
      img.sdf[i] = 1;
    }
  }
}
