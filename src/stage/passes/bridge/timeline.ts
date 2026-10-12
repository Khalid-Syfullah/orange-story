// The bridge reel's camera, in the segment's local progress t (0..1 over p 0.04-0.07). Phase 18: the
// reel reads as filmed, not scrubbed. Four things, none of which touches the hero-to-reel handover
// (the film is held where the hero ended; the reel is cut in on the same dolly, the same orbit and
// no roll, and nothing below is on screen before the wave has crossed):
//
//   - the film's orbit relaxes to nothing with the dolly (the same smoothstep, DOLLY_FROM..DOLLY_TO), so
//     the reel ends framed like the Model's stills (the orbit's layers are the hero's, the sky mask is read
//     on the reel too);
//   - a handheld sway and roll: three incommensurate sines of t (rule 9) under an envelope that is 0 until
//     the wave has crossed and 0 again at t = 1, so the sway is the camera's pace through the reel (a
//     faster scroll sways faster, a stopped one holds), plus a gust of the wind field on the same envelope;
//   - the camera's lean with the scroll's speed: a roll, an extra push and a radial smear, on an envelope
//     that is 0 until the reel is fully revealed (the speed test: before that only the crest answers the
//     speed) and 0 again at the end (so the reel's last frame is the Model's first at any speed);
//   - all of it squeezed inside the room the framing and the dolly leave (reelRoomScale), so no edge shows.
// Every term is a function of t, of the pass clock (the wind) and of the scroll's speed: no history.
import type { Wind } from "@/content/art";
import { art } from "@/content/art";
import { coverScale, sizeFromAspect, uncover, type Size } from "../../framing";
import { heroCam, heroCamMax, heroRoom, HERO_PUSH_END } from "../hero/timeline";

const hero = art.hero;
const REEL_TEX = sizeFromAspect(art.bridge.aspect);

/** The wave runs over this stretch of the segment's local progress; the film is gone after it. */
export const SWEEP_FROM = 0.02;
export const SWEEP_TO = 0.58;
/** The reel's dolly and orbit ease to nothing over this stretch, after the film has left the frame. */
export const DOLLY_FROM = 0.6;
export const DOLLY_TO = 1.0;

