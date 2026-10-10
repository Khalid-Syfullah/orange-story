/**
 * The only place fonts are chosen. Three families, nothing else:
 *
 * - Newsreader (display): light 300 headlines, italic available, 600 only for the finale wordmark.
 * - Geist (text): body copy and leads.
 * - Geist Mono (labels): buttons, tags, meta readouts.
 *
 * Each loader exposes a CSS variable (`--font-newsreader`, `--font-geist`, `--font-geist-mono`)
 * that `globals.css` maps onto the public tokens `--font-display`, `--font-text` and `--font-mono`.
 * All three are variable fonts, so every weight in their range is available without extra files.
 * `adjustFontFallback` (on by default for Google fonts) generates size-adjusted local fallbacks,
 * which keeps layout shift near zero while `display: swap` shows text immediately.
 * Do not pass a `fallback` list here: in Next 16 an explicit list replaces the generated
 * size-adjusted "<Family> Fallback" face. Generic stacks live in globals.css after the variable.
 */
import { Geist, Geist_Mono, Newsreader } from "next/font/google";

export const displayFont = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-newsreader",
});

export const textFont = Geist({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-geist",
});

export const monoFont = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-geist-mono",
});

/** Class names to put on `<html>` so the three font variables exist everywhere. */
export const fontVariables = [displayFont.variable, textFont.variable, monoFont.variable].join(" ");
