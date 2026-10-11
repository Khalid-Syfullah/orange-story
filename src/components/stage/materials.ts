import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  NoColorSpace,
  NormalBlending,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";

import { seeded } from "@/lib/progress";
import { colors, mixColors } from "@/styles/tokens";

import { LIFE } from "./life";
import { HALFTONE, RINGS } from "./paint";
import { RIG_MAX_FIGURES } from "./rig";

/**
 * The plate shaders. Every texture is sampled premultiplied (see `textures.ts`), every material
 * blends premultiplied and draws in painter's order (no depth test), so plates stack exactly as the
 * scene sorts them.
 *
 * - `PlateMaterial`: one painted plate with opacity, tint and blur (a small golden-angle ring of
 *   reads on a mip-biased texture: cheap depth of field), on the painted canvas: grain and
 *   craquelure in the plate's own UV space, and for figures the scene's colour grade, a sky rim on
 *   the shadow edge, a warm bounce from below and idle life (a subdivided mesh bent by the rig's
 *   weight texture, `rig.ts`, `life.ts`).
 * - `HalftoneMaterial`: the graphic layer over the painting: clouds, water and the hero's ripple
 *   rings as a dot grid at 45 degrees in plate space (`paint.ts`).
 * - `MorphMaterial`: two textures blended through a mask with a moving, soft edge (stone turning
 *   into bark), with an optional glow along the edge.
 * - `TwinkleMaterial`: instanced sprites that pulse on idle time and appear as `reveal` passes
 *   each one's threshold (stars, sparkles).
 * - `RippleMaterial`: instanced droplets of light that drift outward from a source, brightened by a
 *   slow ring wave (the hero's glow), drawn as crisp dots whose size carries their brightness. Their
 *   whole motion is computed in the vertex shader.
 *
 * Plates and morphs can also be cut to a screen-space circle (`revealMask`): the rainbow ring shows
 * the new scene inside it and the old one outside. Plates can also thin out of, or recede into the
 * sky's haze inside, a soft screen-space rectangle behind text (`clearInside`): the clouds parting
 * around the service cards, the foliage and fruit fading back behind a headline.
 *
 * The shared uniforms (`STAGE_UNIFORMS`) are one object for every material: the quality tier, the
 * grain and craquelure textures and the palette colours of the figure treatment. Setting one value
 * changes every plate at once.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Shared uniforms                                                     */
/* ------------------------------------------------------------------ */

