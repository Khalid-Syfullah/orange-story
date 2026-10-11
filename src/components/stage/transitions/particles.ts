import { dragAxis } from "@/lib/flight";
import { seeded } from "@/lib/progress";

/**
 * The transitions' deterministic particle system (pure: no React, no three). Every grain, speck, mote
 * or drop is seeded once (`particleField`) and then evaluated in closed form at a moment of story time
 * (`particleAt`): it is born at a place with a speed, falls under gravity, is carried toward the
 * wind's speed by its own drag, and swirls a little in the eddies. Nothing is stepped, so any moment
 * is computed directly, scrubbing far costs the same as scrubbing near, and scrolling back plays it
 * all backwards exactly. The vertex shader does the same math for every particle at once
 * (`PARTICLE_GLSL`, `particle-field.tsx`); this file is its reference, and the tests hold both to it.
 *
 * Units are world units and seconds of story time (`PHYSICS`: a world unit is a metre, a screen of
 * scrolling a second). A field lives either in the lens (camera space: x right, y up, z toward the
 * viewer, in front of the lens is negative z) or in the world.
 */

/** Floats per particle: four vec4 attributes. */
export const PARTICLE_STRIDE = 16;

/**
 * One particle, as the generator writes it:
 * - `start` [x, y, z] and `born` (seconds on the field's clock);
 * - `velocity` [vx, vy, vz] at birth and `drag` (per second: how fast it takes up the wind's speed);
 * - `size` (world units across), `seed` (0 to 1, its own randomness), `tone` (0 to 1: where it sits in
 *   the medium's palette), `life` (seconds before it has faded out; Infinity for never);
 * - `swirl` (world units of eddy it is carried round, fully grown), `swirlRate` (eddies per second),
 *   `phase` (radians) and `fall` (the share of gravity it feels: 1 for a grain, little for a mote).
 */
export interface ParticleSpec {
  start: readonly [number, number, number];
  born: number;
  velocity: readonly [number, number, number];
  drag: number;
  size: number;
  seed: number;
  tone: number;
  life: number;
  swirl: number;
  swirlRate: number;
  phase: number;
  fall: number;
}

export interface ParticleField {
  count: number;
  /** `count * PARTICLE_STRIDE` floats, in the shader's layout. */
  data: Float32Array;
}

/** The air a field flies through: gravity (downward, world units per second squared) and the wind's speed. */
export interface Air {
  gravity: number;
  wind: readonly [number, number, number];
}

/** A very long life, for particles that never fade (Infinity does not fit a float attribute). */
export const FOREVER = 1e6;

/**
 * A seeded field of `count` particles: `spawn` makes each from the field's random numbers (and its
 * index). The particles are shuffled afterwards (seeded), so any first share of them is an even
 * sample of the whole: a lighter mode draws the first 40% and still covers the same ground.
 */
export function particleField(seed: string, count: number, spawn: (rand: () => number, i: number) => ParticleSpec): ParticleField {
  const rand = seeded(seed);
  const specs = Array.from({ length: count }, (_, i) => spawn(rand, i));
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = specs[i];
    specs[i] = specs[j];
    specs[j] = t;
  }
  const data = new Float32Array(count * PARTICLE_STRIDE);
  specs.forEach((s, i) => {
    const o = i * PARTICLE_STRIDE;
    data[o] = s.start[0];
    data[o + 1] = s.start[1];
    data[o + 2] = s.start[2];
    data[o + 3] = s.born;
    data[o + 4] = s.velocity[0];
    data[o + 5] = s.velocity[1];
    data[o + 6] = s.velocity[2];
    data[o + 7] = Math.max(1e-4, s.drag);
    data[o + 8] = s.size;
    data[o + 9] = s.seed;
    data[o + 10] = s.tone;
    data[o + 11] = Number.isFinite(s.life) ? s.life : FOREVER;
    data[o + 12] = s.swirl;
    data[o + 13] = s.swirlRate;
    data[o + 14] = s.phase;
    data[o + 15] = s.fall;
  });
  return { count, data };
}

/** Where a particle is at a moment: position, speed, and how much of it shows (0 before it is born and after it has faded). */
export interface ParticleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  alpha: number;
}

export const newParticleState = (): ParticleState => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, alpha: 0 });

/** How long a particle takes to appear once born, and the share of its life it fades over at the end. */
export const PARTICLE_FADE = { in: 0.06, out: 0.3 } as const;

/** How fast an eddy grows round a particle once it is born (per second). */
export const SWIRL_GROWTH = 1.6;

