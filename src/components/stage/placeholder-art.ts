import { seeded } from "@/lib/progress";
import type { SceneId } from "@/scroll/types";
import { colors } from "@/styles/tokens";

/**
 * Placeholder art: one tidy plate per scene, made of silhouettes and color fields from the palette,
 * until the painted plates exist. Each scene is a list of shapes in frame fractions (x and y from 0
 * to 1 of the width and height; radii as fractions of the shorter side), drawn by two renderers:
 * `drawPlaceholder` (a 2D canvas, the texture of the scene plate on the stage) and
 * `PlaceholderStill` (SVG, the still for each scene on the reduced-motion page).
 */

type Pt = readonly [number, number];

export type PlaceholderShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; alpha?: number }
  | { kind: "circle"; x: number; y: number; r: number; fill: string; alpha?: number }
  | { kind: "ellipse"; x: number; y: number; rx: number; ry: number; fill: string; alpha?: number }
  | { kind: "poly"; points: readonly Pt[]; fill: string; alpha?: number }
  | { kind: "line"; from: Pt; to: Pt; stroke: string; width: number; alpha?: number };

export interface PlaceholderPlate {
  /** Vertical background: top color, bottom color. */
  ground: readonly [string, string];
  shapes: readonly PlaceholderShape[];
}

const { sky, skySoft, milk, ink, orange, leaf, marble, white } = colors;

/* Building blocks */

/** A robed figure standing with its feet at (x, y); `s` is its height as a fraction of the frame. */
function figure(x: number, y: number, s: number, robe: string = marble): PlaceholderShape[] {
  const w = s * 0.32;
  return [
    { kind: "poly", points: [[x - w / 2, y], [x + w / 2, y], [x + w * 0.22, y - s * 0.78], [x - w * 0.22, y - s * 0.78]], fill: robe, alpha: 0.95 },
    { kind: "circle", x, y: y - s * 0.86, r: s * 0.09, fill: marble },
  ];
}

const fruit = (x: number, y: number, r: number): PlaceholderShape => ({ kind: "circle", x, y, r, fill: orange });

/** A cluster of leaves with a few oranges, seeded so it is the same on every render. */
function canopy(seed: string, x: number, y: number, rx: number, ry: number, count: number, fruits: number): PlaceholderShape[] {
  const rand = seeded(seed);
  const shapes: PlaceholderShape[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    shapes.push({ kind: "circle", x: x + Math.cos(a) * rx * d, y: y + Math.sin(a) * ry * d, r: 0.03 + rand() * 0.035, fill: leaf, alpha: 0.75 + rand() * 0.25 });
  }
  for (let i = 0; i < fruits; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.85;
    shapes.push(fruit(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 0.012 + rand() * 0.008));
  }
  return shapes;
}

function cloud(x: number, y: number, s: number, alpha = 0.85): PlaceholderShape[] {
  return [
    { kind: "ellipse", x, y, rx: s, ry: s * 0.38, fill: milk, alpha },
    { kind: "ellipse", x: x - s * 0.45, y: y + s * 0.06, rx: s * 0.55, ry: s * 0.3, fill: milk, alpha },
    { kind: "ellipse", x: x + s * 0.2, y: y - s * 0.18, rx: s * 0.5, ry: s * 0.34, fill: white, alpha: alpha * 0.9 },
  ];
}

/** A hand reaching in, with its robe sleeve trailing to (sx, sy). */
function hand(x: number, y: number, sx: number, sy: number, s = 0.05): PlaceholderShape[] {
  return [
    { kind: "line", from: [sx, sy], to: [x, y], stroke: white, width: s * 1.1, alpha: 0.9 },
    { kind: "ellipse", x, y, rx: s * 0.75, ry: s * 0.55, fill: marble },
  ];
}

