import { seeded } from "@/lib/progress";

/**
 * A cloth with weight and drape (pure): a grid of particles joined by stretch, shear and bend links,
 * simulated with position-based dynamics on a fixed step under gravity, the air's drag on its face and
 * seeded gusts, and stored as frames (`simulateCloth`). The stage reads it back by story time
 * (`clothAt`, linear between stored frames), so the cloth at any progress is a lookup: deterministic,
 * and exactly reversible when scrolling back. It runs once, a few screens before it is needed.
 *
 * Units are world units and seconds; space is the lens (x right, y up, z toward the viewer).
 */

export interface ClothSpec {
  seed: string;
  /** Particles across and down. */
  nx: number;
  ny: number;
  /** Size at rest. */
  width: number;
  height: number;
  /** Where the middle of its top edge hangs before it falls. */
  top: readonly [number, number, number];
  /** Downward gravity. */
  gravity: number;
  /** Drag of the air on the cloth as a whole (per second): it sets the speed it falls at. */
  drag: number;
  /** Extra drag across its face (per second, on the speed square to the cloth): the air billows it. */
  faceDrag: number;
  /** The air's speed (it blows the cloth), with seeded gusts of this size and rate. */
  wind: readonly [number, number, number];
  gust: number;
  gustRate: number;
  /** The hem (bottom row) weighs this many times a row of the body: it falls first and keeps the cloth hanging. */
  hem: number;
  /** Seconds it hangs from its two top corners to find its drape before it is let go (not stored). */
  settle: number;
  /** How far apart the two corners hang, as a share of its width: less than 1 leaves slack, which drapes into folds. */
  pinSpan: number;
  /** The right corner is let go this many seconds after the left: the cloth swings as it falls. */
  stagger: number;
  /** Seconds simulated after it is let go, and frames stored per second. */
  duration: number;
  rate: number;
  /** Steps per stored frame, and link passes per step. */
  substeps: number;
  iterations: number;
  /** Stiffness of the bend links (0 to 1; stretch and shear are 1). */
  bend: number;
}

export interface ClothFrames {
  nx: number;
  ny: number;
  /** Stored frames, `rate` per second from the moment it is let go. */
  count: number;
  rate: number;
  /** `count * nx * ny * 3` positions. */
  positions: Float32Array;
}

interface Link {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
}

/** Runs the cloth and stores its frames (all at once). */
export function simulateCloth(spec: ClothSpec): ClothFrames {
  const run = clothSteps(spec);
  for (let r = run.next(); ; r = run.next()) if (r.done) return r.value;
}

/**
 * The same, one stretch at a time: a generator that yields after every `chunk` steps, so the stage can
 * run it across idle moments (`runInIdle`) without holding up a frame.
 */