/** A 1x1 texture of one grey value (data, not colour), standing in until the canvas textures load. */
function flatTexture(value: number): DataTexture {
  const texture = new DataTexture(new Uint8Array([value, value, value, 255]), 1, 1, RGBAFormat);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Linear colour from a palette colour (`Color.set` converts sRGB to the working space). */
const paletteColor = (hex: string) => new Color(hex);

/**
 * Uniforms every stage material shares (the same objects, so one write reaches them all):
 * - `quality`: the adaptive quality tier, 0 (lowest: plain soft paint, no canvas, rim or halftone)
 *   to 2 (`quality.ts`);
 * - `grainMap`, `crackMap`: the shared canvas textures (`hero/canvas-grain`, `hero/craquelure`),
 *   neutral until they load;
 * - the figure treatment's palette: the warm sun, the cool sky, the rim and the bounce.
 */
export const STAGE_UNIFORMS = {
  quality: { value: 2 },
  grainMap: { value: flatTexture(128) as Texture },
  crackMap: { value: flatTexture(0) as Texture },
  warmColor: { value: paletteColor(mixColors("milk", "orange", 0.35)) },
  coolColor: { value: paletteColor(colors.skySoft) },
  rimColor: { value: paletteColor(mixColors("skySoft", "white", 0.25)) },
  bounceColor: { value: paletteColor(mixColors("milk", "orange", 0.55)) },
};

/** The plan's paper: the milk of the story, a little toward the marble's cream. */
export const PAPER = mixColors("milk", "marble", 0.45);

/* ------------------------------------------------------------------ */
/* The plate: life in the vertex shader                                */
/* ------------------------------------------------------------------ */

const PLATE_VERTEX = /* glsl */ `
#define MAX_FIGURES ${RIG_MAX_FIGURES}
attribute vec2 figure;
uniform float lifeOn;
uniform sampler2D rigMap;
uniform float plateAspect;
uniform vec4 lifeA[MAX_FIGURES]; // breath (rise), head turn, sway, hem swing
uniform vec4 lifeB[MAX_FIGURES]; // feet xy, neck xy (q space)
uniform vec4 lifeC[MAX_FIGURES]; // hem phase
uniform vec4 armTurn;            // shoulder xy, angle, curl (a part's fingers: knuckles, turn, how far they close in)
varying vec2 vUv;
vec2 turnAbout(vec2 p, vec2 c, float a) {
  float s = sin(a);
  float k = cos(a);
  p -= c;
  return c + vec2(k * p.x - s * p.y, s * p.x + k * p.y);
}
void main() {
  vUv = uv;
  vec3 pos = position;
  if (lifeOn > 0.5) {
    // The rig's weights at this vertex: breath, hem, head, arm (rig.ts). The same bend as deformQ (life.ts).
    vec4 w = textureLod(rigMap, uv, 0.0);
    int i = int(figure.x + 0.5);
    float zone = figure.y;
    vec4 a = lifeA[i];
    vec4 b = lifeB[i];
    vec2 q = vec2(uv.x * plateAspect, uv.y);
    q = mix(q, turnAbout(q, armTurn.xy, armTurn.z), w.a);
    // A part's fingers curling closed, seen from the palm: they shorten in toward the knuckles.
    q = mix(q, armTurn.xy + (q - armTurn.xy) * (1.0 - armTurn.w), w.a);
    q = mix(q, turnAbout(q, b.zw, a.y * zone), w.b);
    q.y += a.x * w.r * zone;
    q.x += a.w * w.g * zone * sin(lifeC[i].x + uv.x * ${LIFE.hem.waves.toFixed(1)});
    q = turnAbout(q, b.xy, a.z * zone);
    pos.xy = vec2(q.x / plateAspect, q.y) - 0.5;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

/** Premultiplied linear color in, premultiplied output color (in the canvas color space) out. */
export const OUTPUT = /* glsl */ `
vec4 toOutput(vec4 color, float opacity) {
  vec3 straight = color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
  vec4 outColor = linearToOutputTexel(vec4(straight, color.a));
  return vec4(outColor.rgb * outColor.a, outColor.a) * opacity;
}
`;

/**
 * A screen-space circle that hides the plate outside it (or inside it): the rainbow ring revealing
 * the new scene. `revealCircle` is in drawing-buffer pixels (centre x, centre y from the bottom,
 * radius, soft half-width); `revealSide` is 0 (off), 1 (show inside) or -1 (show outside).
 */
const REVEAL = /* glsl */ `
uniform vec4 revealCircle;
uniform float revealSide;
float revealMask() {
  if (revealSide == 0.0) return 1.0;
  float d = distance(gl_FragCoord.xy, revealCircle.xy);
  float inside = 1.0 - smoothstep(revealCircle.z - revealCircle.w, revealCircle.z + revealCircle.w, d);
  return revealSide > 0.0 ? inside : 1.0 - inside;
}
`;

/**
 * A screen-space clearing behind text: a rectangle (`clearRect`, drawing-buffer pixels, left,
 * bottom, right, top) with a soft edge `clearSoft` pixels wide, at strength `clearAmount` (0 off).
 * Inside it the plate either thins out (`clearHaze` 0: the clouds part around the service cards) or
 * recedes into the haze, its color drawn toward `hazeColor` (`clearHaze` 1: foliage and fruit
 * behind a headline), so text never sits on a bright cloud or fruit.
 */
const CLEARING = /* glsl */ `
uniform vec4 clearRect;
uniform float clearSoft;
uniform float clearAmount;
uniform float clearHaze;
uniform vec3 hazeColor;
float clearInside() {
  if (clearAmount <= 0.0) return 0.0;
  vec2 center = (clearRect.xy + clearRect.zw) * 0.5;
  vec2 q = abs(gl_FragCoord.xy - center) - (clearRect.zw - clearRect.xy) * 0.5;
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return (1.0 - smoothstep(0.0, clearSoft, outside)) * clearAmount;
}
`;

/**
 * Paper under a drawing (the plan in the architect's hands, and the sheet of the paper unfold that
 * takes over from it): cream with a fibre (the shared canvas weave read finer) and a softly deckled
 * edge, the drawing laid over it. Linear premultiplied colour in and out. `paper` 0 leaves the plate as it is.
 */
export const PAPER_GLSL = /* glsl */ `
uniform float paper;
uniform vec3 paperColor;
vec4 onPaper(vec4 color, vec2 uv) {
  if (paper < 0.5) return color;
  vec2 e = min(uv, 1.0 - uv);
  float rag = texture2D(grainMap, uv * vec2(2.3, 3.1) + 0.37).r - 0.5;
  float sheet = smoothstep(0.0, 0.01, min(e.x, e.y) + 0.006 * rag);
  float fibre = texture2D(grainMap, uv * vec2(5.0, 7.5)).r - 0.5;
  vec4 back = vec4(paperColor * (1.0 + 0.06 * fibre) * sheet, sheet);
  return color + back * (1.0 - color.a);
}
`;

/**
 * A plate that fills in (`grow`: how far, negative when off; the point it spreads from, in uv; the soft
 * edge, negative when it closes in on the point from the edges instead): it spreads out from its point
 * clump by clump (a value noise read at two sizes), so each part is either there or not but for a soft
 * edge, never the whole picture faded half through. The fruiting tree round the graft, the finale's
 * clouds blown in (in the halftone, the dots grow at the edge).
 */
const GROW = /* glsl */ `
uniform vec4 grow;
float growHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float growNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(growHash(i), growHash(i + vec2(1.0, 0.0)), f.x), mix(growHash(i + vec2(0.0, 1.0)), growHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float growKeep(vec2 uv) {
  if (grow.x < 0.0) return 1.0;
  float soft = abs(grow.w);
  float far = length(max(grow.yz, 1.0 - grow.yz));
  float reach = clamp(length(uv - grow.yz) / far, 0.0, 1.0);
  if (grow.w < 0.0) reach = 1.0 - reach;
  float clumps = 0.65 * growNoise(uv * 7.0) + 0.35 * growNoise(uv * 19.0 + 3.7);
  float threshold = 0.5 * reach + 0.5 * clumps;
  float amount = grow.x * (1.0 + 2.0 * soft) - soft;
  return smoothstep(threshold - soft, threshold + soft, amount);
}
`;

/** The blurred read of a plate's map (depth of field), shared by the plate and the halftone. */
const SAMPLE_MAP = /* glsl */ `
vec4 sampleMap(vec2 uv) {
  if (blurRadius.x <= 0.0 && blurRadius.y <= 0.0) return texture2D(map, uv);
  vec4 sum = texture2D(map, uv, blurBias) * 2.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 8.0);
    float a = fi * 2.39996323;
    sum += texture2D(map, uv + vec2(cos(a), sin(a)) * r * blurRadius, blurBias);
  }
  return sum / 10.0;
}
`;

/** Clearing and output, the same for every plate-like material. */
const FINISH = /* glsl */ `
void finish(vec4 color) {
  float cleared = clearInside();
  gl_FragColor = toOutput(color, opacity * revealMask() * (1.0 - cleared * (1.0 - clearHaze)));
  if (cleared * clearHaze > 0.0) {
    // The haze mixes in the display's color space, as paint (and the browser's own compositing)
    // would: fruit receding into the blue goes dusky, not violet as a mix in linear light does.
    vec3 haze = linearToOutputTexel(vec4(hazeColor, 1.0)).rgb;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, haze * gl_FragColor.a, cleared * clearHaze);
  }
  if (gl_FragColor.a < 0.002) discard;
}
`;

const LUMA = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvTransform;
uniform float opacity;
uniform vec3 tint;
uniform float tintAmount;
uniform vec2 blurRadius;
uniform float blurBias;
// The painted canvas (paint.ts): grain and craquelure in the plate's own UV space.
uniform float quality;
uniform sampler2D grainMap;
uniform sampler2D crackMap;
uniform vec4 canvasRepeat;
uniform float grainAmount;
uniform float crackAmount;
// The figure treatment: the scene grade, the sky rim on the shadow edge, the warm bounce from below.
uniform float figureOn;
uniform vec3 grade;
uniform vec3 warmColor;
uniform vec3 coolColor;
uniform vec3 rimColor;
uniform vec3 bounceColor;
uniform vec2 rimStep;
uniform float rimAmount;
uniform vec4 rimJoint; // a part's joint (uv), the radius around it with no rim (plate heights), the plate's aspect
uniform vec3 bounce; // amount, the ground's height in uv, how high it reaches
// Where the painting is cut by its image's edge (a sleeve): the widths (uv) it fades out over toward the left, bottom, right and top edges.
uniform vec4 cutFade;
// Only part of the plate (the fingers drawn again in front of what they hold): a soft window in uv, left, bottom, right, top; off when empty.
uniform vec4 crop;
uniform float cropSoft;
// The back of a plate turned away on its hinge (a fold panel seen from behind): its colour, and how far toward it (0: the painting shows through, mirrored).
uniform vec4 backTint;
varying vec2 vUv;
${OUTPUT}
${REVEAL}
${CLEARING}
${LUMA}
${SAMPLE_MAP}
${FINISH}
${PAPER_GLSL}
${GROW}
// gradeColor in paint.ts: warm highlights, cool shadows, a saturation trim.
vec3 gradeColor(vec3 c) {
  float l = luma(c);
  float hi = smoothstep(0.3, 0.85, l);
  float lo = 1.0 - smoothstep(0.05, 0.45, l);
  c = mix(c, c * (warmColor / max(1e-4, luma(warmColor))), grade.x * hi);
  c = mix(c, c * (coolColor / max(1e-4, luma(coolColor))), grade.y * lo);
  float l2 = luma(c);
  return mix(vec3(l2), c, 1.0 + grade.z);
}
// How much of the plate shows at vUv: all of it, but for its cut edges (faded), outside its crop window and where it has not filled in yet.
float plateKeep() {
  float keep = 1.0;
  if (cutFade.x > 0.0) keep *= smoothstep(0.0, cutFade.x, vUv.x);
  if (cutFade.y > 0.0) keep *= smoothstep(0.0, cutFade.y, vUv.y);
  if (cutFade.z > 0.0) keep *= smoothstep(0.0, cutFade.z, 1.0 - vUv.x);
  if (cutFade.w > 0.0) keep *= smoothstep(0.0, cutFade.w, 1.0 - vUv.y);
  if (crop.z > crop.x) {
    vec2 inside = smoothstep(crop.xy - cropSoft, crop.xy + cropSoft, vUv) * (1.0 - smoothstep(crop.zw - cropSoft, crop.zw + cropSoft, vUv));
    keep *= inside.x * inside.y;
  }
  return keep * growKeep(vUv);
}
void main() {
  vec2 uv = vUv * uvTransform.xy + uvTransform.zw;
  vec4 color = onPaper(sampleMap(uv), vUv) * plateKeep();
  if (color.a > 0.0 && (figureOn > 0.5 || (quality > 1.5 && grainAmount + crackAmount > 0.0))) {
    vec3 c = color.rgb / color.a;
    if (figureOn > 0.5) {
      c = gradeColor(c);
      if (quality > 0.5) {
        // Only on the paint itself, not on the soft matte around it (its colour is the cut-out's, not the figure's).
        float body = smoothstep(0.6, 0.95, color.a);
        // The sky wraps the shadow edge: where the alpha falls away toward the shadow side (read as soft
        // as the paint itself is drawn, so a blurred plate gets no rim outside its blurred edge). Not
        // where a part meets its body (rimJoint: the cut at a neck or a shoulder is not an edge).
        float ahead = 0.5 * (texture2D(map, uv + rimStep, blurBias).a + texture2D(map, uv + rimStep * 2.2, blurBias).a);
        float joint = rimJoint.z > 0.0 ? smoothstep(rimJoint.z, rimJoint.z * 1.8, length((vUv - rimJoint.xy) * vec2(rimJoint.w, 1.0))) : 1.0;
        float edge = clamp((color.a - ahead) * 1.6, 0.0, 1.0) * body * joint;
        c = 1.0 - (1.0 - c) * (1.0 - rimColor * (edge * rimAmount));
        // Warm light bounced up from the ground, on the lower part of a standing figure, in its darks.
        float low = 1.0 - smoothstep(bounce.y, bounce.y + bounce.z, vUv.y);
        c += bounceColor * (bounce.x * low * body * (1.0 - smoothstep(0.1, 0.8, luma(c))));
      }
    }
    if (quality > 1.5) {
      if (grainAmount > 0.0) c *= 1.0 + (texture2D(grainMap, vUv * canvasRepeat.xy).r - 0.5) * 2.0 * grainAmount;
      if (crackAmount > 0.0) c *= 1.0 - texture2D(crackMap, vUv * canvasRepeat.zw).r * crackAmount;
    }
    color.rgb = c * color.a;
  }
  if (!gl_FrontFacing) color.rgb = mix(color.rgb, backTint.rgb * color.a, backTint.a);
  color.rgb = mix(color.rgb, tint * color.a, tintAmount);
  finish(color);
}
`;

