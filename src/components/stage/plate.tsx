"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isMotionValue, type MotionValue } from "motion/react";
import { Color, PlaneGeometry, Vector2, Vector3, type Group, type Mesh, type PerspectiveCamera, type ShaderMaterial, type Vector4 } from "three";

import { hasPlate, plateEntry, platePaint, plateWorldSize, rigIsPart, type Pair, type PlateEntry, type PlateId, type ResolvedPaint } from "@/art/manifest";
import { remap } from "@/lib/progress";
import { revealCircle } from "./transitions/choreography";
import { stageTransitionMode } from "./transitions/modes";
import { transitionOf } from "@/scroll/helpers";
import { SCENE_PAINT } from "@/scroll/script";
import { colors } from "@/styles/tokens";
import type { SceneId, TransitionId } from "@/scroll/types";

import { useFigureLife, useRigResources, type FigureLife, type PartRide, type RigResources } from "./figure-life";
import { phaseOf, swayAngle, useIdleClock, type SwayOptions } from "./idle";
import { HalftoneMaterial, PlateMaterial } from "./materials";
import { backdropRepeat, CANVAS, canvasRepeat, FIGURE_LIGHT, figureLight, HALFTONE, SHADOW_SIDE } from "./paint";
import { DEPTH_OF_FIELD, MIN_BLUR_PX } from "./quality";
import { rigFigures } from "./rig";
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
  /**
   * A turn about the vertical axis through the anchor (radians; positive brings the plate's left
   * toward the camera): a panel of paper swinging on its hinge, seen in perspective, not stretched.
   */
  turnY?: Num;
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
  /**
   * A part of a figure riding its body (`FigureLife.ride`): world offsets and a turn, updated every
   * frame by the body's life, added to everything else.
   */
  ride?: PartRide;
  /** A constant factor on the opacity (the contact shadow's strength). */
  opacityScale?: number;
  /**
   * Draw only part of the plate: a window of the image ([left, top, right, bottom] fractions) with a
   * soft edge `soft` wide. The fingers of a hand drawn a second time in front of what they hold.
   */
  crop?: { box: readonly [number, number, number, number]; soft: number };
  /** A multiplier of the halftone's dot cell (default: the manifest's `paint.cell`): a cloud passing the lens takes a finer dot. */
  cell?: number;
  /** How much of a halftone plate is dots (1, default) rather than its soft painted version (0): a cloud out of focus near the lens is mostly soft. */
  dots?: Num;
  /** The drawing is on a sheet of paper (the plan): cream under it, with a fibre and a deckled edge. */
  paper?: boolean;
  /** Fill in from a point instead of fading up: the fruiting tree spreading out from the graft, clump by clump. */
  grow?: PlateGrow;
  name?: string;
}

/**
 * A plate that fills in: `amount` 0 (none of it) to 1 (all of it), spreading out from a point, or
 * closing in on it from the plate's edges (`inward`), clump by clump, each part either there or not but
 * for a soft edge `soft` (a share of the fill, default 0.05). The point is a world point (`from`, x and
 * y: its place on the plate as it stands) or a point of the image (`at`, fractions from its left and top).
 */
export interface PlateGrow {
  amount: Num;
  from?: Pair;
  at?: Pair;
  inward?: boolean;
  soft?: number;
}

export interface PlateProps extends PlatePlacement, PlateMotion {
  id: PlateId;
  /** Color the plate is tinted toward (for example white for a glow, ink for a silhouette). */
  tint?: string;
  /** How far toward `tint`, 0 to 1. Default 1 when a tint is given. */
  tintAmount?: Num;
  /**
   * The plate's back, where it is turned away (`turnY` past a quarter turn): the colour it shows there
   * and how far toward it (a sheet of paper's plain back, the drawing faintly through it). Default: the
   * painting itself, mirrored.
   */
  backTint?: { color: string; amount: Num };
  /**
   * A living figure's life (`useFigureLife`), when the scene drives it (acting, parts riding it).
   * Default: a figure plate with a rig lives on its own; `false` keeps it still.
   */
  life?: FigureLife | false;
  children?: React.ReactNode;
}

/** The unit quad every plate scales (shared, never disposed). */
export const UNIT_PLANE = new PlaneGeometry(1, 1);