/** The handheld camera's numbers (painting units and radians at full envelope, before the room scales them). */
export const REEL_CAM = {
  /** The handheld envelope runs from here to the end of the reel (0 at both ends). */
  swayFrom: 0.55,
  /** Sway across and up and down. */
  sway: { x: 0.0035, y: 0.0025 },
  /** Roll about the orange: 0.49 degrees. */
  roll: 0.0085,
  /** The wind's own sway of the camera, painting units at a full gust. */
  wind: { scale: 1.1, speed: 0.35, flutter: 2.6, flutterSpeed: 3.2 } satisfies Wind,
  windAmp: 0.0022,
  /** The scroll's speed: the envelope's window, the roll's lean, the extra push and the radial smear at a flick. */
  vel: { from: 0.58, rise: 0.14, fall: 0.88, knee: 30, lean: 0.006, push: 0.012, smear: 0.010 },
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const TAU = Math.PI * 2;

/** The share of the film's orbit and dolly still held: 1 through the wave, easing to 0 by the end of the reel. */
export function reelHold(t: number): number {
  return 1 - smooth(DOLLY_FROM, DOLLY_TO, t);
}

/** The reel's dolly about the orange: the hero's push, easing to 1 late. */
export function reelDolly(t: number): number {
  return 1 + HERO_PUSH_END * reelHold(t);
}

/** The handheld envelope: 0 until the wave has crossed, rising and falling smoothly, exactly 0 at t = 1. */
export function handEnvelope(t: number): number {
  const u = clamp01((t - REEL_CAM.swayFrom) / (1 - REEL_CAM.swayFrom));
  const s = Math.sin(Math.PI * u);
  return s * s;
}

/** The scroll-speed envelope: 0 while the film is on screen, 1 once the reel is fully revealed, 0 again at the end. */
export function velEnvelope(t: number): number {
  const v = REEL_CAM.vel;
  return smooth(v.from, v.from + v.rise, t) * (1 - smooth(v.fall, 1, t));
}

/** Three incommensurate sines of the progress (rule 9), -1..1. */
function sines(t: number, a: readonly [number, number, number], ph: readonly [number, number, number]): number {
  return 0.55 * Math.sin(TAU * (a[0] * t + ph[0])) + 0.3 * Math.sin(TAU * (a[1] * t + ph[1])) + 0.15 * Math.sin(TAU * (a[2] * t + ph[2]));
}

export interface ReelCamera {
  /** The handheld sway, painting units (scaled by the envelope and the room). */
  swayX: number;
  swayY: number;
  /** The handheld roll about the orange, radians. */
  roll: number;
  /** The wind's sway amplitude, painting units. */
  windAmp: number;
  /** The scroll-speed envelope, and the roll's lean at a flick (radians, scaled by the room). */
  velEnv: number;
  lean: number;
  /** The share of the film's orbit and dolly still held. */
  hold: number;
  /** The room's scale on everything above, 0..1. */
  scale: number;
}

/**
 * The room the reel's frame leaves at t (painting units): the hero's framing and the dolly about the orange
 * as it relaxes, less what the held orbit still uses.
 */
export function reelRoom(css: Size, t: number): { x: number; y: number } {
  const hold = reelHold(t);
  const room = heroRoom(css, HERO_PUSH_END * hold);
  const cam = heroCam(1);
  const bound = heroCamMax(css, HERO_PUSH_END);
  const bx = Math.abs(cam.x) / Math.sqrt(1 + (cam.x / bound.x) ** 2);
  const by = Math.abs(cam.y) / Math.sqrt(1 + (cam.y / Math.max(bound.y, 1e-9)) ** 2);
  const lead = Math.max(hero.depth.near, hero.depth.far);
  return { x: Math.max(0, room.x - lead * bx * hold), y: Math.max(0, room.y - lead * by * hold) };
}

/**
 * How far the handheld camera's worst displacement at the screen's corners reaches, per axis, at t:
 * the roll about the orange moves a corner by the roll times its distance, plus the sway and the wind.
 */
export function reelReach(css: Size, t: number): { x: number; y: number } {
  const f = hero.framing;
  const o = uncover(hero.anchors.orange, css, REEL_TEX, f);
  const cs = coverScale(css, REEL_TEX);
  const asp = css[0] / css[1];
  const env = handEnvelope(t);
  const lean = velEnvelope(t) * REEL_CAM.vel.lean;
  const roll = REEL_CAM.roll * env + lean;
  const dx = Math.max(Math.abs(o.x), Math.abs(1 - o.x)) * asp;
  const dy = Math.max(Math.abs(o.y), Math.abs(1 - o.y));
  return {
    x: (roll * dy * cs[0]) / f.zoom + REEL_CAM.sway.x * env + REEL_CAM.windAmp * 1.6 * env,
    y: (roll * dx * cs[1]) / f.zoom + REEL_CAM.sway.y * env + REEL_CAM.windAmp * 0.6 * env,
  };
}

/** The reel's camera at local progress t at this frame size. */
export function reelCamera(css: Size, t: number): ReelCamera {
  const env = handEnvelope(t);
  const velEnv = velEnvelope(t);
  const room = reelRoom(css, t);
  const reach = reelReach(css, t);
  // One smooth scale for the room: the displacement at full strength over 0.8 of the room, squared and
  // added, so the camera loses amplitude only when the room is short and never breaks in.
  const rx = reach.x / Math.max(0.8 * room.x, 1e-9);
  const ry = reach.y / Math.max(0.8 * room.y, 1e-9);
  const scale = 1 / Math.sqrt(1 + rx * rx + ry * ry);
  const hand = env * scale;
  return {
    swayX: REEL_CAM.sway.x * hand * sines(t, [3.1, 5.3, 8.9], [0.13, 0.71, 0.37]),
    swayY: REEL_CAM.sway.y * hand * sines(t, [2.3, 4.1, 7.3], [0.52, 0.19, 0.88]),
    roll: REEL_CAM.roll * hand * (0.6 * Math.sin(TAU * (2.3 * t + 0.4)) + 0.4 * Math.sin(TAU * (4.1 * t + 0.9))),
    windAmp: REEL_CAM.windAmp * hand,
    velEnv,
    lean: REEL_CAM.vel.lean * scale,
    hold: reelHold(t),
    scale,
  };
}
