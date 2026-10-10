"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { animate, useMotionValue, type AnimationPlaybackControls, type MotionValue } from "motion/react";

import { designPage, storyScenes } from "@/content/copy";
import { Hairlines, type FrameRect } from "@/components/chrome/hairlines";
import { PlaceholderStill } from "@/components/stage/placeholder-still";
import { scenePresence } from "@/components/stage/presence";
import { Beat } from "@/components/story/beat";
import { revealCircle, transitionPhase } from "@/components/transitions/choreography";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { lerp, remap } from "@/lib/progress";
import { useElementSize } from "@/lib/use-element-size";
import { progressToScreens, transitionOf } from "@/scroll/helpers";
import { HAIRLINES, TRANSITIONS } from "@/scroll/script";
import { StoryContext, type Story } from "@/scroll/story-scroll";
import type { TransitionDef, TransitionId } from "@/scroll/types";

import { demoTransitionPlates } from "./demo-script";

/**
 * Dev-only: every transition of the story on one slider, on its real range from the scroll script,
 * between placeholder plates of the scenes it joins. The canvas transitions draw on the same
 * transition canvas as the stage; the viewfinders on the hairlines; the smoke on the real beats.
 */

const TransitionCanvas = dynamic(() => import("@/components/transitions/transition-canvas"), { ssr: false });

const labels = designPage.transitionLab;
const STEPS = 1000;
/** Seconds for a full play-through (a steady scroll). */
const PLAY_SECONDS = 3.2;

function phaseLabel(def: TransitionDef, p: number): string {
  const { t, enter, exit } = transitionPhase(def, p);
  const frame = def.kind === "viewfinder";
  if (t <= 0) return labels.phases.start;
  if (t >= 1) return labels.phases.end;
  if (!def.peak) return def.kind === "smoke" ? labels.phases.dissolving : labels.phases.sweeping;
  if (enter < 1) return frame ? labels.phases.closing : labels.phases.covering;
  if (exit <= 0) return frame ? labels.phases.closed : labels.phases.covered;
  return labels.phases.opening;
}

