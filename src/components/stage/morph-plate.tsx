"use client";

import * as React from "react";
import type { Group, Mesh } from "three";

import { plateEntry, platePaint, type Pair, type PlateId } from "@/art/manifest";

import { defaultMorphMask, MorphMaterial } from "./materials";
import { configurePaint, read, setColorUniform, UNIT_PLANE, useInvalidateOnChange, usePlateFrame, usePlateRenderOrder, type Num, type PlateMotion, type PlatePlacement } from "./plate";
import { useSceneLayer } from "./stage-context";
import { useOptionalPlateTexture, usePlateTexture } from "./textures";

/**
 * A plate that turns from one texture into another through a mask with a moving, soft edge: the
 * minaret's stone becoming bark in the ascent, and any other "this becomes that". `progress` (0 to
 * 1, usually a MotionValue scrubbed by scroll) moves the edge across the mask: at 0 the plate shows
 * `from`, at 1 it shows `to`, and dark mask values turn first. Without a `mask` a built-in ramp with
 * soft noise turns the plate from the bottom up.
 *
 * Placement comes from `place` (another plate's manifest entry, e.g. the minaret it replaces) or
 * from `from`, with the same overrides and motion as `Plate`.
 */
export interface MorphPlateProps extends PlatePlacement, PlateMotion {
  from: PlateId;
  to: PlateId;
  mask?: PlateId;
  /** Whose manifest placement to use. Default: `from`. */
  place?: PlateId;
  /** 0 shows `from`, 1 shows `to`. */
  progress: Num;
  /** Width of the soft edge in mask units (0 to 1). Default 0.08. */
  softness?: number;
  /** A glow along the moving edge. */
  edgeColor?: string;
  edgeAmount?: Num;
  /** Mask tiling and offset (the mask spans the plate once by default). */
  maskRepeat?: Pair;
  maskOffset?: readonly [Num, Num];
  children?: React.ReactNode;
}

export function MorphPlate({ from, to, mask, place, progress, softness = 0.08, edgeColor, edgeAmount, maskRepeat, maskOffset, children, ...props }: MorphPlateProps) {
  const fromEntry = plateEntry(from);
  const toEntry = plateEntry(to);
  const maskEntry = mask ? plateEntry(mask) : null;
  const placeEntry = plateEntry(place ?? from);
  const mapA = usePlateTexture(fromEntry);
  const mapB = usePlateTexture(toEntry);
  const maskTexture = useOptionalPlateTexture(maskEntry) ?? defaultMorphMask();

  const scene = useSceneLayer()?.scene.id ?? null;
  const material = React.useMemo(() => {
    const m = new MorphMaterial(mapA, mapB, maskTexture);
    // The canvas of the plate it stands in for (the minaret's stone has the same grain as the hero's).
    configurePaint(m, placeEntry, platePaint(placeEntry), scene);
    return m;
  }, [mapA, mapB, maskTexture, placeEntry, scene]);
  React.useEffect(() => () => material.dispose(), [material]);
  useInvalidateOnChange([progress, edgeAmount, maskOffset?.[0], maskOffset?.[1]]);

  const group = React.useRef<Group>(null);
  const mesh = React.useRef<Mesh>(null);
  const renderOrder = usePlateRenderOrder(placeEntry, props);
  usePlateFrame(placeEntry, props, group, mesh, (m) => {
    const u = m.uniforms;
    setColorUniform(m, "edgeColor", edgeColor);
    u.softness.value = softness;
    u.progress.value = Math.min(1, Math.max(0, read(progress, 0)));
    u.edgeAmount.value = edgeColor ? read(edgeAmount, 0.6) : 0;
    const [rx, ry] = maskRepeat ?? [1, 1];
    u.maskTransform.value.set(rx, ry, read(maskOffset?.[0], 0), read(maskOffset?.[1], 0));
  });

  return (
    <group ref={group} name={props.name ?? `${from}->${to}`}>
      <mesh ref={mesh} geometry={UNIT_PLANE} material={material} renderOrder={renderOrder} />
      {children}
    </group>
  );
}