/* ------------------------------------------------------------------ */
/* The halftone layer                                                  */
/* ------------------------------------------------------------------ */

/** The dot of a halftone cell (`halftoneCoverage` in paint.ts). */
export const HALFTONE_DOT = /* glsl */ `
float halftoneTone(float t) { return smoothstep(${HALFTONE.low.toFixed(3)}, ${HALFTONE.high.toFixed(3)}, t); }
float halftoneDot(vec2 cell, float tone, float aa) {
  float r = 0.70710678 * sqrt(halftoneTone(tone));
  if (r <= 0.0) return 0.0;
  float d = length(fract(cell) - 0.5);
  return 1.0 - smoothstep(r - aa, r + aa, d);
}
`;

/** The ripple rings' tone (`ringTone` in paint.ts). */
const RING_TONE = /* glsl */ `
float ringTone(float r, float t, float reach) {
  float tone = 0.0;
  for (int k = 0; k < ${RINGS.count}; k++) {
    float life = fract(float(k) / ${RINGS.count.toFixed(1)} + t * ${RINGS.speed});
    float radius = ${RINGS.start} + reach * pow(life, 0.62);
    float born = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.35, 1.0, life));
    float d = (r - radius) / (${RINGS.width} * (0.6 + life));
    tone = max(tone, exp(-d * d) * born);
  }
  return tone;
}
`;

