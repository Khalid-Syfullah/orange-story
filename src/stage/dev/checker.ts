// The /stage-test pass: a labelled 16:9 (or any aspect) checkerboard drawn through cover(), with
// crosses at three painting points drawn in painting space and rings at uncover() of the same
// points drawn in screen space. If cover and uncover are exact inverses, every ring is centred on
// its cross at any viewport, pan and zoom. The DOM labels (StageTest.tsx) use the TypeScript
// uncover() and must land on the same spots.
import type { Framing, Point } from "@/content/art";
import type { PassDef } from "../gl/passes";

export const TEST_POINTS: readonly Point[] = [
  { x: 0.25, y: 0.25 },
  { x: 0.5, y: 0.5 },
  { x: 0.8, y: 0.7 },
];

export interface TestFraming extends Framing {
  /** Painting size; only the aspect matters. */
  size: [number, number];
}

const DEFAULT: TestFraming = { pan: { x: 0, y: 0 }, zoom: 1, size: [1920, 1080] };

let cachedSearch: string | null = null;
let cached: TestFraming = DEFAULT;

/** `?pan=0.1,-0.05&zoom=1.3&aspect=9:16` from the URL, cached per search string. */
export function readTestFraming(): TestFraming {
  if (typeof window === "undefined") return DEFAULT;
  const search = window.location.search;
  if (search === cachedSearch) return cached;
  const q = new URLSearchParams(search);
  const pan = (q.get("pan") ?? "0,0").split(",").map(Number);
  const zoom = Number.parseFloat(q.get("zoom") ?? "1");
  const aspect = (q.get("aspect") ?? "16:9").split(":").map(Number);
  cached = {
    pan: { x: Number.isFinite(pan[0]) ? pan[0] : 0, y: Number.isFinite(pan[1]) ? pan[1] : 0 },
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    size:
      aspect.length === 2 && aspect[0] > 0 && aspect[1] > 0 ? [aspect[0] * 120, aspect[1] * 120] : [1920, 1080],
  };
  cachedSearch = search;
  return cached;
}

const FRAG = /* glsl */ `
uniform vec2 uTexSize;
uniform vec2 uPan;
uniform float uZoom;
uniform vec2 uPtA, uPtB, uPtC;

// A cross in painting space, square on screen (x scaled by the painting's aspect).
float cross(vec2 puv, vec2 pt, float aspect) {
  vec2 d = abs(puv - pt) * vec2(aspect, 1.0);
  return max(step(d.x, 0.0025) * step(d.y, 0.045), step(d.y, 0.0025) * step(d.x, 0.045));
}

// A ring in aspect-corrected screen space around uncover(pt).
float ring(vec2 q, vec2 pt, float px) {
  vec2 s = aspectUV(uncover(pt, uTexSize, uPan, uZoom));
  return 1.0 - smoothstep(px * 1.5, px * 3.0, abs(length(q - s) - 0.03));
}

void main() {
  vec2 uv = screenUV();
  vec2 puv = cover(uv, uTexSize, uPan, uZoom);
  float aspect = uTexSize.x / uTexSize.y;
  vec3 col;
  if (puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) {
    col = vec3(0.85, 0.10, 0.60); // outside the painting: a cover fit should never show this
  } else {
    vec2 cell = floor(puv * vec2(16.0, 9.0));
    float chk = mod(cell.x + cell.y, 2.0);
    col = mix(vec3(0.30, 0.34, 0.40), vec3(0.86, 0.84, 0.80), chk);
    // Orientation tint: red grows to the right, green downward, so the top-left is the cool corner.
    col *= vec3(0.70 + 0.55 * puv.x, 0.70 + 0.55 * puv.y, 0.92);
    // Thirds in orange, border in ink.
    float gx = min(abs(puv.x - 1.0 / 3.0), abs(puv.x - 2.0 / 3.0));
    float gy = min(abs(puv.y - 1.0 / 3.0), abs(puv.y - 2.0 / 3.0));
    col = mix(col, uOrange, step(min(gx * aspect, gy), 0.003));
    float border = min(min(puv.x * aspect, (1.0 - puv.x) * aspect), min(puv.y, 1.0 - puv.y));
    col = mix(col, uInk, step(border, 0.008));
    // Crosses at the test points, in painting space.
    float c = cross(puv, uPtA, aspect) + cross(puv, uPtB, aspect) + cross(puv, uPtC, aspect);
    col = mix(col, uInk, clamp(c, 0.0, 1.0));
  }
  // Rings at uncover() of the same points, in screen space.
  vec2 q = aspectUV(uv);
  float px = 1.0 / uRes.y;
  float r = ring(q, uPtA, px) + ring(q, uPtB, px) + ring(q, uPtC, px);
  col = mix(col, uOrange, clamp(r, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export const checkerPass: PassDef = {
  id: "stage-test-checker",
  segments: "all",
  frag: FRAG,
  breathes: false,
  uniforms(_ctx, u) {
    const f = readTestFraming();
    u.set2f("uTexSize", f.size[0], f.size[1]);
    u.set2f("uPan", f.pan.x, f.pan.y);
    u.set1f("uZoom", f.zoom);
    u.set2f("uPtA", TEST_POINTS[0].x, TEST_POINTS[0].y);
    u.set2f("uPtB", TEST_POINTS[1].x, TEST_POINTS[1].y);
    u.set2f("uPtC", TEST_POINTS[2].x, TEST_POINTS[2].y);
  },
};

export const checkerPasses: readonly PassDef[] = [checkerPass];
