import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { colors, mixColors, type ColorToken } from "./tokens";

/**
 * The design rules DESIGN.md states, checked: text on the sky and on milk meets WCAG AA (4.5:1 for
 * body text), including on the lightest part of the painted sky behind it, and every color in the
 * code comes from the palette.
 */

const ROOT = path.resolve(__dirname, "../..");

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `top` (with `alpha`) over `ground`, in sRGB like the browser composites. */
const over = (top: number[], alpha: number, ground: number[]) => top.map((c, i) => c * alpha + ground[i] * (1 - alpha));
const token = (name: ColorToken) => rgb(colors[name]);

const AA = 4.5;

describe("contrast (WCAG AA)", () => {
  it("text on the sky: white and milk", () => {
    expect(contrast(token("white"), token("sky"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("milk"), token("sky"))).toBeGreaterThanOrEqual(AA);
  });

  it("text on milk: ink, and the softened ink of secondary lines", () => {
    expect(contrast(token("ink"), token("milk"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(over(token("ink"), 0.74, token("milk")), token("milk"))).toBeGreaterThanOrEqual(AA);
  });

  it("text on the painted sky, down to its lightest row (the bottom of the hero sky plate)", async () => {
    const { data, info } = await sharp(path.join(ROOT, "public/art/hero/sky.webp")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let lightest = 0;
    let row: number[] = [];
    for (let y = 0; y < info.height; y += 8) {
      const i = (y * info.width + Math.floor(info.width / 2)) * info.channels;
      const pixel = [data[i], data[i + 1], data[i + 2]];
      if (luminance(pixel) > lightest) {
        lightest = luminance(pixel);
        row = pixel;
      }
    }
    expect(contrast(token("milk"), row)).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("white"), row)).toBeGreaterThanOrEqual(AA);
  });

  it("chrome readouts on their chip, over the brightest paint (a white robe or cloud)", () => {
    // `chrome-chip`: 85% of the ground's color over whatever passes behind.
    expect(contrast(token("white"), over(token("sky"), 0.85, token("white")))).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("ink"), over(token("milk"), 0.85, token("ink")))).toBeGreaterThanOrEqual(AA);
    // The Apply pill on sky: an 80% sky fill.
    expect(contrast(token("white"), over(token("sky"), 0.8, token("white")))).toBeGreaterThanOrEqual(AA);
  });

  it("mixes palette colors only", () => {
    expect(mixColors("sky", "milk", 0)).toBe(colors.sky.toLowerCase());
    expect(mixColors("sky", "milk", 1)).toBe(colors.milk.toLowerCase());
    expect(mixColors("white", "orange", 0.25)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

/** Every source file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("tokens are used everywhere", () => {
  /** Where raw colors may be written: the token files themselves, and the dev-only /design lab. */
  const ALLOWED = ["src/styles/tokens.ts", "src/app/globals.css", "src/app/design/"];

  it("has no raw hex or rgb colors outside the token files", () => {
    const offenders: string[] = [];
    for (const file of sources(path.join(ROOT, "src"))) {
      const rel = path.relative(ROOT, file);
      if (ALLOWED.some((allowed) => rel.startsWith(allowed))) continue;
      const text = readFileSync(file, "utf8");
      // Black with an alpha is how a CSS mask says "how much shows" (the smoke mask): not a color.
      const scrubbed = text.replace(/rgb\(0 0 0 \//g, "");
      for (const match of scrubbed.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d/g)) offenders.push(`${rel}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
