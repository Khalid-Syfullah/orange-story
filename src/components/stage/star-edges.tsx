"use client";

import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, LineBasicMaterial, LineSegments } from "three";

import { colors } from "@/styles/tokens";

import { read, type Num } from "./plate";
import { plateRenderOrder, useSceneLayer, useStageProgress } from "./stage-context";
import { constellation, edgeDraw, STAR_Z } from "./stars-plan";

/**
 * The thin lines joining some of the constellation's stars. One draw call; every frame the free end
 * of each line is moved to how drawn it is (a pure function of progress), so scrolling back undraws
 * them. Faded with the scene's presence. `y` lifts the whole graph and `opacity` fades it (the finale
 * lets the stars drift up and away).
 */
export function StarEdges({ layer = 1, y, opacity }: { layer?: number; y?: Num; opacity?: Num }) {
  const scene = useSceneLayer();
  const progress = useStageProgress();
  const invalidate = useThree((s) => s.invalidate);
  const { nodes, edges } = React.useMemo(() => constellation(), []);

  const object = React.useMemo(() => {
    const geometry = new BufferGeometry();
    const attr = new Float32BufferAttribute(new Float32Array(edges.length * 6), 3);
    attr.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", attr);
    const material = new LineBasicMaterial({ color: colors.white, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.name = "star-edges";
    return lines;
  }, [edges]);

  React.useEffect(
    () => () => {
      object.geometry.dispose();
      (object.material as LineBasicMaterial).dispose();
    },
    [object],
  );
  React.useEffect(() => progress?.on("change", () => invalidate()), [progress, invalidate]);

  const ref = React.useRef<LineSegments>(null);
  useFrame(() => {
    const lines = ref.current;
    if (!lines) return;
    const p = progress?.get() ?? 1;
    const presence = scene ? scene.presence(p) : 1;
    const attr = lines.geometry.getAttribute("position") as Float32BufferAttribute;
    let any = false;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const a = nodes[edge.from].position;
      const b = nodes[edge.to].position;
      const t = edgeDraw(edge, p);
      if (t > 0) any = true;
      attr.setXYZ(i * 2, a[0], a[1], STAR_Z);
      attr.setXYZ(i * 2 + 1, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, STAR_Z);
    }
    attr.needsUpdate = true;
    const material = lines.material as LineBasicMaterial;
    const alpha = presence * read(opacity, 1);
    material.opacity = 0.55 * alpha;
    lines.position.y = read(y, 0);
    lines.visible = any && alpha > 0.001;
  });

  return <primitive ref={ref} object={object} renderOrder={plateRenderOrder(scene, layer)} />;
}
