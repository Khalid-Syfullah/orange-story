// The engine: one requestAnimationFrame loop that owns the scroll clock, the pointer, the GL
// context, the texture manager and the pass manager, and emits one FrameCtx per frame to the hub.
//
// Order of work per frame (docs/MOTION-RULES.md, scroll smoothing and rest states):
//   1. scroll.tick  -> p, vel, dt            (the clock)
//   2. pointer.tick -> uMouse, uKick          (rest state)
//   3. script       -> active segment, local t
//   4. passes.preload / textures.tick         (near assets load, loops upload a frame)
//   5. passes.draw  -> exactly one full-screen pass
//   6. hub.emit     -> DOM layers write to their elements
//
// `?p=0.42` lands on that progress at start (deep links and dev); `#model` etc. land on a segment;
// a reload lands where it was (the browser's restoration is read before the first frame).
import { tierFor } from "@/content/art";
import type { FrameCtx } from "./frame";
import { createContext, fitCanvas, type CanvasFit, type GLContext } from "./gl/context";
import { PassManager, type PassDef } from "./gl/passes";
import { TextureManager } from "./gl/textures";
import type { StageHub } from "./hub";
import { createPointer } from "./pointer";
import { ANCHORS, active, local, pAt, type SegmentId } from "./script";
import { createScrollClock, type ScrollClock } from "./scroll";
import { readColorTokens } from "./tokens";

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** The hero <video> in the stage markup (null on pages without it). */
  video: HTMLVideoElement | null;
  /** The sticky pin; the canvas follows its CSS size. */
  pin: HTMLElement;
  passes: readonly PassDef[];
  hub: StageHub;
}

export interface Engine {
  readonly scroll: ScrollClock;
  /** True when WebGL is off (`?nogl`, no context): the DOM layers still run. */
  readonly glOff: boolean;
  readonly textures: TextureManager | null;
  readonly passes: PassManager | null;
  /** Octaves for texture fields: 2 on phones, 4 otherwise. */
  readonly octaves: number;
  destroy(): void;
}

/** Phones and small tablets drop texture-field fbm to 2 octaves (motion fields keep 4 in GLSL). */
const PHONE_WIDTH = 820;

export function createEngine(opts: EngineOptions): Engine {
  const { canvas, pin, hub } = opts;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const octaves = coarse || window.innerWidth <= PHONE_WIDTH ? 2 : 4;

  const scroll = createScrollClock({ reduced, coarse });
  const pointer = createPointer(reduced);
  const colors = readColorTokens();

  // Deep links: ?p= and #anchor land at once (restoration semantics, no glide, no intro).
  const params = new URLSearchParams(window.location.search);
  const pParam = Number.parseFloat(params.get("p") ?? "");
  if (Number.isFinite(pParam)) scroll.setP(pParam, true);
  else {
    const seg = segmentForHash(window.location.hash);
    if (seg) scroll.setP(pAt(seg), true);
  }

  // GL stack: created now and rebuilt after a context restore.
  const gl: GLContext | null = createContext(canvas);
  const glOff = gl === null;
  if (glOff) canvas.classList.add("gl--off");
  let textures: TextureManager | null = null;
  let passes: PassManager | null = null;
  let fit: CanvasFit = { width: 1, height: 1, dpr: 1 };
  let css: [number, number] = [pin.clientWidth || window.innerWidth, pin.clientHeight || window.innerHeight];

  const buildGL = () => {
    if (!gl) return;
    const tier = tierFor(window.innerWidth, window.devicePixelRatio || 1);
    textures = new TextureManager(gl.gl, { tier, heroVideo: opts.video });
    passes = new PassManager(gl, textures, opts.passes, colors);
    fit = fitCanvas(gl, css[0], css[1]);
  };
  const dropGL = () => {
    passes?.destroy();
    textures?.destroy();
    passes = null;
    textures = null;
  };
  buildGL();

  const onLost = (e: Event) => {
    e.preventDefault();
    if (gl) gl.lost = true;
  };
  const onRestored = () => {
    if (!gl) return;
    dropGL();
    gl.lost = false;
    buildGL();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  // Resize: the canvas follows the pin; the clock re-measures the page.
  let resized = true;
  const onResize = () => {
    css = [pin.clientWidth || window.innerWidth, pin.clientHeight || window.innerHeight];
    if (gl && !gl.lost) fit = fitCanvas(gl, css[0], css[1]);
    scroll.measure();
    resized = true;
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(pin);
  else window.addEventListener("resize", onResize);

  const onHash = () => {
    const seg = segmentForHash(window.location.hash);
    if (seg) scroll.jumpTo(pAt(seg) * scroll.max);
  };
  window.addEventListener("hashchange", onHash);

  const controls = {
    scrollToSegment(id: SegmentId, t = 0) {
      scroll.setP(pAt(id, t));
    },
    setP(p: number, immediate?: boolean) {
      scroll.setP(p, immediate);
    },
  };

  // The loop.
  const t0 = performance.now();
  let raf = 0;
  let frameCount = 0;
  let lastMs = 0;
  let lastP = Number.NaN;
  let lastMouse: [number, number] = [0, 0];
  let lastUploads = -1;
  let destroyed = false;

  const loop = (now: number) => {
    if (destroyed) return;
    const start = performance.now();
    scroll.tick(now);
    const time = (now - t0) / 1000;
    pointer.tick(scroll.vel, time);

    const p = scroll.p;
    const segment = active(p);
    const t = local(segment.id, p);
    const mouse: [number, number] = [pointer.x, pointer.y];

    const frame: FrameCtx = {
      p,
      t,
      segment,
      vel: scroll.vel,
      dt: scroll.dt,
      time,
      res: [fit.width, fit.height],
      css,
      dpr: fit.dpr,
      mouse,
      still: reduced ? 1 : 0,
      kick: pointer.kick,
      octaves,
      reduced,
      frame: frameCount,
      ms: lastMs,
      glOff,
    };

    if (gl && !gl.lost && passes && textures) {
      passes.preload(p);
      textures.tick();
      const changed =
        resized ||
        frameCount < 4 ||
        p !== lastP ||
        Math.abs(mouse[0] - lastMouse[0]) > 1e-4 ||
        Math.abs(mouse[1] - lastMouse[1]) > 1e-4 ||
        textures.uploads !== lastUploads ||
        pointer.kick > 0.01;
      // Rule 14: skip dead work. Breath redraws every frame unless motion is reduced (uStill = 1).
      if (changed || (!reduced && passes.breathes(segment))) {
        passes.draw(frame);
        lastUploads = textures.uploads;
      }
      passes.warm();
    }

    hub.emit(frame);

    resized = false;
    lastP = p;
    lastMouse = mouse;
    frameCount++;
    lastMs = performance.now() - start;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const engine: Engine = {
    scroll,
    glOff,
    get textures() {
      return textures;
    },
    get passes() {
      return passes;
    },
    octaves,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      hub.detach();
      window.removeEventListener("hashchange", onHash);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Programs and textures are deleted explicitly; the context itself stays with the canvas,
      // which React may hand to the next engine (strict-mode remounts reuse the element).
      dropGL();
      pointer.destroy();
      scroll.destroy();
    },
  };
  hub.attach(controls, engine);
  return engine;
}

function segmentForHash(hash: string): SegmentId | null {
  const key = hash.replace(/^#/, "");
  return key in ANCHORS ? ANCHORS[key] : null;
}