const axis: [number, number] = [0, 0];
const TAU = Math.PI * 2;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Particle `i` of a field at `t` seconds on the field's clock (the shader's `particleFlight`): its own
 * flight under gravity (`fall` of it), drag toward the wind's speed, and an eddy that grows as it
 * ages. Writes into `out`.
 */
export function particleAt(field: ParticleField, i: number, t: number, air: Air, out: ParticleState = newParticleState()): ParticleState {
  const d = field.data;
  const o = i * PARTICLE_STRIDE;
  const age = t - d[o + 3];
  const k = d[o + 7];
  if (age < 0) {
    out.x = d[o];
    out.y = d[o + 1];
    out.z = d[o + 2];
    out.vx = out.vy = out.vz = 0;
    out.alpha = 0;
    return out;
  }
  const g = air.gravity * d[o + 15];
  dragAxis(d[o], d[o + 4], k * air.wind[0], k, age, axis);
  out.x = axis[0];
  out.vx = axis[1];
  dragAxis(d[o + 1], d[o + 5], k * air.wind[1] - g, k, age, axis);
  out.y = axis[0];
  out.vy = axis[1];
  dragAxis(d[o + 2], d[o + 6], k * air.wind[2], k, age, axis);
  out.z = axis[0];
  out.vz = axis[1];
  // The eddy: a slow loop that grows from nothing, so the particle leaves its birth at its own speed.
  const swirl = d[o + 12] * -Math.expm1(-SWIRL_GROWTH * age);
  const w = TAU * d[o + 13];
  const phase = d[o + 14];
  out.x += swirl * Math.sin(w * age + phase);
  out.y += swirl * 0.6 * Math.sin(0.73 * w * age + 1.3 * phase);
  out.z += swirl * 0.5 * Math.sin(0.51 * w * age + 2.1 * phase);
  const life = d[o + 11];
  out.alpha = smoothstep(0, PARTICLE_FADE.in, age) * (1 - smoothstep(life * (1 - PARTICLE_FADE.out), life, age));
  return out;
}

/** The same flight in GLSL, for the particle field's vertex shader (attributes `aStart`, `aVelocity`, `aLook`, `aSwirl`). */
export const PARTICLE_GLSL = /* glsl */ `
attribute vec4 aStart;    // x, y, z, born
attribute vec4 aVelocity; // vx, vy, vz, drag
attribute vec4 aLook;     // size, seed, tone, life
attribute vec4 aSwirl;    // swirl, swirlRate, phase, fall
uniform float uTime;
uniform float uGravity;
uniform vec3 uWind;

/* dragAxis (src/lib/flight.ts): position and speed after t seconds from x0 with speed v0, acceleration a, drag k. */
vec2 dragAxis(float x0, float v0, float a, float k, float t) {
  if (k * t < 1e-6) return vec2(x0 + v0 * t + 0.5 * a * t * t, v0 + a * t);
  float terminal = a / k;
  float e = exp(-k * t);
  return vec2(x0 + terminal * t + (v0 - terminal) * (1.0 - e) / k, terminal + (v0 - terminal) * e);
}

/* The particle's flight at uTime (particleAt in particles.ts): position in .xyz, how much shows in .w; its speed in velocity. */
vec4 particleFlight(out vec3 velocity) {
  float age = uTime - aStart.w;
  if (age < 0.0) {
    velocity = vec3(0.0);
    return vec4(aStart.xyz, 0.0);
  }
  float k = aVelocity.w;
  float g = uGravity * aSwirl.w;
  vec2 fx = dragAxis(aStart.x, aVelocity.x, k * uWind.x, k, age);
  vec2 fy = dragAxis(aStart.y, aVelocity.y, k * uWind.y - g, k, age);
  vec2 fz = dragAxis(aStart.z, aVelocity.z, k * uWind.z, k, age);
  vec3 p = vec3(fx.x, fy.x, fz.x);
  velocity = vec3(fx.y, fy.y, fz.y);
  float swirl = aSwirl.x * (1.0 - exp(-${SWIRL_GROWTH.toFixed(2)} * age));
  float w = 6.2831853 * aSwirl.y;
  float phase = aSwirl.z;
  p += swirl * vec3(sin(w * age + phase), 0.6 * sin(0.73 * w * age + 1.3 * phase), 0.5 * sin(0.51 * w * age + 2.1 * phase));
  float life = aLook.w;
  float alpha = smoothstep(0.0, ${PARTICLE_FADE.in.toFixed(3)}, age) * (1.0 - smoothstep(life * ${(1 - PARTICLE_FADE.out).toFixed(3)}, life, age));
  return vec4(p, alpha);
}
`;
