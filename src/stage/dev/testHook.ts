// The e2e test hook: `window.__stage`, the handle the Playwright suite (e2e/) drives the stage by
// (docs/CHECKS.md). Built only when NEXT_PUBLIC_STAGE_TEST_HOOK=1 (the e2e build); engine.ts imports
// it behind that flag and next.config.ts pins the flag to "0" otherwise, so production never has it.
//
//   setP(p)      land at progress p at once, as a deep link lands (no glide, followers at rest)
//   getP()       the smoothed progress
//   segment()    the active segment and its local t (after the reduced-motion hold)
//   frameMs()    the main thread's time for the last frame, ms (scroll, textures, draw, DOM layers)
//   frame()      draw the stage now, at the current p and the current (page.clock) time, and
//                return the canvas as PNG bytes (frame(vel): as if the scroll moved vel px a frame)
//
// and for the suite: ready() (every texture the frame samples is exactly the one it wants),
// probe() (each pixel's place across the cut's crest zone, or a printed boundary's mix: lib.glsl.ts
// PROBE and PROBE_MIX), holdLoops() (the
// video loops paused at one frame, so frames over them are reproducible), pinFrames() and
// sequencesMove() (a frame drawn at a new p with the sequences' last frames, so the pop test can
// tell the shader's change from the content's), frameTimes() and state().
import type { Engine } from "../engine";
import type { FrameCtx } from "../frame";
import type { StageHub } from "../hub";
import type { SegmentId } from "../script";

/** What the engine hands the hook (engine.ts, behind the flag). */
export interface StageTestAccess {
  canvas: HTMLCanvasElement;
  /** The reduced-motion dissolve's ghost canvas. */
  ghost: HTMLCanvasElement | null;
  hub: StageHub;
  engine(): Engine;
  /** Land at p (scroll clock set at once, per-frame followers reset). */
  land(p: number): void;
  /** The smoothed progress, before the reduced-motion hold. */
  progress(): number;
  /** The frame context the stage would draw now. */
  frame(): FrameCtx;
  /**
   * Draw now: the picture, or the probe build's crest zone or boundary mix (lib.glsl.ts PROBE and
   * PROBE_MIX), at the scroll's own speed or at `vel` px per frame; false when there is no GL or no
   * probe build.
   */
  render(what: "picture" | "zone" | "mix", vel?: number): boolean;
  /** Everything the pass for the current frame samples is exactly what it wants. */
  settled(): boolean;
  holdLoops(seconds: number): Promise<void>;
  /** Sequences keep the frame they show (TextureManager.pinFrames). */
  pinFrames(on: boolean): void;
  /** Landing at p would put another frame of a sequence on screen. */
  sequencesMove(p: number): boolean;
}

export interface StageState {
  p: number;
  segment: SegmentId;
  t: number;
  pass: string | null;
  reduced: boolean;
  still: number;
  octaves: number;
  band: number;
  css: readonly [number, number];
  view: readonly [number, number];
  res: readonly [number, number];
  dpr: number;
  mode: string;
  /** The ghost canvas's computed opacity (the reduced-motion dissolve), 0 when it has faded. */
  ghostOpacity: number;
  /** The ghost's transition as the dissolve last set it ("" before any dissolve). */
  ghostTransition: string;
  /** Assets that failed to load. */
  missing: string[];
}

export interface StageTestHook {
  setP(p: number): void;
  getP(): number;
  segment(): { id: SegmentId; t: number };
  frameMs(): number;
  /** The canvas as PNG bytes, drawn now; at `vel` px per frame of scroll speed when given (the speed test). */
  frame(vel?: number): Promise<Uint8Array>;
  ready(): boolean;
  probe(what?: "zone" | "mix"): Promise<Uint8Array>;
  holdLoops(seconds?: number): Promise<void>;
  pinFrames(on: boolean): void;
  sequencesMove(p: number): boolean;
  frameTimes(clear?: boolean): number[];
  state(): StageState;
}

declare global {
  interface Window {
    __stage?: StageTestHook;
  }
}

/** Frame times kept for frameTimes(), the most recent last. */
const KEEP = 8192;

export function installTestHook(access: StageTestAccess): () => void {
  const times: number[] = [];
  const unsubscribe = access.hub.subscribe((f) => {
    // f.ms is the previous frame's time: skip the first frame (nothing before it).
    if (f.frame === 0) return;
    times.push(f.ms);
    if (times.length > KEEP) times.splice(0, times.length - KEEP);
  });

  // Read in the same task as the draw, so the drawing buffer has not been presented and cleared.
  const png = (): Uint8Array => {
    const url = access.canvas.toDataURL("image/png");
    const bin = atob(url.slice(url.indexOf(",") + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const hook: StageTestHook = {
    setP(p) {
      access.land(p);
    },
    getP() {
      return access.progress();
    },
    segment() {
      const f = access.frame();
      return { id: f.segment.id, t: f.t };
    },
    frameMs() {
      return access.hub.last?.ms ?? 0;
    },
    async frame(vel) {
      access.render("picture", vel);
      const out = png();
      if (vel !== undefined) access.render("picture");
      return out;
    },
    ready() {
      access.render("picture");
      return access.settled();
    },
    async probe(what = "zone") {
      const ok = access.render(what);
      const out = ok ? png() : new Uint8Array(0);
      access.render("picture");
      return out;
    },
    holdLoops(seconds = 1) {
      return access.holdLoops(seconds);
    },
    pinFrames(on) {
      access.pinFrames(on);
    },
    sequencesMove(p) {
      return access.sequencesMove(p);
    },
    frameTimes(clear = false) {
      const out = times.slice();
      if (clear) times.length = 0;
      return out;
    },
    state() {
      const f = access.frame();
      const engine = access.engine();
      const ghost = access.ghost;
      return {
        p: f.p,
        segment: f.segment.id,
        t: f.t,
        pass: engine.passes?.lastPassId ?? null,
        reduced: f.reduced,
        still: f.still,
        octaves: f.octaves,
        band: f.band,
        css: f.css,
        view: f.view,
        res: f.res,
        dpr: f.dpr,
        mode: engine.scroll.mode,
        ghostOpacity: ghost ? Number.parseFloat(getComputedStyle(ghost).opacity) : 0,
        ghostTransition: ghost?.style.transition ?? "",
        missing: engine.textures?.failedKeys() ?? [],
      };
    },
  };

  window.__stage = hook;
  return () => {
    unsubscribe();
    if (window.__stage === hook) delete window.__stage;
  };
}
