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
// `?p=0.42` lands on that progress at start (deep links and dev); `?split=0.5` (any segment id with
// a local t) lands inside that segment; `#model` etc. land on a segment; a reload lands where it
// was (the browser's restoration is read before the first frame). Dev only: `?clock=12` fixes the
// shader clock so frames are reproducible (docs/CHECKS.md) and `?finish` waits for the GPU after
// each draw so the HUD's frame time is the pass's real cost.
import { tierFor } from "@/content/art";
import { bandFor, pageAt, setBand, ZONE_IN_BAND } from "./band";
import type { FrameCtx } from "./frame";
import { createContext, fitCanvas, type CanvasFit, type GLContext } from "./gl/context";
import { PassManager, type PassDef } from "./gl/passes";
import { TextureManager } from "./gl/textures";
import type { StageHub } from "./hub";
import { createPointer } from "./pointer";
import { ANCHORS, active, local, pAt, reducedHold, segmentFromParams, type SegmentId } from "./script";
import { createScrollClock, type ScrollClock } from "./scroll";
import { readColorTokens } from "./tokens";

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** The hero <video> in the stage markup (null on pages without it). */
  video: HTMLVideoElement | null;
  /** The sticky pin; the canvas follows its CSS size (the band of it, on a tall phone). */
  pin: HTMLElement;
  /** Under reduced motion: the 2D canvas that holds the last frame while a 300 ms dissolve runs. */
  ghost?: HTMLCanvasElement | null;
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

/** Under reduced motion a jump in the effective progress bigger than this starts the dissolve. */
const JUMP_P = 0.004;
const DISSOLVE_MS = 300;

