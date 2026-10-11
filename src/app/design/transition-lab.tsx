"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { animate, useMotionValue, type AnimationPlaybackControls, type MotionValue } from "motion/react";

import { designPage, storyScenes } from "@/content/copy";
import { Hairlines } from "@/components/chrome/hairlines";
import { setStageAspect } from "@/components/stage/camera-path";
import { transitionPhase } from "@/components/stage/transitions/choreography";
import { TRANSITION_MODES, type TransitionMode } from "@/components/stage/transitions/modes";
import { Beat } from "@/components/story/beat";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { lerp, remap } from "@/lib/progress";
import { progressToScreens, transitionOf } from "@/scroll/helpers";
import { HAIRLINES, SCREEN, TRANSITIONS } from "@/scroll/script";
import { StoryContext, type Story } from "@/scroll/story-scroll";
import type { TransitionDef, TransitionId } from "@/scroll/types";

import { demoTransitionPlates } from "./demo-script";

/**
 * Dev-only: every transition of the story on one slider, on the real stage (the same canvas, camera,
 * scenes and media as the story), over its real range from the scroll script and a little either side.
 * The media can be seen in each of their versions: full, light (a phone, the lowest quality tier) and
 * calm (reduced motion). The viewfinders draw on the hairlines over it, the smoke on the real beats.
 */

const StageCanvas = dynamic(() => import("@/components/stage/stage-canvas"), { ssr: false });

const labels = designPage.transitionLab;
const STEPS = 1000;
/** Seconds for a full play-through (a steady scroll). */
const PLAY_SECONDS = 3.2;
/** Screens shown before and after a transition's own range. */
const MARGIN = 0.1;

const spanOf = (def: TransitionDef): [number, number] => [Math.max(0, def.start - MARGIN * SCREEN), Math.min(1, def.end + MARGIN * SCREEN)];

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
  const [mode, setMode] = React.useState<TransitionMode>("full");
  const [value, setValue] = React.useState(0);
  const def = transitionOf(id);
  const span = React.useMemo(() => spanOf(def), [def]);
  const progress = useMotionValue(span[0]);
  const playback = React.useRef<AnimationPlaybackControls | null>(null);
  const readout = React.useRef<HTMLSpanElement>(null);
  const phase = React.useRef<HTMLSpanElement>(null);
  const [from, to] = demoTransitionPlates(def);

  // The stage films the lab's box (16 by 10, the reference shape).
  React.useEffect(() => {
    setStageAspect(1.6);
    return () => setStageAspect(0);
  }, []);

  const seek = React.useCallback(
    (t: number) => {
      setValue(t);
      progress.set(lerp(span[0], span[1], t));
    },
    [span, progress],
  );

  const choose = (next: TransitionDef) => {
    playback.current?.stop();
    setId(next.id);
    setValue(0);
    progress.set(spanOf(next)[0]);
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

      <div role="group" aria-label={labels.mode} className="flex flex-wrap items-center gap-1.5">
        <span className="type-label mr-2">{labels.mode}</span>
        {TRANSITION_MODES.map((m) => (
          <Button key={m} size="sm" variant={m === mode ? "secondary" : "outline"} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {labels.modes[m]}
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
        className="theme-sky relative aspect-[16/10] w-full overflow-hidden bg-background [container-type:inline-size]"
        style={{ "--grid-top": "5.3cqw" } as React.CSSProperties}
      >
        <StageCanvas progress={progress} transitionMode={mode} />
        {def.layer === "hairlines" ? <Hairlines progress={progress} cues={HAIRLINES} position="absolute" className="text-white" /> : null}
        {def.layer === "text" ? <SmokeBeats def={def} progress={progress} /> : null}
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
