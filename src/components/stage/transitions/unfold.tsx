"use client";

import * as React from "react";
import { useFrame } from "@react-three/fiber";
import { useMutable } from "@/lib/use-mutable";
import { plateEntry } from "@/art/manifest";

import { usePlateTexture } from "../textures";
import { CalmVeil } from "./calm-veil";
import { foldShade, PAGE_STATIONS, pageBend, pageShape } from "./hinge";
import { LensGroup, lensOrder } from "./lens";
import { poseAt } from "./match-cut";
import { pageMesh, setPage } from "./page-material";
import { LEFT_PAGE, RIGHT_PAGE, sheetPlacement, sheetShows, UNFOLD_COVERED } from "./unfold-plan";
import { usePrecompile, type TransitionEffectProps } from "./transition-stage";

/**
 * Blueprint to site: the paper unfolds (`unfold-plan.ts`). Two pages in front of the lens, the plan's
 * second and third panels on their paper, exactly where the plan was on the screen when the camera
 * dove into it. Each is a strip bent along its length (the angle at each of `PAGE_STATIONS` stations,
 * the free edge lagging its hinge), lit by the story's sun on whichever face the camera sees (the
 * paper's plain back, the drawing faint through it, when it has turned over), the fold under a landing
 * page shading the page it closes on. The right page rides the left one once it has landed on it.
 * Calm: a still milk paper veil.
 */

export function PaperUnfold({ def, progress, mode }: TransitionEffectProps) {
  const left = usePlateTexture(plateEntry("blueprint/plan-2"));
  const right = usePlateTexture(plateEntry("blueprint/plan-3"));
  const pages = React.useMemo(() => ({ left: pageMesh(left, "drawing", "unfold-left"), right: pageMesh(right, "drawing", "unfold-right") }), [left, right]);
  React.useEffect(
    () => () => {
      for (const page of [pages.left, pages.right]) {
        page.geometry.dispose();
        page.material.dispose();
      }
    },
    [pages],
  );
  usePrecompile([pages.left, pages.right]);

  // The sheet keeps the size it had when it took over, whatever the camera's field of view does under it.
  const fov = React.useMemo(() => poseAt(UNFOLD_COVERED).fov, []);
  const hold = React.useCallback(() => (progress.get() >= UNFOLD_COVERED ? fov : null), [progress, fov]);
  const scratch = React.useRef({ left: new Array(PAGE_STATIONS).fill(0), right: new Array(PAGE_STATIONS).fill(0), shape: new Array(2 * PAGE_STATIONS).fill(0) });

  const pagesRef = useMutable(pages);

  useFrame(({ size }) => {
    const pages = pagesRef.current;
    const p = progress.get();
    const on = sheetShows(p) && mode() !== "calm";
    pages.left.visible = on;
    pages.right.visible = on;
    if (!on) return;
    const place = sheetPlacement(size.width, size.height);
    const leftAngles = pageBend(LEFT_PAGE, p, scratch.current.left);
    const rightAngles = pageBend(RIGHT_PAGE, p, scratch.current.right);
    // The left page: hinged on the left crease, lying where the second panel was.
    setPage(pages.left, leftAngles, 0, 1, place.panel, place.tall, [place.crease - place.panel, place.y, -place.depth]);
    pages.left.material.uniforms.uFold.value = foldShade(rightAngles[PAGE_STATIONS - 1]);
    // The right page: hinged on the middle crease, which is the left page's free edge (it rides it).
    const shape = pageShape(leftAngles, place.panel, scratch.current.shape);
    setPage(pages.right, rightAngles, leftAngles[PAGE_STATIONS - 1], 1, place.panel, place.tall, [place.crease - place.panel + shape[2 * PAGE_STATIONS - 2], place.y, -place.depth + shape[2 * PAGE_STATIONS - 1]]);
    // Lying on the left page, the right one is on top of it; once the left page has turned past edge-on, behind it.
    const leftTurned = leftAngles[PAGE_STATIONS - 1] > Math.PI / 2;
    pages.left.renderOrder = lensOrder(place.depth, leftTurned ? 2 : 1);
    pages.right.renderOrder = lensOrder(place.depth, leftTurned ? 1 : 2);
  });

  return (
    <>
      <LensGroup name="unfold" holdFov={hold}>
        <primitive object={pages.left} />
        <primitive object={pages.right} />
      </LensGroup>
      <CalmVeil def={def} progress={progress} mode={mode} look="paper" />
    </>
  );
}

