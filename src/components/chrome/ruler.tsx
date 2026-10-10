"use client";

import * as React from "react";
import type { MotionValue } from "motion/react";

import { chrome } from "@/content/copy";
import { cn } from "@/lib/utils";
import { remap } from "@/lib/progress";
import { useElementSize } from "@/lib/use-element-size";
import { HAIRLINE_ALPHA } from "@/styles/tokens";

import { useActiveChapter, type RulerChapter, type RulerSegment } from "./chapters";

/**
 * The chapter ruler on the left hairline.
 *
 * - A segmented progress line: one SVG path per stretch of the script, its length proportional to
 *   that stretch, each storing its own start and end progress (`data-start`, `data-end`), filled with
 *   `stroke-dashoffset` as progress passes. Written straight to the DOM; no React state per frame.
 * - Four chapter marks placed at their start progress. Only the active chapter shows its name beside
 *   a short rule; the others are ticks. Hover or keyboard focus expands the ruler to all four names
 *   with "Ch. 1" to "Ch. 4". Each entry scrolls to its chapter; the active one has `aria-current`.
 *   Arrow keys move between entries.
 */
export interface RulerProps {
  progress: MotionValue<number>;
  chapters: readonly RulerChapter[];
  segments: readonly RulerSegment[];
  onSelect: (chapter: RulerChapter) => void;
  className?: string;
}

/** Space left between neighbouring segments, in px. */
const SEGMENT_GAP = 3;

export function Ruler({ progress, chapters, segments, onSelect, className }: RulerProps) {
  const active = useActiveChapter(progress, chapters);
  const [measureRef, { height }] = useElementSize<HTMLDivElement>();
  const fills = React.useRef<(SVGPathElement | null)[]>([]);
  const entries = React.useRef<(HTMLButtonElement | null)[]>([]);

  const geometry = React.useMemo(
    () =>
      segments.map((s) => {
        const y1 = s.start * height + SEGMENT_GAP / 2;
        const y2 = Math.max(y1 + 0.5, s.end * height - SEGMENT_GAP / 2);
        return { ...s, y1, y2, length: y2 - y1 };
      }),
    [segments, height],
  );

  React.useEffect(() => {
    if (!height) return;
    const draw = (p: number) => {
      geometry.forEach((g, i) => {
        const el = fills.current[i];
        if (el) el.style.strokeDashoffset = String(g.length * (1 - remap(p, g.start, g.end)));
      });
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [geometry, height, progress]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? index + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? chapters.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    entries.current[(next + chapters.length) % chapters.length]?.focus();
  };

  return (
    <nav aria-label={chrome.menu.title} data-ruler className={cn("group/ruler pointer-events-none", className)}>
      <div ref={measureRef} className="relative h-full">
        {/* Hover strip along the hairline, so the ruler expands before an entry is reached. */}
        <span aria-hidden className="pointer-events-auto absolute inset-y-0 -left-3 w-6" />

        {height > 0 && (
          <svg
            aria-hidden
            width={3}
            height={height}
            viewBox={`-1.5 0 3 ${height}`}
            className="absolute top-0 -left-[1.5px] overflow-visible"
          >
            {geometry.map((g, i) => (
              <g key={`${g.start}-${g.end}`}>
                <path d={`M0 ${g.y1} V${g.y2}`} stroke="currentColor" strokeOpacity={HAIRLINE_ALPHA} strokeWidth={1} />
                <path
                  ref={(el) => {
                    fills.current[i] = el;
                  }}
                  data-segment={i}
                  data-start={g.start}
                  data-end={g.end}
                  d={`M0 ${g.y1} V${g.y2}`}
                  stroke="currentColor"
                  strokeOpacity={0.9}
                  strokeWidth={1}
                  strokeDasharray={g.length}
                  strokeDashoffset={g.length}
                />
              </g>
            ))}
          </svg>
        )}

        <ol className="absolute inset-0">
          {chapters.map((chapter, i) => {
            const isActive = i === active;
            return (
              <li key={chapter.id} className="absolute left-0" style={{ top: `${chapter.start * 100}%` }}>
                <button
                  ref={(el) => {
                    entries.current[i] = el;
                  }}
                  type="button"
                  data-active={isActive || undefined}
                  aria-current={isActive ? "location" : undefined}
                  onClick={() => onSelect(chapter)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="group/entry pointer-events-auto flex -translate-y-1/2 cursor-pointer items-center rounded-sm py-1.5 pr-2 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-current"
                >
                  {/* Tick for inactive chapters, a short rule for the active one. */}
                  <span
                    aria-hidden
                    className="h-px w-1.5 bg-current opacity-60 transition-[width,opacity] duration-300 group-hover/ruler:w-3 group-focus-within/ruler:w-3 group-data-active/entry:w-5 group-data-active/entry:opacity-100"
                  />
                  <span className="type-meta ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-300 group-hover/ruler:ml-2.5 group-hover/ruler:max-w-16 group-hover/ruler:opacity-60 group-focus-within/ruler:ml-2.5 group-focus-within/ruler:max-w-16 group-focus-within/ruler:opacity-60">
                    {chapter.short}
                  </span>
                  <span className="type-label ml-2.5 whitespace-nowrap opacity-0 blur-[3px] transition-[opacity,filter] duration-300 group-hover/ruler:opacity-70 group-hover/ruler:blur-[0px] group-focus-within/ruler:opacity-70 group-focus-within/ruler:blur-[0px] group-data-active/entry:opacity-100 group-data-active/entry:blur-[0px]">
                    {chapter.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