/** A colour as #rrggbb (the pin's `--page`). */
function hexOf(c: readonly [number, number, number]): string {
  const h = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
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
  const segParam = segmentFromParams(params);
  if (Number.isFinite(pParam)) scroll.setP(pParam, true);
  else if (segParam) scroll.setP(pAt(segParam.id, segParam.t), true);
  else {
    // A reload or a Back/Forward lands where the browser restores the scroll (the same p, no
    // intro), whatever anchor the URL carries from an earlier jump; a fresh visit to #terms lands on it.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const restored = nav?.type === "reload" || nav?.type === "back_forward";
    const seg = segmentForHash(window.location.hash);
    if (seg && !restored) scroll.setP(pAt(seg), true);
  }
  // Dev: a fixed shader clock (breath, hashed flickers and the kick hold still); `?finish` waits
  // for the GPU after each draw (a one-pixel readback: in Chrome, finish() alone does not block on
  // the draw) so the HUD's frame time is the pass's cost; `?repeat=8` draws the pass that many
  // times a frame, so a cost under the readback's noise can be read off dt instead (it rises above
  // 16.7 ms once the repeats exceed the budget).
  const clockParam = Number.parseFloat(params.get("clock") ?? "");
  const fixedClock = Number.isFinite(clockParam) ? clockParam : null;
  const syncGPU = params.has("finish");
  const repeatParam = Number.parseInt(params.get("repeat") ?? "", 10);
  const repeat = Number.isFinite(repeatParam) && repeatParam > 1 ? Math.min(repeatParam, 64) : 1;
  const syncPixel = new Uint8Array(4);

  // GL stack: created now and rebuilt after a context restore.
  const gl: GLContext | null = createContext(canvas, { preserve: reduced });
  const glOff = gl === null;
  if (glOff) canvas.classList.add("gl--off");
  let textures: TextureManager | null = null;
  let passes: PassManager | null = null;
  let fit: CanvasFit = { width: 1, height: 1, dpr: 1 };
  // The layout: `view` is the whole viewport, `css` the picture's frame in it (a band 0.6 of the
  // height on tall phones, src/stage/band.ts), written to the pin as variables the copy reads.
  let view: [number, number] = [1, 1];
  let band = 1;
  let css: [number, number] = [1, 1];
  const layout = () => {
    view = [pin.clientWidth || window.innerWidth, pin.clientHeight || window.innerHeight];
    band = bandFor(view[0], view[1]);
    setBand(band);
    css = [view[0], Math.max(1, Math.round(view[1] * band))];
    const stacked = band < 0.999;
    pin.dataset.stack = stacked ? "true" : "false";
    pin.style.setProperty("--band-px", stacked ? `${css[1]}px` : "100%");
    pin.style.setProperty("--zone-top", stacked ? `${Math.round(css[1] * ZONE_IN_BAND)}px` : "0px");
    pin.style.setProperty("--view-h", `${view[1]}px`);
  };
  layout();
  let pageKey = "";

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
    layout();
    if (gl && !gl.lost) fit = fitCanvas(gl, css[0], css[1]);
    scroll.measure();
    resized = true;
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(pin);
  else window.addEventListener("resize", onResize);

  // History: a jump from the menu, the rail, the pill or the mark is an entry of its own, carrying
  // the progress it left from (and an anchor in the URL when the segment has one), so Back and
  // Forward glide to where the reader was. A hash change alone (typing #terms) also sets the target.
  const stateP = () => {
    const st = window.history.state as { p?: unknown } | null;
    return st && typeof st.p === "number" ? st.p : null;
  };
  const remember = (to: number, hash: string) => {
    try {
      window.history.replaceState({ p: scroll.p }, "", window.location.href);
      const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
      window.history.pushState({ p: to }, "", url);
    } catch {
      // History can be unavailable (sandboxed frames); the jump itself still works.
    }
  };
  const anchorOf = (id: SegmentId): string => Object.keys(ANCHORS).find((k) => ANCHORS[k] === id) ?? "";
  const onHash = () => {
    if (stateP() !== null) return;
    const seg = segmentForHash(window.location.hash);
    if (seg) scroll.jumpTo(pAt(seg) * scroll.max);
  };
  const onPop = () => {
    const p = stateP();
    if (p !== null) scroll.setP(p);
    else {
      const seg = segmentForHash(window.location.hash);
      scroll.setP(seg ? pAt(seg) : 0);
    }
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onPop);

  const controls = {
    scrollToSegment(id: SegmentId, t = 0) {
      remember(pAt(id, t), t === 0 ? anchorOf(id) : "");
      scroll.setP(pAt(id, t));
    },
    setP(p: number, immediate?: boolean) {
      if (!immediate) remember(p, "");
      scroll.setP(p, immediate);
    },
  };

  // The dissolve: the canvas still holds the last frame (the context keeps its drawing buffer under
  // reduced motion), so it is copied to the ghost, which fades out over 300 ms above the new frame.
  const ghost = opts.ghost ?? null;
  const ghostCtx = ghost ? ghost.getContext("2d") : null;
  let lastDrew = false;
  const dissolve = () => {
    if (!ghost || !ghostCtx || !gl || gl.lost || !lastDrew) return;
    if (ghost.width !== canvas.width || ghost.height !== canvas.height) {
      ghost.width = canvas.width;
      ghost.height = canvas.height;
    }
    ghostCtx.drawImage(canvas, 0, 0);
    ghost.style.transition = "none";
    ghost.style.opacity = "1";
    void ghost.offsetWidth;
    ghost.style.transition = `opacity ${DISSOLVE_MS}ms linear`;
    ghost.style.opacity = "0";
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
    const real = (now - t0) / 1000;
    const time = fixedClock ?? real;
    pointer.tick(scroll.vel, real);

    // Reduced motion: a transition shows its end frame (t = 1) from the moment the scroll enters
    // it, and the change dissolves over 300 ms (the ghost holds the frame that was on screen).
    const p = reduced ? reducedHold(scroll.p) : scroll.p;
    if (reduced && Math.abs(p - lastP) > JUMP_P && frameCount > 4) dissolve();
    const segment = active(p);
    const t = local(segment.id, p);
    const mouse: [number, number] = [pointer.x, pointer.y];

    const page = pageAt(p, colors);
    if (band < 0.999) {
      const key = hexOf(page);
      if (key !== pageKey) {
        pageKey = key;
        pin.style.setProperty("--page", key);
      }
    }

    const frame: FrameCtx = {
      p,
      t,
      segment,
      vel: scroll.vel,
      dt: scroll.dt,
      time,
      res: [fit.width, fit.height],
      css,
      view,
      band,
      page,
      dpr: fit.dpr,
      mouse,
      still: reduced ? 1 : 0,
      kick: fixedClock === null ? pointer.kick : 0,
      octaves,
      reduced,
      frame: frameCount,
      ms: lastMs,
      glOff,
      synced: syncGPU,
    };

    if (gl && !gl.lost && passes && textures) {
      // Rule 14: what is near only changes when p does (or a pass finishes compiling).
      if (p !== lastP || frameCount < 8 || frameCount % 30 === 0) passes.preload(p);
      textures.tick();
      const changed =
        resized ||
        frameCount < 4 ||
        p !== lastP ||
        Math.abs(mouse[0] - lastMouse[0]) > 1e-4 ||
        Math.abs(mouse[1] - lastMouse[1]) > 1e-4 ||
        textures.uploads !== lastUploads ||
        pointer.kick > 0.01;
      // Rule 14: skip dead work. Breath redraws unless motion is reduced (uStill = 1); at rest it is
      // 0.4% of zoom over seconds, so every second frame (30 Hz) draws it and the rest cost nothing.
      if (changed || (!reduced && passes.breathes(segment) && frameCount % 2 === 0)) {
        passes.draw(frame);
        for (let i = 1; i < repeat; i++) passes.draw(frame);
        if (syncGPU) {
          gl.gl.finish();
          gl.gl.readPixels(0, 0, 1, 1, gl.gl.RGBA, gl.gl.UNSIGNED_BYTE, syncPixel);
        }
        lastUploads = textures.uploads;
        lastDrew = true;
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
      window.removeEventListener("popstate", onPop);
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
