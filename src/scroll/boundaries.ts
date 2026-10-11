import { SCENES, SCREEN, TRANSITIONS } from "./script";
import type { SceneId, TransitionDef, TransitionKind } from "./types";

/**
 * Every place the picture changes, read from the script: each boundary between two scenes (with the
 * transition that hands one to the other, or a plain crossfade where none does) and every transition
 * that plays inside one scene (the ring, the viewfinders, the smoke). Pure: the capture
 * (`npm run motion:capture -- --transitions`), the inventory and the tests read the same list.
 */

/** A boundary without a transition of its own crossfades over this many screens to each side (`presence.ts`). */
export const CROSSFADE_SCREENS = 0.2;

export interface StoryBoundary {
  /** Stable name for files and tables: `b05-share-work`, or `in-fall-ring` for one inside a scene. */
  name: string;
  /** The scene on screen before, and the one after (the same scene for an in-scene transition). */
  from: SceneId;
  to: SceneId;
  /** Where the scenes swap (the next scene's start), or the transition's start inside a scene. */
  at: number;
  /** The transition that plays here, if any. */
  transition: TransitionDef | null;
  /** Its kind, or `crossfade` where the scenes simply fade into each other. */
  kind: TransitionKind | "crossfade";
  /** Where it starts and ends (a crossfade: `CROSSFADE_SCREENS` to each side of the boundary). */
  start: number;
  end: number;
  /** Full cover (a covering transition): where the screen is first and last fully covered. */
  covered: number | null;
  clearing: number | null;
}

/** The stretch filmed around a boundary: a little before and after its transition, or 0.6 screen to each side of a crossfade. */
export const CAPTURE_MARGIN = { transition: 0.1, crossfade: 0.6 } as const;

export function storyBoundaries(transitions: readonly TransitionDef[] = TRANSITIONS): StoryBoundary[] {
  const list: StoryBoundary[] = [];
  for (let i = 1; i < SCENES.length; i++) {
    const a = SCENES[i - 1];
    const b = SCENES[i];
    const t = transitions.find((x) => x.from === a.id && x.to === b.id) ?? null;
    const fade = CROSSFADE_SCREENS * SCREEN;
    list.push({
      name: `b${String(i).padStart(2, "0")}-${a.id}-${b.id}`,
      from: a.id,
      to: b.id,
      at: b.start,
      transition: t,
      kind: t?.kind ?? "crossfade",
      start: t ? t.start : b.start - fade,
      end: t ? t.end : b.start + fade,
      covered: t?.peak?.[0] ?? null,
      clearing: t?.peak?.[1] ?? null,
    });
  }
  for (const t of transitions) {
    if (t.from !== t.to) continue;
    list.push({
      name: `in-${t.from}-${t.id}`,
      from: t.from,
      to: t.to,
      at: t.start,
      transition: t,
      kind: t.kind,
      start: t.start,
      end: t.end,
      covered: t.peak?.[0] ?? null,
      clearing: t.peak?.[1] ?? null,
    });
  }
  return list.sort((x, y) => x.start - y.start);
}

/** The stretch of progress to film for a boundary. */
export function captureRange(b: StoryBoundary): [number, number] {
  const margin = (b.transition ? CAPTURE_MARGIN.transition : CAPTURE_MARGIN.crossfade) * SCREEN;
  if (!b.transition) return [Math.max(0, b.at - margin), Math.min(1, b.at + margin)];
  return [Math.max(0, b.start - margin), Math.min(1, b.end + margin)];
}
