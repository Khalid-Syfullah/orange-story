// The wordmark's offscreen canvas: "Orange" in the display face at 600, one letter at a time, each
// letter filled with its own index in the red channel (alpha is the glyph), so the shader can print
// the letters in one after another with the halftone print-in on the glyph alpha. The canvas is
// redrawn when the frame's size changes, the device pixel ratio changes or the font arrives.
import { finale } from "@/content/copy";
import { FINALE_TUNE, WORD_LETTERS, wordmarkLayout } from "./timeline";

const WEIGHT = 600;

export interface Wordmark {
  canvas: HTMLCanvasElement;
  /** Box in CSS px, y down: left, top, width, height. */
  box: readonly [number, number, number, number];
  /** Changes whenever the canvas was redrawn. */
  version: number;
}

let canvas: HTMLCanvasElement | null = null;
let key = "";
let version = 0;
let box: [number, number, number, number] = [0, 0, 1, 1];
let fontsReady = false;
let fontsAsked = "";
/** The canvas was last drawn with the display face loaded (not the fallback). */
let drawnWithFont = false;

/** The wordmark on the canvas is the final one, in its own face (PassDef.settled, for the e2e hook). */
export function wordmarkSettled(): boolean {
  return drawnWithFont;
}

function family(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  return v ? `${v}, Georgia, serif` : "Georgia, serif";
}

/** The wordmark for this frame size and dpr, redrawn only when something changed. */
export function wordmark(css: readonly [number, number], dpr: number): Wordmark {
  if (!canvas) canvas = document.createElement("canvas");
  const lay = wordmarkLayout(css);
  const fam = family();
  const px = Math.round(lay.fontPx);
  const ask = `${WEIGHT} ${px}px ${fam}`;
  if (fontsAsked !== ask && typeof document.fonts !== "undefined") {
    fontsAsked = ask;
    fontsReady = false;
    document.fonts
      .load(ask, finale.wordmark)
      .catch(() => undefined)
      .then(() => {
        fontsReady = true;
      });
  }
  const k = `${css[0]}x${css[1]}@${dpr}:${fontsReady ? 1 : 0}`;
  if (k !== key) {
    key = k;
    version++;
    drawnWithFont = fontsReady;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = ask;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const tracking = FINALE_TUNE.tracking * lay.fontPx;
      const cx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
      cx.letterSpacing = `${tracking}px`;
      const full = ctx.measureText(finale.wordmark).width;
      const pad = lay.fontPx * 0.12;
      const w = Math.ceil(full + pad * 2);
      const h = Math.ceil(lay.height);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = ask;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      cx.letterSpacing = `${tracking}px`;
      const n = WORD_LETTERS.length;
      for (let i = 0; i < n; i++) {
        const x = pad + ctx.measureText(finale.wordmark.slice(0, i)).width;
        ctx.fillStyle = `rgb(${Math.round(((i + 0.5) / n) * 255)} 255 255)`;
        ctx.fillText(WORD_LETTERS[i], x, h / 2 + lay.fontPx * 0.04);
      }
      box = [(css[0] - w) / 2, lay.centreY - h / 2, w, h];
    }
  }
  return { canvas, box, version };
}
