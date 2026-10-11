"use client";
// /stage-test: the checkerboard pass with DOM labels at the TypeScript uncover() of the same three
// points the shader rings. Rings, crosses and labels must coincide at any viewport, pan and zoom
// (try ?pan=0.1,-0.05&zoom=1.3&aspect=9:16 and resize the window).
import { useCallback, useRef } from "react";
import type { FrameCtx } from "../frame";
import { uncover } from "../framing";
import { useFrame } from "../hub";
import { Stage } from "../Stage";
import { checkerPasses, readTestFraming, TEST_POINTS } from "./checker";
import styles from "./StageTest.module.css";

function TestLabels() {
  const boxRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef("");

  const onFrame = useCallback((f: FrameCtx) => {
    const box = boxRef.current;
    if (!box) return;
    const framing = readTestFraming();
    const key = `${f.css[0]}x${f.css[1]}|${framing.pan.x},${framing.pan.y}|${framing.zoom}|${framing.size.join("x")}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const labels = box.querySelectorAll<HTMLSpanElement>("[data-point]");
    labels.forEach((el, i) => {
      const pt = TEST_POINTS[i];
      const s = uncover(pt, f.css, framing.size, framing);
      el.style.left = `${(s.x * 100).toFixed(3)}%`;
      el.style.top = `${(s.y * 100).toFixed(3)}%`;
      el.textContent = `${String.fromCharCode(65 + i)} (${pt.x}, ${pt.y}) → ${Math.round(s.x * f.css[0])}, ${Math.round(s.y * f.css[1])} px`;
    });
    const caption = box.querySelector<HTMLElement>("[data-caption]");
    if (caption) {
      caption.textContent = [
        `viewport ${f.css[0]}x${f.css[1]} css, ${f.res[0]}x${f.res[1]} buffer, dpr ${f.dpr.toFixed(2)}`,
        `painting ${framing.size[0]}x${framing.size[1]}  pan ${framing.pan.x},${framing.pan.y}  zoom ${framing.zoom}`,
        `rings (GLSL uncover) and labels (TS uncover) must sit on the crosses (painting space)`,
      ].join("\n");
    }
  }, []);
  useFrame(onFrame);

  return (
    <div ref={boxRef} className={styles.labels}>
      {TEST_POINTS.map((pt) => (
        <span key={`${pt.x},${pt.y}`} data-point="" className={`meta ${styles.label}`} />
      ))}
      <pre data-caption="" className={`meta ${styles.caption}`} />
    </div>
  );
}

export function StageTest() {
  return (
    <Stage passes={checkerPasses} heights={1} chrome={false} heroVideo={false}>
      <TestLabels />
    </Stage>
  );
}
