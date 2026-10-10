"use client";

import { LayoutGrid } from "lucide-react";

import { chrome } from "@/content/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import type { RulerChapter } from "./chapters";

/**
 * The small grid icon button under the mark. Opens a shadcn Sheet with the chapter list; on small
 * screens this is where the ruler lives.
 */
export interface ChapterMenuProps {
  chapters: readonly RulerChapter[];
  active: number;
  onSelect: (chapter: RulerChapter) => void;
  className?: string;
}

export function ChapterMenu({ chapters, active, onSelect, className }: ChapterMenuProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={chrome.gridButton.label}
          className={cn(
            "rounded-full text-current hover:bg-white/10 hover:text-current focus-visible:border-transparent focus-visible:ring-current/60 dark:hover:bg-white/10",
            className,
          )}
        >
          <LayoutGrid strokeWidth={1.25} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} className="theme-sky w-72 border-hairline shadow-none sm:max-w-xs">
        <SheetHeader className="px-6 pt-8">
          <SheetTitle className="type-label font-mono text-label text-milk">{chrome.menu.title}</SheetTitle>
        </SheetHeader>
        <ol className="flex flex-col px-3">
          {chapters.map((chapter, i) => {
            const isActive = i === active;
            return (
              <li key={chapter.id}>
                <SheetClose asChild>
                  <button
                    type="button"
                    aria-current={isActive ? "location" : undefined}
                    onClick={() => onSelect(chapter)}
                    className="group flex w-full cursor-pointer items-baseline gap-4 rounded-md px-3 py-3 text-left outline-none transition-colors duration-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-milk/60"
                  >
                    <span className="type-meta w-10 shrink-0 text-milk/60">{chapter.short}</span>
                    <span className="type-title">{chapter.name}</span>
                    {isActive ? <span aria-hidden className="ml-auto h-px w-5 self-center bg-current" /> : null}
                  </button>
                </SheetClose>
              </li>
            );
          })}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
