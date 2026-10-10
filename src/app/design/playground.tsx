"use client";

import * as React from "react";
import { useMotionValue } from "motion/react";

import { designPage, model, questions, terms, work } from "@/content/copy";
import { activeChapterIndex, type RulerChapter } from "@/components/chrome/chapters";
import { Hairlines } from "@/components/chrome/hairlines";
import { ProgressLine } from "@/components/chrome/progress-line";
import { StoryChrome } from "@/components/chrome/story-chrome";
import { BlurFade } from "@/components/motion/blur-fade";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Typewriter } from "@/components/motion/typewriter";
import { Slider } from "@/components/ui/slider";
import { Tag } from "@/components/ui/tag";

import { demoApplyAt, demoChapters, demoHairlineCues, demoRanges, demoSegments, demoTargets } from "./demo-script";

const STEPS = 1000;
const labels = designPage.playground;

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="theme-sky relative flex min-h-56 flex-col bg-background p-8">
      <p className="type-label">{title}</p>
      {meta ? <p className="type-meta mt-2 normal-case text-milk/60">{meta}</p> : null}
      <div className="mt-8 flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function TargetBox({ rect }: { rect: { x: number; y: number; width: number; height: number } }) {
  return (
    <span
      aria-hidden
      className="absolute border border-dashed border-white/25"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    />
  );
}

/** Dev-only playground: every UI-kit and chrome piece driven by one fake `progress` value. */
export function Playground() {
  const progress = useMotionValue(0);
  const [value, setValue] = React.useState(0);

  const jump = React.useCallback(
    (p: number) => {
      progress.set(p);
      setValue(p);
    },
    [progress],
  );
  const onChapterSelect = React.useCallback((c: RulerChapter) => jump(c.start), [jump]);
  const onApply = React.useCallback(() => jump(demoApplyAt), [jump]);

  const chapterName = demoChapters[activeChapterIndex(value, demoChapters)].name;
  const r = demoRanges;

  return (
    <div className="flex flex-col gap-px">
      {/* The fake progress control, sticky so it stays reachable while looking at each piece. */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-6 border-b border-border bg-background/95 py-5 backdrop-blur-sm">
        <label id="fake-progress-label" className="type-label shrink-0">
          {labels.slider}
        </label>
        <Slider
          aria-labelledby="fake-progress-label"
          className="max-w-xl flex-1"
          min={0}
          max={STEPS}
          step={1}
          value={[Math.round(value * STEPS)]}
          onValueChange={([v]) => jump(v / STEPS)}
        />
        <p className="type-meta tabular-nums" aria-live="off">
          {labels.readout(value, chapterName)}
        </p>
        <p className="type-meta w-full normal-case text-muted-foreground">{labels.hint}</p>
      </div>

      {/* Stage: hairlines plus the fixed chrome, contained in a 16:9 frame. */}
      <div className="mt-8">
        <p className="type-label mb-3">{labels.stage}</p>
        <div
          className="theme-sky relative aspect-video w-full overflow-hidden bg-background [container-type:inline-size]"
          style={{ "--grid-top": "5.3cqw" } as React.CSSProperties}
        >
          <TargetBox rect={demoTargets.share} />
          <TargetBox rect={demoTargets.finale} />
          <Hairlines progress={progress} cues={demoHairlineCues} position="absolute" className="text-white" />
          <ProgressLine
            progress={progress}
            range={r.progressLine}
            erase={r.progressLineErase}
            className="absolute text-white"
            style={{ left: "5.3%", width: "80.3%", top: "5.3cqw" }}
          />
          <StoryChrome
            progress={progress}
            chapters={demoChapters}
            segments={demoSegments}
            onChapterSelect={onChapterSelect}
            onApply={onApply}
            position="absolute"
          />
        </div>
        <p className="type-meta mt-3 normal-case text-muted-foreground">{labels.hairlineCaption}</p>
      </div>

      {/* Text effects */}
      <div className="mt-8 grid gap-px md:grid-cols-2">
        <Panel title={labels.splitReveal} meta={labels.range(...r.splitReveal)}>
          <SplitReveal as="h2" text={model.hero.title} progress={progress} range={r.splitReveal} className="type-display-xl" />
        </Panel>

        <Panel title={labels.splitRevealInView}>
          <SplitReveal as="h3" text={questions.title} className="type-display-l" once={false} />
        </Panel>

        <Panel title={labels.typewriter} meta={labels.range(...r.typewriter)}>
          <div className="flex items-start gap-6">
            <Tag className="mt-1 shrink-0">{model.harvest.tag}</Tag>
            <Typewriter text={model.harvest.typed} progress={progress} range={r.typewriter} className="type-body max-w-[40ch] text-milk" />
          </div>
        </Panel>

        <Panel
          title={labels.blurFade}
          meta={labels.inOut(r.blurFadeIn, r.blurFadeOut)}
        >
          <BlurFade progress={progress} in={r.blurFadeIn} out={r.blurFadeOut} direction="left">
            <p className="type-title max-w-[22ch]">{terms.block.title}</p>
          </BlurFade>
          <BlurFade progress={progress} out={r.blurFadeOut} direction="up" scale={1.04} className="mt-4">
            <p className="type-body max-w-[44ch] text-milk">{work.cards[0].body}</p>
          </BlurFade>
        </Panel>

        <Panel title={labels.progressLine} meta={labels.drawErase(r.progressLine, r.progressLineErase)}>
          <div className="relative h-10">
            <span className="hairline-x absolute inset-x-0 top-1/2" aria-hidden />
            <ProgressLine progress={progress} range={r.progressLine} erase={r.progressLineErase} className="absolute inset-x-0 top-1/2" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
