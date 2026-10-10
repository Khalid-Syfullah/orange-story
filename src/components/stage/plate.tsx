"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isMotionValue, type MotionValue } from "motion/react";
import { PlaneGeometry, Vector3, type Color, type Group, type Mesh, type PerspectiveCamera, type ShaderMaterial } from "three";

import { plateEntry, plateWorldSize, type Pair, type PlateEntry, type PlateId } from "@/art/manifest";

import { phaseOf, swayAngle, useIdleClock, type SwayOptions } from "./idle";
import { PlateMaterial } from "./materials";
import { DEPTH_OF_FIELD, MIN_BLUR_PX } from "./quality";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "./stage-context";
import { usePlateTexture } from "./textures";

/**
 * A painted plate: a flat image with alpha standing in the world at its manifest place (anchor
 * point at `position`, z = -depth), drawn in painter's order inside its scene.
 *
 * Everything that moves can be a number or a MotionValue (read every frame, never through React
 * state): offsets, scale, rotation, opacity, tint amount, blur and texture offset. Opacity is
 * multiplied by the scene's presence, so plates crossfade with their scene. Depth of field adds blur
 * by distance from the camera's focus. Sway (leaves, fruit) rotates the plate about its anchor on
 * idle time, paused offscreen and with reduced motion. Backdrops follow the camera and fill the view.
 *
 * Children are attached at the anchor and move, scale and sway with the plate.
 */

export type Num = number | MotionValue<number>;

/** The value of a number or MotionValue right now. */
export const read = (value: Num | undefined, fallback: number): number => (value === undefined ? fallback : typeof value === "number" ? value : value.get());

/** Where the plate stands. Each field overrides the manifest's. */
export interface PlatePlacement {
  /** World x and y of the anchor. */
  position?: Pair;
  /** Distance behind the picture plane (z = -depth). */
  depth?: number;
  /** Height in world units. */
  height?: number;
  /** Image point placed at `position`, fractions from the left and from the top. */
  anchor?: Pair;
  /** Euler rotation in degrees (x, y, z). */
  rotation?: readonly [number, number, number];
}

/** How the plate moves and looks, frame by frame. */
export interface PlateMotion {
  /** World offsets added to the placement. */
  x?: Num;
  y?: Num;
  z?: Num;
  /** Uniform scale about the anchor, then per axis. */
  scale?: Num;
  scaleX?: Num;
  scaleY?: Num;
  /** Rotation in the plate's own plane about the anchor, in radians. */
  rotate?: Num;
  /** 0 to 1, multiplied by the scene's presence. */
  opacity?: Num;
  /** Extra blur as a fraction of the view height (0.01 is about 10px on a 1000px screen). */
  blur?: Num;
  /** Depth-of-field blur by distance from the camera focus. Default: on for plates, off for backdrops. */
  focus?: boolean;
  /** Idle sway about the anchor. Default: the manifest's `sway` (degrees), if any. */
  sway?: boolean | SwayOptions;
  /** Mirror about the anchor. */
  flipX?: boolean;
  flipY?: boolean;
  /** Stacking inside the scene for plates at the same depth. Default: the manifest's, or 0. */
  layer?: number;
  visible?: boolean;
  /** Tiles across and down (tileable plates). Default: the manifest's `repeat`. */
  uvRepeat?: Pair;
  /** Texture offset in tiles, e.g. to scroll a tileable shaft. */
  uvOffset?: readonly [Num, Num];
  /** Fill the view behind the scene and follow the camera. Default: the manifest's role. */
  backdrop?: boolean;
  name?: string;
}

export interface PlateProps extends PlatePlacement, PlateMotion {
  id: PlateId;
  /** Color the plate is tinted toward (for example white for a glow, ink for a silhouette). */
  tint?: string;
  /** How far toward `tint`, 0 to 1. Default 1 when a tint is given. */
  tintAmount?: Num;
  children?: React.ReactNode;
}

