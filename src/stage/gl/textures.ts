// The texture manager: stills, video loops and frame sequences as WebGL textures.
//
//   - Stills: the tier (1440 or 768) is chosen from the viewport width; decoded off the main thread
//     and uploaded once.
//   - Loops: a <video> per loop (the hero's lives in the stage markup). Frames are uploaded with
//     texImage2D only while the loop's segment is near; otherwise the video is paused.
//   - Frame sequences: manifest.json gives the count. `aim(frame)` decodes around the aimed frame
//     in both directions through a small worker pool (fetch + createImageBitmap off-thread);
//     `near(frame)` returns the nearest decoded frame so the shader never samples a blank, and
//     uploads only when the chosen frame changes. At most MAX_DECODED frames stay decoded.
//
// Every texture starts as one sky-coloured pixel, so a pass can sample before anything has loaded.
// Textures are uploaded without UNPACK_FLIP_Y: painting uv (0,0) is the top-left of the image.
import {
  art,
  framePath,
  loadFrameCount,
  type ArtId,
  type FramesArt,
  type LoopArt,
  type StillArt,
  type StillTiers,
  type Tier,
} from "@/content/art";

export const MAX_DECODED = 24;
/** Frames kept warm on each side of the aim (with the aim itself: 23 <= MAX_DECODED). */
const DECODE_WINDOW = 11;
/** Decodes in flight per sequence; stale requests are dropped on arrival. */
const INFLIGHT_PER_SEQUENCE = 3;
const POOL_SIZE = 3;
/** A sequence that is no longer near keeps its frames this long in case the scroll comes back. */
const RELEASE_GRACE_MS = 1500;

export type TextureKind = "still" | "loop" | "frames";
export type DecodedSource = ImageBitmap | HTMLImageElement;

export interface TextureHandle {
  readonly id: ArtId;
  readonly kind: TextureKind;
  readonly key: string;
  readonly texture: WebGLTexture;
  /** Source size in pixels; the aspect from art.ts until the real size is known. */
  readonly size: [number, number];
  /** True once real pixels have been uploaded. */
  readonly ready: boolean;
  /** True when loading failed (missing file); the texture stays at its last content. */
  readonly failed: boolean;
}

export interface StillHandle extends TextureHandle {
  readonly kind: "still";
  /** Start loading (idempotent). The manager calls it when the still's segment is near. */
  load(): void;
}

export interface LoopHandle extends TextureHandle {
  readonly kind: "loop";
  readonly video: HTMLVideoElement;
  /** Play and upload frames while near; pause otherwise. */
  setNear(near: boolean): void;
}

export interface FramesHandle extends TextureHandle {
  readonly kind: "frames";
  /** Frame count (from manifest.json once read; docs/PAINTINGS.md's count before). */
  readonly count: number;
  /** Frames decoded right now. */
  readonly decodedCount: number;
  /** Index of the frame in the texture, -1 before any upload. */
  readonly current: number;
  /** Decode around this frame in both directions. */
  aim(frame: number): void;
  /** Upload and return the nearest decoded frame to `frame` (or keep the current one). */
  near(frame: number): number;
  /** Drop decoded frames (the texture keeps its last frame). */
  release(): void;
}

// ---------------------------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------------------------

const WORKER_SOURCE = `
self.onmessage = async (e) => {
  const { id, url } = e.data;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    self.postMessage({ id, bmp }, [bmp]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
`;

interface Job {
  id: number;
  url: string;
  resolve: (src: DecodedSource) => void;
  reject: (err: Error) => void;
}

/** Decodes images off the main thread with a few workers; falls back to <img> decoding. */
export class DecodePool {
  private readonly workers: { worker: Worker; busy: boolean }[] = [];
  private readonly queue: Job[] = [];
  private readonly pending = new Map<number, Job>();
  private nextId = 1;
  private url: string | null = null;
  readonly supported: boolean;

