// Colour tokens for the shaders, read from the CSS variables in src/app/globals.css at start-up so
// the canvas and the DOM share one palette. The fallback table carries the phase 1 values for the
// case where the stylesheet has not applied yet.

export const COLOR_TOKENS = [
  "sky",
  "sky-soft",
  "milk",
  "ink",
  "press",
  "orange",
  "leaf",
  "marble",
  "paper",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type RGB = readonly [number, number, number];

const FALLBACK: Record<ColorToken, string> = {
  sky: "#1f4e9c",
  "sky-soft": "#6f9bd6",
  milk: "#f6f3ec",
  ink: "#15130f",
  press: "#0e0c0a",
  orange: "#ff7a00",
  leaf: "#476b35",
  marble: "#ece7dd",
  paper: "#efe6d2",
};

/** Uniform name for a token: `--sky-soft` -> `uSkySoft`. */
export function uniformNameFor(token: ColorToken): string {
  return "u" + token.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

/** Parse `#rgb`, `#rrggbb` or `rgb(r g b)` / `rgb(r, g, b)` into 0..1 components. */
export function parseColor(value: string): RGB | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return null;
}

/** Every colour token as 0..1 RGB, from the live stylesheet when possible. */
export function readColorTokens(): Record<ColorToken, RGB> {
  const style = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const out = {} as Record<ColorToken, RGB>;
  for (const token of COLOR_TOKENS) {
    const live = style ? parseColor(style.getPropertyValue(`--${token}`)) : null;
    out[token] = live ?? (parseColor(FALLBACK[token]) as RGB);
  }
  return out;
}