/** The unit quad every plate scales (shared, never disposed). */
export const UNIT_PLANE = new PlaneGeometry(1, 1);

const DEG = Math.PI / 180;
/** Backdrops sit this far in front of the camera, behind every plate. */
const BACKDROP_DISTANCE = 150;
const NO_REPEAT: Pair = [1, 1];

const tmpPosition = new Vector3();
const tmpDirection = new Vector3();

/** Re-renders the on-demand canvas when a MotionValue prop changes outside of scroll. */
export function useInvalidateOnChange(values: readonly (Num | undefined)[]) {
  const invalidate = useThree((s) => s.invalidate);
  React.useEffect(() => {
    const unsubscribe = values.filter(isMotionValue).map((value) => (value as MotionValue<number>).on("change", () => invalidate()));
    return () => unsubscribe.forEach((off) => off());
  });
}

function resolveSway(sway: PlateMotion["sway"], entry: PlateEntry, name: string): SwayOptions | null {
  if (sway === false) return null;
  if (sway === undefined && !entry.sway) return null;
  const options = typeof sway === "object" ? sway : {};
  return { amplitude: entry.sway ?? 1.5, phase: phaseOf(name), ...options };
}

/** Render order of a plate-like mesh: backdrops first, then the plate's layer, inside its scene. */
export function usePlateRenderOrder(entry: PlateEntry, props: Pick<PlateMotion, "layer" | "backdrop">): number {
  const layer = useSceneLayer();
  const backdrop = props.backdrop ?? entry.role === "backdrop";
  return plateRenderOrder(layer, (backdrop ? -500 : 0) + (props.layer ?? entry.layer ?? 0));
}

/**
 * The frame loop shared by every plate-like mesh: placement, presence, sway, depth of field and the
 * common uniforms of its material (`opacity`, `uvTransform`, `blurRadius`, `blurBias`). `extra`
 * runs after, with the material and the current progress, for material-specific uniforms.
 */
