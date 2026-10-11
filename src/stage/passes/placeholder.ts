// The placeholder pass: fills the canvas with --sky and draws the uncover() test marks at the
// hero's anchors (glint, orange, spout) so the mapping can be checked on the home page before the
// hero pass exists. It claims "all" segments, so it only draws where no chapter pass has claimed.
import { art } from "@/content/art";
import type { PassDef } from "../gl/passes";

const FRAG = /* glsl */ `
uniform vec2 uMarkA, uMarkB, uMarkC; // painting points, 0..1, y down
uniform vec2 uTexSize;               // the painting's size (only its aspect matters)
uniform vec2 uPan;
uniform float uZoom;

// A thin ring with a dot at its centre, in aspect-corrected screen units.
float mark(vec2 q, vec2 c, float px) {
  float d = length(q - c);
  float ring = 1.0 - smoothstep(px, px * 2.0, abs(d - 0.018));
  float dot = 1.0 - smoothstep(px * 1.5, px * 3.0, d);
  return max(ring, dot);
}

void main() {
  vec2 uv = screenUV();
  vec2 q = aspectUV(uv);
  float px = 1.0 / uRes.y;
  float m = mark(q, aspectUV(uncover(uMarkA, uTexSize, uPan, uZoom)), px)
          + mark(q, aspectUV(uncover(uMarkB, uTexSize, uPan, uZoom)), px)
          + mark(q, aspectUV(uncover(uMarkC, uTexSize, uPan, uZoom)), px);
  vec3 col = mix(uSky, uMilk, clamp(m, 0.0, 1.0) * 0.85);
  gl_FragColor = vec4(col, 1.0);
}
`;

const hero = art.hero;
const TEX_SIZE: [number, number] = [hero.aspect * 1080, 1080];

export const placeholderPass: PassDef = {
  id: "placeholder",
  segments: "all",
  frag: FRAG,
  breathes: false,
  uniforms(_ctx, u) {
    u.set2f("uMarkA", hero.anchors.glint.x, hero.anchors.glint.y);
    u.set2f("uMarkB", hero.anchors.orange.x, hero.anchors.orange.y);
    u.set2f("uMarkC", hero.anchors.spout.x, hero.anchors.spout.y);
    u.set2f("uTexSize", TEX_SIZE[0], TEX_SIZE[1]);
    u.set2f("uPan", hero.framing.pan.x, hero.framing.pan.y);
    u.set1f("uZoom", hero.framing.zoom);
  },
};
