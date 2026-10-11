// The one file that owns font choice. Everything else reads the CSS variables:
//   --font-display  Newsreader  (display: optical-size axis, light weights, italic)
//   --font-text     Geist       (running text, 400 and 500)
//   --font-mono     Geist Mono  (labels and meta, 400 and 500)
//
// next/font self-hosts the files, uses `font-display: swap`, and generates size-adjusted
// fallback faces (adjustFontFallback) so the swap does not shift the layout.
import { Geist, Geist_Mono, Newsreader } from "next/font/google";

// Newsreader is loaded as its variable font so the optical-size axis (opsz 6..72) is available.
// next/font cannot subset a variable font's weight axis, so the file carries 200..800; the design
// uses 200 to 500 (and 600 only for the finale wordmark).
export const fontDisplay = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "serif"],
  variable: "--font-display",
});

export const fontText = Geist({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["system-ui", "Helvetica Neue", "Arial", "sans-serif"],
  variable: "--font-text",
});

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  variable: "--font-mono",
});

/** Class names that define --font-display, --font-text and --font-mono on <html>. */
export const fontVariables = [fontDisplay.variable, fontText.variable, fontMono.variable].join(" ");
