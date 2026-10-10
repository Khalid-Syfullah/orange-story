import { clamp01 } from "@/lib/progress";

import { beatArrivedAt } from "./helpers";
import { ANCHORS, BEATS, CHAPTERS, SCENES, SCREEN } from "./script";
import type { AnchorId } from "./types";

/**
 * Where the visitor can be taken, and where they were: beat stops for the J and K keys, the hash
 * that names a place (`#work`), and what survives a reload. Pure, so it is safe on the server, in
 * tests and inside scroll callbacks. The browser side (`story-location.ts`) wires these to the
 * page.
 */

/* ------------------------------------------------------------------ */
/* Beat stops (J and K)                                                */
/* ------------------------------------------------------------------ */

/** Stops closer than this are one stop: beats that arrive together (the hero's two blocks, the apply pair). */
const SAME_STOP = 0.5 * SCREEN;
/** J and K ignore a stop this close to where the reader already is, so each press moves on. */
const ALREADY_THERE = 0.25 * SCREEN;

/**
 * Progress values where a text beat is fully on screen, in order: one per beat, at the point where
 * its last line has arrived, merged when beats arrive together (the later one wins, so every beat
 * of the group is fully shown there). Each question card, the section title that stays through
 * all five cards, and the form get a stop.
 */
export const BEAT_STOPS: readonly number[] = (() => {
  const starts = BEATS.map((beat) => beatArrivedAt(beat)).sort((a, b) => a - b);
  const stops: number[] = [];
  for (const start of starts) {
    if (stops.length > 0 && start - stops[stops.length - 1] < SAME_STOP) stops[stops.length - 1] = start;
    else stops.push(start);
  }
  return stops;
})();

/** The stop after (`direction` 1) or before (-1) progress `p`, or null at either end of the story. */
export function stepBeat(p: number, direction: 1 | -1, stops: readonly number[] = BEAT_STOPS): number | null {
  if (direction === 1) return stops.find((stop) => stop > p + ALREADY_THERE) ?? null;
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i] < p - ALREADY_THERE) return stops[i];
  return null;
}

/* ------------------------------------------------------------------ */
/* The hash                                                            */
/* ------------------------------------------------------------------ */

const ANCHOR_IDS = Object.keys(ANCHORS) as AnchorId[];
const applyScene = SCENES.find((scene) => scene.id === "apply")!;

/** The anchor named by a URL hash (`#work` or `work`), or null. */
export function anchorFromHash(hash: string): AnchorId | null {
  const id = hash.replace(/^#/, "");
  return ANCHOR_IDS.find((anchor) => anchor === id) ?? null;
}

/**
 * The anchor that names where progress `p` is: the chapter, or `apply` from the application on.
 * Null on the hero, before the first chapter starts (no hash at all there).
 */
export function anchorAt(p: number): AnchorId | null {
  if (p < CHAPTERS[0].start) return null;
  if (p >= applyScene.start) return "apply";
  let id: AnchorId = CHAPTERS[0].id;
  for (const chapter of CHAPTERS) if (p >= chapter.start) id = chapter.id;
  return id;
}

/* ------------------------------------------------------------------ */
/* Restoration                                                         */
/* ------------------------------------------------------------------ */

/** Where the last progress is kept for this tab (session storage). */
export const PROGRESS_STORAGE_KEY = "orange:progress";

/** Progress below this is the top of the page: nothing to restore. */
export const RESTORE_MIN = 0.0005;

/** Navigation types after which the reader expects to find the page where they left it. */
const KEEPS_PLACE = new Set(["reload", "back_forward"]);

/**
 * Where to put the page when it loads: the saved progress after a reload or a back/forward
 * navigation, otherwise the place the URL hash names, otherwise null (the top).
 */
export function restoreTarget(navigationType: string | undefined, saved: string | null, hash: string): number | null {
  if (navigationType && KEEPS_PLACE.has(navigationType) && saved !== null) {
    const value = Number.parseFloat(saved);
    if (Number.isFinite(value) && value > RESTORE_MIN) return clamp01(value);
  }
  const anchor = anchorFromHash(hash);
  if (anchor && ANCHORS[anchor] > RESTORE_MIN) return ANCHORS[anchor];
  return null;
}

/** How long the stage stays covered while it waits to be placed, before it shows itself anyway (ms). */
export const RESTORE_FAILSAFE_MS = 4000;

/**
 * A tiny script that runs in the document head, before the first paint. It stops the browser from
 * restoring the scroll by itself (the story restores through Lenis, once the stage has a layout),
 * and when a place is to be restored it marks the page `data-restore`, which hides the stage so the
 * hero never flashes before the right scene is in place. The stage removes the mark once it has
 * moved; a timer removes it anyway if it never does. With reduced motion it does nothing: the calm
 * page keeps the browser's own restoration.
 *
 * It mirrors `restoreTarget` (ES5, no imports). `navigation.test.ts` runs it against fakes.
 */
export const RESTORE_SCRIPT = `(function(){try{
var d=document.documentElement;
if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if("scrollRestoration" in history)history.scrollRestoration="manual";
var n=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];
var t=n&&n.type;
var s=null;try{s=sessionStorage.getItem(${JSON.stringify(PROGRESS_STORAGE_KEY)})}catch(e){}
var h=location.hash.replace(/^#/,"");
var go=false;
if((t==="reload"||t==="back_forward")&&s!==null){var v=parseFloat(s);go=isFinite(v)&&v>${RESTORE_MIN};}
if(!go)go=${JSON.stringify(ANCHOR_IDS.filter((id) => ANCHORS[id] > RESTORE_MIN))}.indexOf(h)>=0;
if(go){d.setAttribute("data-restore","");setTimeout(function(){d.removeAttribute("data-restore")},${RESTORE_FAILSAFE_MS});}
}catch(e){}})();`;