/** The two placeholder plates: the new one swaps in at the boundary, or inside the ring. */
function DemoPlates({ def, progress }: { def: TransitionDef; progress: MotionValue<number> }) {
  const [from, to] = demoTransitionPlates(def);
  const [measure, size] = useElementSize<HTMLDivElement>();
  const fromRef = React.useRef<HTMLDivElement>(null);
  const toRef = React.useRef<HTMLDivElement>(null);
  const twoPlates = from !== to;

  React.useEffect(() => {
    const draw = (p: number) => {
      const old = fromRef.current;
      const next = toRef.current;
      if (!old || !next) return;
      if (def.kind === "ring") {
        if (!size.width || !size.height) return; // not measured yet
        // Inside the ring the new scene, outside it the old one (as plates with `reveal` on the stage).
        const c = revealCircle(def, p, size.width, size.height);
        const mask = `radial-gradient(circle at ${c.x.toFixed(1)}px ${c.y.toFixed(1)}px, #000 ${Math.max(0, c.radius - c.softness).toFixed(1)}px, transparent ${(c.radius + c.softness).toFixed(1)}px)`;
        next.style.maskImage = mask;
        next.style.setProperty("-webkit-mask-image", mask);
        next.style.opacity = "1";
        old.style.opacity = "1";
        return;
      }
      // As on the stage: the scenes swap at their boundary, under the transition's full cover.
      old.style.opacity = String(scenePresence(from, p));
      next.style.opacity = String(scenePresence(to, p));
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [def, from, to, progress, size]);

  return (
    <div ref={measure} className="absolute inset-0">
      <div ref={fromRef} className="absolute inset-0">
        <PlaceholderStill scene={from} className="size-full" />
      </div>
      <div ref={toRef} className="absolute inset-0" style={{ opacity: 0 }}>
        {twoPlates ? <PlaceholderStill scene={to} className="size-full" /> : null}
      </div>
    </div>
  );
}

function TargetBox({ rect }: { rect: FrameRect }) {
  return (
    <span
      aria-hidden
      className="absolute border border-dashed border-white/30"
      style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
    />
  );
}

/** The smoke runs on the real beats it lists, inside a stand-in story driven by the slider. */
function SmokeBeats({ def, progress }: { def: TransitionDef; progress: MotionValue<number> }) {
  const velocity = useMotionValue(0);
  const story = React.useMemo<Story>(() => ({ progress, velocity, scrollTo: () => {}, year: null }), [progress, velocity]);
  return (
    <StoryContext value={story}>
      <div className="absolute inset-0 text-white [--story-soft:var(--milk)]">
        {(def.beats ?? []).map((id) => (
          <Beat key={id} id={id} />
        ))}
      </div>
    </StoryContext>
  );
}

export function TransitionLab() {
  const [id, setId] = React.useState<TransitionId>("sand");
  const [value, setValue] = React.useState(0);
  const def = transitionOf(id);
  const progress = useMotionValue(def.start);
  const playback = React.useRef<AnimationPlaybackControls | null>(null);
  const readout = React.useRef<HTMLSpanElement>(null);
  const phase = React.useRef<HTMLSpanElement>(null);
  const [from, to] = demoTransitionPlates(def);
  const canvasDefs = React.useMemo(() => (def.layer === "canvas" ? [def] : []), [def]);

  const seek = React.useCallback(
    (t: number) => {
      setValue(t);
      progress.set(lerp(def.start, def.end, t));
    },
    [def, progress],
  );

  const choose = (next: TransitionDef) => {
    playback.current?.stop();
    setId(next.id);
    setValue(0);
    progress.set(next.start);
  };

  const play = () => {
    playback.current?.stop();
    const back = value >= 0.999;
    const target = back ? 0 : 1;
    playback.current = animate(value, target, { duration: PLAY_SECONDS * Math.abs(target - value), ease: "linear", onUpdate: seek });
  };

  React.useEffect(() => () => playback.current?.stop(), []);

  // Readouts, written straight to the DOM.
  React.useEffect(() => {
    const draw = (p: number) => {
      if (readout.current) readout.current.textContent = labels.readout(p, progressToScreens(p), remap(p, def.start, def.end));
      if (phase.current) phase.current.textContent = phaseLabel(def, p);
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [def, progress]);

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={labels.pick} className="flex flex-wrap gap-1.5">
        {TRANSITIONS.map((t) => (
          <Button key={t.id} size="sm" variant={t.id === id ? "secondary" : "ghost"} aria-pressed={t.id === id} onClick={() => choose(t)}>
            {labels.names[t.id]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label id="transition-lab-label" className="type-label shrink-0">
          {labels.slider}
        </label>
        <Slider
          aria-labelledby="transition-lab-label"
          className="max-w-xl flex-1"
          min={0}
          max={STEPS}
          step={1}
          value={[Math.round(value * STEPS)]}
          onValueChange={([v]) => {
            playback.current?.stop();
            seek(v / STEPS);
          }}
        />
        <Button size="sm" variant="outline" onClick={play}>
          {value >= 0.999 ? labels.playBack : labels.play}
        </Button>
        <p className="type-meta tabular-nums" aria-live="off">
          <span ref={readout} /> · <span ref={phase} className="text-foreground" />
        </p>
      </div>

      <div
        className="theme-sky relative aspect-video w-full overflow-hidden bg-background [container-type:inline-size]"
        style={{ "--grid-top": "5.3cqw" } as React.CSSProperties}
      >
        <DemoPlates key={def.id} def={def} progress={progress} />
        {def.layer === "hairlines" && def.target ? (
          <>
            <TargetBox rect={def.target} />
            <Hairlines progress={progress} cues={HAIRLINES} position="absolute" className="text-white" />
          </>
        ) : null}
        {def.layer === "text" ? <SmokeBeats def={def} progress={progress} /> : null}
        <TransitionCanvas progress={progress} transitions={canvasDefs} />
      </div>

      <div className="type-meta grid gap-1 normal-case text-muted-foreground md:grid-cols-[1fr_auto] md:gap-6">
        <p>{labels.notes[def.id]}</p>
        <p className="tabular-nums md:text-right">
          {labels.scenes(storyScenes[from].name, storyScenes[to].name)} · {labels.range(def.start, def.end, def.peak)}
        </p>
      </div>
      <p className="type-meta normal-case text-muted-foreground">{labels.hint}</p>
    </div>
  );
}
