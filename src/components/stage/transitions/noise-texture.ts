import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat } from "three";

import { bakeNoise, NOISE_SIZE } from "./media";

let texture: DataTexture | null = null;

/**
 * The transitions' baked noise (`bakeNoise`): one small tileable texture, made the first time a medium
 * needs it and shared by all of them for the life of the page (never disposed: it is tiny).
 */
export function noiseTexture(): DataTexture {
  if (texture) return texture;
  const t = new DataTexture(bakeNoise(NOISE_SIZE), NOISE_SIZE, NOISE_SIZE, RGBAFormat);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  texture = t;
  return t;
}