export function* clothSteps(spec: ClothSpec, chunk = 24): Generator<number, ClothFrames, void> {
  const { nx, ny } = spec;
  const n = nx * ny;
  const rand = seeded(spec.seed);
  const pos = new Float64Array(n * 3);
  const prev = new Float64Array(n * 3);
  const inv = new Float64Array(n);
  const dx = spec.width / (nx - 1);
  const dy = spec.height / (ny - 1);
  // Hanging flat, a little rippled so the drape finds folds of its own.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[3 * k] = spec.top[0] - spec.width / 2 + i * dx;
      pos[3 * k + 1] = spec.top[1] - j * dy;
      pos[3 * k + 2] = spec.top[2] + (rand() - 0.5) * 0.02 * dx;
      inv[k] = j === ny - 1 ? 1 / spec.hem : 1;
    }
  }
  prev.set(pos);

  const links: Link[] = [];
  const link = (a: number, b: number, stiffness: number) => {
    const rest = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
    links.push({ a, b, rest, stiffness });
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i + 1 < nx) link(k, k + 1, 1);
      if (j + 1 < ny) link(k, k + nx, 1);
      if (i + 1 < nx && j + 1 < ny) {
        link(k, k + nx + 1, 1);
        link(k + 1, k + nx, 1);
      }
      if (i + 2 < nx) link(k, k + 2, spec.bend);
      if (j + 2 < ny) link(k, k + 2 * nx, spec.bend);
    }
  }

  // Gusts: a few seeded waves of wind across the cloth, so it never moves in lockstep.
  const waves = Array.from({ length: 3 }, () => ({ kx: (rand() - 0.5) * 3, ky: (rand() - 0.5) * 3, rate: spec.gustRate * (0.7 + 0.6 * rand()), phase: rand() * Math.PI * 2, dir: [rand() - 0.5, rand() - 0.5, rand() - 0.5] as const }));
  const normals = new Float64Array(n * 3);
  const pinned = [0, nx - 1];
  // The corners hang closer together than the cloth is wide: the slack drapes.
  for (const k of pinned) pos[3 * k] = spec.top[0] + (pos[3 * k] - spec.top[0]) * spec.pinSpan;
  prev.set(pos);

  const step = 1 / (spec.rate * spec.substeps);
  const totalSteps = Math.round(spec.settle / step);
  const frames = Math.floor(spec.duration * spec.rate) + 1;
  const positions = new Float32Array(frames * n * 3);
  const anchor = pinned.map((k) => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]] as const);

  /** `hold`: both corners held; `holdRight`: only the right one still is. */
  const run = (time: number, hold: boolean, holdRight = false) => {
    computeNormals(pos, nx, ny, normals);
    for (let k = 0; k < n; k++) {
      const o = 3 * k;
      let vx = (pos[o] - prev[o]) / step;
      let vy = (pos[o + 1] - prev[o + 1]) / step;
      let vz = (pos[o + 2] - prev[o + 2]) / step;
      const x = pos[o];
      const y = pos[o + 1];
      // The air's speed here and now.
      let wx = spec.wind[0];
      let wy = spec.wind[1];
      let wz = spec.wind[2];
      for (const w of waves) {
        const s = spec.gust * Math.sin(w.kx * x + w.ky * y + Math.PI * 2 * w.rate * time + w.phase);
        wx += s * w.dir[0];
        wy += s * w.dir[1];
        wz += s * w.dir[2];
      }
      const rx = vx - wx;
      const ry = vy - wy;
      const rz = vz - wz;
      // The air pulls on the cloth's area, gravity on its mass: a heavier row (the hem) feels less of the air.
      const across = rx * normals[o] + ry * normals[o + 1] + rz * normals[o + 2];
      const air = inv[k];
      const ax = -air * (spec.drag * rx + spec.faceDrag * across * normals[o]);
      const ay = -spec.gravity - air * (spec.drag * ry + spec.faceDrag * across * normals[o + 1]);
      const az = -air * (spec.drag * rz + spec.faceDrag * across * normals[o + 2]);
      vx += ax * step;
      vy += ay * step;
      vz += az * step;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      pos[o] += vx * step;
      pos[o + 1] += vy * step;
      pos[o + 2] += vz * step;
    }
    for (let it = 0; it < spec.iterations; it++) {
      for (const l of links) {
        const a = 3 * l.a;
        const b = 3 * l.b;
        const ex = pos[b] - pos[a];
        const ey = pos[b + 1] - pos[a + 1];
        const ez = pos[b + 2] - pos[a + 2];
        const d = Math.hypot(ex, ey, ez) || 1e-9;
        const wa = inv[l.a];
        const wb = inv[l.b];
        const wsum = wa + wb;
        if (wsum <= 0) continue;
        const c = ((d - l.rest) / d / wsum) * l.stiffness;
        pos[a] += ex * c * wa;
        pos[a + 1] += ey * c * wa;
        pos[a + 2] += ez * c * wa;
        pos[b] -= ex * c * wb;
        pos[b + 1] -= ey * c * wb;
        pos[b + 2] -= ez * c * wb;
      }
      if (hold || holdRight) {
        pinned.forEach((k, i) => {
          if (!hold && i === 0) return;
          pos[3 * k] = anchor[i][0];
          pos[3 * k + 1] = anchor[i][1];
          pos[3 * k + 2] = anchor[i][2];
        });
      }
    }
    if (hold || holdRight) {
      pinned.forEach((k, i) => {
        if (!hold && i === 0) return;
        prev[3 * k] = pos[3 * k] = anchor[i][0];
        prev[3 * k + 1] = pos[3 * k + 1] = anchor[i][1];
        prev[3 * k + 2] = pos[3 * k + 2] = anchor[i][2];
      });
    }
  };

  // Hang from the two top corners and find the drape (ending at rest: the velocity is let go of).
  let done = 0;
  for (let s = 0; s < totalSteps; s++) {
    run(s * step - spec.settle, true);
    if (++done % chunk === 0) yield done;
  }
  prev.set(pos);
  // Let go, and store a frame `rate` times a second.
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < n * 3; i++) positions[f * n * 3 + i] = pos[i];
    for (let s = 0; s < spec.substeps; s++) {
      const time = f / spec.rate + s * step;
      run(time, false, time < spec.stagger);
      if (++done % chunk === 0) yield done;
    }
  }
  return { nx, ny, count: frames, rate: spec.rate, positions };
}

/** Normals of the grid's vertices (from the neighbours across and down), written into `out`. */
export function computeNormals(pos: ArrayLike<number>, nx: number, ny: number, out: Float64Array | Float32Array): void {
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const l = j * nx + Math.max(0, i - 1);
      const r = j * nx + Math.min(nx - 1, i + 1);
      const u = Math.max(0, j - 1) * nx + i;
      const d = Math.min(ny - 1, j + 1) * nx + i;
      // Across (x) and up the cloth (rows run downward, so up is u minus d).
      const ax = pos[3 * r] - pos[3 * l];
      const ay = pos[3 * r + 1] - pos[3 * l + 1];
      const az = pos[3 * r + 2] - pos[3 * l + 2];
      const bx = pos[3 * u] - pos[3 * d];
      const by = pos[3 * u + 1] - pos[3 * d + 1];
      const bz = pos[3 * u + 2] - pos[3 * d + 2];
      let cx = ay * bz - az * by;
      let cy = az * bx - ax * bz;
      let cz = ax * by - ay * bx;
      const len = Math.hypot(cx, cy, cz) || 1;
      cx /= len;
      cy /= len;
      cz /= len;
      out[3 * k] = cx;
      out[3 * k + 1] = cy;
      out[3 * k + 2] = cz;
    }
  }
}

/** The cloth `t` seconds after it was let go (held at its first frame before, its last after), written into `out`. */
export function clothAt(frames: ClothFrames, t: number, out: Float32Array): Float32Array {
  const size = frames.nx * frames.ny * 3;
  const f = Math.min(frames.count - 1, Math.max(0, t * frames.rate));
  const i = Math.min(frames.count - 2, Math.floor(f));
  const s = f - i;
  const a = i * size;
  const b = (i + 1) * size;
  const p = frames.positions;
  for (let k = 0; k < size; k++) out[k] = p[a + k] + (p[b + k] - p[a + k]) * s;
  return out;
}