/** The soft contact shadow under a standing figure (a plate of its own). */
const CONTACT_PLATE = "hero/contact-shadow";
/** How far (world units) behind its figure the contact shadow stands: in front of the ground it stands on. */
const CONTACT_BEHIND = 0.005;

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
 * Sets a material's reveal circle for progress p (drawing-buffer pixels, as `gl_FragCoord`). Returns how
 * much of the plate to show: 0 when it is entirely cut away, else 1; in the calm transitions there is
 * no circle, the old picture and the new one simply cross-fade over the transition.
 */
function applyReveal(material: ShaderMaterial, reveal: PlateReveal | undefined, p: number, gl: { getDrawingBufferSize(target: Vector2): Vector2 }, width: number, height: number): number {
  const u = material.uniforms;
  if (!u.revealSide) return 1; // a material without the reveal uniforms
  if (!reveal) {
    u.revealSide.value = 0;
    return 1;
  }
  const def = transitionOf(reveal.transition);
  const inside = reveal.side !== "outside";
  if (stageTransitionMode() === "calm") {
    u.revealSide.value = 0;
    const t = remap(p, def.start, def.end);
    const fade = t * t * (3 - 2 * t);
    return inside ? fade : 1 - fade;
  }
  const circle = revealCircle(def, p, width, height);
  const far = Math.max(Math.hypot(circle.x, circle.y), Math.hypot(width - circle.x, circle.y), Math.hypot(circle.x, height - circle.y), Math.hypot(width - circle.x, height - circle.y));
  if (inside && circle.radius + circle.softness <= 0) return 0;
  if (!inside && circle.radius - circle.softness >= far) return 0;
  gl.getDrawingBufferSize(tmpBuffer);
  const sx = tmpBuffer.x / Math.max(1, width);
  const sy = tmpBuffer.y / Math.max(1, height);
  u.revealSide.value = inside ? 1 : -1;
  (u.revealCircle.value as Vector4).set(circle.x * sx, tmpBuffer.y - circle.y * sy, circle.radius * sy, Math.max(1, circle.softness * sy));
  return 1;
}

/** Sets a material's clearing for this frame (drawing-buffer pixels, as `gl_FragCoord`). */
export function applyClearing(material: ShaderMaterial, clearing: PlateClearing | undefined, gl: { getDrawingBufferSize(target: Vector2): Vector2 }): void {
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

  useInvalidateOnChange([props.x, props.y, props.z, props.scale, props.scaleX, props.scaleY, props.rotate, props.turnY, props.opacity, props.blur, props.dots, props.grow?.amount, props.height, props.uvRepeat?.[0], props.uvRepeat?.[1], props.uvOffset?.[0], props.uvOffset?.[1], props.clearing?.amount, props.clearing?.left, props.clearing?.right, props.clearing?.top, props.clearing?.bottom]);
  React.useEffect(() => () => clock.drop(key), [clock, key]);

  useFrame((state) => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m) return;
    const p = progress?.get() ?? 0;
    const material = m.material as ShaderMaterial;
    const opacity = read(props.opacity, 1) * (props.opacityScale ?? 1) * (layer ? layer.presence(p) : 1) * (props.visible !== false ? applyReveal(material, props.reveal, p, state.gl, state.size.width, state.size.height) : 0);
    const shown = props.visible !== false && opacity > 0.001 && (props.grow === undefined || read(props.grow.amount, 1) > 0);
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
      const ride = props.ride;
      g.position.set(px + read(props.x, 0) + (ride?.x ?? 0), py + read(props.y, 0) + (ride?.y ?? 0), -(props.depth ?? entry.depth) + read(props.z, 0));
      g.rotation.set(rx * DEG, ry * DEG + read(props.turnY, 0), rz * DEG + read(props.rotate, 0) + angle + (ride?.rotate ?? 0));
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
    // The canvas lies in the plate's own UV space (it moves and scales with the art, never crawls):
    // a world-size weave on a plate, a screen-size one on a backdrop (which stays put on the screen).
    if (u.canvasRepeat) {
      const r = backdrop ? backdropRepeat(camera.aspect, tmpCanvas) : canvasRepeat(w, h, tmpCanvas);
      (u.canvasRepeat.value as Vector4).set(r[0], r[1], r[2], r[3]);
    }
    // The halftone's dot grid, in plate space: the same world size on any screen.
    if (u.cells) {
      const cell = halftoneCell(u.mode.value as number) * (props.cell ?? entry.paint?.cell ?? 1);
      (u.cells.value as Vector2).set(w / cell, h / cell);
      u.dots.value = read(props.dots, 1);
    }
    // Filling in from a point: a point of the image, or a world point's place on the plate as it stands now (uv, from the bottom).
    if (u.grow) {
      const grow = props.grow;
      const value = u.grow.value as Vector4;
      if (grow && !backdrop) {
        let ix = grow.at?.[0] ?? 0.5;
        let iy = grow.at?.[1] ?? 0.5;
        if (grow.from) {
          const [px, py] = props.position ?? entry.position;
          const [ax, ay] = props.anchor ?? entry.anchor;
          const s = read(props.scale, 1) || 1;
          ix = (grow.from[0] - px - read(props.x, 0)) / (w * s) + ax;
          iy = ay - (grow.from[1] - py - read(props.y, 0)) / (h * s);
        }
        const amount = read(grow.amount, 1);
        // All of it there: off (the same picture, without the work).
        value.set(amount >= 1 ? -1 : amount, ix, 1 - iy, (grow.soft ?? 0.05) * (grow.inward ? -1 : 1));
      } else value.x = -1;
    }
    extra?.(material, p);
  });
}