const HALFTONE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvTransform;
uniform float opacity;
uniform vec2 blurRadius;
uniform float blurBias;
uniform float quality;
uniform float dots;      // 1: the dots; toward 0, the soft painted version (a cloud out of focus near the lens)
uniform float mode;      // 0: cloud, 1: water, 2: ripple rings
uniform vec2 cells;      // dot cells across and down the plate
uniform vec3 litColor;
uniform vec3 shadeColor;
uniform vec3 dotColor;
// The rings: ripple time, reach and lift, the plane's world size, and where the left of the stage calms.
uniform float time;
uniform float reach;
uniform float lift;
uniform vec2 ringSize;
uniform vec2 calm;       // world x offsets (from the source) where the rings are gone, and full
varying vec2 vUv;
${OUTPUT}
${REVEAL}
${CLEARING}
${LUMA}
${SAMPLE_MAP}
${FINISH}
${GROW}
${HALFTONE_DOT}
${RING_TONE}
void main() {
  // The dot grid lives in plate space, at 45 degrees: it moves with the art, the same size on any screen.
  vec2 g = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678) * (vUv * cells);
  float perPixel = length(fwidth(g));
  float aa = clamp(perPixel * 0.75, 0.01, 0.5);
  // Cells too small to draw cleanly give way to the plain soft version, as does the lowest quality tier.
  float lod = quality > 0.5 ? smoothstep(${HALFTONE.minCellPx.toFixed(2)}, ${HALFTONE.fullCellPx.toFixed(2)}, 1.0 / max(perPixel, 1e-4)) * dots : 0.0;
  vec4 color;
  if (mode < 1.5) {
    vec4 soft = sampleMap(vUv * uvTransform.xy + uvTransform.zw) * growKeep(vUv);
    color = soft;
    if (lod > 0.0 && soft.a > 0.001) {
      vec3 c = soft.rgb / soft.a;
      float lum = luma(linearToOutputTexel(vec4(c, 1.0)).rgb);
      vec4 dots;
      if (mode < 0.5) {
        // A cloud: the soft edge breaks into dots (toned as the paint there); inside, the shadow side is
        // dots of the cool shade on the lit body, dense where it is darkest. One grid for both.
        float solid = smoothstep(0.8, 0.98, soft.a);
        float body = mix(halftoneDot(g, soft.a, aa), 1.0, solid);
        float tone = smoothstep(0.93, 0.5, lum);
        float shade = halftoneDot(g, tone, aa) * solid;
        vec3 rim = mix(litColor, shadeColor, tone * 0.6);
        dots = vec4(mix(mix(rim, litColor, solid), shadeColor, shade) * body, body);
      } else {
        // Water: light dots where the stream is, over a faint wash of it.
        float d = halftoneDot(g, soft.a * smoothstep(0.15, 0.9, lum), aa);
        dots = vec4(dotColor * d, d) + soft * 0.2;
      }
      color = mix(soft, dots, lod);
    }
  } else {
    // Rings of dots spreading from the orange (the glow's ripple), calming toward the words on the left.
    vec2 p = (vUv - 0.5) * ringSize;
    float tone = ringTone(length(p), time, reach) * smoothstep(calm.x, calm.y, p.x) * (0.75 + 0.25 * lift);
    float d = mix(tone * 0.16, halftoneDot(g, tone * 0.42, aa), lod) * 0.75;
    vec3 c = mix(dotColor, vec3(1.0), lift * 0.6);
    color = vec4(c * d, d);
  }
  finish(color);
}
`;

/**
 * The water of the finale's jug: a stream (a ribbon along its parabola, `stream` = across -1..1,
 * along, how much water) and the drops it breaks into (instanced quads, `drop` = how much water). In
 * the halftone of the painted water: light dots where the water is, on a faint wash of it, the dot
 * grid in world space at 45 degrees so it stays put as the water runs through it.
 */
const WATER_VERTEX = /* glsl */ `
attribute vec3 stream;
#ifdef DROPS
attribute float drop;
#endif
varying vec3 vStream;
varying vec2 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  #ifdef DROPS
  vStream = vec3(0.0, 0.0, drop);
  #else
  vStream = stream;
  #endif
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WATER_FRAGMENT = /* glsl */ `
uniform float opacity;
uniform float time;
uniform float quality;
uniform float cell;
uniform vec3 dotColor;
varying vec3 vStream;
varying vec2 vWorld;
varying vec2 vUv;
${OUTPUT}
${REVEAL}
${CLEARING}
${FINISH}
${HALFTONE_DOT}
void main() {
  #ifdef DROPS
  // A drop: round, soft at its rim.
  float body = (1.0 - smoothstep(0.45, 1.0, length(vUv - 0.5) * 2.0)) * vStream.z;
  vec4 color = vec4(dotColor * body, body);
  #else
  // A rope of water: full along its middle, thinning to its edges, ripples running down it.
  float across = abs(vStream.x);
  float ripple = 0.8 + 0.2 * sin(vStream.y * 60.0 - time * 16.0 + vStream.x * 1.7);
  float body = (1.0 - smoothstep(0.5, 1.0, across)) * ripple * vStream.z;
  vec2 g = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678) * (vWorld / cell);
  float perPixel = length(fwidth(g));
  float aa = clamp(perPixel * 0.75, 0.01, 0.5);
  float lod = quality > 0.5 ? smoothstep(${HALFTONE.minCellPx.toFixed(2)}, ${HALFTONE.fullCellPx.toFixed(2)}, 1.0 / max(perPixel, 1e-4)) : 0.0;
  float d = halftoneDot(g, body, aa);
  vec4 soft = vec4(dotColor * body, body) * 0.7;
  vec4 color = mix(soft, vec4(dotColor * d, d) + soft * 0.4, lod);
  #endif
  finish(color);
}
`;

