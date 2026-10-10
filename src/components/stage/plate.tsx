"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isMotionValue, type MotionValue } from "motion/react";
import { PlaneGeometry, Vector2, Vector3, type Color, type Group, type Mesh, type PerspectiveCamera, type ShaderMaterial, type Vector4 } from "three";

import { plateEntry, plateWorldSize, type Pair, type PlateEntry, type PlateId } from "@/art/manifest";
import { revealCircle } from "@/components/transitions/choreography";
import { transitionOf } from "@/scroll/helpers";
import { colors } from "@/styles/tokens";
import type { TransitionId } from "@/scroll/types";

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
 * `reveal` cuts the plate to the circle of a sweeping transition: the rainbow ring shows the plates
 * of the new scene inside it (`side: "inside"`) and can hide the old ones there (`"outside"`).
 *
 * Children are attached at the anchor and move, scale and sway with the plate.
 */

export type Num = number | MotionValue<number>;

/** Cut a plate to the expanding circle of a transition (the rainbow ring), scrubbed by progress. */
export interface PlateReveal {
  transition: TransitionId;
  /** `inside` (default): shown inside the circle only, the new scene. `outside`: the old scene. */
  side?: "inside" | "outside";
}

/**
 * A soft rectangle of the stage, behind text, that the plate thins out of (the clouds parting around
 * the service cards) or, with `haze`, recedes into the sky inside (foliage and fruit fading back
 * behind a headline), so the text never sits on bright paint. Fractions of the stage, from its left
 * and its top; any of them may move.
 */
export interface PlateClearing {
  left: Num;
  right: Num;
  top: Num;
  bottom: Num;
  /** Width of the soft edge, as a fraction of the stage width. */
  soft: number;
  /** 0 (off) to 1 (the plate is gone, or fully hazed, inside the rectangle). */
  amount: Num;
  /** Recede toward this color instead of thinning out. */
  haze?: string;
}

/** The value of a number or MotionValue right now. */
export const read = (value: Num | undefined, fallback: number): number => (value === undefined ? fallback : typeof value === "number" ? value : value.get());