  constructor(size = POOL_SIZE) {
    let ok = typeof Worker !== "undefined" && typeof createImageBitmap === "function";
    if (ok) {
      try {
        this.url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "application/javascript" }));
        for (let i = 0; i < size; i++) {
          const worker = new Worker(this.url);
          const slot = { worker, busy: false };
          worker.onmessage = (e: MessageEvent<{ id: number; bmp?: ImageBitmap; error?: string }>) => {
            const job = this.pending.get(e.data.id);
            this.pending.delete(e.data.id);
            slot.busy = false;
            if (job) {
              if (e.data.bmp) job.resolve(e.data.bmp);
              else job.reject(new Error(e.data.error ?? "decode failed"));
            }
            this.pump();
          };
          worker.onerror = () => {
            slot.busy = false;
            this.pump();
          };
          this.workers.push(slot);
        }
      } catch {
        ok = false;
        this.workers.length = 0;
      }
    }
    this.supported = ok && this.workers.length > 0;
  }

  decode(url: string): Promise<DecodedSource> {
    if (!this.supported) return decodeWithImage(url);
    // The workers run from a blob: URL, where a root-relative path cannot be resolved.
    const absolute = new URL(url, window.location.href).href;
    return new Promise<DecodedSource>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, url: absolute, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.busy = true;
      this.pending.set(job.id, job);
      slot.worker.postMessage({ id: job.id, url: job.url });
    }
  }

  destroy(): void {
    for (const slot of this.workers) slot.worker.terminate();
    this.workers.length = 0;
    for (const job of this.queue) job.reject(new Error("pool destroyed"));
    this.queue.length = 0;
    for (const job of this.pending.values()) job.reject(new Error("pool destroyed"));
    this.pending.clear();
    if (this.url) URL.revokeObjectURL(this.url);
  }
}

function decodeWithImage(url: string): Promise<DecodedSource> {
  return new Promise<DecodedSource>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

function closeSource(src: DecodedSource): void {
  if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) src.close();
}

// ---------------------------------------------------------------------------------------------
// GL helpers
// ---------------------------------------------------------------------------------------------

const PLACEHOLDER_PIXEL = new Uint8Array([31, 78, 156, 255]); // --sky

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("[stage] could not create a texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, PLACEHOLDER_PIXEL);
  return texture;
}

type Uploadable = DecodedSource | HTMLVideoElement;

function sourceSize(src: Uploadable): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

// ---------------------------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------------------------

interface Shared {
  gl: WebGLRenderingContext;
  tier: Tier;
  pool: DecodePool;
  /** Count one texture upload (for the HUD's uploads per second). */
  countUpload(): void;
}

abstract class BaseHandle implements TextureHandle {
  abstract readonly kind: TextureKind;
  readonly texture: WebGLTexture;
  size: [number, number];
  ready = false;
  failed = false;
  protected destroyed = false;

  constructor(
    protected readonly shared: Shared,
    readonly id: ArtId,
    readonly key: string,
    aspect: number,
  ) {
    this.texture = createTexture(shared.gl);
    this.size = [Math.round(aspect * 1080), 1080];
  }

  protected upload(src: Uploadable): void {
    const { gl } = this.shared;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const [w, h] = sourceSize(src);
    if (w > 0 && h > 0) this.size = [w, h];
    this.ready = true;
    this.shared.countUpload();
  }

  destroy(): void {
    this.destroyed = true;
    this.shared.gl.deleteTexture(this.texture);
  }
}

class StillTexture extends BaseHandle implements StillHandle {
  readonly kind = "still" as const;
  private loading = false;

  constructor(
    shared: Shared,
    entry: StillArt,
    private readonly tiers: StillTiers,
    key: string,
  ) {
    super(shared, entry.id, key, entry.aspect);
  }

  load(): void {
    if (this.loading || this.ready || this.failed) return;
    this.loading = true;
    const url = this.tiers[this.shared.tier];
    this.shared.pool.decode(url).then(
      (src) => {
        if (this.destroyed) {
          closeSource(src);
          return;
        }
        this.upload(src);
        closeSource(src);
      },
      () => {
        this.failed = true;
        console.warn(`[stage] still missing: ${url}`);
      },
    );
  }
}

class LoopTexture extends BaseHandle implements LoopHandle {
  readonly kind = "loop" as const;
  readonly video: HTMLVideoElement;
  private isNear = false;
  private freshFrame = false;
  private readonly usesFrameCallback: boolean;
  private lastTime = -1;

