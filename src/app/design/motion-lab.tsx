"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { animate, useMotionValue, type AnimationPlaybackControls, type MotionValue } from "motion/react";

import { designPage, storyScenes } from "@/content/copy";
import { createCameraPath, projectPoint, setStageAspect } from "@/components/stage/camera-path";
import { channelSpan, SCENE_MOTION } from "@/components/stage/motion-channels";
import { velocityJumps, type SceneMotion, type Vec3 } from "@/components/stage/motion-kit";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useElementSize } from "@/lib/use-element-size";
import { progressToScreens } from "@/scroll/helpers";
import { CAMERA, SCENES } from "@/scroll/script";
import type { SceneId } from "@/scroll/types";
import { colors, mixColors } from "@/styles/tokens";

/**
 * Dev-only: the motion lab. Pick a scene and scrub it on the real stage (the same canvas, camera and
 * scene arts as the story), with its skeleton drawn over it: bones (shoulder, elbow, wrist, grip),
 * the pivots things turn on, the grips things are held at and the arcs hands and things travel. Under
 * it, every value the scene drives (`motion-channels.ts`) plotted against progress with its speed, so
 * a jump in speed shows as a step in the orange line (and a white dot, from `velocityJumps`).
 */

const StageCanvas = dynamic(() => import("@/components/stage/stage-canvas"), { ssr: false });

const labels = designPage.motionLab;
const STEPS = 1000;
/** Seconds for a whole scene played through (a brisk, steady scroll). */
const PLAY_SECONDS = 6;
/** Samples per plotted curve. */
const SAMPLES = 360;

type Layer = keyof typeof labels.layers;
const LAYERS = Object.keys(labels.layers) as Layer[];

const COLORS = {
  bone: colors.milk,
  pivot: colors.orange,
  grip: colors.white,
  arc: colors.skySoft,
  value: mixColors("milk", "sky", 0.35),
  speed: colors.orange,
  jump: colors.white,
  grid: mixColors("sky", "milk", 0.2),
};

const SCENE_IDS: readonly SceneId[] = SCENES.map((s) => s.id);

interface Curve {
  name: string;
  value: string;
  speed: string;
  jumps: number[];
  min: number;
  max: number;
}

/** A scene's driven values as polylines (0 to 1 across, 0 to 1 down), with their speed and where it jumps. */
function curvesOf(motion: SceneMotion | undefined, [from, to]: readonly [number, number]): Curve[] {
  if (!motion) return [];
  const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => from + ((to - from) * i) / SAMPLES);
  return motion.channels.map((channel) => {
    const values = xs.map(channel.at);
    const speeds = values.map((_, i) => (i === 0 ? 0 : (values[i] - values[i - 1]) / (xs[i] - xs[i - 1])));
    speeds[0] = speeds[1] ?? 0;
    const line = (list: number[]) => {
      const lo = Math.min(...list);
      const hi = Math.max(...list);
      const span = hi - lo || 1;
      return list.map((v, i) => `${(i / SAMPLES).toFixed(4)},${(1 - (v - lo) / span).toFixed(4)}`).join(" ");
    };
    const jumps = velocityJumps(channel.at, from, to, { step: 2e-5 }).map((j) => (j.at - from) / (to - from));
    return { name: channel.name, value: line(values), speed: line(speeds), jumps, min: Math.min(...values), max: Math.max(...values) };
  });
}