/** Where the plate stands. Each field overrides the manifest's. */
export interface PlatePlacement {
  /** World x and y of the anchor. */
  position?: Pair;
  /** Distance behind the picture plane (z = -depth). */
  depth?: number;
  /** Height in world units (a MotionValue lets a plate grow, like the rising minaret shaft). */
  height?: Num;
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
  /** Tiles across and down (tileable plates). Default: the manifest's `repeat`. Either may move. */
  uvRepeat?: readonly [Num, Num];
  /** Texture offset in tiles, e.g. to scroll a tileable shaft. */
  uvOffset?: readonly [Num, Num];
  /** Fill the view behind the scene and follow the camera. Default: the manifest's role. */
  backdrop?: boolean;
  /** Show only inside (or outside) a transition's expanding circle. */
  reveal?: PlateReveal;
  /** Thin out of a soft rectangle of the stage. */
  clearing?: PlateClearing;
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
const NO_ROTATION: readonly [number, number, number] = [0, 0, 0];
/** Resolved repeat and world size of the plate being updated (one pair each per module, overwritten every plate). */
const tmpRepeat: [number, number] = [1, 1];
const tmpSize: [number, number] = [1, 1];

const tmpPosition = new Vector3();
const tmpDirection = new Vector3();
const tmpBuffer = new Vector2();

/**
 * Sets a material's reveal circle for progress p (drawing-buffer pixels, as `gl_FragCoord`).
 * Returns false when the plate is entirely cut away.
 */
function applyReveal(material: ShaderMaterial, reveal: PlateReveal | undefined, p: number, gl: { getDrawingBufferSize(target: Vector2): Vector2 }, width: number, height: number): boolean {
  const u = material.uniforms;
  if (!u.revealSide) return true; // a material without the reveal uniforms
  if (!reveal) {
    u.revealSide.value = 0;
    return true;
  }
  const circle = revealCircle(transitionOf(reveal.transition), p, width, height);
  const inside = reveal.side !== "outside";
  const far = Math.max(Math.hypot(circle.x, circle.y), Math.hypot(width - circle.x, circle.y), Math.hypot(circle.x, height - circle.y), Math.hypot(width - circle.x, height - circle.y));
  if (inside && circle.radius + circle.softness <= 0) return false;
  if (!inside && circle.radius - circle.softness >= far) return false;
  gl.getDrawingBufferSize(tmpBuffer);
  const sx = tmpBuffer.x / Math.max(1, width);
  const sy = tmpBuffer.y / Math.max(1, height);
  u.revealSide.value = inside ? 1 : -1;
  (u.revealCircle.value as Vector4).set(circle.x * sx, tmpBuffer.y - circle.y * sy, circle.radius * sy, Math.max(1, circle.softness * sy));
  return true;
}

/** Sets a material's clearing for this frame (drawing-buffer pixels, as `gl_FragCoord`). */
function applyClearing(material: ShaderMaterial, clearing: PlateClearing | undefined, gl: { getDrawingBufferSize(target: Vector2): Vector2 }): void {
  const u = material.uniforms;
  if (!u.clearAmount) return; // a material without the clearing uniforms
  const amount = clearing ? read(clearing.amount, 0) : 0;
  u.clearAmount.value = amount;
  if (!clearing || amount <= 0) return;
  gl.getDrawingBufferSize(tmpBuffer);
  const { x: w, y: h } = tmpBuffer;
  (u.clearRect.value as Vector4).set(read(clearing.left, 0) * w, (1 - read(clearing.bottom, 1)) * h, read(clearing.right, 1) * w, (1 - read(clearing.top, 0)) * h);
  u.clearSoft.value = Math.max(1, clearing.soft * w);
  u.clearHaze.value = clearing.haze ? 1 : 0;
  if (clearing.haze) setColorUniform(material, "hazeColor", clearing.haze);
}

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

/**
 * Backdrops (the sky) draw before the plates of every scene, in scene order among themselves. Where
 * one scene crossfades into the next, the arriving scene's sky then fades in behind the leaving
 * scene's plates instead of over them: a figure that carries on across the boundary (the statue,
 * the astronomer) never dims or flickers, and plates of a new picture simply fade in on top.
 */
const BACKDROP_ORDER = -1_000_000;

/** Render order of a plate-like mesh: all backdrops first, then each scene's plates by layer, scene over scene. */
export function usePlateRenderOrder(entry: PlateEntry, props: Pick<PlateMotion, "layer" | "backdrop">): number {
  const layer = useSceneLayer();
  const backdrop = props.backdrop ?? entry.role === "backdrop";
  const order = plateRenderOrder(layer, props.layer ?? entry.layer ?? 0);
  return backdrop ? BACKDROP_ORDER + order : order;
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

  useInvalidateOnChange([props.x, props.y, props.z, props.scale, props.scaleX, props.scaleY, props.rotate, props.opacity, props.blur, props.height, props.uvRepeat?.[0], props.uvRepeat?.[1], props.uvOffset?.[0], props.uvOffset?.[1], props.clearing?.amount, props.clearing?.left, props.clearing?.right, props.clearing?.top, props.clearing?.bottom]);
  React.useEffect(() => () => clock.drop(key), [clock, key]);

  useFrame((state) => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m) return;
    const p = progress?.get() ?? 0;
    const material = m.material as ShaderMaterial;
    const opacity = read(props.opacity, 1) * (layer ? layer.presence(p) : 1);
    const shown = props.visible !== false && opacity > 0.001 && applyReveal(material, props.reveal, p, state.gl, state.size.width, state.size.height);
    g.visible = shown;
    if (!shown) {
      clock.drop(key);
      return;
    }
    applyClearing(material, props.clearing, state.gl);

    const camera = state.camera as PerspectiveCamera;
    const u = material.uniforms;
    const baseRepeat = entry.repeat ?? NO_REPEAT;
    tmpRepeat[0] = read(props.uvRepeat?.[0], baseRepeat[0]);
    tmpRepeat[1] = read(props.uvRepeat?.[1], baseRepeat[1]);
    const repeat = tmpRepeat;
    const [w, h] = plateWorldSize(entry, read(props.height, entry.height), repeat, tmpSize);

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
      const [rx, ry, rz] = props.rotation ?? entry.rotation ?? NO_ROTATION;
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
export function setColorUniform(material: ShaderMaterial, name: string, value: string | undefined, fallback: string = colors.white): void {
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
