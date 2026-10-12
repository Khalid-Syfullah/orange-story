// The rest state, shared by every painting pass (docs/MOTION-RULES.md, rest states): breath is a
// sum of three incommensurate sines plus an exp decay from the last scroll stop; pointer parallax
// is 0.45% x / 0.32% y; ambient drift is 0.22% from two sines (0.17 Hz and 0.13 Hz).
//
// The hero, the bridge and the model all use this chunk, so the picture breathes the same way
// across the cuts between them and a handover never changes the offset. The Split (phase 6) must
// use it too, so the model's last frame and its first frame are one picture.
//
// `tm` is the pass's clock: `uTime * (1.0 - uStill)`, so reduced motion stops everything.

/**
 * The rest state's amplitudes, written into REST_GLSL below. src/stage/motion.ts reads them for the
 * room a framing leaves (coverRoom): breath and kick on the zoom, pointer parallax and ambient drift
 * as offsets in painting units.
 */
export const REST = {
  /** Breath: the zoom's swing at the sum of the three sines' peak (their weights add to 1). */
  breath: 0.004,
  /** The scroll-stop kick on the zoom, dying in 1.2 s. */
  kick: 0.015,
  /** Pointer parallax at the pointer's full reach, painting units. */
  pointer: { x: 0.0045, y: 0.0032 },
  /** Ambient drift, painting units, on each axis. */
  drift: 0.0022,
} as const;

const g = (x: number) => x.toFixed(4);

export const REST_GLSL = /* glsl */ `
const float REST_TAU = 6.2831853;

// Breath in -1..1: 5.3 s, 7.9 s and 11.4 s sines (rule 9), never one.
float restBreath(float tm) {
  return 0.5 * sin(tm * REST_TAU / 5.3) + 0.3 * sin(tm * REST_TAU / 7.9 + 1.3) + 0.2 * sin(tm * REST_TAU / 11.4 + 2.1);
}

// A painting's zoom with the breath (0.4%) and the scroll-stop kick (1.5%, dying in 1.2 s).
float restZoom(float zoom, float tm) {
  return zoom * (1.0 + ${g(REST.breath)} * restBreath(tm) + ${g(REST.kick)} * uKick);
}

// Pointer parallax plus ambient drift, as an offset in painting units.
vec2 restOffset(float tm) {
  return -uMouse * vec2(${g(REST.pointer.x)}, ${g(REST.pointer.y)})
       + ${g(REST.drift)} * vec2(sin(tm * REST_TAU * 0.17), sin(tm * REST_TAU * 0.13 + 1.1));
}
`;
