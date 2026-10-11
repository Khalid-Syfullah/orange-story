"use client";
// The stage: one <section class="stage"> about 60 viewport heights tall, a sticky .pin that fills
// the viewport with one WebGL canvas, the hidden hero <video> and a .layers div for DOM text.
//
// This is the one client component that owns the requestAnimationFrame loop (through the engine).
// It talks to React only through refs and the hub's subscribe API: no state changes per frame.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { art } from "@/content/art";
import { Chrome } from "./Chrome";
import { createEngine } from "./engine";
import type { PassDef } from "./gl/passes";
import { Hud } from "./Hud";
import { createHub, StageContext } from "./hub";
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

export function Stage({ passes, heights = 60, chrome = true, heroVideo = true, children }: StageProps) {
  const [hub] = useState(createHub);
  const pinRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pin = pinRef.current;
    if (!canvas || !pin) return;
    const engine = createEngine({ canvas, pin, video: videoRef.current, passes, hub });
    return () => engine.destroy();
  }, [hub, passes]);

  return (
    <StageContext.Provider value={hub}>
      <section className="stage" style={{ "--stage-heights": heights } as CSSProperties}>
        <div className="pin" ref={pinRef}>
          <canvas className="gl" ref={canvasRef} aria-hidden="true" />
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
