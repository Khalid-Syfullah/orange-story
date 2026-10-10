/**
 * Free flight with linear drag, in closed form (no stepping, so it is exact at any moment and plays
 * backwards exactly): the one formula the stage's falls are made of. Pure, with no imports, so the
 * scroll script (the camera following a fall) and the stage (drawing it) share it.
 */

/**
 * One axis of a flight after `t` seconds: from `x0` with speed `v0`, under a constant acceleration
 * `a` (gravity is -9.81 on y, 0 across), with linear drag `k` per second (the speed relaxes toward
 * the terminal speed `a / k` as e^(-k t)). Writes [position, speed] into `out`.
 */
export function dragAxis(x0: number, v0: number, a: number, k: number, t: number, out: [number, number] = [0, 0]): [number, number] {
  if (k * t < 1e-6) {
    out[0] = x0 + v0 * t + (a * t * t) / 2;
    out[1] = v0 + a * t;
    return out;
  }
  const terminal = a / k;
  const e = Math.exp(-k * t);
  out[0] = x0 + terminal * t + ((v0 - terminal) * -Math.expm1(-k * t)) / k;
  out[1] = terminal + (v0 - terminal) * e;
  return out;
}
