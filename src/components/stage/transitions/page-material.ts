import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3, Vector4, type Texture } from "three";

import { mixColors } from "@/styles/tokens";

import { OUTPUT, PAPER, PAPER_GLSL, STAGE_UNIFORMS } from "../materials";
import { PAGE_STATIONS } from "./hinge";
import { glslFloat, SUN } from "./media";

/**
 * A sheet of paper in front of the lens, bent along its length (`hinge.ts`): a strip walked from its
 * hinge to its free edge through the angles at `PAGE_STATIONS` stations, either way along x (`uDir`),
 * its hinge anywhere (it can ride another page, or fly). The sun lights whichever face the camera
 * sees, flat being as lit as a plate is. Two faces:
 * - `drawing`: a drawing on paper (the plan's panels), the paper's plain back on the other side;
 * - `page`: the milk page of the building site, with very soft shadows of leaves drifting over it.
 */

const VERTEX = /* glsl */ `
uniform float uAngles[${PAGE_STATIONS}];
uniform float uBase;
uniform float uDir;
uniform float uLength;
uniform float uTall;
uniform vec3 uHinge;
varying vec2 vUv;
varying vec2 vNormal;
varying float vS;
void main() {
  vUv = uv;
  // Walk from the hinge along the bent page to this vertex: the angle between two stations is their mean.
  float s = clamp(position.x, 0.0, 1.0) * ${glslFloat(PAGE_STATIONS - 1)};
  float step = uLength / ${glslFloat(PAGE_STATIONS - 1)};
  float x = 0.0;
  float z = 0.0;
  float a = uBase + uAngles[0];
  for (int j = 1; j < ${PAGE_STATIONS}; j++) {
    float seg = clamp(s - float(j - 1), 0.0, 1.0);
    float aj = uBase + 0.5 * (uAngles[j - 1] + uAngles[j]);
    x += step * seg * cos(aj);
    z += step * seg * sin(aj);
    if (seg > 0.0) a = aj;
  }
  vS = position.x;
  // The front face's normal (x, z): the page's direction turned a quarter toward the viewer.
  vNormal = vec2(-uDir * sin(a), cos(a));
  vec3 p = uHinge + vec3(uDir * x, position.y * uTall, z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform sampler2D grainMap;
uniform vec3 uBack;
uniform float uBackAmount;
uniform float uFold;
uniform float uOpacity;
uniform vec4 uLeafA;   // the leaf shadows' drift: offset x, y, turn, scale
uniform vec4 uLeafB;
uniform float uLeaves;
uniform float uDir;
varying vec2 vUv;
varying vec2 vNormal;
varying float vS;
${OUTPUT}
${PAPER_GLSL}
const vec2 SUN_XZ = vec2(${glslFloat(SUN[0])}, ${glslFloat(SUN[2])});
vec2 drift(vec2 uv, vec4 d, float size) {
  vec2 q = uv - 0.5;
  float c = cos(d.z);
  float s = sin(d.z);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y) / d.w;
  return (q + 0.5 + d.xy) / size;
}
void main() {
  #ifdef PAGE
  // Milk, with two layers of leaf shadows so blurred they are felt more than seen.
  vec4 color = vec4(paperColor, 1.0);
  float leafA = texture2D(map, drift(vUv, uLeafA, 0.64), 6.2).a;
  float leafB = texture2D(map, drift(vUv, uLeafB, 0.9), 7.0).a;
  color.rgb *= 1.0 - uLeaves * (0.2 * leafA + 0.13 * leafB) * 0.85;
  #else
  vec4 color = onPaper(texture2D(map, vUv), vUv);
  #endif
  // The face the camera sees (a strip run the other way along x turns its triangles over), and the
  // sun on it: 1 where the page lies flat.
  bool front = uDir > 0.0 ? gl_FrontFacing : !gl_FrontFacing;
  vec2 n = front ? vNormal : -vNormal;
  float lit = dot(n, SUN_XZ) / SUN_XZ.y;
  if (!front) color.rgb = mix(color.rgb, uBack * color.a, uBackAmount);
  color.rgb *= mix(0.58, 1.0, clamp(lit, 0.0, 1.0)) + 0.08 * max(lit - 1.0, 0.0);
  // A fold closing over this page shades it, most toward its free edge.
  color.rgb *= 1.0 - uFold * smoothstep(0.25, 1.0, vS);
  gl_FragColor = toOutput(color, uOpacity);
  if (gl_FragColor.a < 0.002) discard;
}
`;

export type PageKind = "drawing" | "page";

/** A page's mesh: its own strip (never the plates' shared quad), from its hinge (x 0) to its free edge (x 1), subdivided along its length. */
export function pageMesh(map: Texture, kind: PageKind, name: string): Mesh<PlaneGeometry, ShaderMaterial> {
  const geometry = new PlaneGeometry(1, 1, 32, 1);
  geometry.translate(0.5, 0, 0);
  const material = new ShaderMaterial({
    name: `transition:page:${name}`,
    defines: kind === "page" ? { PAGE: "" } : {},
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      map: { value: map },
      grainMap: STAGE_UNIFORMS.grainMap,
      paper: { value: 1 },
      paperColor: { value: new Color(kind === "page" ? mixColors("milk", "white", 0.1) : PAPER) },
      uAngles: { value: new Array(PAGE_STATIONS).fill(0) },
      uBase: { value: 0 },
      uDir: { value: 1 },
      uLength: { value: 1 },
      uTall: { value: 1 },
      uHinge: { value: new Vector3() },
      // The back: the milk page's own milk, a shade cooler; the plan's cream paper, the drawing faintly through it.
      uBack: { value: new Color(kind === "page" ? mixColors("milk", "skySoft", 0.2) : mixColors("milk", "marble", 0.6)) },
      uBackAmount: { value: kind === "page" ? 1 : 0.86 },
      uFold: { value: 0 },
      uOpacity: { value: 1 },
      uLeafA: { value: new Vector4(0, 0, 0, 1) },
      uLeafB: { value: new Vector4(0, 0, 0, 1) },
      uLeaves: { value: 0 },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = name;
  return mesh;
}

/** Sets a page's bend: its angles at the stations, a turn added to all of them, which way it runs, its size and its hinge. */
export function setPage(mesh: Mesh<PlaneGeometry, ShaderMaterial>, angles: readonly number[], base: number, dir: 1 | -1, length: number, tall: number, hinge: readonly [number, number, number]): void {
  const u = mesh.material.uniforms;
  const list = u.uAngles.value as number[];
  for (let j = 0; j < PAGE_STATIONS; j++) list[j] = angles[j] ?? 0;
  u.uBase.value = base;
  u.uDir.value = dir;
  u.uLength.value = length;
  u.uTall.value = tall;
  (u.uHinge.value as Vector3).set(hinge[0], hinge[1], hinge[2]);
}