const tmpCanvas: [number, number, number, number] = [1, 1, 1, 1];

/** World size of a halftone cell for a material mode (0 cloud, 1 water, 2 rings). */
const halftoneCell = (mode: number) => (mode < 0.5 ? HALFTONE.cloudCell : mode < 1.5 ? HALFTONE.waterCell : HALFTONE.ringCell);

/**
 * The paint of a plate in a scene, set once on its material: canvas grain and craquelure, and for a
 * figure the scene's grade, the sky rim and the warm bounce (see `paint.ts`).
 */
export function configurePaint(material: ShaderMaterial, entry: PlateEntry, paint: ResolvedPaint, scene: SceneId | null): void {
  const u = material.uniforms;
  const scenePaint = scene ? SCENE_PAINT[scene] : null;
  // Where the painting is cut by its image's edge, it fades out toward that edge (left, bottom, right, top in uv).
  if (u.cutFade) (u.cutFade.value as Vector4).set(paint.cut[0], paint.cut[3], paint.cut[2], paint.cut[1]);
  if (u.grainAmount) u.grainAmount.value = paint.grain ? (entry.role === "backdrop" ? CANVAS.grainAmount.backdrop : CANVAS.grainAmount.plate) : 0;
  if (u.crackAmount) u.crackAmount.value = CANVAS.crackAmount * paint.craquelure * (scenePaint?.craquelure ?? 0.5);
  if (!u.figureOn) return;
  u.figureOn.value = paint.figure ? 1 : 0;
  if (!paint.figure) return;
  if (scenePaint) (u.grade.value as Vector3).set(scenePaint.warm, scenePaint.cool, scenePaint.saturation);
  const light = figureLight(paint.painted);
  const aspect = entry.size[0] / entry.size[1];
  u.rimAmount.value = light.rim;
  (u.rimStep.value as Vector2).set((SHADOW_SIDE[0] * FIGURE_LIGHT.rimReach) / aspect, SHADOW_SIDE[1] * FIGURE_LIGHT.rimReach);
  // A part (a head, an arm, a forearm: a rig with its joint and no body): no rim along the cut where it meets its body.
  const part = rigIsPart(entry.rig);
  (u.rimJoint.value as Vector4).set(part ? entry.rig!.pivot![0] : 0, part ? 1 - entry.rig!.pivot![1] : 0, part ? FIGURE_LIGHT.jointClear : 0, aspect);
  // The warm bounce: only on a standing body (its feet near the plate's foot), not on a head, an arm or a hand.
  const feet = !part && (paint.life || paint.contact > 0) ? rigFigures(entry.rig)[0]?.pivot : undefined;
  if (feet && feet[1] > 0.85) (u.bounce.value as Vector3).set(light.bounce, 1 - feet[1], FIGURE_LIGHT.bounceReach);
  else (u.bounce.value as Vector3).set(0, 0, 1);
}

/** Sets a color uniform only when the color string changes (no parsing every frame). */
export function setColorUniform(material: ShaderMaterial, name: string, value: string | undefined, fallback: string = colors.white): void {
  const next = value ?? fallback;
  const seen = (material.userData.colors ??= {}) as Record<string, string>;
  if (seen[name] === next) return;
  seen[name] = next;
  (material.uniforms[name].value as Color).set(next);
}

