/**
 * The texture guard: a figure plate must read as painted, not as flat clip art. Measured inside the
 * plate's alpha (pixels at least 90% opaque, two pixels in from any edge):
 *
 * - `lumStd`: the standard deviation of luminance (0..1): modelling by light;
 * - `colors`: the number of distinct colours once quantised to 5 bits a channel: paint, not fills;
 * - `hf`: high-frequency energy, the mean absolute difference between luminance and its 3x3 box
 *   blur: brushwork and canvas grain that survive WebP.
 *
 * The thresholds were calibrated on the pilot (the gardener) and the rest of the cast against the
 * flat placeholders they replaced. The flat placeholders measured lumStd 0.02 to 0.32 (a black cap
 * of hair on a skin-coloured disc spreads luminance too, so spread alone proves nothing), 8 to 255
 * colours and hf at most 0.0018; the painted studies measure lumStd 0.10 and up, 460 colours and
 * up and hf 0.010 and up. Each limit sits between the two, low enough for a real painting's
 * smoother finish: a flat fill fails all three, a vector drawing fails colours and hf.
 */

import sharp from "sharp";

export const THRESHOLDS = { lumStd: 0.05, colors: 350, hf: 0.005 };

/** Texture metrics of a straight-alpha RGBA buffer. */
export function measureTexture(rgba, W, H) {
  const N = W * H;
  const lum = new Float32Array(N);
  const inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    inside[i] = rgba[i * 4 + 3] >= 230 ? 1 : 0;
  }
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  let hf = 0;
  const colors = new Set();
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      // Two pixels in from the alpha edge, so antialiasing is not counted as texture.
      if (!inside[i] || !inside[i - 2] || !inside[i + 2] || !inside[i - 2 * W] || !inside[i + 2 * W]) continue;
      const v = lum[i];
      n++;
      sum += v;
      sum2 += v * v;
      let box = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) box += lum[i + dy * W + dx];
      hf += Math.abs(v - box / 9);
      colors.add(((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3));
    }
  if (n === 0) return { pixels: 0, lumStd: 0, colors: 0, hf: 0 };
  const mean = sum / n;
  return { pixels: n, lumStd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), colors: colors.size, hf: hf / n };
}

/** Whether metrics pass the guard; `reasons` lists what is flat. */
export function judgeTexture(m, t = THRESHOLDS) {
  const reasons = [];
  if (m.pixels < 200) reasons.push(`only ${m.pixels} opaque pixels`);
  if (m.lumStd < t.lumStd) reasons.push(`luminance spread ${m.lumStd.toFixed(3)} < ${t.lumStd}`);
  if (m.colors < t.colors) reasons.push(`${m.colors} colours < ${t.colors}`);
  if (m.hf < t.hf) reasons.push(`high-frequency energy ${m.hf.toFixed(4)} < ${t.hf}`);
  return { ok: reasons.length === 0, reasons };
}

/** Reads an image file and measures it. */
export async function measureFile(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return measureTexture(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
}

export const formatMetrics = (m) => `lumStd ${m.lumStd.toFixed(3)}  colours ${String(m.colors).padStart(5)}  hf ${m.hf.toFixed(4)}`;
