/**
 * Monotone cubic curves through keys (Fritsch and Butland's harmonic-mean slopes): the curve passes
 * every key with one speed from both sides, so its speed never jumps, and it never overshoots a key.
 * Pure, with no imports: the camera path, the motion kit's tracks and the phone's scroll map share it.
 */

/**
 * The slope (value per time) to pass each key with, for values sampled at `times` (strictly
 * increasing): zero where the value turns back or holds still, and on both sides of a segment
 * marked `rest`; elsewhere the weighted harmonic mean of the two neighbouring slopes. The ends get
 * `ends`: "rest" (zero, the camera's and a track's) or "secant" (the slope of the first and last
 * segments, for a curve that keeps going, like a scroll map).
 */
export function monotoneSlopes(times: readonly number[], values: readonly number[], rest: readonly boolean[] = [], ends: "rest" | "secant" = "rest"): number[] {
  const n = times.length;
  const slopes = new Array<number>(n).fill(0);
  for (let i = 1; i + 1 < n; i++) {
    if (rest[i - 1] || rest[i]) continue;
    const h0 = times[i] - times[i - 1];
    const h1 = times[i + 1] - times[i];
    const d0 = (values[i] - values[i - 1]) / h0;
    const d1 = (values[i + 1] - values[i]) / h1;
    if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) continue;
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    slopes[i] = (w0 + w1) / (w0 / d0 + w1 / d1);
  }
  if (ends === "secant" && n > 1) {
    slopes[0] = (values[1] - values[0]) / (times[1] - times[0]);
    slopes[n - 1] = (values[n - 1] - values[n - 2]) / (times[n - 1] - times[n - 2]);
  }
  return slopes;
}

/** The cubic Hermite between two keys (t0, v0, slope m0) and (t1, v1, slope m1), at time t inside. */
export function hermiteAt(t: number, t0: number, v0: number, m0: number, t1: number, v1: number, m1: number): number {
  const h = t1 - t0;
  const s = (t - t0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
}