export function Plate({ id, tint, tintAmount, backTint, life, crop, children, ...props }: PlateProps) {
  const entry = plateEntry(id);
  const paint = platePaint(entry);
  const scene = useSceneLayer()?.scene.id ?? null;
  const texture = usePlateTexture(entry);
  const halftone = paint.halftone;
  const material = React.useMemo(() => {
    const m = halftone ? new HalftoneMaterial(texture, halftone) : new PlateMaterial(texture);
    configurePaint(m, entry, paint, scene);
    return m;
    // `paint` is derived from `entry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, halftone, entry, scene]);
  React.useEffect(() => () => material.dispose(), [material]);
  useInvalidateOnChange([tintAmount, backTint?.amount]);

  // A figure lives on its own unless the scene drives it (or keeps it still).
  const own = useFigureLife(entry, { enabled: life === undefined && paint.life && !halftone });
  const living = life === false || halftone ? null : (life ?? (paint.life ? own : null));
  const rig = useRigResources(entry, living !== null);
  React.useEffect(() => offWithoutRig(material, rig), [material, rig]);

  const group = React.useRef<Group>(null);
  const mesh = React.useRef<Mesh>(null);
  const renderOrder = usePlateRenderOrder(entry, props);
  usePlateFrame(entry, props, group, mesh, (m) => {
    if (m.uniforms.tint) {
      setColorUniform(m, "tint", tint);
      m.uniforms.tintAmount.value = tint ? read(tintAmount, 1) : 0;
    }
    // The crop window, in uv (from the bottom): off unless asked for.
    if (m.uniforms.crop) {
      if (crop) (m.uniforms.crop.value as Vector4).set(crop.box[0], 1 - crop.box[3], crop.box[2], 1 - crop.box[1]);
      else (m.uniforms.crop.value as Vector4).set(0, 0, 0, 0);
      m.uniforms.cropSoft.value = crop?.soft ?? 0.01;
    }
    if (m.uniforms.paper) m.uniforms.paper.value = props.paper ? 1 : 0;
    if (m.uniforms.backTint) {
      const back = m.uniforms.backTint.value as Vector4;
      if (backTint) {
        const seen = (m.userData.backColor ??= { key: "", color: new Color() }) as { key: string; color: Color };
        if (seen.key !== backTint.color) seen.color.set((seen.key = backTint.color));
        back.set(seen.color.r, seen.color.g, seen.color.b, read(backTint.amount, 1));
      } else back.w = 0;
    }
    if (living && rig) {
      // The rig's weights are bound in the same frame as the life that reads them (never a frame without).
      m.uniforms.rigMap.value = rig.weights;
      living.attach(mesh.current);
      living.apply(m);
    }
  });

  return (
    <group ref={group} name={props.name ?? entry.id}>
      <mesh ref={mesh} geometry={rig?.geometry ?? UNIT_PLANE} material={material} renderOrder={renderOrder} />
      {paint.contact > 0 && <ContactShadow entry={entry} paint={paint} {...props} />}
      {children}
    </group>
  );
}

/** Turns a plate's life off when it has no rig (the frame loop binds the rig's weights when it has one). */
function offWithoutRig(material: ShaderMaterial, rig: RigResources | null): void {
  if (material instanceof PlateMaterial && !rig) material.uniforms.lifeOn.value = 0;
}

/**
 * The soft contact shadow under a standing figure's feet (its rig pivot), so it stands on its
 * platform instead of floating over it: a plate of its own, just behind the figure and in front of
 * the ground, fading and moving with it.
 */
function ContactShadow({ entry, paint, opacity, opacityScale, layer, clearing, reveal, visible }: { entry: PlateEntry; paint: ResolvedPaint } & PlateMotion) {
  if (!hasPlate(CONTACT_PLATE)) return null;
  const feet = rigFigures(entry.rig)[0]?.pivot ?? [entry.anchor[0], 1];
  const [w, h] = plateWorldSize(entry);
  const shadow = plateEntry(CONTACT_PLATE);
  const width = paint.contact;
  const height = (width * shadow.size[1]) / shadow.size[0];
  return (
    <Plate
      id={CONTACT_PLATE}
      position={[(feet[0] - entry.anchor[0]) * w, (entry.anchor[1] - feet[1]) * h]}
      depth={CONTACT_BEHIND}
      height={height}
      anchor={[0.5, 0.5]}
      opacity={opacity}
      opacityScale={(opacityScale ?? 1) * figureLight(paint.painted).contact}
      layer={layer ?? entry.layer}
      clearing={clearing}
      reveal={reveal}
      visible={visible}
      sway={false}
      focus={false}
      name={`${entry.id}:contact`}
    />
  );
}