  constructor(shared: Shared, entry: LoopArt, element: HTMLVideoElement | undefined, key: string) {
    super(shared, entry.id, key, entry.aspect);
    const video = element ?? document.createElement("video");
    this.video = video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    if (!element) video.preload = "metadata";
    if (video.getAttribute("poster") !== entry.poster) video.poster = entry.poster;
    if (video.getAttribute("src") !== entry.src) video.src = entry.src;
    video.addEventListener("loadedmetadata", () => {
      if (video.videoWidth > 0) this.size = [video.videoWidth, video.videoHeight];
    });
    video.addEventListener("error", () => {
      this.failed = true;
      console.warn(`[stage] loop missing: ${entry.src}`);
    });

    this.usesFrameCallback = typeof video.requestVideoFrameCallback === "function";
    if (this.usesFrameCallback) {
      const onFrame = () => {
        if (this.destroyed) return;
        this.freshFrame = true;
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
  }

  setNear(near: boolean): void {
    if (near === this.isNear) return;
    this.isNear = near;
    if (near) {
      if (this.video.preload !== "auto") this.video.preload = "auto";
      const playing = this.video.play();
      if (playing) playing.catch(() => undefined);
    } else {
      this.video.pause();
    }
  }

  /** Upload the current video frame when a new one has arrived and the loop is near. */
  tick(): void {
    if (!this.isNear || this.video.readyState < 2) return;
    const fresh = this.usesFrameCallback ? this.freshFrame : this.video.currentTime !== this.lastTime;
    if (!fresh) return;
    this.freshFrame = false;
    this.lastTime = this.video.currentTime;
    this.upload(this.video);
  }

  destroy(): void {
    super.destroy();
    this.video.pause();
  }
}

class FramesTexture extends BaseHandle implements FramesHandle {
  readonly kind = "frames" as const;
  count: number;
  current = -1;
  private readonly decoded = new Map<number, DecodedSource>();
  private readonly inflight = new Set<number>();
  private readonly failedFrames = new Set<number>();
  private wanted: number[] = [];
  private aimFrame = 0;
  private released = true;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  /** Requests wait for manifest.json so no frame beyond the real count is ever fetched. */
  private countKnown = false;

  constructor(
    shared: Shared,
    private readonly entry: FramesArt,
    key: string,
  ) {
    super(shared, entry.id, key, entry.aspect);
    this.count = entry.expectedCount;
    loadFrameCount(entry, shared.tier).then((n) => {
      if (this.destroyed) return;
      this.count = n;
      this.countKnown = true;
      this.aimFrame = this.clampIndex(this.aimFrame);
      if (!this.released) this.schedule();
    });
  }

  get decodedCount(): number {
    return this.decoded.size;
  }

  private clampIndex(frame: number): number {
    const i = Math.round(frame);
    return i < 0 ? 0 : i >= this.count ? this.count - 1 : i;
  }

  aim(frame: number): void {
    this.cancelRelease();
    const f = this.clampIndex(frame);
    if (this.released || f !== this.aimFrame) {
      this.aimFrame = f;
      this.released = false;
      this.schedule();
    } else {
      this.fill();
    }
  }

  near(frame: number): number {
    const f = this.clampIndex(frame);
    let best = -1;
    if (this.decoded.has(f)) {
      best = f;
    } else {
      for (let k = 1; k < this.count; k++) {
        if (this.decoded.has(f - k)) {
          best = f - k;
          break;
        }
        if (this.decoded.has(f + k)) {
          best = f + k;
          break;
        }
      }
    }
    if (best < 0) return this.current;
    if (best !== this.current) {
      const src = this.decoded.get(best);
      if (src) {
        this.upload(src);
        this.current = best;
      }
    }
    return this.current;
  }

  /** Called by the manager when the sequence is no longer near; frames are dropped after a grace. */
  scheduleRelease(): void {
    if (this.released || this.releaseTimer) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.release();
    }, RELEASE_GRACE_MS);
  }

  private cancelRelease(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  release(): void {
    this.cancelRelease();
    for (const src of this.decoded.values()) closeSource(src);
    this.decoded.clear();
    this.failedFrames.clear();
    this.wanted = [];
    this.released = true;
  }

  /** Recompute the wanted list around the aim: aim, aim+1, aim-1, aim+2, aim-2 ... */
  private schedule(): void {
    const list: number[] = [this.aimFrame];
    for (let k = 1; k <= DECODE_WINDOW; k++) {
      if (this.aimFrame + k < this.count) list.push(this.aimFrame + k);
      if (this.aimFrame - k >= 0) list.push(this.aimFrame - k);
    }
    this.wanted = list;
    this.evict();
    this.fill();
  }

  private wantsNow(frame: number): boolean {
    return !this.released && Math.abs(frame - this.aimFrame) <= DECODE_WINDOW;
  }

  private fill(): void {
    if (this.released || !this.countKnown) return;
    while (this.inflight.size < INFLIGHT_PER_SEQUENCE) {
      const next = this.wanted.find(
        (i) => !this.decoded.has(i) && !this.inflight.has(i) && !this.failedFrames.has(i),
      );
      if (next === undefined) return;
      this.request(next);
    }
  }

  private request(frame: number): void {
    this.inflight.add(frame);
    const url = framePath(this.entry, this.shared.tier, frame);
    this.shared.pool.decode(url).then(
      (src) => {
        this.inflight.delete(frame);
        if (this.destroyed || !this.wantsNow(frame) || this.decoded.has(frame)) {
          closeSource(src);
          this.fill();
          return;
        }
        this.decoded.set(frame, src);
        this.evict();
        this.fill();
      },
      () => {
        this.inflight.delete(frame);
        this.failedFrames.add(frame);
        if (this.failedFrames.size === 1) console.warn(`[stage] frame missing: ${url}`);
        this.fill();
      },
    );
  }

  /** Keep at most MAX_DECODED frames, dropping the ones farthest from the aim. */
  private evict(): void {
    while (this.decoded.size > MAX_DECODED) {
      let worst = -1;
      let worstDist = -1;
      for (const i of this.decoded.keys()) {
        const d = Math.abs(i - this.aimFrame);
        if (d > worstDist) {
          worstDist = d;
          worst = i;
        }
      }
      if (worst < 0) return;
      const src = this.decoded.get(worst);
      if (src) closeSource(src);
      this.decoded.delete(worst);
    }
  }

  destroy(): void {
    this.release();
    super.destroy();
  }
}

// ---------------------------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------------------------

export interface TextureManagerOptions {
  tier: Tier;
  /** The hero <video> from the stage markup, used for the `hero` loop. */
  heroVideo?: HTMLVideoElement | null;
  pool?: DecodePool;
}

export class TextureManager {
  readonly tier: Tier;
  readonly pool: DecodePool;
  /** Total texImage2D uploads so far (the HUD derives uploads per second). */
  uploads = 0;
  private readonly ownsPool: boolean;
  private readonly handles = new Map<string, StillTexture | LoopTexture | FramesTexture>();
  private readonly shared: Shared;

