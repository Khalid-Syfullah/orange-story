"use client";

import * as React from "react";
import { X } from "lucide-react";

import { chrome, devTimeline as labels, story, storyScenes } from "@/content/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { progressToScreens, sceneProgress, visibleBeats } from "@/scroll/helpers";
import { BEATS, CAMERA, CHAPTERS, SCENES, SCREEN, SCREENS, TRANSITIONS } from "@/scroll/script";
import { useChapterIndex, useProgressState, useSceneIndex, useStory } from "@/scroll/story-scroll";
import type { SceneDef, SlotId, StoryPart } from "@/scroll/types";

/**
 * Development-only map of the script, toggled with the backtick key: scenes, beats (one row per
 * slot), transitions and camera keys on a horizontal bar with the chapter starts, a playhead at the
 * current progress, and readouts of progress, scene and chapter. While open, number keys jump to
 * scene starts (1 to 9, 0 for 10, Shift with 1 to 4 for 11 to 14); click or drag a bar to seek.
 *
 * The playhead and the numbers are written straight to the DOM; React state changes only when the
 * scene, chapter or set of visible beats changes.
 */

const STORAGE_KEY = "orange:dev-timeline";
const SLOT_ROWS: readonly SlotId[] = ["center-left", "bottom-left", "right", "top-left", "top-center", "center"];

const PART_TINT: Record<StoryPart, string> = {
  model: "bg-orange/35",
  work: "bg-sky-soft/45",
  terms: "bg-leaf/60",
  questions: "bg-marble/25",
  end: "bg-milk/15",
};

type View = "story" | "chapter";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Scene for a digit key: 1 to 9, 0 is 10, Shift+1 to Shift+4 are 11 to 14. */
function sceneForKey(event: KeyboardEvent): SceneDef | undefined {
  const match = /^Digit(\d)$/.exec(event.code);
  if (!match) return undefined;
  const digit = Number(match[1]);
  const number = event.shiftKey ? (digit >= 1 && digit <= 4 ? 10 + digit : 0) : digit === 0 ? 10 : digit;
  return SCENES.find((s) => s.number === number);
}

function chapterRange(index: number): readonly [number, number] {
  const start = index === 0 ? 0 : CHAPTERS[index].start;
  const end = index + 1 < CHAPTERS.length ? CHAPTERS[index + 1].start : 1;
  return [start, end];
}

const visibleKey = (p: number) =>
  visibleBeats(p)
    .map((b) => b.id)
    .join(" ");