/** The skeleton over the stage: drawn straight into the SVG on every change of progress (no React state per frame). */
function Overlay({ motion, progress, layers, scene }: { motion: SceneMotion | undefined; progress: MotionValue<number>; layers: Record<Layer, boolean>; scene: SceneId }) {
  const [measure, size] = useElementSize<HTMLDivElement>();
  const svg = React.useRef<SVGSVGElement>(null);
  const path = React.useMemo(() => createCameraPath(CAMERA), []);
  const arcs = React.useMemo(() => motion?.arcs?.() ?? [], [motion]);
  React.useEffect(() => () => path.kill(), [path]);

  React.useEffect(() => {
    const el = svg.current;
    if (!el || !size.width || !size.height) return;
    const draw = (p: number) => {
      const pose = path.seek(p);
      const at = (v: Vec3) => projectPoint(pose, v, size.width, size.height);
      const parts: string[] = [];
      if (layers.arcs) {
        for (const arc of arcs) {
          const points = arc.points.map(at).filter((s) => s.depth > 0);
          if (points.length > 1) parts.push(`<polyline points="${points.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(" ")}" fill="none" stroke="${COLORS.arc}" stroke-width="1.5" stroke-dasharray="4 4" />`);
        }
      }
      const marks = motion?.marks?.(p);
      if (marks) {
        if (layers.bones) {
          for (const [a, b] of marks.bones) {
            const sa = at(a);
            const sb = at(b);
            if (sa.depth > 0 && sb.depth > 0) parts.push(`<line x1="${sa.x.toFixed(1)}" y1="${sa.y.toFixed(1)}" x2="${sb.x.toFixed(1)}" y2="${sb.y.toFixed(1)}" stroke="${COLORS.bone}" stroke-width="3" stroke-linecap="round" stroke-opacity="0.85" />`);
          }
        }
        if (layers.pivots) {
          for (const v of marks.pivots) {
            const s = at(v);
            if (s.depth > 0) parts.push(`<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="5" fill="none" stroke="${COLORS.pivot}" stroke-width="2" />`);
          }
        }
        if (layers.grips) {
          for (const v of marks.grips) {
            const s = at(v);
            if (s.depth > 0) parts.push(`<rect x="${(s.x - 4).toFixed(1)}" y="${(s.y - 4).toFixed(1)}" width="8" height="8" fill="none" stroke="${COLORS.grip}" stroke-width="2" />`);
          }
        }
      }
      el.innerHTML = parts.join("");
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [motion, arcs, path, progress, size, layers, scene]);

  return (
    <div ref={measure} className="pointer-events-none absolute inset-0">
      <svg ref={svg} width={size.width} height={size.height} className="absolute inset-0" aria-hidden />
    </div>
  );
}

/** One driven value's plot, with the playhead (moved on progress change, straight into the DOM). */
function Plot({ curve, progress, span }: { curve: Curve; progress: MotionValue<number>; span: readonly [number, number] }) {
  const head = React.useRef<SVGLineElement>(null);
  React.useEffect(() => {
    const draw = (p: number) => {
      const x = Math.min(1, Math.max(0, (p - span[0]) / (span[1] - span[0])));
      head.current?.setAttribute("x1", String(x));
      head.current?.setAttribute("x2", String(x));
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [progress, span]);
  return (
    <div className="flex flex-col gap-1">
      <p className="type-meta flex justify-between gap-2 normal-case">
        <span className="truncate">{curve.name}</span>
        <span className={curve.jumps.length ? "text-orange" : "text-muted-foreground"}>{labels.jumps(curve.jumps.length)}</span>
      </p>
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="h-14 w-full bg-sky" aria-hidden>
        <polyline points={curve.value} fill="none" stroke={COLORS.value} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={curve.speed} fill="none" stroke={COLORS.speed} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {curve.jumps.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={0} y2={1} stroke={COLORS.jump} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        ))}
        <line ref={head} x1={0} x2={0} y1={0} y2={1} stroke={COLORS.grid} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="type-meta normal-case text-muted-foreground tabular-nums">{labels.range(curve.min, curve.max)}</p>
    </div>
  );
}

/** `?motion=<scene>&at=<0..1>`: the scene and the moment of it the lab opens on (for a link, or a script that looks). */
function openedFrom(query: URLSearchParams | null): { scene: SceneId; at: number } | null {
  const id = query?.get("motion") as SceneId | null;
  if (!id || !SCENE_IDS.includes(id)) return null;
  return { scene: id, at: Math.min(1, Math.max(0, Number(query?.get("at") ?? 0) || 0)) };
}

/** The lab reads the address it was opened with: wrap it in a `Suspense` boundary on a prerendered page. */
export function MotionLab() {
  const query = useSearchParams();
  const opened = React.useMemo(() => openedFrom(query), [query]);
  const [scene, setScene] = React.useState<SceneId>(opened?.scene ?? "graft");
  const [value, setValue] = React.useState(opened?.at ?? 0.5);
  const [layers, setLayers] = React.useState<Record<Layer, boolean>>({ bones: true, pivots: true, grips: true, arcs: true });
  const motion = SCENE_MOTION[scene];
  const span = React.useMemo(() => {
    const s = SCENES.find((x) => x.id === scene)!;
    return [s.start, Math.min(1, s.end)] as const;
  }, [scene]);
  const progress = useMotionValue(span[0] + (span[1] - span[0]) * value);
  const playback = React.useRef<AnimationPlaybackControls | null>(null);
  const readout = React.useRef<HTMLParagraphElement>(null);
  const curves = React.useMemo(() => curvesOf(motion, channelSpan(scene)), [motion, scene]);
  const plotSpan = React.useMemo(() => channelSpan(scene), [scene]);

  // The stage films the lab's box (16 by 10, the reference shape).
  React.useEffect(() => {
    setStageAspect(1.6);
    return () => setStageAspect(0);
  }, []);

  // Opened on a scene: bring the lab into view.
  React.useEffect(() => {
    if (opened) document.getElementById("motion-lab")?.scrollIntoView({ block: "start" });
  }, [opened]);

  const seek = React.useCallback(
    (t: number) => {
      setValue(t);
      progress.set(span[0] + (span[1] - span[0]) * t);
    },
    [progress, span],
  );

  const choose = (id: SceneId) => {
    playback.current?.stop();
    setScene(id);
    const s = SCENES.find((x) => x.id === id)!;
    setValue(0);
    progress.set(s.start);
  };

  const play = () => {
    playback.current?.stop();
    const back = value >= 0.999;
    const target = back ? 0 : 1;
    playback.current = animate(value, target, { duration: PLAY_SECONDS * Math.abs(target - value), ease: "linear", onUpdate: seek });
  };
  React.useEffect(() => () => playback.current?.stop(), []);

  React.useEffect(() => {
    const draw = (p: number) => {
      if (readout.current) readout.current.textContent = labels.readout(p, progressToScreens(p), (p - span[0]) / (span[1] - span[0]));
    };
    draw(progress.get());
    return progress.on("change", draw);
  }, [progress, span]);

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={labels.pick} className="flex flex-wrap gap-1.5">
        {SCENE_IDS.map((id) => (
          <Button key={id} size="sm" variant={id === scene ? "secondary" : "ghost"} aria-pressed={id === scene} onClick={() => choose(id)}>
            {storyScenes[id].name}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label id="motion-lab-label" className="type-label shrink-0">
          {labels.slider}
        </label>
        <Slider
          aria-labelledby="motion-lab-label"
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
        <p ref={readout} className="type-meta tabular-nums" aria-live="off" />
      </div>

      <div role="group" className="flex flex-wrap gap-1.5">
        {LAYERS.map((layer) => (
          <Button key={layer} size="sm" variant={layers[layer] ? "secondary" : "outline"} aria-pressed={layers[layer]} onClick={() => setLayers((l) => ({ ...l, [layer]: !l[layer] }))}>
            {labels.layers[layer]}
          </Button>
        ))}
      </div>

      <div id="motion-lab" data-motion-lab className="relative aspect-[16/10] w-full overflow-hidden bg-sky">
        <StageCanvas progress={progress} />
        <Overlay motion={motion} progress={progress} layers={layers} scene={scene} />
      </div>
      <p className="type-meta normal-case text-muted-foreground">{labels.hint}</p>

      <p className="type-meta normal-case text-muted-foreground">{motion ? labels.curves : labels.none}</p>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {curves.map((curve) => (
          <Plot key={`${scene}:${curve.name}`} curve={curve} progress={progress} span={plotSpan} />
        ))}
      </div>
    </div>
  );
}
