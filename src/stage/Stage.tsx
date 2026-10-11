"use client";
// The stage: one <section class="stage"> about 60 viewport heights tall, a sticky .pin that fills
// the viewport with one WebGL canvas, the hidden hero <video> and a .layers div for DOM text.
//
// This is the one client component that owns the requestAnimationFrame loop (through the engine).
// It talks to React only through refs and the hub's subscribe API: no state changes per frame.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { art } from "@/content/art";
import { chrome as chromeCopy } from "@/content/copy";
import { Chrome } from "./Chrome";
import { createEngine } from "./engine";
import type { PassDef } from "./gl/passes";
import { Hud } from "./Hud";
import { createHub, StageContext, useFrame } from "./hub";
import type { FrameCtx } from "./frame";
import "./stage.css";

export interface StageProps {
  /** The passes to draw; a module-level constant so the engine is built once. */
  passes: readonly PassDef[];
  /** Height of the scroll track in viewport heights (docs/STORY.md: about 60). */
  heights?: number;
  /** Draw the hairline frame, mark, menu, Apply pill, rail and percentage. */
  chrome?: boolean;
  /** Mount the hidden hero <video> (the story does; dev pages need not). */
  heroVideo?: boolean;
  /** DOM layers over the canvas (copy, cards, the form). */
  children?: ReactNode;
}

/**
 * The canvas is an image to assistive technology: `role="img"` with a description of the painting
 * on screen, updated when the segment changes (never per frame: the label is written on a change).
 */
function SceneLabel({ canvas }: { canvas: RefObject<HTMLCanvasElement | null> }) {
  const shown = useRef("");
  const onFrame = useCallback(
    (f: FrameCtx) => {
      const id = f.segment.id;
      if (shown.current === id) return;
      const el = canvas.current;
      if (!el) return;
      shown.current = id;
      el.setAttribute("aria-label", chromeCopy.scenes[id]);
    },
    [canvas],
  );
  useFrame(onFrame);
  return null;
}

export function Stage({ passes, heights = 60, chrome = true, heroVideo = true, children }: StageProps) {
  const [hub] = useState(createHub);
  const pinRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pin = pinRef.current;
    if (!canvas || !pin) return;
    const engine = createEngine({ canvas, pin, ghost: ghostRef.current, video: videoRef.current, passes, hub });
    return () => engine.destroy();
  }, [hub, passes]);

  return (
    <StageContext.Provider value={hub}>
      <section className="stage" style={{ "--stage-heights": heights } as CSSProperties}>
        <div className="pin" ref={pinRef}>
          <canvas className="gl" ref={canvasRef} role="img" aria-label={chromeCopy.scenes.hero} />
          <SceneLabel canvas={canvasRef} />
          <canvas className="ghost" ref={ghostRef} aria-hidden="true" />
          {heroVideo && (
            <video
              ref={videoRef}
              className="stage-video"
              src={art.hero.src}
              poster={art.hero.poster}
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden="true"
              tabIndex={-1}
            />
          )}
          <div className="layers">{children}</div>
          {chrome && <Chrome />}
          <Hud />
        </div>
      </section>
    </StageContext.Provider>
  );
}
