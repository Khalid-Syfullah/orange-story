"use client";

import * as React from "react";
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  type WebGLRenderer,
} from "three";

import type { PlateEntry } from "@/art/manifest";

import { TEXTURE_CAP, TEXTURE_RELEASE_MS, textureCap } from "./quality";

/**
 * Plate textures: loaded once per file, scaled down to the device's texture cap, uploaded with
 * premultiplied alpha (so blur and mipmaps never darken the edges) and mipmaps (so depth-of-field
 * blur stays cheap). Plates hold a reference while mounted; a texture nobody holds leaves the GPU
 * a few seconds later and is loaded again (from the browser cache) when a scene needs it back.
 *
 * `preloadTextures` loads and uploads ahead of time, so a scene arriving on stage never stalls.
 * A file that fails to load becomes a transparent pixel (with a console warning), so a missing
 * painting never breaks the story.
 */

interface Slot {
  promise: Promise<Texture>;
  texture: Texture | null;
  refs: number;
  timer: number;
}

const slots = new Map<string, Slot>();
let cap: number | null = null;

/** The texture cap: decided on first use (WebGL2 guarantees at least the cap), refined by the renderer. */
const currentCap = () => (cap ??= textureCap(TEXTURE_CAP));

/** Sets the texture cap from the renderer's limits. */
export function configureTextures(gl: WebGLRenderer): void {
  cap = textureCap(gl.capabilities.maxTextureSize);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image.decode().then(() => image);
}

/** The image itself, or a copy scaled down so its longest side fits the cap. */
function fitToCap(image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const limit = currentCap();
  if (longest <= limit) return image;
  const scale = limit / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function configure(texture: Texture, entry: PlateEntry): Texture {
  texture.name = entry.id;
  texture.colorSpace = entry.linear ? NoColorSpace : SRGBColorSpace;
  texture.premultiplyAlpha = !entry.linear;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = entry.tile ? RepeatWrapping : ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** One transparent pixel, standing in for a file that could not be loaded. */
function missingTexture(): Texture {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function slotFor(entry: PlateEntry): Slot {
  const existing = slots.get(entry.src);
  if (existing) return existing;
  const slot = { texture: null, refs: 0, timer: 0 } as Omit<Slot, "promise"> as Slot;
  slot.promise = loadImage(entry.src).then(
    (image) => (slot.texture = configure(new Texture(fitToCap(image)), entry)),
    (error: unknown) => {
      console.warn(`[art] Could not load ${entry.src}; drawing nothing in its place.`, error);
      return (slot.texture = missingTexture());
    },
  );
  slots.set(entry.src, slot);
  return slot;
}

/** Loads a plate's texture (once per file). Never rejects. */
export function loadTexture(entry: PlateEntry): Promise<Texture> {
  return slotFor(entry).promise;
}

function scheduleRelease(src: string, slot: Slot, delay = TEXTURE_RELEASE_MS) {
  window.clearTimeout(slot.timer);
  slot.timer = window.setTimeout(() => {
    if (slot.refs > 0 || slots.get(src) !== slot) return;
    slot.texture?.dispose();
    slots.delete(src);
  }, delay);
}

function retain(entry: PlateEntry) {
  const slot = slotFor(entry);
  slot.refs++;
  window.clearTimeout(slot.timer);
}

function release(entry: PlateEntry) {
  const slot = slots.get(entry.src);
  if (!slot) return;
  slot.refs = Math.max(0, slot.refs - 1);
  if (slot.refs === 0) scheduleRelease(entry.src, slot);
}

/**
 * The texture of a plate, holding it while the component is mounted. Suspends until loaded, so a
 * scene inside one Suspense boundary appears all at once.
 */
export function usePlateTexture(entry: PlateEntry): Texture {
  const texture = React.use(loadTexture(entry));
  React.useEffect(() => {
    retain(entry);
    return () => release(entry);
  }, [entry]);
  return texture;
}

/** Like `usePlateTexture`, for an optional plate (returns null without suspending when absent). */
export function useOptionalPlateTexture(entry: PlateEntry | null): Texture | null {
  const promise = entry ? loadTexture(entry) : null;
  const texture = promise ? React.use(promise) : null;
  React.useEffect(() => {
    if (!entry) return;
    retain(entry);
    return () => release(entry);
  }, [entry]);
  return texture;
}

/**
 * The texture of a plate without suspending: null until it has loaded, and while `entry` is null.
 * Holds the texture while `entry` is set, so a caller can ask for art only when it is about to need
 * it (the transition canvas, before a transition that reads the ring mask or the cloud).
 */
export function useLazyPlateTexture(entry: PlateEntry | null): Texture | null {
  const [loaded, setLoaded] = React.useState<{ src: string; texture: Texture } | null>(null);
  React.useEffect(() => {
    if (!entry) return;
    let alive = true;
    retain(entry);
    void loadTexture(entry).then((texture) => {
      if (alive) setLoaded({ src: entry.src, texture });
    });
    return () => {
      alive = false;
      release(entry);
    };
  }, [entry]);
  return entry && loaded?.src === entry.src ? loaded.texture : null;
}

/**
 * Loads and uploads the given plates ahead of time. Textures nobody mounts within a while are
 * released again.
 */
export function preloadTextures(entries: readonly PlateEntry[], gl: WebGLRenderer): void {
  for (const entry of entries) {
    const slot = slotFor(entry);
    void slot.promise.then((texture) => {
      if (slots.get(entry.src) !== slot) return;
      gl.initTexture(texture);
      if (slot.refs === 0) scheduleRelease(entry.src, slot, TEXTURE_RELEASE_MS * 4);
    });
  }
}