  constructor(
    private readonly gl: WebGLRenderingContext,
    private readonly options: TextureManagerOptions,
  ) {
    this.tier = options.tier;
    this.ownsPool = !options.pool;
    this.pool = options.pool ?? new DecodePool();
    this.shared = {
      gl,
      tier: this.tier,
      pool: this.pool,
      countUpload: () => {
        this.uploads++;
      },
    };
  }

  /** A still (or the `last` keyframe variant of `share`). Loading starts when its segment is near. */
  still(id: ArtId, variant?: "last"): StillHandle {
    const key = variant ? `still:${id}:${variant}` : `still:${id}`;
    const existing = this.handles.get(key);
    if (existing) return existing as StillHandle;
    const entry = art[id];
    const tiers =
      variant === "last" && "last" in entry && entry.last
        ? entry.last
        : entry.kind === "still"
          ? entry.tiers
          : null;
    if (!tiers) throw new Error(`[stage] ${id} is not a still${variant ? ` with a ${variant} keyframe` : ""}`);
    const handle = new StillTexture(this.shared, entry as StillArt, tiers, key);
    this.handles.set(key, handle);
    return handle;
  }

  /** A video loop. The hero uses the element from the stage markup; others get their own. */
  loop(id: ArtId, element?: HTMLVideoElement | null): LoopHandle {
    const key = `loop:${id}`;
    const existing = this.handles.get(key);
    if (existing) return existing as LoopHandle;
    const entry = art[id];
    if (entry.kind !== "loop") throw new Error(`[stage] ${id} is not a loop`);
    const el = element ?? (id === "hero" ? this.options.heroVideo : null) ?? undefined;
    const handle = new LoopTexture(this.shared, entry, el, key);
    this.handles.set(key, handle);
    return handle;
  }

  /** A frame sequence scrubbed with aim()/near(). */
  frames(id: ArtId): FramesHandle {
    const key = `frames:${id}`;
    const existing = this.handles.get(key);
    if (existing) return existing as FramesHandle;
    const entry = art[id];
    if (entry.kind !== "frames") throw new Error(`[stage] ${id} is not a frame sequence`);
    const handle = new FramesTexture(this.shared, entry, key);
    this.handles.set(key, handle);
    return handle;
  }

  /**
   * Tell the manager which assets are near the current `p` (the pass manager computes this from
   * the script): near stills load, near loops play, far loops pause, far sequences release.
   */
  setNear(near: ReadonlySet<string>): void {
    for (const handle of this.handles.values()) {
      const isNear = near.has(handle.key);
      if (handle instanceof LoopTexture) handle.setNear(isNear);
      else if (handle instanceof StillTexture) {
        if (isNear) handle.load();
      } else if (handle instanceof FramesTexture) {
        if (!isNear) handle.scheduleRelease();
      }
    }
  }

  /** Per frame: upload new video frames for near loops. */
  tick(): void {
    for (const handle of this.handles.values()) {
      if (handle instanceof LoopTexture) handle.tick();
    }
  }

  /** Decoded frame totals across sequences, for the HUD. */
  stats(): { textures: number; decoded: number; frames: number } {
    let decoded = 0;
    let frames = 0;
    for (const handle of this.handles.values()) {
      if (handle instanceof FramesTexture) {
        decoded += handle.decodedCount;
        frames += handle.count;
      }
    }
    return { textures: this.handles.size, decoded, frames };
  }

  destroy(): void {
    for (const handle of this.handles.values()) handle.destroy();
    this.handles.clear();
    if (this.ownsPool) this.pool.destroy();
    void this.gl;
  }
}