export function usePlateFrame(
  entry: PlateEntry,
  props: PlatePlacement & PlateMotion,
  groupRef: React.RefObject<Group | null>,
  meshRef: React.RefObject<Mesh | null>,
  extra?: (material: ShaderMaterial, p: number) => void,
): void {
  const layer = useSceneLayer();
  const progress = useStageProgress();
  const clock = useIdleClock();
  const key = React.useMemo(() => ({}), []);
  const backdrop = props.backdrop ?? entry.role === "backdrop";
  const sway = resolveSway(props.sway, entry, props.name ?? entry.id);

  useInvalidateOnChange([props.x, props.y, props.z, props.scale, props.scaleX, props.scaleY, props.rotate, props.opacity, props.blur, props.uvOffset?.[0], props.uvOffset?.[1]]);
  React.useEffect(() => () => clock.drop(key), [clock, key]);

  useFrame((state) => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m) return;
    const p = progress?.get() ?? 0;
    const opacity = read(props.opacity, 1) * (layer ? layer.presence(p) : 1);
    const shown = props.visible !== false && opacity > 0.001;
    g.visible = shown;
    if (!shown) {
      clock.drop(key);
      return;
    }

    const camera = state.camera as PerspectiveCamera;
    const material = m.material as ShaderMaterial;
    const u = material.uniforms;
    const repeat = props.uvRepeat ?? entry.repeat ?? NO_REPEAT;
    const [w, h] = plateWorldSize(entry, props.height ?? entry.height, repeat);

    if (backdrop) {
      camera.getWorldDirection(tmpDirection);
      g.position.copy(camera.position).addScaledVector(tmpDirection, BACKDROP_DISTANCE);
      g.quaternion.copy(camera.quaternion);
      g.scale.set(1, 1, 1);
      const viewHeight = 2 * BACKDROP_DISTANCE * Math.tan((camera.fov * DEG) / 2) * 1.02;
      m.position.set(0, 0, 0);
      m.scale.set(viewHeight * camera.aspect, viewHeight, 1);
    } else {
      const [px, py] = props.position ?? entry.position;
      const [ax, ay] = props.anchor ?? entry.anchor;
      const [rx, ry, rz] = props.rotation ?? entry.rotation ?? [0, 0, 0];
      let angle = 0;
      if (sway && clock.inView(m)) clock.hold(key);
      else clock.drop(key);
      if (sway) angle = swayAngle(clock.time(), sway);
      g.position.set(px + read(props.x, 0), py + read(props.y, 0), -(props.depth ?? entry.depth) + read(props.z, 0));
      g.rotation.set(rx * DEG, ry * DEG, rz * DEG + read(props.rotate, 0) + angle);
      const s = read(props.scale, 1);
      g.scale.set(s * read(props.scaleX, 1) * (props.flipX ? -1 : 1), s * read(props.scaleY, 1) * (props.flipY ? -1 : 1), 1);
      m.position.set((0.5 - ax) * w, (ay - 0.5) * h, 0);
      m.scale.set(w, h, 1);
    }

    // Depth of field: blur by distance from the focus, converted to texture units of this plate.
    let blur = read(props.blur, 0);
    g.getWorldPosition(tmpPosition);
    camera.getWorldDirection(tmpDirection);
    const distance = tmpPosition.sub(camera.position).dot(tmpDirection);
    const focus = camera.userData.focus as number | undefined;
    if ((props.focus ?? !backdrop) && focus && distance > camera.near) blur += Math.min(DEPTH_OF_FIELD.max, (DEPTH_OF_FIELD.aperture * Math.abs(distance - focus)) / distance);
    const blurPx = blur * state.size.height * state.viewport.dpr;
    if (blurPx >= MIN_BLUR_PX && distance > camera.near) {
      const viewHeight = 2 * distance * Math.tan((camera.fov * DEG) / 2);
      const worldW = Math.abs(m.scale.x * g.scale.x) || 1;
      const worldH = Math.abs(m.scale.y * g.scale.y) || 1;
      u.blurRadius.value.set(((blur * viewHeight) / worldW) * repeat[0], ((blur * viewHeight) / worldH) * repeat[1]);
      u.blurBias.value = Math.min(5, Math.log2(Math.max(1, blurPx / 3)));
    } else {
      u.blurRadius.value.set(0, 0);
      u.blurBias.value = 0;
    }

    u.opacity.value = opacity;
    u.uvTransform.value.set(repeat[0], repeat[1], read(props.uvOffset?.[0], 0), read(props.uvOffset?.[1], 0));
    extra?.(material, p);
  });
}

/** Sets a color uniform only when the color string changes (no parsing every frame). */
export function setColorUniform(material: ShaderMaterial, name: string, value: string | undefined, fallback = "#ffffff"): void {
  const next = value ?? fallback;
  const seen = (material.userData.colors ??= {}) as Record<string, string>;
  if (seen[name] === next) return;
  seen[name] = next;
  (material.uniforms[name].value as Color).set(next);
}

export function Plate({ id, tint, tintAmount, children, ...props }: PlateProps) {
  const entry = plateEntry(id);
  const texture = usePlateTexture(entry);
  const material = React.useMemo(() => new PlateMaterial(texture), [texture]);
  React.useEffect(() => () => material.dispose(), [material]);
  useInvalidateOnChange([tintAmount]);

  const group = React.useRef<Group>(null);
  const mesh = React.useRef<Mesh>(null);
  const renderOrder = usePlateRenderOrder(entry, props);
  usePlateFrame(entry, props, group, mesh, (m) => {
    setColorUniform(m, "tint", tint);
    m.uniforms.tintAmount.value = tint ? read(tintAmount, 1) : 0;
  });

  return (
    <group ref={group} name={props.name ?? entry.id}>
      <mesh ref={mesh} geometry={UNIT_PLANE} material={material} renderOrder={renderOrder} />
      {children}
    </group>
  );
}
