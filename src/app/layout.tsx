import type { Metadata, Viewport } from "next";
import { finale, hero } from "@/content/copy";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: `${finale.wordmark}: ${hero.title}`,
  description: hero.subtitle,
};

// With JavaScript off the stage cannot run: the hero poster shows and every piece of copy follows it
// in reading order on its own ground, as plain text (the pieces are hidden by the frame loop's
// opacity, so the override is !important). Anything aria-hidden is a drawn duplicate and goes.
const NO_JS = `
.stage{height:auto!important}
.pin{position:static!important;height:auto!important;overflow:visible!important}
.gl,.ghost,.hud,[data-surface]{display:none!important}
.stage-video{position:static!important;display:block;width:100%!important;height:auto!important;max-height:70vh;object-fit:cover;opacity:1!important;aspect-ratio:16/9}
.layers{position:static!important;display:flex;flex-direction:column}
.layers>*{position:static!important;background:var(--bg);color:var(--fg);padding:2.5rem max(1rem,6vw)}
.layers *{position:static!important;opacity:1!important;visibility:visible!important;transform:none!important;translate:none!important;width:auto!important;max-width:44rem!important;min-height:0!important;pointer-events:auto!important;text-shadow:none!important;clip-path:none!important}
.layers [aria-hidden="true"]{display:none!important}
.layers .sr-only{margin:0!important;height:auto!important;overflow:visible!important;clip:auto!important;white-space:normal!important}
.layers h1,.layers h2,.layers h3,.layers p,.layers article,.layers div,.layers form{margin-block:0 1rem}
`;

export const viewport: Viewport = {
  themeColor: "#1F4E9C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        <noscript>
          <style dangerouslySetInnerHTML={{ __html: NO_JS }} />
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
