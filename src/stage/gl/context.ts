// WebGL 1 context creation and canvas sizing.
//
//   - alpha false (the canvas is opaque, the page never shows through), antialias false (the
//     full-screen triangle has no edges to smooth), high-performance.
//   - OES_standard_derivatives when the driver has it; shaders see HAS_DERIVATIVES.
//   - `?nogl` in the URL skips the context and hides the canvas, so the DOM layers can be checked
//     on their own; a failed context does the same.
//   - devicePixelRatio is capped at 2 and the drawing buffer at 3.4 Mpx in total.

export const MAX_DPR = 2;
export const MAX_PIXELS = 3.4e6;

export interface GLContext {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  /** OES_standard_derivatives is available (dFdx, dFdy, fwidth). */
  derivatives: boolean;
  /** Set while the context is lost; drawing is skipped until it is restored. */
  lost: boolean;
}

export interface CanvasFit {
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  /** The ratio actually used after the caps. */
  dpr: number;
}

/** True when the URL asks for no WebGL (`?nogl`). */
export function wantsNoGL(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("nogl");
}

/** Create the context, or null when WebGL is unavailable or switched off. */
export function createContext(canvas: HTMLCanvasElement): GLContext | null {
  if (wantsNoGL()) return null;
  const attrs: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  };
  let gl: WebGLRenderingContext | null = null;
  try {
    gl =
      (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl", attrs) as WebGLRenderingContext | null);
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const derivatives = gl.getExtension("OES_standard_derivatives") !== null;

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  return { gl, canvas, derivatives, lost: false };
}

/**
 * Size the drawing buffer for a CSS size: dpr capped at MAX_DPR, then scaled down so the buffer
 * never exceeds MAX_PIXELS (1440x900 at dpr 2 would be 5.2 Mpx; it draws at about dpr 1.62).
 */
export function fitCanvas(ctx: GLContext, cssWidth: number, cssHeight: number): CanvasFit {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const pixels = w * h * dpr * dpr;
  if (pixels > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / pixels);
  const width = Math.max(1, Math.round(w * dpr));
  const height = Math.max(1, Math.round(h * dpr));
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  ctx.gl.viewport(0, 0, width, height);
  return { width, height, dpr };
}
