// The hero's signal rings: faint concentric rings of tiny halftone dots rippling outward from the
// orange's crown like a signal, over the sky (docs/PAINTINGS.md, hero). They are in the hero's shader
// (heroColor) and, with the same code and the same clock, in the bridge's, so their rhythm runs on
// through the bridge: over the sky of the film and, once the reel's ground has gone pale, over that.
//
// Each ring has its own phase and its own largest radius (rule 13), and travels slower the larger it
// is (a ring of radius 0.2 takes about 12 s, one of 0.95 about 28 s); a cycle's reach and brightness
// are hashed per cycle, so no two cycles of a ring alike (rule 10) and the pattern never settles into a
// metronome. A ring is born from the crown with a smoothstep ramp and dies on the way out (rule 4:
// nothing starts or stops as an edge). The dots are the page's halftone screen at 15 degrees (the print-in's
// `screenCell` and `dotGrow`): the coverage is read at each cell's centre, so a ring is a field of clean
// round dots growing and shrinking, never a smooth line. A dot's colour follows the ground under it, milk on
// the dark sky and ink on a pale ground, by the ground's own luminance: as the bridge's ground whitens the
// dots turn from milk to ink without a switch, and the whole is multiplied by `uRingGain` (the hero's
// print-in driver; the bridge fades it out by the time the knife is at rest), so nothing pops on or off
// (rule 3). Under reduced motion the clock is 0 and the rings hold at their first phases.
//
// Needs the shared library (screenCell, dotGrow, hash, luma, aspectUV) and the palette (uMilk, uInk).
import { art } from "@/content/art";

const f = (x: number) => x.toFixed(4);
const R = art.hero.rings;

export const RINGS_GLSL = /* glsl */ `
uniform vec2 uACrown;      // the crown, painting point 0..1, y down
uniform float uRingGain;   // 0..1: the rings' strength (the hero's print-in driver; the bridge fades them out)
uniform float uRingPale;   // 0..1: how far a pale ground may carry the rings (the bridge's reel once it has whitened)

const int RING_N = ${R.count};
const float RING_MIN = ${f(R.minR)};
const float RING_MAX = ${f(R.maxR)};
const float RING_SPEED = ${f(R.speed)};
const float RING_CELL = ${f(R.cell)};
const float RING_STRENGTH = ${f(R.strength)};

// The rings' coverage 0..1 at distance d (frame heights) from the crown at the pass clock tm.
float ringsCoverage(float d, float tm) {
  float cov = 0.0;
  for (int k = 0; k < RING_N; k++) {
    float fk = float(k);
    float h0 = hash(fk * 2.31 + 1.7);
    float rmax = mix(RING_MIN, RING_MAX, (fk + 0.5) / float(RING_N)) * (0.92 + 0.16 * h0);
    float rate = RING_SPEED / (0.35 + rmax);                    // cycles a second: slower the larger
    float x = hash(fk * 5.77 + 0.3) + tm * rate;                // its own phase
    float c = floor(x);
    float fr = x - c;
    float hc = hash(vec2(fk, c));                               // this cycle's own reach and brightness (rule 10)
    float r = rmax * (0.88 + 0.24 * hc) * fr;
    float w = 0.005 + 0.011 * r;
    float dd = d - r;
    if (abs(dd) > 3.0 * w) continue;
    float life = smoothstep(0.0, 0.12, fr) * pow(1.0 - fr, 1.4) * (0.7 + 0.3 * hash(vec2(fk + 9.0, c)));
    cov += life * exp(-dd * dd / (w * w));
  }
  return min(cov, 1.0);
}

// The rings over col at this fragment. 'crownQ' is the crown on screen (aspect-corrected), 'gain' the rings'
// strength and 'ground' 0..1 how much this pixel is a ground the rings may sit on (the sky, or a pale ground).
vec3 signalRings(vec3 col, vec2 frag, vec2 crownQ, float gain, float ground, float tm) {
  float a = gain * ground;
  if (a < 0.004) return col;
  float cellPx = RING_CELL * uDpr;
  vec2 cid;
  vec2 loc;
  vec2 uvC;
  screenCell(frag, cellPx, PRINT_ANGLE, cid, loc, uvC);
  float dC = length(aspectUV(uvC) - crownQ);
  if (dC > RING_MAX * 1.2 + 0.1) return col;
  float cov = ringsCoverage(dC, tm);
  if (cov < 0.01) return col;
  // The far rings are fainter: the headline and its copy sit under them, and the signal dies with distance.
  a *= 1.0 - 0.7 * smoothstep(0.30, 0.95, dC);
  float dot_ = dotGrow(cov, loc, cid, cellPx);
  vec3 ink = mix(uMilk, uInk, smoothstep(0.5, 0.85, luma(col)));    // milk on the dark sky, ink on a pale ground
  return mix(col, ink, dot_ * RING_STRENGTH * a);
}
`;
