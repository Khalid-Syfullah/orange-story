import type { Metadata, Viewport } from "next";
import { finale, hero } from "@/content/copy";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: `${finale.wordmark}: ${hero.title}`,
  description: hero.subtitle,
};

export const viewport: Viewport = {
  themeColor: "#1F4E9C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
