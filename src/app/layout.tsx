import type { Metadata, Viewport } from "next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { meta } from "@/content/copy";
import { colors } from "@/styles/tokens";
import { fontVariables } from "@/styles/fonts";
import { RESTORE_SCRIPT } from "@/scroll/navigation";

import "./globals.css";

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
};

export const viewport: Viewport = {
  themeColor: colors.sky,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the head script marks <html> (data-restore) before React hydrates.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Before the first paint: take over scroll restoration, and cover the stage if a place is to be restored. */}
        <script dangerouslySetInnerHTML={{ __html: RESTORE_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