function stars(seed: string, count: number, keepOut: (x: number, y: number) => boolean): PlaceholderShape[] {
  const rand = seeded(seed);
  const points: Pt[] = [];
  while (points.length < count) {
    const p: Pt = [rand(), rand() * 0.85];
    if (!keepOut(p[0], p[1])) points.push(p);
  }
  const shapes: PlaceholderShape[] = [];
  points.forEach((p, i) => {
    if (i % 4 === 0 && i + 1 < points.length) shapes.push({ kind: "line", from: p, to: points[i + 1], stroke: white, width: 0.0016, alpha: 0.35 });
  });
  points.forEach((p) => shapes.push({ kind: "circle", x: p[0], y: p[1], r: 0.003 + rand() * 0.004, fill: white, alpha: 0.6 + rand() * 0.4 }));
  return shapes;
}

/* Scenes */

const SKY: readonly [string, string] = [sky, skySoft];

function heroPlate(): PlaceholderPlate {
  const rand = seeded("hero-droplets");
  const droplets: PlaceholderShape[] = Array.from({ length: 28 }, () => {
    const a = rand() * Math.PI * 2;
    const d = 0.06 + rand() * 0.3;
    return { kind: "circle", x: 0.741 + Math.cos(a) * d * 0.9, y: 0.09 + Math.sin(a) * d * 0.6, r: 0.003 + rand() * 0.004, fill: white, alpha: 0.35 + rand() * 0.4 };
  });
  return {
    ground: SKY,
    shapes: [
      { kind: "circle", x: 0.741, y: 0.085, r: 0.16, fill: orange, alpha: 0.12 },
      { kind: "circle", x: 0.741, y: 0.085, r: 0.08, fill: orange, alpha: 0.22 },
      ...droplets,
      { kind: "rect", x: 0.7, y: 0.33, w: 0.05, h: 0.67, fill: marble, alpha: 0.92 },
      { kind: "rect", x: 0.688, y: 0.41, w: 0.074, h: 0.016, fill: marble },
      ...figure(0.725, 0.33, 0.15),
      { kind: "line", from: [0.733, 0.215], to: [0.741, 0.11], stroke: marble, width: 0.012 },
      fruit(0.741, 0.085, 0.024),
      ...[0.58, 0.64, 0.7, 0.77, 0.83, 0.89].flatMap((x, i) => figure(x, 0.97, 0.13 + (i % 3) * 0.02)),
    ],
  };
}

function ascentPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      { kind: "rect", x: 0.6, y: 0.62, w: 0.07, h: 0.38, fill: marble, alpha: 0.9 },
      { kind: "poly", points: [[0.6, 0.62], [0.67, 0.62], [0.655, 0.05], [0.615, 0.05]], fill: ink, alpha: 0.55 },
      { kind: "line", from: [0.63, 0.42], to: [0.42, 0.24], stroke: ink, width: 0.016, alpha: 0.55 },
      { kind: "line", from: [0.645, 0.3], to: [0.84, 0.16], stroke: ink, width: 0.014, alpha: 0.55 },
      ...canopy("ascent-a", 0.42, 0.22, 0.12, 0.09, 18, 0),
      ...canopy("ascent-b", 0.84, 0.15, 0.1, 0.08, 16, 0),
      ...canopy("ascent-c", 0.635, 0.06, 0.09, 0.07, 14, 0),
    ],
  };
}

function graftPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      { kind: "poly", points: [[0, 0.6], [1, 0.4], [1, 0.47], [0, 0.68]], fill: ink, alpha: 0.6 },
      ...canopy("graft-leaves", 0.85, 0.36, 0.14, 0.08, 14, 0),
      { kind: "line", from: [0.5, 0.52], to: [0.56, 0.3], stroke: ink, width: 0.012, alpha: 0.55 },
      { kind: "circle", x: 0.565, y: 0.28, r: 0.025, fill: leaf },
      { kind: "rect", x: 0.485, y: 0.48, w: 0.03, h: 0.05, fill: marble, alpha: 0.85 },
      ...hand(0.42, 0.56, 0.2, 1.05, 0.06),
      ...hand(0.6, 0.47, 0.85, 1.05, 0.06),
    ],
  };
}

function pluckPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...canopy("pluck-a", 0.2, 0.25, 0.22, 0.2, 40, 8),
      ...canopy("pluck-b", 0.8, 0.22, 0.22, 0.2, 40, 8),
      ...canopy("pluck-c", 0.5, 0.1, 0.25, 0.1, 26, 5),
      fruit(0.5, 0.42, 0.04),
      ...hand(0.5, 0.52, 0.5, 1.05, 0.06),
    ],
  };
}

function sharePlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...hand(0.44, 0.6, 0.2, 1.05, 0.06),
      ...hand(0.57, 0.6, 0.8, 1.05, 0.06),
      fruit(0.44, 0.5, 0.09),
      fruit(0.57, 0.5, 0.09),
      { kind: "circle", x: 0.455, y: 0.5, r: 0.07, fill: white, alpha: 0.35 },
      { kind: "circle", x: 0.555, y: 0.5, r: 0.07, fill: white, alpha: 0.35 },
      { kind: "line", from: [0.505, 0.24], to: [0.505, 0.36], stroke: marble, width: 0.006 },
    ],
  };
}

function workPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...cloud(0.18, 0.2, 0.12),
      ...cloud(0.55, 0.12, 0.09, 0.7),
      ...cloud(0.85, 0.32, 0.14),
      ...cloud(0.4, 0.82, 0.16, 0.75),
      { kind: "rect", x: 0.255, y: 0.56, w: 0.06, h: 0.44, fill: marble, alpha: 0.92 },
      fruit(0.285, 0.43, 0.14),
      ...figure(0.36, 0.62, 0.12, white),
    ],
  };
}

function blueprintPlate(): PlaceholderPlate {
  const scaffold: PlaceholderShape[] = [];
  for (const x of [0.4, 0.45, 0.55, 0.6]) scaffold.push({ kind: "line", from: [x, 0.28], to: [x, 1], stroke: ink, width: 0.006, alpha: 0.5 });
  for (const y of [0.38, 0.55, 0.72, 0.89]) scaffold.push({ kind: "line", from: [0.38, y], to: [0.62, y], stroke: ink, width: 0.008, alpha: 0.5 });
  return {
    ground: SKY,
    shapes: [
      { kind: "rect", x: 0.47, y: 0.26, w: 0.06, h: 0.74, fill: marble, alpha: 0.85 },
      ...scaffold,
      ...figure(0.6, 0.55, 0.13, white),
      { kind: "rect", x: 0.63, y: 0.45, w: 0.05, h: 0.06, fill: marble },
      { kind: "rect", x: 0.68, y: 0.45, w: 0.05, h: 0.06, fill: milk, alpha: 0.85 },
      ...figure(0.43, 0.72, 0.12),
    ],
  };
}

function sitePlate(): PlaceholderPlate {
  const tiles: PlaceholderShape[] = [];
  for (let col = 0; col < 10; col++)
    for (let row = 0; row < 10; row++)
      tiles.push({ kind: "rect", x: col * 0.05, y: row * 0.1, w: 0.048, h: 0.096, fill: (col + row) % 2 ? marble : skySoft, alpha: (col + row) % 2 ? 0.9 : 0.35 });
  return {
    ground: [milk, milk],
    shapes: [
      ...tiles,
      { kind: "circle", x: 0.25, y: 0.5, r: 0.22, fill: marble },
      { kind: "rect", x: 0.13, y: 0.36, w: 0.24, h: 0.28, fill: ink, alpha: 0.25 },
      fruit(0.25, 0.5, 0.11),
      ...[[0.13, 0.42], [0.36, 0.44], [0.2, 0.66]].map(([x, y]) => ({ kind: "circle" as const, x, y, r: 0.018, fill: ink, alpha: 0.6 })),
      { kind: "rect", x: 0.5, y: 0, w: 0.5, h: 1, fill: milk },
      { kind: "ellipse", x: 0.72, y: 0.35, rx: 0.16, ry: 0.07, fill: leaf, alpha: 0.06 },
      { kind: "ellipse", x: 0.86, y: 0.7, rx: 0.12, ry: 0.06, fill: leaf, alpha: 0.05 },
    ],
  };
}

function prunePlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      { kind: "rect", x: 0.47, y: 0.46, w: 0.06, h: 0.54, fill: marble, alpha: 0.92 },
      { kind: "poly", points: [[0.445, 0.46], [0.555, 0.46], [0.54, 0.39], [0.46, 0.39]], fill: marble },
      { kind: "line", from: [0.5, 0.39], to: [0.5, 0.27], stroke: ink, width: 0.008, alpha: 0.6 },
      ...canopy("prune-tree", 0.5, 0.22, 0.09, 0.07, 18, 4),
      ...figure(0.585, 0.46, 0.14),
    ],
  };
}

function fallPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...canopy("fall-left", 0.08, 0.45, 0.16, 0.45, 50, 12),
      ...canopy("fall-right", 0.92, 0.45, 0.16, 0.45, 50, 12),
      { kind: "line", from: [0.5, 0.28], to: [0.5, 0.48], stroke: white, width: 0.01, alpha: 0.18 },
      fruit(0.5, 0.55, 0.05),
      { kind: "line", from: [0.56, 0.24], to: [0.62, 0.3], stroke: ink, width: 0.008, alpha: 0.55 },
    ],
  };
}

function faqPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...canopy("faq-left-far", 0.18, 0.4, 0.12, 0.3, 30, 10),
      ...canopy("faq-right-far", 0.82, 0.4, 0.12, 0.3, 30, 10),
      ...canopy("faq-left", 0.04, 0.5, 0.14, 0.5, 46, 14),
      ...canopy("faq-right", 0.96, 0.5, 0.14, 0.5, 46, 14),
    ],
  };
}

function starsPlate(): PlaceholderPlate {
  return {
    ground: [ink, sky],
    shapes: [
      { kind: "rect", x: 0, y: 0, w: 1, h: 1, fill: sky, alpha: 0.55 },
      ...stars("stars-sky", 90, (x, y) => x > 0.6 && y > 0.55),
      ...cloud(0.8, 0.82, 0.14, 0.7),
      ...cloud(0.94, 0.68, 0.1, 0.6),
      { kind: "rect", x: 0.05, y: 0.42, w: 0.26, h: 0.035, fill: marble },
      ...[0, 1, 2, 3].map((i) => ({ kind: "rect" as const, x: 0.07 + i * 0.03, y: 0.455 + i * 0.07, w: 0.22 - i * 0.04 + i * 0.05, h: 0.07, fill: marble, alpha: 0.85 - i * 0.12 })),
      ...figure(0.17, 0.42, 0.16, white),
      { kind: "line", from: [0.185, 0.32], to: [0.24, 0.22], stroke: marble, width: 0.01 },
    ],
  };
}

function applyPlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      { kind: "circle", x: 0.72, y: 0.52, r: 0.36, fill: skySoft, alpha: 0.28 },
      { kind: "circle", x: 0.72, y: 0.52, r: 0.2, fill: white, alpha: 0.1 },
      ...cloud(0.2, 0.9, 0.18, 0.6),
      ...cloud(0.6, 0.96, 0.2, 0.55),
    ],
  };
}