const MORPH_FRAGMENT = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform sampler2D mask;
uniform vec4 uvTransform;
uniform vec4 maskTransform;
uniform float progress;
uniform float softness;
uniform vec3 edgeColor;
uniform float edgeAmount;
uniform float opacity;
// The painted canvas, as on a plate.
uniform float quality;
uniform sampler2D grainMap;
uniform sampler2D crackMap;
uniform vec4 canvasRepeat;
uniform float grainAmount;
uniform float crackAmount;
varying vec2 vUv;
${OUTPUT}
${REVEAL}
void main() {
  vec2 uv = vUv * uvTransform.xy + uvTransform.zw;
  vec4 a = texture2D(mapA, uv);
  vec4 b = texture2D(mapB, uv);
  float m = texture2D(mask, vUv * maskTransform.xy + maskTransform.zw).r;
  // The edge sweeps the mask from 0 to 1: dark mask values turn first.
  float edge = mix(-softness, 1.0 + softness, progress);
  float keep = smoothstep(edge - softness, edge + softness, m);
  vec4 color = mix(b, a, keep);
  float band = 1.0 - abs(2.0 * keep - 1.0);
  color.rgb += edgeColor * (band * band * edgeAmount * color.a);
  if (quality > 1.5) {
    if (grainAmount > 0.0) color.rgb *= 1.0 + (texture2D(grainMap, vUv * canvasRepeat.xy).r - 0.5) * 2.0 * grainAmount;
    if (crackAmount > 0.0) color.rgb *= 1.0 - texture2D(crackMap, vUv * canvasRepeat.zw).r * crackAmount;
  }
  gl_FragColor = toOutput(color, opacity * revealMask());
  if (gl_FragColor.a < 0.002) discard;
}
`;

const TWINKLE_VERTEX = /* glsl */ `
attribute vec4 twinkle;
uniform float time;
uniform float reveal;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  // twinkle: phase (radians), speed (cycles per second), appear (reveal threshold), unused
  float shown = smoothstep(twinkle.z, twinkle.z + 0.06, reveal);
  float wave = 0.5 + 0.5 * sin(time * twinkle.y * 6.2831853 + twinkle.x);
  vAlpha = shown * mix(0.3, 1.0, wave * wave);
  vec4 local = vec4(position * shown * mix(0.72, 1.0, wave), 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`;

const TWINKLE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform vec3 tint;
uniform float tintAmount;
varying vec2 vUv;
varying float vAlpha;
${OUTPUT}
void main() {
  vec4 color = texture2D(map, vUv);
  color.rgb = mix(color.rgb, tint * color.a, tintAmount);
  gl_FragColor = toOutput(color, opacity * vAlpha);
  if (gl_FragColor.a < 0.002) discard;
}
`;

const RIPPLE_VERTEX = /* glsl */ `
attribute vec4 drop; // angle, ring (0 to 1), jitter (-1 to 1), size
uniform float time;
uniform vec2 source;
uniform float reach;
uniform float lift;
uniform vec2 sky;    // below the source: where the droplets are gone, and where they are full
uniform vec2 quiet;  // left of the source: where they are calmest, and where they are full
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv;
  // Droplets travel in rings: every droplet belongs to one of RINGS fronts, staggered in time, and
  // each front spreads from the source in step (a little jitter keeps it from looking drawn). The
  // droplets drift outward and a little upward ("rain in reverse") and are gone before the edge.
  const float RINGS = 8.0;
  float front = floor(drop.y * RINGS) / RINGS;
  float life = fract(front + drop.z * 0.008 + time * 0.045);
  float r = 0.45 + reach * pow(life, 0.62) + drop.z * 0.3;
  vec2 center = source + vec2(cos(drop.x), sin(drop.x)) * r + vec2(0.0, 0.6 * life);
  // A faint glimmer runs through each front as it spreads.
  float wave = 0.5 + 0.5 * cos(6.2831853 * (drop.x * 3.0 + time * 0.12) + drop.y * 40.0);
  float born = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.35, 1.0, life));
  float high = smoothstep(sky.x, sky.y, center.y - source.y);
  // Keep the middle of the sky behind the title calmer.
  float calm = mix(0.4, 1.0, smoothstep(quiet.x, quiet.y, center.x - source.x));
  vAlpha = born * high * calm * (0.45 + 0.55 * wave);
  float size = drop.w * (0.8 + 0.4 * wave) * (0.7 + 0.5 * sin(3.14159265 * life)) * (1.0 + 0.45 * lift);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position.xy * size, 0.0, 1.0);
}
`;

const RIPPLE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform float lift;
uniform float quality;
uniform vec3 dotColor;
varying vec2 vUv;
varying float vAlpha;
${OUTPUT}
void main() {
  if (quality > 0.5) {
    // A crisp dot of light whose size carries its brightness: the glow as a halftone.
    float d = length(vUv - 0.5);
    float r = 0.22 * sqrt(clamp(vAlpha, 0.0, 1.0));
    float aa = fwidth(d) * 0.8 + 0.002;
    float dotA = 1.0 - smoothstep(r - aa, r + aa, d);
    // The dots brighten toward white as the story starts to move.
    vec3 c = mix(dotColor, vec3(1.0), 0.35 + lift * 0.55);
    gl_FragColor = toOutput(vec4(c * dotA, dotA), opacity * 0.85);
  } else {
    vec4 color = texture2D(map, vUv);
    // The glow brightens toward white as the story starts to move.
    color.rgb = mix(color.rgb, vec3(color.a), lift * 0.7);
    gl_FragColor = toOutput(color, opacity * vAlpha);
  }
  if (gl_FragColor.a < 0.002) discard;
}
`;

const PAINTER = {
  transparent: true,
  premultipliedAlpha: true,
  depthTest: false,
  depthWrite: false,
  side: DoubleSide,
  toneMapped: false,
} as const;

/** Per-figure uniform arrays of the plate's life (one entry per person a plate can hold). */
const lifeArray = () => Array.from({ length: RIG_MAX_FIGURES }, () => new Vector4(0, 0, 0, 0));

/** No rig: life reads zero weights. */
let noRig: DataTexture | null = null;
function noRigTexture(): DataTexture {
  return (noRig ??= flatTexture(0));
}

export class PlateMaterial extends ShaderMaterial {
  constructor(map: Texture) {
    super({
      ...PAINTER,
      vertexShader: PLATE_VERTEX,
      fragmentShader: PLATE_FRAGMENT,
      uniforms: {
        map: { value: map },
        uvTransform: { value: new Vector4(1, 1, 0, 0) },
        opacity: { value: 1 },
        tint: { value: new Color(colors.white) },
        tintAmount: { value: 0 },
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        // The canvas (set per plate by `Plate`; off until then).
        canvasRepeat: { value: new Vector4(1, 1, 1, 1) },
        grainAmount: { value: 0 },
        crackAmount: { value: 0 },
        // The figure treatment.
        figureOn: { value: 0 },
        grade: { value: new Vector3(0, 0, 0) },
        rimStep: { value: new Vector2(0, 0) },
        rimAmount: { value: 0 },
        rimJoint: { value: new Vector4(0, 0, 0, 1) },
        bounce: { value: new Vector3(0, 0, 0) },
        // Cut edges (from the manifest's `paint.cut`) and the crop window (off).
        cutFade: { value: new Vector4(0, 0, 0, 0) },
        crop: { value: new Vector4(0, 0, 0, 0) },
        cropSoft: { value: 0.01 },
        // The back face (off).
        backTint: { value: new Vector4(1, 1, 1, 0) },
        // Paper under the drawing (off).
        paper: { value: 0 },
        paperColor: { value: paletteColor(PAPER) },
        // Filling in (off).
        ...growUniforms(),
        // Life.
        lifeOn: { value: 0 },
        rigMap: { value: noRigTexture() },
        plateAspect: { value: 1 },
        lifeA: { value: lifeArray() },
        lifeB: { value: lifeArray() },
        lifeC: { value: lifeArray() },
        armTurn: { value: new Vector4(0, 0, 0, 0) },
        ...STAGE_UNIFORMS,
        ...revealUniforms(),
        ...clearingUniforms(),
      },
    });
  }
}

/** What a halftone plate is: a cloud, water, or the hero's ripple rings (procedural, no texture of its own). */
export type HalftoneMode = "cloud" | "water" | "rings";

const HALFTONE_MODES: Record<HalftoneMode, number> = { cloud: 0, water: 1, rings: 2 };

export class HalftoneMaterial extends ShaderMaterial {
  constructor(map: Texture, mode: HalftoneMode) {
    super({
      ...PAINTER,
      vertexShader: VERTEX,
      fragmentShader: HALFTONE_FRAGMENT,
      uniforms: {
        map: { value: map },
        uvTransform: { value: new Vector4(1, 1, 0, 0) },
        opacity: { value: 1 },
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        mode: { value: HALFTONE_MODES[mode] },
        dots: { value: 1 },
        cells: { value: new Vector2(1, 1) },
        // The story's palette: a milk-white body, the cool sky in the shadow dots, warm light for water and rings.
        litColor: { value: paletteColor(mixColors("milk", "white", 0.5)) },
        shadeColor: { value: paletteColor(mixColors("skySoft", "sky", 0.25)) },
        dotColor: { value: paletteColor(mode === "rings" ? mixColors("white", "orange", 0.3) : mixColors("white", "skySoft", 0.2)) },
        time: { value: 0 },
        reach: { value: 7 },
        lift: { value: 0 },
        ringSize: { value: new Vector2(1, 1) },
        calm: { value: new Vector2(-1, 0) },
        quality: STAGE_UNIFORMS.quality,
        ...growUniforms(),
        ...revealUniforms(),
        ...clearingUniforms(),
      },
    });
  }
}

/** Uniforms of filling in (off by default). */
function growUniforms() {
  return { grow: { value: new Vector4(-1, 0.5, 0.5, 0.05) } };
}

/** Uniforms of the reveal circle (off by default). */
function revealUniforms() {
  return { revealCircle: { value: new Vector4(0, 0, 0, 1) }, revealSide: { value: 0 } };
}

/** Uniforms of the clearing (off by default). */
function clearingUniforms() {
  return {
    clearRect: { value: new Vector4(0, 0, 0, 0) },
    clearSoft: { value: 1 },
    clearAmount: { value: 0 },
    clearHaze: { value: 0 },
    hazeColor: { value: new Color(colors.white) },
  };
}

export class MorphMaterial extends ShaderMaterial {
  constructor(mapA: Texture, mapB: Texture, mask: Texture) {
    super({
      ...PAINTER,
      vertexShader: VERTEX,
      fragmentShader: MORPH_FRAGMENT,
      uniforms: {
        mapA: { value: mapA },
        mapB: { value: mapB },
        mask: { value: mask },
        uvTransform: { value: new Vector4(1, 1, 0, 0) },
        maskTransform: { value: new Vector4(1, 1, 0, 0) },
        progress: { value: 0 },
        softness: { value: 0.08 },
        edgeColor: { value: new Color(colors.white) },
        edgeAmount: { value: 0 },
        opacity: { value: 1 },
        // Shared with the plate frame (unused by the morph, kept so one updater fits both).
        blurRadius: { value: new Vector2(0, 0) },
        blurBias: { value: 0 },
        canvasRepeat: { value: new Vector4(1, 1, 1, 1) },
        grainAmount: { value: 0 },
        crackAmount: { value: 0 },
        quality: STAGE_UNIFORMS.quality,
        grainMap: STAGE_UNIFORMS.grainMap,
        crackMap: STAGE_UNIFORMS.crackMap,
        ...revealUniforms(),
      },
    });
  }
}

/** The finale's water: its stream (a ribbon) or, with `drops`, the drops it breaks into (instanced). */
export class WaterMaterial extends ShaderMaterial {
  constructor(drops = false) {
    super({
      ...PAINTER,
      defines: drops ? { DROPS: "" } : {},
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      uniforms: {
        opacity: { value: 1 },
        time: { value: 0 },
        cell: { value: HALFTONE.waterCell },
        dotColor: { value: paletteColor(mixColors("white", "skySoft", 0.2)) },
        quality: STAGE_UNIFORMS.quality,
        ...revealUniforms(),
        ...clearingUniforms(),
      },
    });
  }
}

export class TwinkleMaterial extends ShaderMaterial {
  constructor(map: Texture, additive = false) {
    super({
      ...PAINTER,
      blending: additive ? AdditiveBlending : NormalBlending,
      vertexShader: TWINKLE_VERTEX,
      fragmentShader: TWINKLE_FRAGMENT,
      uniforms: {
        map: { value: map },
        time: { value: 0 },
        reveal: { value: 1 },
        opacity: { value: 1 },
        tint: { value: new Color(colors.white) },
        tintAmount: { value: 0 },
      },
    });
  }
}

export class RippleMaterial extends ShaderMaterial {
  constructor(map: Texture) {
    super({
      ...PAINTER,
      blending: AdditiveBlending,
      vertexShader: RIPPLE_VERTEX,
      fragmentShader: RIPPLE_FRAGMENT,
      uniforms: {
        map: { value: map },
        time: { value: 0 },
        source: { value: new Vector2(0, 0) },
        sky: { value: new Vector2(-5, -3) },
        quiet: { value: new Vector2(-6.2, -3.2) },
        reach: { value: 7 },
        lift: { value: 0 },
        opacity: { value: 1 },
        dotColor: { value: paletteColor(mixColors("white", "orange", 0.35)) },
        quality: STAGE_UNIFORMS.quality,
      },
    });
  }
}

let defaultMask: DataTexture | null = null;

/**
 * A mask for morphs that have none of their own: a bottom-to-top ramp broken up by soft noise,
 * so the edge climbs with a ragged front.
 */
export function defaultMorphMask(): DataTexture {
  if (defaultMask) return defaultMask;
  const width = 64;
  const height = 256;
  const rand = seeded("morph-mask");
  const cells = Array.from({ length: 9 * 33 }, () => rand());
  const cell = (i: number, j: number) => cells[j * 9 + (i % 8)];
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (x / width) * 8;
      const gy = (y / height) * 32;
      const i = Math.floor(gx);
      const j = Math.min(31, Math.floor(gy));
      const u = gx - i;
      const v = gy - j;
      const sx = u * u * (3 - 2 * u);
      const sy = v * v * (3 - 2 * v);
      const top = cell(i, j) + (cell(i + 1, j) - cell(i, j)) * sx;
      const bottom = cell(i, j + 1) + (cell(i + 1, j + 1) - cell(i, j + 1)) * sx;
      const noise = top + (bottom - top) * sy;
      // DataTexture rows run bottom to top: row 0 is the bottom of the plate.
      const ramp = y / (height - 1);
      data[y * width + x] = Math.round(Math.min(1, Math.max(0, ramp * 0.75 + noise * 0.25)) * 255);
    }
  }
  defaultMask = new DataTexture(data, width, height, RedFormat);
  defaultMask.magFilter = LinearFilter;
  defaultMask.minFilter = LinearFilter;
  defaultMask.needsUpdate = true;
  return defaultMask;
}