export function DevTimeline() {
  const { progress, velocity, scrollTo } = useStory();
  const [open, setOpen] = React.useState(() => window.localStorage.getItem(STORAGE_KEY) === "1");
  const [view, setView] = React.useState<View>("story");
  const sceneIndex = useSceneIndex(progress);
  const chapterIndex = useChapterIndex(progress);
  const beatsOnStage = useProgressState(progress, visibleKey);

  const [v0, v1] = view === "story" ? ([0, 1] as const) : chapterRange(chapterIndex);
  const at = React.useCallback((p: number) => ((p - v0) / (v1 - v0)) * 100, [v0, v1]);

  const playhead = React.useRef<HTMLDivElement>(null);
  const readProgress = React.useRef<HTMLSpanElement>(null);
  const readScreen = React.useRef<HTMLSpanElement>(null);
  const readScene = React.useRef<HTMLSpanElement>(null);
  const readVelocity = React.useRef<HTMLSpanElement>(null);
  const scene = SCENES[sceneIndex];

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  // Keys: backtick toggles; digits jump to scene starts while open.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Backquote") {
        event.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (!open) return;
      const target = sceneForKey(event);
      if (target) {
        event.preventDefault();
        scrollTo(target.start + 0.005 * SCREEN, { immediate: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, scrollTo]);

  // Playhead and readouts, written straight to the DOM.
  React.useEffect(() => {
    if (!open) return;
    const draw = (p: number) => {
      if (playhead.current) playhead.current.style.left = `${Math.min(100, Math.max(0, at(p)))}%`;
      if (readProgress.current) readProgress.current.textContent = p.toFixed(4);
      if (readScreen.current) readScreen.current.textContent = labels.screens(progressToScreens(p), SCREENS);
      if (readScene.current) readScene.current.textContent = `${Math.round(sceneProgress(scene.id, p) * 100)}%`;
    };
    const drawVelocity = (v: number) => {
      if (readVelocity.current) readVelocity.current.textContent = labels.velocity(v);
    };
    draw(progress.get());
    drawVelocity(velocity.get());
    const offProgress = progress.on("change", draw);
    const offVelocity = velocity.on("change", drawVelocity);
    return () => {
      offProgress();
      offVelocity();
    };
  }, [open, at, progress, velocity, scene.id]);

  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    scrollTo(v0 + share * (v1 - v0), { immediate: true });
  };

  if (!open) return null;

  const inView = (start: number, end: number) => end > v0 && start < v1;
  const box = (start: number, end: number): React.CSSProperties => ({
    left: `${Math.max(0, at(start))}%`,
    width: `${Math.max(0.15, Math.min(100, at(end)) - Math.max(0, at(start)))}%`,
  });
  const chapter = CHAPTERS[chapterIndex];
  const chapterName = chrome.chapters.find((c) => c.id === chapter.id)?.name ?? chapter.id;

  return (
    <div
      role="region"
      aria-label={labels.title}
      data-dev-timeline
      className="theme-press fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pt-3 pb-4 font-mono text-[10px] leading-none text-foreground backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="type-label">{labels.title}</span>
        <span>
          {labels.readout.progress} <span ref={readProgress} className="tabular-nums text-orange" />
        </span>
        <span>
          {labels.readout.screen} <span ref={readScreen} className="tabular-nums" />
        </span>
        <span>
          {labels.readout.scene} {String(scene.number).padStart(2, "0")} {storyScenes[scene.id].name}{" "}
          <span ref={readScene} className="tabular-nums text-muted-foreground" />
        </span>
        <span>
          {labels.readout.chapter} {chapterName}
          {scene.part === "end" ? ` · ${story.endPart}` : ""}
        </span>
        <span>
          {labels.readout.beats} {beatsOnStage || labels.none}
        </span>
        <span>
          {labels.readout.velocity} <span ref={readVelocity} className="tabular-nums" />
        </span>
        <span className="ml-auto flex items-center gap-1">
          {(["story", "chapter"] as const).map((v) => (
            <Button key={v} size="xs" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)}>
              {labels.views[v]}
            </Button>
          ))}
          <Button size="icon-xs" variant="ghost" onClick={() => setOpen(false)} aria-label={labels.close}>
            <X />
          </Button>
        </span>
      </div>
      <p className="mt-1.5 text-muted-foreground">{labels.hint}</p>

      <div
        className="relative mt-3 cursor-crosshair touch-none overflow-hidden select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e);
        }}
        onPointerMove={seek}
      >
        {/* Chapter starts, across every row. */}
        {CHAPTERS.filter((c) => inView(c.start, c.start + 1e-9)).map((c) => (
          <div key={c.id} className="pointer-events-none absolute inset-y-0 z-10 border-l border-orange/70" style={{ left: `${at(c.start)}%` }}>
            <span className="absolute top-0 left-1 whitespace-nowrap text-orange">{chrome.chapters.find((x) => x.id === c.id)?.short}</span>
          </div>
        ))}

        <Row label={labels.rows.scenes} tall>
          {SCENES.filter((s) => inView(s.start, s.end)).map((s) => (
            <div
              key={s.id}
              title={`${s.number} ${storyScenes[s.id].name} · ${s.start.toFixed(3)} to ${s.end.toFixed(3)}`}
              className={cn("absolute inset-y-0 truncate border-r border-background px-1 pt-1.5", PART_TINT[s.part], s.id === scene.id && "outline outline-1 outline-white/70")}
              style={box(s.start, s.end)}
            >
              {String(s.number).padStart(2, "0")} {s.id}
            </div>
          ))}
        </Row>

        {SLOT_ROWS.map((slot) => (
          <Row key={slot} label={slot}>
            {BEATS.filter((b) => b.slot === slot && inView(b.in, b.out)).map((b) => (
              <div
                key={b.id}
                title={`${b.id} · ${b.copy} · ${b.in.toFixed(4)} to ${b.out.toFixed(4)} · ${((b.out - b.in) / SCREEN).toFixed(2)} screens · ${b.enter}/${b.leave}`}
                className="absolute inset-y-0.5 overflow-hidden rounded-[2px] bg-white/15"
                style={box(b.in, b.out)}
              >
                <div className="absolute inset-y-0 bg-white/30" style={{ left: `${((b.hold[0] - b.in) / (b.out - b.in)) * 100}%`, right: `${((b.out - b.hold[1]) / (b.out - b.in)) * 100}%` }} />
                <span className="relative truncate px-1 leading-[14px]">{b.id}</span>
              </div>
            ))}
          </Row>
        ))}

        <Row label={labels.rows.transitions}>
          {TRANSITIONS.filter((t) => inView(t.start, t.end)).map((t) => (
            <div
              key={t.id}
              title={`${t.id} · ${t.from} to ${t.to} · ${t.start.toFixed(4)} to ${t.end.toFixed(4)}`}
              className="absolute inset-y-0.5 overflow-hidden rounded-[2px] bg-sky-soft/40"
              style={box(t.start, t.end)}
            >
              {t.peak ? (
                <div
                  className="absolute inset-y-0 bg-sky-soft/70"
                  style={{ left: `${((t.peak[0] - t.start) / (t.end - t.start)) * 100}%`, right: `${((t.end - t.peak[1]) / (t.end - t.start)) * 100}%` }}
                />
              ) : null}
              <span className="relative truncate px-1 leading-[14px]">{t.kind}</span>
            </div>
          ))}
        </Row>

        <Row label={labels.rows.camera}>
          {CAMERA.filter((k) => inView(k.at, k.at + 1e-9)).map((k, i) => (
            <div key={i} title={`${k.scene} · ${k.at.toFixed(4)} · ${k.move} · fov ${k.fov}`} className="absolute inset-y-1 w-px bg-milk/80" style={{ left: `${at(k.at)}%` }} />
          ))}
        </Row>

        <div ref={playhead} className="pointer-events-none absolute inset-y-0 z-20 w-px bg-orange" />
      </div>
    </div>
  );
}

function Row({ label, tall = false, children }: { label: string; tall?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("relative border-b border-white/5", tall ? "h-6" : "h-4")}>
      <span className="pointer-events-none absolute top-1/2 right-1 z-10 -translate-y-1/2 text-[9px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