function finalePlate(): PlaceholderPlate {
  return {
    ground: SKY,
    shapes: [
      ...cloud(0.15, 0.16, 0.1, 0.7),
      ...cloud(0.82, 0.12, 0.12, 0.7),
      { kind: "rect", x: 0.485, y: 0.5, w: 0.03, h: 0.5, fill: ink, alpha: 0.6 },
      ...canopy("finale-tree", 0.5, 0.36, 0.2, 0.18, 46, 12),
      ...figure(0.31, 0.98, 0.3),
      { kind: "rect", x: 0.34, y: 0.78, w: 0.04, h: 0.03, fill: marble },
      { kind: "line", from: [0.38, 0.79], to: [0.42, 0.74], stroke: white, width: 0.003, alpha: 0.6 },
      ...figure(0.69, 0.98, 0.3),
      { kind: "line", from: [0.66, 0.74], to: [0.62, 0.68], stroke: ink, width: 0.005, alpha: 0.7 },
      { kind: "line", from: [0.67, 0.75], to: [0.63, 0.7], stroke: ink, width: 0.005, alpha: 0.7 },
    ],
  };
}

const BUILDERS: Record<SceneId, () => PlaceholderPlate> = {
  hero: heroPlate,
  ascent: ascentPlate,
  graft: graftPlate,
  pluck: pluckPlate,
  share: sharePlate,
  work: workPlate,
  blueprint: blueprintPlate,
  site: sitePlate,
  prune: prunePlate,
  fall: fallPlate,
  faq: faqPlate,
  stars: starsPlate,
  apply: applyPlate,
  finale: finalePlate,
};

const cache = new Map<SceneId, PlaceholderPlate>();

/** The placeholder plate of a scene (built once). */
export function placeholderPlate(id: SceneId): PlaceholderPlate {
  let plate = cache.get(id);
  if (!plate) {
    plate = BUILDERS[id]();
    cache.set(id, plate);
  }
  return plate;
}

/* Canvas renderer */

export interface PlateLabel {
  number: string;
  name: string;
  meta: string;
  /** The page's mono family (`--font-mono`). */
  monoFont: string;
}

/**
 * Draws a scene's placeholder plate into a 2D canvas, with its label as one small line in the strip
 * along the bottom edge: below the bottom text slot and clear of the percent counter, so it never
 * sits under a beat.
 */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, id: SceneId, width: number, height: number, label?: PlateLabel) {
  const plate = placeholderPlate(id);
  const unit = Math.min(width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, plate.ground[0]);
  gradient.addColorStop(1, plate.ground[1]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (const shape of plate.shapes) {
    ctx.globalAlpha = shape.alpha ?? 1;
    if (shape.kind === "line") {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = Math.max(1, shape.width * unit);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(shape.from[0] * width, shape.from[1] * height);
      ctx.lineTo(shape.to[0] * width, shape.to[1] * height);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = shape.fill;
    ctx.beginPath();
    if (shape.kind === "rect") ctx.rect(shape.x * width, shape.y * height, shape.w * width, shape.h * height);
    else if (shape.kind === "circle") ctx.arc(shape.x * width, shape.y * height, shape.r * unit, 0, Math.PI * 2);
    else if (shape.kind === "ellipse") ctx.ellipse(shape.x * width, shape.y * height, shape.rx * unit, shape.ry * unit, 0, 0, Math.PI * 2);
    else {
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * width, y * height) : ctx.lineTo(x * width, y * height)));
      ctx.closePath();
    }
    ctx.fill();
  }

  if (label) {
    const dark = plate.ground[0] === milk;
    const text = `${label.number}  ·  ${label.name}  ·  ${label.meta}`.toUpperCase();
    // Fit the line inside the middle 56% of the width (the percent counter sits to the right).
    let size = Math.max(9, unit * 0.017);
    ctx.font = `500 ${Math.round(size)}px ${label.monoFont}`;
    const fit = (width * 0.56) / Math.max(1, ctx.measureText(text).width);
    if (fit < 1) {
      size = Math.max(6, size * fit);
      ctx.font = `500 ${Math.round(size)}px ${label.monoFont}`;
    }
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = dark ? ink : white;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height - Math.max(18, unit * 0.03));
  }
  ctx.globalAlpha = 1;
}
