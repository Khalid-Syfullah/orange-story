import { storyScenes } from "@/content/copy";
import { cn } from "@/lib/utils";
import type { SceneId } from "@/scroll/types";

import { placeholderPlate, type PlaceholderShape } from "./placeholder-art";

/**
 * A scene's placeholder plate as an SVG still (16:9, cropped to fill). Used for the one still per
 * scene on the reduced-motion page; renders on the server, no script needed.
 */

const W = 1600;
const H = 900;
const UNIT = Math.min(W, H);

function Shape({ shape }: { shape: PlaceholderShape }) {
  const opacity = shape.alpha ?? 1;
  switch (shape.kind) {
    case "rect":
      return <rect x={shape.x * W} y={shape.y * H} width={shape.w * W} height={shape.h * H} fill={shape.fill} fillOpacity={opacity} />;
    case "circle":
      return <circle cx={shape.x * W} cy={shape.y * H} r={shape.r * UNIT} fill={shape.fill} fillOpacity={opacity} />;
    case "ellipse":
      return <ellipse cx={shape.x * W} cy={shape.y * H} rx={shape.rx * UNIT} ry={shape.ry * UNIT} fill={shape.fill} fillOpacity={opacity} />;
    case "poly":
      return <polygon points={shape.points.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill={shape.fill} fillOpacity={opacity} />;
    case "line":
      return (
        <line
          x1={shape.from[0] * W}
          y1={shape.from[1] * H}
          x2={shape.to[0] * W}
          y2={shape.to[1] * H}
          stroke={shape.stroke}
          strokeOpacity={opacity}
          strokeWidth={Math.max(1, shape.width * UNIT)}
          strokeLinecap="round"
        />
      );
  }
}

export function PlaceholderStill({ scene, className }: { scene: SceneId; className?: string }) {
  const plate = placeholderPlate(scene);
  const gradient = `still-ground-${scene}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={storyScenes[scene].still}
      className={cn("block h-auto w-full", className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={plate.ground[0]} />
          <stop offset="1" stopColor={plate.ground[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gradient})`} />
      {plate.shapes.map((shape, i) => (
        <Shape key={i} shape={shape} />
      ))}
    </svg>
  );
}
