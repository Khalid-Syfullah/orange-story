#!/usr/bin/env node
// Painted placeholders for every asset in src/content/art.ts.
//
//   npm run art:placeholders                    paint every id that has no source in art/source/
//   npm run art:placeholders -- --only hero,plan paint only these ids
//   npm run art:placeholders -- --force         also repaint ids that have a real source (overwrites it)
//   npm run art:placeholders -- --preview DIR   write a few PNG frames per id to DIR, touch nothing else
//
// `npm run art:import` calls this for any id whose source is missing. Each placeholder is in the
// right palette and aspect: cobalt field with a soft vignette, the orange as a disc with a darker
// lower half and a highlight, cream and ochre figures, marble steps, paper for the drawings, leaves
// for the canopy. Features sit on the anchors read from art.ts (hero glint and spout, share seam,
// canopy nearest orange, application fingertip, finale spout and roots, sapling trunk foot), so
// later phases built against placeholders keep working when real art arrives and the anchors are
// retuned. Sequences change from frame to frame and loops move, so scrubbing and playback are visible.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { openLoopEncoder, writeJpegRaw, writeTiersRaw, loopEncoder } from "./lib/art-encode.mjs";
import { findSource, frameManifestText, loadArt, LOOP_SIZE, publicPath, tierSize } from "./lib/art-manifest.mjs";
import {
  branch,
  C,
  clamp,
  cloud,
  figure,
  finish,
  halfOrange,
  hand,
  leaf,
  leafCluster,
  lerp,
  marbleStep,
  mix,
  n,
  noiseField,
  orange,
  over,
  paper,
  renderSvg,
  rng,
  sky,
  smooth,
  smoother,
  Svg,
  TAU,
  warp,
  wateringCan,
} from "./lib/paint.mjs";

const LOOP_FPS = 24;
const LOOP_SECONDS = 10;
const CONCURRENCY = 4;

const label = (id, frame = null) => (frame === null ? `${id} · placeholder` : `${id} · f ${String(frame).padStart(3, "0")}`);

// =============================================================================================
// Scenes. Each draws into an Svg of any size; coordinates are painting fractions mapped to pixels.
// =============================================================================================

const P = (svg) => [(x) => x * svg.W, (y) => y * svg.H];

// ---------------------------------------------------------------------------------------------
// hero: the giant orange on the stepped plinth, three attendants, cobalt sky
// ---------------------------------------------------------------------------------------------

function heroGeometry(art, W, H) {
  const a = art.hero.anchors;
  return {
    orange: { cx: a.orange.x * W, cy: a.orange.y * H, r: 0.13 * W, highlight: [a.glint.x * W, a.glint.y * H] },
    spout: [a.spout.x * W, a.spout.y * H],
    pourEnd: [a.pourEnd.x * W, a.pourEnd.y * H],
  };
}

/**
 * The stepped plinth as [x0, x1, top, tread, bottom] fractions, built round the anchors: the block
 * the orange sits on, step B, step A whose tread carries the pour's landing point, and the floor.
 */
function heroSteps(art) {
  const a = art.hero.anchors;
  const rY = 0.13 * (16 / 9); // the orange's radius in height units
  const blockTop = a.orange.y + rY * 0.98;
  const aTop = a.pourEnd.y - 0.01;
  const bTop = lerp(blockTop, aTop, 0.6);
  const floorTop = Math.min(0.95, aTop + 0.075);
  const bx0 = a.orange.x - 0.27;
  return [
    [-0.01, 1.01, floorTop, floorTop + 0.023, 1.01],
    [Math.min(bx0 - 0.1, a.pourEnd.x - 0.04), 1.01, aTop, aTop + 0.025, floorTop + 0.005],
    [bx0, 1.01, bTop, bTop + 0.025, aTop + 0.002],
    [a.orange.x - 0.17, a.orange.x + 0.2, blockTop, blockTop + 0.025, bTop + 0.002],
  ];
}

function heroStatic(svg, art) {
  const [X, Y] = P(svg);
  const g = heroGeometry(art, svg.W, svg.H);
  const steps = heroSteps(art);
  const [floor, , stepB, block] = steps;
  sky(svg, { seed: 11 });
  steps.forEach(([x0, x1, top, tread, bottom], i) =>
    svg.add(marbleStep(svg, { x0: X(x0), x1: X(x1), top: Y(top), tread: Y(tread), bottom: Y(bottom), seed: 3 + i * 7, veins: 4 })),
  );
  const shadow = svg.blur(10);
  // contact shadow under the orange, and the attendants' cast shadows to the lower right
  svg.add(`<ellipse cx="${n(g.orange.cx + g.orange.r * 0.35)}" cy="${n(Y(block[2] + 0.014))}" rx="${n(g.orange.r * 1.05)}" ry="${n(Y(0.012))}" fill="#3b3326" opacity="0.45" filter="url(#${shadow})"/>`);
  svg.add(`<ellipse cx="${n(X(0.3))}" cy="${n(Y(floor[2] + 0.047))}" rx="${n(X(0.075))}" ry="${n(Y(0.012))}" fill="#3b3326" opacity="0.32" filter="url(#${shadow})"/>`);
  svg.add(`<ellipse cx="${n(X(0.55))}" cy="${n(Y(stepB[2] + 0.017))}" rx="${n(X(0.06))}" ry="${n(Y(0.01))}" fill="#3b3326" opacity="0.32" filter="url(#${shadow})"/>`);
  svg.add(`<ellipse cx="${n(X(0.97))}" cy="${n(Y(stepB[2] + 0.02))}" rx="${n(X(0.05))}" ry="${n(Y(0.01))}" fill="#3b3326" opacity="0.3" filter="url(#${shadow})"/>`);
  svg.add(orange(svg, { ...g.orange, seed: 5, leaves: 2 }));
}

/** The attendants, the can and the cloth at loop phase t (0..1, periodic). */
function heroFigures(svg, art, t) {
  const [X, Y] = P(svg);
  const g = heroGeometry(art, svg.W, svg.H);
  const [floor, , stepB] = heroSteps(art);
  const o = art.hero.anchors.orange;
  const s = (k, ph) => Math.sin(TAU * k * t + ph);
  // lower left: cream gown, rust sash, tilting the empty can toward the steps
  const canSize = X(0.045);
  const grip = [g.spout[0] - canSize * 1.27, g.spout[1] - canSize * 0.82];
  const w1 = figure(svg, {
    x: X(0.232), y: Y(floor[2] + 0.051), h: Y(0.52), face: 1, sash: C.rust, seed: 31,
    sway: X(0.0035) * s(2, 0.3), lean: X(0.0015) * s(1, 1.2),
    arms: [
      { side: "R", to: grip, bend: 1 },
      { side: "L", to: [g.spout[0] - canSize * 1.6, g.spout[1] + canSize * 0.05], bend: 1, front: false },
    ],
  });
  const can = wateringCan(svg, { tip: g.spout, size: canSize, dir: 1, tilt: 2.2 * s(1, 0), pivot: grip });
  // centre: cream tunic, golden-ochre sash, polishing the peel with a white cloth
  const cloth = [X(o.x - 0.102) + X(0.012) * Math.cos(TAU * t), Y(o.y + 0.05) + Y(0.022) * Math.sin(TAU * t)];
  const w2 = figure(svg, {
    x: X(o.x - 0.2), y: Y(stepB[2] + 0.015), h: Y(0.42), face: 1, sash: C.gold, seed: 37,
    sway: X(0.003) * s(3, 1.1), lean: X(0.004) + X(0.002) * Math.cos(TAU * t),
    arms: [
      { side: "R", to: cloth, bend: 1 },
      { side: "L", to: [X(o.x - 0.212), Y(o.y + 0.2)], bend: -1, front: false },
    ],
  });
  const clothSvg =
    `<g filter="url(#${svg.rough(2, 0.06, 41)})"><ellipse cx="${n(cloth[0] + X(0.004))}" cy="${n(cloth[1] + Y(0.008))}" rx="${n(X(0.017))}" ry="${n(Y(0.034))}" transform="rotate(${n(-20 + 8 * Math.sin(TAU * t))} ${n(cloth[0])} ${n(cloth[1])})" fill="${C.white}"/>` +
    `<path d="M${n(cloth[0] - X(0.008))},${n(cloth[1] - Y(0.01))} q${n(X(0.006))},${n(Y(0.03))} ${n(X(0.004))},${n(Y(0.05))}" stroke="${C.whiteShade}" stroke-width="${n(X(0.002))}" fill="none"/></g>`;
  // far right: ochre shawl, a hand on her chest
  const w3 = figure(svg, {
    x: X(0.93), y: Y(stepB[2] + 0.025), h: Y(0.44), face: -1, shawl: C.ochre, seed: 43,
    sway: X(0.004) * s(2, 2.0), lean: X(0.0012) * s(1, 0.4),
    arms: [
      { side: "L", to: [X(0.922), Y(stepB[2] - 0.24)], bend: -1 },
      { side: "R", to: [X(0.955), Y(stepB[2] - 0.175)], bend: 1, front: false },
    ],
  });
  svg.add(w2.svg, clothSvg, w3.svg, w1.svg, can);
}

// ---------------------------------------------------------------------------------------------
// graft: paper-white ground, a bark branch where the plinth was, the orange hanging where it sat,
// two hands grafting a scion onto a cut branch
// ---------------------------------------------------------------------------------------------

function graftScene(svg, art) {
  const [X, Y] = P(svg);
  const g = heroGeometry(art, svg.W, svg.H);
  paper(svg, { color: C.paperWhite, seed: 23, fibre: 0.35 });
  const o = g.orange;
  // the trunk rising from the lower right (the plinth's place), arching over the orange
  svg.add(`<g filter="url(#${svg.rough(3, 0.03, 51)})">`);
  svg.add(branch(svg, [X(0.95), Y(1.06)], [X(0.9), Y(0.55)], [X(0.86), Y(0.16)], X(0.034), X(0.022)));
  svg.add(branch(svg, [X(0.87), Y(0.2)], [X(0.8), Y(0.05)], [X(0.52), Y(0.08)], X(0.02), X(0.008)));
  svg.add(branch(svg, [X(0.86), Y(0.18)], [X(0.95), Y(0.06)], [X(1.02), Y(0.02)], X(0.016), X(0.01)));
  // the cut branch the hands work on
  svg.add(branch(svg, [X(0.89), Y(0.74)], [X(0.62), Y(0.62)], [X(0.37), Y(0.645)], X(0.02), X(0.014)));
  svg.add(`</g>`);
  // the cut face
  svg.add(`<ellipse cx="${n(X(0.37))}" cy="${n(Y(0.645))}" rx="${n(X(0.006))}" ry="${n(X(0.0135))}" fill="#e2c89a"/>`);
  // the orange hangs from the arching branch on a short stalk
  svg.add(`<path d="M${n(o.cx + o.r * 0.06)},${n(o.cy - o.r * 0.98)} Q${n(o.cx + o.r * 0.12)},${n(Y(0.15))} ${n(o.cx + o.r * 0.05)},${n(Y(0.085))}" fill="none" stroke="${C.bark}" stroke-width="${n(X(0.005))}" stroke-linecap="round"/>`);
  svg.add(orange(svg, { ...o, seed: 5, leaves: 2, stemLen: o.r * 0.12 }));
  // leaves sprouted along the branches
  const rand = rng(77);
  for (let i = 0; i < 26; i++) {
    const t = rand();
    const bx = lerp(X(0.52), X(0.86), t);
    const by = lerp(Y(0.08), Y(0.16), t) - Y(0.04) * Math.sin(t * Math.PI);
    svg.add(leaf(svg, bx, by, X(0.03 + rand() * 0.025), (rand() < 0.5 ? -1 : 1) * (30 + rand() * 120), { tone: rand() < 0.3 ? "young" : "dark" }));
  }
  for (let i = 0; i < 8; i++) {
    const t = rand();
    svg.add(leaf(svg, lerp(X(0.6), X(0.86), t), lerp(Y(0.63), Y(0.73), t), X(0.022 + rand() * 0.012), -40 - rand() * 100, { tone: "young" }));
  }
  // the scion rising from the join, four young leaves and a white bud
  const sc = [[X(0.372), Y(0.635)], [X(0.36), Y(0.46)], [X(0.345), Y(0.3)]];
  svg.add(`<path d="M${n(sc[0][0])},${n(sc[0][1])} Q${n(sc[1][0])},${n(sc[1][1])} ${n(sc[2][0])},${n(sc[2][1])}" fill="none" stroke="#6b6a2c" stroke-width="${n(X(0.0045))}" stroke-linecap="round"/>`);
  [[0.36, 0.53, -20], [0.357, 0.47, -160], [0.351, 0.4, -30], [0.348, 0.35, -150]].forEach(([x, y, a]) =>
    svg.add(leaf(svg, X(x), Y(y), X(0.034), a, { tone: "young" })),
  );
  svg.add(`<g filter="url(#${svg.rough(1.5, 0.08, 9)})"><ellipse cx="${n(X(0.345))}" cy="${n(Y(0.285))}" rx="${n(X(0.008))}" ry="${n(Y(0.022))}" fill="#fbf7ee"/><ellipse cx="${n(X(0.343))}" cy="${n(Y(0.282))}" rx="${n(X(0.003))}" ry="${n(Y(0.012))}" fill="#ffffff"/><path d="M${n(X(0.339))},${n(Y(0.3))} l${n(X(0.006))},${n(Y(0.008))} l${n(X(0.006))},${n(-Y(0.008))}" fill="#6f9a3c"/></g>`);
  // raffia wound round the join, its loose end running to the right hand
  for (let i = 0; i < 6; i++) {
    const yy = Y(0.622) + i * Y(0.007);
    svg.add(`<path d="M${n(X(0.364))},${n(yy)} l${n(X(0.018))},${n(Y(0.012))}" stroke="${C.raffia}" stroke-width="${n(X(0.0028))}" stroke-linecap="round"/>`);
  }
  svg.add(`<path d="M${n(X(0.38))},${n(Y(0.66))} Q${n(X(0.37))},${n(Y(0.72))} ${n(X(0.335))},${n(Y(0.74))}" fill="none" stroke="${C.raffia}" stroke-width="${n(X(0.0022))}"/>`);
  // the grafting knife (boxwood handle) and a coil of raffia resting on the branch
  svg.add(`<g filter="url(#${svg.rough(1.2, 0.06, 19)})" transform="rotate(-6 ${n(X(0.55))} ${n(Y(0.62))})">` +
    `<rect x="${n(X(0.5))}" y="${n(Y(0.605))}" width="${n(X(0.06))}" height="${n(Y(0.022))}" rx="${n(Y(0.01))}" fill="${C.boxwood}"/>` +
    `<path d="M${n(X(0.56))},${n(Y(0.608))} L${n(X(0.605))},${n(Y(0.606))} Q${n(X(0.615))},${n(Y(0.612))} ${n(X(0.6))},${n(Y(0.622))} L${n(X(0.56))},${n(Y(0.624))}Z" fill="${C.steel}"/>` +
    `<path d="M${n(X(0.562))},${n(Y(0.611))} L${n(X(0.6))},${n(Y(0.61))}" stroke="#eef2f4" stroke-width="${n(X(0.0015))}"/></g>`);
  for (let i = 0; i < 5; i++) {
    svg.add(`<ellipse cx="${n(X(0.68))}" cy="${n(Y(0.635) - i * Y(0.004))}" rx="${n(X(0.03) - i * X(0.002))}" ry="${n(Y(0.018))}" fill="none" stroke="${mix(C.raffia, "#7a6230", i % 2 ? 0.25 : 0)}" stroke-width="${n(X(0.003))}"/>`);
  }
  // the hands: the left steadies the branch from below, the right winds the twine
  svg.add(hand(svg, { x: X(0.468), y: Y(0.765), angle: -86, size: X(0.05), curl: 0.85, sleeve: C.cream, cuff: C.creamLight, sleeveLen: 7, seed: 3 }));
  svg.add(hand(svg, { x: X(0.318), y: Y(0.775), angle: -58, size: X(0.048), curl: 0.6, sleeve: C.cream, cuff: C.creamLight, sleeveLen: 7, seed: 8 }));
}

// ---------------------------------------------------------------------------------------------
// grove: looking up into a laden tree against an overcast white sky; a hand in a lace cuff and a
// green velvet sleeve reaches from the lower right and closes round the gilded orange at the centre
// ---------------------------------------------------------------------------------------------

function groveScene(svg) {
  const [X, Y] = P(svg);
  const g = svg.linear([[0, "#dcdedb"], [0.55, "#ebebe6"], [1, "#f5f3ec"]], [0, 0, 0, 1]);
  svg.add(`<rect width="${svg.W}" height="${svg.H}" fill="url(#${g})"/>`);
  sky(svg, { top: "#dcdedb", mid: "#ebebe6", low: "#f5f3ec", seed: 15, mottle: 0.25 });
  const rand = rng(91);
  // branches reaching in from the edges
  const limbs = [
    [[-0.03, 0.06], [0.2, 0.12], [0.44, 0.3], 0.022, 0.005],
    [[1.03, -0.02], [0.82, 0.16], [0.6, 0.31], 0.024, 0.006],
    [[-0.03, 0.72], [0.14, 0.6], [0.3, 0.52], 0.018, 0.005],
    [[1.03, 0.5], [0.9, 0.46], [0.74, 0.44], 0.016, 0.005],
    [[0.3, -0.03], [0.36, 0.08], [0.47, 0.18], 0.012, 0.004],
  ];
  svg.add(`<g filter="url(#${svg.rough(2.5, 0.03, 53)})">`);
  for (const [a, c, b, w0, w1] of limbs) svg.add(branch(svg, [X(a[0]), Y(a[1])], [X(c[0]), Y(c[1])], [X(b[0]), Y(b[1])], X(w0), X(w1)));
  svg.add(`</g>`);
  // leaf masses round the edges, thinner toward the middle
  const clusters = [];
  for (let i = 0; i < 42; i++) {
    const edge = rand() * 4;
    const along = rand();
    const depth = rand() ** 1.6 * 0.3;
    const [x, y] = edge < 1 ? [along, depth] : edge < 2 ? [1 - depth, along] : edge < 3 ? [along * 0.62, 1 - depth * 0.7] : [depth, along];
    clusters.push([x, y]);
  }
  for (const [a, , b] of limbs) for (let t = 0.25; t <= 1; t += 0.25) clusters.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
  for (const [x, y] of clusters) svg.add(leafCluster(svg, X(x), Y(y), X(0.05), 9, { seed: Math.floor(rand() * 1e6), len: X(0.032) }));
  // dozens of oranges among the leaves
  const oranges = [];
  for (let i = 0; i < 34; i++) {
    const [x, y] = clusters[Math.floor(rand() * clusters.length)];
    const ox = x + (rand() - 0.5) * 0.06;
    const oy = y + (rand() - 0.5) * 0.08;
    if (Math.hypot((ox - 0.52) * 1.78, oy - 0.4) < 0.17) continue;
    if (ox > 0.58 && oy > 0.55) continue; // the hand's way in
    oranges.push([ox, oy, 0.016 + rand() * 0.016]);
  }
  oranges.sort((a, b) => a[2] - b[2]);
  for (const [x, y, r] of oranges) svg.add(orange(svg, { cx: X(x), cy: Y(y), r: X(r), seed: 5, leaves: rand() < 0.4 ? 1 : 0, stemLen: X(r) * 0.3, rough: false, dimples: 0.1 }));
  for (const [x, y] of clusters.slice(0, 20)) svg.add(leafCluster(svg, X(x + 0.02), Y(y + 0.03), X(0.03), 4, { seed: Math.floor(rand() * 1e6), len: X(0.03) }));
  // the gilded orange at the centre on its twig, brighter than the rest, with a soft glow
  const go = { cx: X(0.52), cy: Y(0.4), r: X(0.045) };
  svg.add(`<path d="M${n(X(0.47))},${n(Y(0.18))} Q${n(X(0.51))},${n(Y(0.22))} ${n(go.cx + go.r * 0.05)},${n(go.cy - go.r * 0.95)}" fill="none" stroke="${C.bark}" stroke-width="${n(X(0.004))}"/>`);
  svg.add(`<circle cx="${n(go.cx)}" cy="${n(go.cy)}" r="${n(go.r * 1.9)}" fill="url(#${svg.radial([[0, "#fff1b8", 0.55], [1, "#fff1b8", 0]])})"/>`);
  svg.add(orange(svg, { ...go, gilded: true, seed: 6, leaves: 2, leafAngle: 10 }));
  // the hand from the lower right closing round it
  svg.add(hand(svg, { x: X(0.578), y: Y(0.575), angle: -122, size: X(0.058), curl: 0.7, sleeve: C.velvet, cuff: "#f7f2e6", lace: true, sleeveLen: 9, seed: 12, flip: true }));
}

// ---------------------------------------------------------------------------------------------
// share: a young man in green velvet studies a gilded orange at eye level (first keyframe); then
// two hands hold its halves a hand's width apart, the gap on the seam anchor (last keyframe)
// ---------------------------------------------------------------------------------------------

function shareScene(svg) {
  const [X, Y] = P(svg);
  paper(svg, { color: C.paperWhite, seed: 25, fibre: 0.3 });
  const hx = X(0.645);
  const hy = Y(0.33);
  const R = Y(0.105);
  const velvet = svg.linear([[0, C.velvetLight], [0.35, C.velvet], [1, C.velvetDark]], [0, 0, 1, 0.2]);
  const parts = [];
  // shadow on the paper behind him
  parts.push(`<ellipse cx="${n(X(0.72))}" cy="${n(Y(0.8))}" rx="${n(X(0.2))}" ry="${n(Y(0.3))}" fill="#6a5636" opacity="0.12" filter="url(#${svg.blur(30)})"/>`);
  // the doublet: shoulders and chest, running off the bottom of the frame
  parts.push(`<path d="M${n(X(0.6))},${n(Y(0.47))} C${n(X(0.55))},${n(Y(0.49))} ${n(X(0.52))},${n(Y(0.53))} ${n(X(0.51))},${n(Y(0.62))} L${n(X(0.49))},${n(Y(1.05))} L${n(X(0.88))},${n(Y(1.05))} L${n(X(0.85))},${n(Y(0.64))} C${n(X(0.83))},${n(Y(0.55))} ${n(X(0.78))},${n(Y(0.5))} ${n(X(0.7))},${n(Y(0.47))}Z" fill="url(#${velvet})"/>`);
  for (let i = 0; i < 4; i++) parts.push(`<path d="M${n(X(0.56 + i * 0.07))},${n(Y(0.58))} q${n(X(0.01))},${n(Y(0.2))} ${n(X(-0.005 + i * 0.004))},${n(Y(0.46))}" stroke="${C.velvetDark}" stroke-width="${n(X(0.006))}" fill="none" opacity="0.5"/>`);
  // neck, gold-embroidered collar
  parts.push(`<rect x="${n(hx - R * 0.3)}" y="${n(hy + R * 0.5)}" width="${n(R * 0.62)}" height="${n(R * 0.9)}" fill="${C.skinShade}"/>`);
  parts.push(`<path d="M${n(X(0.585))},${n(Y(0.465))} Q${n(hx)},${n(Y(0.53))} ${n(X(0.715))},${n(Y(0.465))} L${n(X(0.72))},${n(Y(0.5))} Q${n(hx)},${n(Y(0.575))} ${n(X(0.58))},${n(Y(0.5))}Z" fill="${C.gold}"/>`);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const cx = lerp(X(0.588), X(0.712), t);
    const cy = Y(0.487) + Math.sin(t * Math.PI) * Y(0.04);
    parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(X(0.0028))}" fill="#fff0b0" opacity="0.85"/>`);
  }
  // head in three-quarter profile facing left
  const skinG = svg.linear([[0, C.skinLight], [0.5, C.skin], [1, C.skinShade]], [0, 0, 1, 0.3]);
  parts.push(`<ellipse cx="${n(hx)}" cy="${n(hy)}" rx="${n(R * 0.8)}" ry="${n(R)}" fill="url(#${skinG})"/>`);
  parts.push(`<path d="M${n(hx - R * 0.7)},${n(hy - R * 0.32)} q${n(-R * 0.16)},${n(R * 0.24)} ${n(-R * 0.2)},${n(R * 0.42)} l${n(R * 0.16)},${n(R * 0.07)} q${n(-R * 0.04)},${n(R * 0.18)} ${n(R * 0.02)},${n(R * 0.3)} q${n(-R * 0.03)},${n(R * 0.14)} ${n(R * 0.14)},${n(R * 0.24)}" fill="${C.skin}" stroke="${C.skinShade}" stroke-width="${n(R * 0.03)}"/>`);
  parts.push(`<path d="M${n(hx - R * 0.5)},${n(hy - R * 0.12)} q${n(R * 0.1)},${n(-R * 0.06)} ${n(R * 0.2)},0" stroke="${C.hairDark}" stroke-width="${n(R * 0.05)}" fill="none"/>`);
  parts.push(`<ellipse cx="${n(hx + R * 0.22)}" cy="${n(hy + R * 0.05)}" rx="${n(R * 0.12)}" ry="${n(R * 0.18)}" fill="${C.skinShade}"/>`);
  // auburn curls over the crown and the back of the head
  const rand = rng(31);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 0.95 + rand() * Math.PI * 1.35;
    const d = R * (0.78 + rand() * 0.22);
    const cx = hx + R * 0.12 + Math.cos(a) * d * 0.9;
    const cy = hy - R * 0.1 + Math.sin(a) * d;
    if (cx < hx - R * 0.55 && cy > hy - R * 0.5) continue;
    parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R * (0.2 + rand() * 0.12))}" fill="${mix(C.auburn, i % 3 ? "#000000" : "#ffb070", i % 3 ? 0.15 : 0.25)}"/>`);
  }
  // the raised right arm in velvet with a lace cuff, the gilded orange at eye level
  const armD = `M${n(X(0.57))},${n(Y(0.55))} C${n(X(0.5))},${n(Y(0.62))} ${n(X(0.44))},${n(Y(0.64))} ${n(X(0.45))},${n(Y(0.49))}`;
  parts.push(`<path d="${armD}" fill="none" stroke="${C.velvetDark}" stroke-width="${n(X(0.056))}" stroke-linecap="round"/>`);
  parts.push(`<path d="${armD}" fill="none" stroke="${C.velvet}" stroke-width="${n(X(0.046))}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${n(X(0.555))},${n(Y(0.565))} C${n(X(0.5))},${n(Y(0.615))} ${n(X(0.455))},${n(Y(0.63))} ${n(X(0.448))},${n(Y(0.52))}" fill="none" stroke="${C.velvetLight}" stroke-width="${n(X(0.008))}" opacity="0.5"/>`);
  svg.add(`<g filter="url(#${svg.rough(2, 0.04, 33)})">${parts.join("")}</g>`);
  svg.add(orange(svg, { cx: X(0.452), cy: Y(0.31), r: X(0.042), gilded: true, seed: 6, leaves: 1 }));
  svg.add(hand(svg, { x: X(0.452), y: Y(0.47), angle: -92, size: X(0.034), curl: 0.55, cuff: "#f7f2e6", lace: true, seed: 14, flip: true }));
}

function shareLastScene(svg, art) {
  const [X, Y] = P(svg);
  paper(svg, { color: C.paperWhite, seed: 26, fibre: 0.3 });
  const seam = art.share.anchors.seam;
  const sx = X(seam.x);
  const sy = Y(seam.y);
  const r = X(0.075);
  const gap = X(0.05); // a hand's width between the cut faces
  const rx = r * 0.6;
  svg.add(`<ellipse cx="${n(sx)}" cy="${n(sy + r * 1.5)}" rx="${n(X(0.22))}" ry="${n(Y(0.05))}" fill="#6a5636" opacity="0.12" filter="url(#${svg.blur(24)})"/>`);
  svg.add(halfOrange(svg, { cx: sx - gap / 2 - rx, cy: sy, r, face: 1, seed: 9 }));
  svg.add(halfOrange(svg, { cx: sx + gap / 2 + rx, cy: sy, r, face: -1, seed: 10 }));
  // the hand from the left in a plain cuff cups the left half; his hand (lace cuff, green velvet)
  // cups the right one; the curled fingers rise in front of the peel
  const lh = sx - gap / 2 - rx * 1.75;
  const rh = sx + gap / 2 + rx * 1.75;
  svg.add(hand(svg, { x: lh - X(0.075), y: sy + r * 1.22, angle: -14, size: X(0.06), curl: 0.72, sleeve: "#d9cdb4", cuff: "#efe7d6", sleeveLen: 9, seed: 21, flip: true }));
  svg.add(hand(svg, { x: rh + X(0.075), y: sy + r * 1.22, angle: -166, size: X(0.06), curl: 0.72, sleeve: C.velvet, cuff: "#f7f2e6", lace: true, sleeveLen: 9, seed: 22 }));
}

// ---------------------------------------------------------------------------------------------
// plate (9:16): open sky, the orange wrapped in scaffold with a man polishing it at the shoulder,
// the plinth below and a woman on the lower stage reading a parchment blueprint. Left 35% quiet.
// ---------------------------------------------------------------------------------------------

/** The parchment she holds, in plate coordinates (phase 8 adds the same rect to art.ts). */
export const PLATE_PARCHMENT = { x: 0.5, y: 0.705, w: 0.2, h: 0.075 };

function plateScene(svg) {
  const [X, Y] = P(svg);
  sky(svg, { seed: 17, y1: svg.H });
  const o = { cx: X(0.66), cy: Y(0.5), r: X(0.3) };
  const timber = "#9a7650";
  const timberDark = "#5e4428";
  const pole = (x, y0, y1, w = X(0.014)) =>
    `<rect x="${n(X(x) - w / 2)}" y="${n(Y(y0))}" width="${n(w)}" height="${n(Y(y1 - y0))}" fill="${timber}"/>` +
    `<rect x="${n(X(x) + w * 0.1)}" y="${n(Y(y0))}" width="${n(w * 0.4)}" height="${n(Y(y1 - y0))}" fill="${timberDark}" opacity="0.5"/>`;
  const ledger = (x0, x1, y, w = Y(0.005)) => `<rect x="${n(X(x0))}" y="${n(Y(y) - w / 2)}" width="${n(X(x1 - x0))}" height="${n(w)}" fill="${timber}"/>`;
  const plank = (x0, x1, y) =>
    `<rect x="${n(X(x0))}" y="${n(Y(y))}" width="${n(X(x1 - x0))}" height="${n(Y(0.008))}" fill="#c9a575"/>` +
    `<rect x="${n(X(x0))}" y="${n(Y(y + 0.008))}" width="${n(X(x1 - x0))}" height="${n(Y(0.004))}" fill="${timberDark}"/>`;
  // marble: plinth block, base and a plain floor across the bottom
  svg.add(marbleStep(svg, { x0: X(-0.01), x1: X(1.01), top: Y(0.9), tread: Y(0.912), bottom: Y(1.01), seed: 2, veins: 5 }));
  svg.add(marbleStep(svg, { x0: X(0.36), x1: X(1.01), top: Y(0.8), tread: Y(0.812), bottom: Y(0.9), seed: 9, veins: 4 }));
  svg.add(marbleStep(svg, { x0: X(0.42), x1: X(0.97), top: Y(0.655), tread: Y(0.668), bottom: Y(0.8), seed: 16, veins: 5 }));
  // scaffold behind the orange
  svg.add(`<g filter="url(#${svg.rough(2, 0.04, 61)})">${pole(0.56, 0.29, 0.66)}${pole(0.76, 0.29, 0.66)}${ledger(0.4, 1.01, 0.36)}${ledger(0.4, 1.01, 0.55)}</g>`);
  svg.add(orange(svg, { ...o, seed: 5, leaves: 2 }));
  // scaffold in front: poles, ledgers, braces, the planks, a rope ladder, lashings
  const front = [];
  front.push(pole(0.4, 0.3, 0.92), pole(0.93, 0.3, 0.92), pole(1.02, 0.3, 0.92));
  front.push(ledger(0.38, 1.01, 0.44), ledger(0.38, 1.01, 0.62), ledger(0.38, 1.01, 0.79));
  front.push(`<path d="M${n(X(0.4))},${n(Y(0.62))} L${n(X(0.56))},${n(Y(0.44))} M${n(X(0.93))},${n(Y(0.79))} L${n(X(1.02))},${n(Y(0.62))}" stroke="${timber}" stroke-width="${n(X(0.008))}"/>`);
  front.push(plank(0.6, 1.01, 0.42), plank(0.38, 1.01, 0.8));
  for (const [x, y] of [[0.4, 0.44], [0.4, 0.62], [0.4, 0.79], [0.93, 0.44], [0.93, 0.62], [0.93, 0.79]]) {
    front.push(`<rect x="${n(X(x) - X(0.011))}" y="${n(Y(y) - Y(0.006))}" width="${n(X(0.022))}" height="${n(Y(0.012))}" fill="#d8c48c" opacity="0.85"/>`);
  }
  const lx = [0.86, 0.9];
  front.push(`<path d="M${n(X(lx[0]))},${n(Y(0.43))} L${n(X(lx[0]))},${n(Y(0.8))} M${n(X(lx[1]))},${n(Y(0.43))} L${n(X(lx[1]))},${n(Y(0.8))}" stroke="#cdb582" stroke-width="${n(X(0.003))}"/>`);
  for (let y = 0.45; y < 0.8; y += 0.025) front.push(`<line x1="${n(X(lx[0]))}" y1="${n(Y(y))}" x2="${n(X(lx[1]))}" y2="${n(Y(y + 0.002))}" stroke="#a88c58" stroke-width="${n(X(0.004))}"/>`);
  svg.add(`<g filter="url(#${svg.rough(2, 0.04, 62)})">${front.join("")}</g>`);
  // the man on the plank at the orange's shoulder, his back to us, polishing with a cloth
  const man = figure(svg, {
    x: X(0.84), y: Y(0.421), h: Y(0.105), back: true, face: -1, gown: C.white, shade: C.whiteShade, sash: C.red, seed: 71, lean: -X(0.01),
    arms: [
      { side: "L", to: [X(0.775), Y(0.365)], bend: 1 },
      { side: "R", to: [X(0.87), Y(0.37)], bend: -1 },
    ],
  });
  svg.add(man.svg);
  svg.add(`<ellipse cx="${n(X(0.77))}" cy="${n(Y(0.364))}" rx="${n(X(0.016))}" ry="${n(Y(0.008))}" fill="${C.white}" transform="rotate(-25 ${n(X(0.77))} ${n(Y(0.364))})"/>`);
  // a coil of rope and a bucket on his plank
  for (let i = 0; i < 4; i++) svg.add(`<ellipse cx="${n(X(0.95))}" cy="${n(Y(0.416) - i * Y(0.002))}" rx="${n(X(0.028) - i * X(0.003))}" ry="${n(Y(0.005))}" fill="none" stroke="#cdb582" stroke-width="${n(X(0.004))}"/>`);
  svg.add(`<path d="M${n(X(0.66))},${n(Y(0.42))} L${n(X(0.665))},${n(Y(0.4))} L${n(X(0.705))},${n(Y(0.4))} L${n(X(0.71))},${n(Y(0.42))}Z" fill="#7a5a36"/><path d="M${n(X(0.662))},${n(Y(0.4))} Q${n(X(0.685))},${n(Y(0.385))} ${n(X(0.708))},${n(Y(0.4))}" fill="none" stroke="#4a3520" stroke-width="${n(X(0.002))}"/>`);
  // the woman on the lower stage reading the parchment blueprint
  const pr = PLATE_PARCHMENT;
  const woman = figure(svg, {
    x: X(0.6), y: Y(0.8), h: Y(0.15), face: -1, gown: C.white, shade: C.whiteShade, sash: C.red, seed: 73,
    arms: [
      { side: "L", to: [X(pr.x + 0.012), Y(pr.y + 0.012)], bend: 1 },
      { side: "R", to: [X(pr.x + pr.w - 0.012), Y(pr.y + 0.012)], bend: -1 },
    ],
  });
  svg.add(woman.svg);
  const parch = [];
  parch.push(`<rect x="${n(X(pr.x))}" y="${n(Y(pr.y))}" width="${n(X(pr.w))}" height="${n(Y(pr.h))}" fill="#e8dbb8"/>`);
  parch.push(`<rect x="${n(X(pr.x) - X(0.008))}" y="${n(Y(pr.y) - Y(0.002))}" width="${n(X(0.014))}" height="${n(Y(pr.h + 0.004))}" rx="${n(X(0.007))}" fill="#cdb98e"/>`);
  parch.push(`<rect x="${n(X(pr.x + pr.w) - X(0.006))}" y="${n(Y(pr.y) - Y(0.002))}" width="${n(X(0.014))}" height="${n(Y(pr.h + 0.004))}" rx="${n(X(0.007))}" fill="#cdb98e"/>`);
  const pcx = X(pr.x + pr.w / 2);
  const pcy = Y(pr.y + pr.h / 2);
  const ink = C.sepia;
  parch.push(`<rect x="${n(pcx - X(0.06))}" y="${n(pcy - X(0.06))}" width="${n(X(0.12))}" height="${n(X(0.12))}" fill="none" stroke="${ink}" stroke-width="${n(X(0.0016))}"/>`);
  parch.push(`<circle cx="${n(pcx)}" cy="${n(pcy)}" r="${n(X(0.042))}" fill="none" stroke="${ink}" stroke-width="${n(X(0.0018))}"/>`);
  parch.push(`<rect x="${n(pcx - X(0.03))}" y="${n(pcy - X(0.03))}" width="${n(X(0.06))}" height="${n(X(0.06))}" fill="none" stroke="${ink}" stroke-width="${n(X(0.0012))}"/>`);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parch.push(`<rect x="${n(pcx + dx * X(0.06) - X(0.008))}" y="${n(pcy + dy * X(0.06) - X(0.008))}" width="${n(X(0.016))}" height="${n(X(0.016))}" fill="none" stroke="${ink}" stroke-width="${n(X(0.0012))}"/>`);
  for (let i = -3; i <= 3; i++) parch.push(`<line x1="${n(X(pr.x + 0.01))}" y1="${n(pcy + i * Y(0.009))}" x2="${n(X(pr.x + 0.035))}" y2="${n(pcy + i * Y(0.009))}" stroke="${ink}" stroke-width="${n(X(0.0008))}" opacity="0.6"/>`);
  svg.add(`<g filter="url(#${svg.rough(1, 0.06, 74)})">${parch.join("")}</g>`);
  // her hands over the top corners of the sheet
  for (const x of [pr.x + 0.012, pr.x + pr.w - 0.012]) svg.add(`<ellipse cx="${n(X(x))}" cy="${n(Y(pr.y + 0.01))}" rx="${n(X(0.01))}" ry="${n(Y(0.006))}" fill="${C.skin}"/>`);
}

// ---------------------------------------------------------------------------------------------
// drawing (121 frames) and plan: an ink-and-wash construction drawing of the plate's scene on
// cream paper, orbiting from an eye-level three-quarter view up to the top-down plan
// ---------------------------------------------------------------------------------------------

function drawingPaper(svg) {
  paper(svg, { color: "#f1e8d4", seed: 27, fibre: 0.45 });
}

/** The drawing at orbit progress u, on a transparent ground (drawingPaper() goes underneath). */
function drawingScene(svg, u, frame) {
  const S = svg.W;
  const e = lerp(9, 90, smoother(u)) * (Math.PI / 180);
  const az = lerp(34, 0, smoother(clamp(u * 1.08))) * (Math.PI / 180);
  const ce = Math.cos(e);
  const se = Math.sin(e);
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const scale = Math.min((0.8 * S) / (3.64 * (ca + sa)), (0.7 * S) / 3.64);
  const cx = S / 2;
  const cy = S / 2 + 1.0 * ce * scale;
  const proj = ([x, y, z]) => {
    const xr = x * ca + z * sa;
    const zr = -x * sa + z * ca;
    return [cx + xr * scale, cy - (y * ce + zr * se) * scale];
  };
  const toward = (nx, ny, nz) => nx * sa * ce + ny * se - nz * ca * ce; // > 0: faces the viewer
  // lines wobble from frame to frame; the last frame (the plan) is fixed
  const fk = frame === "final" ? 4242 : frame;
  const jit = rng(1000 + fk);
  const wob = () => (jit() - 0.5) * 1.4 * svg.s;
  const sepia = C.sepia;
  const line = (a, b, w = 1.4, op = 0.9, col = sepia) => {
    const [x0, y0] = proj(a);
    const [x1, y1] = proj(b);
    const mx = (x0 + x1) / 2 + wob() * 1.5;
    const my = (y0 + y1) / 2 + wob() * 1.5;
    return `<path d="M${n(x0 + wob())},${n(y0 + wob())} Q${n(mx)},${n(my)} ${n(x1 + wob())},${n(y1 + wob())}" fill="none" stroke="${col}" stroke-width="${n(w * svg.s)}" stroke-linecap="round" opacity="${op}"/>`;
  };
  const poly = (pts, fill, op) => `<path d="M${pts.map((p) => proj(p).map(n).join(",")).join(" L")}Z" fill="${fill}" opacity="${op}"/>`;
  const box = (x0, x1, y0, y1, z0, z1) => [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const BOX_FACES = [
    [[4, 5, 6, 7], [0, 1, 0]],
    [[0, 1, 5, 4], [0, 0, -1]],
    [[1, 2, 6, 5], [1, 0, 0]],
    [[3, 0, 4, 7], [-1, 0, 0]],
    [[2, 3, 7, 6], [0, 0, 1]],
  ];
  const washes = [];
  const lines = [];
  const pencil = [];
  const late = smooth(0.78, 1, u); // the plan's furniture arrives in the last stretch
  // a grey-blue wash for the sky while we are still low, fading as we rise
  if (ce > 0.2) {
    const skyOp = 0.2 * smooth(0.2, 0.9, ce);
    const top = cy - 2.6 * ce * scale;
    const low = cy - 0.7 * ce * scale;
    washes.push(`<path d="M${n(S * 0.2)},${n(top)} Q${n(S * 0.42)},${n(top - S * 0.04)} ${n(S * 0.62)},${n(top + S * 0.01)} Q${n(S * 0.8)},${n(top - S * 0.02)} ${n(S * 0.84)},${n(top + S * 0.08)} Q${n(S * 0.86)},${n(low - S * 0.1)} ${n(S * 0.7)},${n(low)} Q${n(S * 0.5)},${n(low + S * 0.03)} ${n(S * 0.3)},${n(low - S * 0.02)} Q${n(S * 0.16)},${n(low - S * 0.12)} ${n(S * 0.2)},${n(top)}Z" fill="#9fb0c4" opacity="${n(skyOp)}" filter="url(#${svg.rough(22, 0.01, 3 + (fk >> 3), 3)})"/>`);
  }
  // pencil construction lines: the ground plane's axes, a horizon while low, dimension ticks
  pencil.push(line([-2.3, 0, 0], [2.3, 0, 0], 0.8, 0.35, "#8a8174"), line([0, 0, -2.3], [0, 0, 2.3], 0.8, 0.35, "#8a8174"));
  if (ce > 0.3) pencil.push(`<line x1="${n(S * 0.04)}" y1="${n(cy - 0.9 * scale * ce)}" x2="${n(S * 0.96)}" y2="${n(cy - 0.9 * scale * ce)}" stroke="#8a8174" stroke-width="${n(0.7 * svg.s)}" opacity="${n(0.4 * ce)}"/>`);
  for (let i = -4; i <= 4; i++) pencil.push(line([i * 0.25, 0, -2.05], [i * 0.25, 0, -2.15], 0.8, 0.5, "#8a8174"), line([2.05, 0, i * 0.25], [2.15, 0, i * 0.25], 0.8, 0.5, "#8a8174"));
  pencil.push(line([-1.0, 0, -2.1], [1.0, 0, -2.1], 0.8, 0.5, "#8a8174"), line([2.1, 0, -1.0], [2.1, 0, 1.0], 0.8, 0.5, "#8a8174"));
  // the mosaic floor with its meander border
  for (const h of [1.62, 1.82]) lines.push(...[[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]].map(([a, b, c, d]) => line([a, 0, b], [c, 0, d], 1, 0.7)));
  const meander = [];
  const steps = 16;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < steps; i++) {
      const t0 = -1.72 + (i / steps) * 3.44;
      const t1 = -1.72 + ((i + 0.5) / steps) * 3.44;
      const lo = 1.67;
      const hi = 1.77;
      const map = (t, r) => (side === 0 ? [t, 0, -r] : side === 1 ? [r, 0, t] : side === 2 ? [-t, 0, r] : [-r, 0, -t]);
      meander.push([map(t0, lo), map(t0, hi)], [map(t0, hi), map(t1, hi)], [map(t1, hi), map(t1, lo)]);
    }
  }
  for (const [a, b] of meander) lines.push(line(a, b, 0.8, 0.55));
  washes.push(poly([[-1.82, 0, -1.82], [1.82, 0, -1.82], [1.82, 0, 1.82], [-1.82, 0, 1.82]], "#c9a36a", 0.1));
  // the plinth (base and block) in cool grey washes, edges in ink
  for (const [hw, y0, y1] of [[1.14, 0, 0.12], [1.0, 0.12, 0.34]]) {
    const v = box(-hw, hw, y0, y1, -hw, hw);
    for (const [idx, nrm] of BOX_FACES) {
      const f = toward(...nrm);
      if (f > 0.02) washes.push(poly(idx.map((i) => v[i]), nrm[1] ? "#c9ced3" : nrm[0] ? "#9aa3ad" : "#b4bcc4", 0.35 + 0.25 * (1 - f)));
    }
    for (const [a, b] of BOX_EDGES) lines.push(line(v[a], v[b], 1.5, 0.85));
  }
  // the scaffold: four corner towers, ledgers at three heights, braces, a deck, a ladder, a hoist
  const T = 1.38;
  const tw = 0.07;
  const umber = "#6d4a2a";
  const corners = [[-T, -T], [T, -T], [T, T], [-T, T]];
  for (const [x, z] of corners) {
    const v = box(x - tw, x + tw, 0, 2.25, z - tw, z + tw);
    for (const [a, b] of BOX_EDGES) lines.push(line(v[a], v[b], 1.2, 0.8, umber));
    washes.push(poly([v[4], v[5], v[6], v[7]], "#8a6340", 0.45 * se));
  }
  for (const y of [0.75, 1.45, 2.15]) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i];
      const [x1, z1] = corners[(i + 1) % 4];
      lines.push(line([x0, y, z0], [x1, y, z1], 1.3, 0.8, umber));
    }
  }
  lines.push(line([-T, 0, -T], [T, 1.45, -T], 1, 0.6, umber), line([T, 0, -T], [T, 1.45, T], 1, 0.6, umber));
  washes.push(poly([[-T, 1.45, -T], [T, 1.45, -T], [T, 1.45, -T + 0.28], [-T, 1.45, -T + 0.28]], "#b08a5c", 0.4));
  lines.push(line([-T, 1.45, -T + 0.28], [T, 1.45, -T + 0.28], 1, 0.7, umber));
  for (const lx of [-0.62, -0.38]) lines.push(line([lx, 0, -T - 0.35], [lx, 1.45, -T - 0.02], 1.1, 0.8, umber));
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    lines.push(line([-0.62, 1.45 * t, -T - 0.35 + 0.33 * t], [-0.38, 1.45 * t, -T - 0.35 + 0.33 * t], 0.9, 0.7, umber));
  }
  lines.push(line([T, 2.25, T], [T + 0.62, 2.25, T], 1.6, 0.85, umber), line([T + 0.55, 2.25, T], [T + 0.55, 0.95, T], 0.8, 0.7));
  const bucket = box(T + 0.47, T + 0.63, 0.8, 0.95, T - 0.08, T + 0.08);
  for (const [a, b] of BOX_EDGES) lines.push(line(bucket[a], bucket[b], 0.9, 0.75));
  // the orange: a dimpled gold disc with an ochre wash, its stem and two leaves
  const oc = [0, 1.08, 0];
  const [ox, oy] = proj(oc);
  const R = 0.78 * scale;
  const pool = svg.rough(9, 0.02, 5 + (fk >> 2));
  washes.push(`<circle cx="${n(ox + wob())}" cy="${n(oy + wob())}" r="${n(R * 0.98)}" fill="#d9a54e" opacity="0.62" filter="url(#${pool})"/>`);
  washes.push(`<circle cx="${n(ox - R * 0.3)}" cy="${n(oy - R * 0.3)}" r="${n(R * 0.45)}" fill="#f4d79a" opacity="0.5" filter="url(#${svg.blur(R * 0.12 / svg.s)})"/>`);
  lines.push(`<circle cx="${n(ox + wob())}" cy="${n(oy + wob())}" r="${n(R)}" fill="none" stroke="${sepia}" stroke-width="${n(1.8 * svg.s)}" opacity="0.9"/>`);
  lines.push(`<circle cx="${n(ox + wob())}" cy="${n(oy + wob())}" r="${n(R * 1.01)}" fill="none" stroke="${sepia}" stroke-width="${n(0.8 * svg.s)}" opacity="0.4"/>`);
  const dots = rng(88);
  for (let i = 0; i < 70; i++) {
    const a = dots() * TAU;
    const d = Math.sqrt(dots()) * R * 0.92;
    lines.push(`<circle cx="${n(ox + Math.cos(a) * d)}" cy="${n(oy + Math.sin(a) * d)}" r="${n(0.9 * svg.s)}" fill="${sepia}" opacity="0.45"/>`);
  }
  const [stx, sty] = proj([0, 1.08 + 0.78, 0]);
  const [stx2, sty2] = proj([0.06, 1.08 + 0.92, 0.04]);
  lines.push(`<path d="M${n(stx)},${n(sty)} L${n(stx2)},${n(sty2)}" stroke="${sepia}" stroke-width="${n(2.2 * svg.s)}"/>`);
  for (const [lx, lz, len] of [[0.5, 0.25, 0.55], [-0.4, -0.3, 0.45]]) {
    const [ax, ay] = proj([0.02, 1.08 + 0.86, 0]);
    const [bx, by] = proj([lx * len * 1.6, 1.08 + 0.9 + 0.15 * ce, lz * len * 1.6]);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const nx = -(by - ay) * 0.28;
    const ny = (bx - ax) * 0.28;
    lines.push(`<path d="M${n(ax)},${n(ay)} Q${n(mx + nx)},${n(my + ny)} ${n(bx)},${n(by)} Q${n(mx - nx)},${n(my - ny)} ${n(ax)},${n(ay)}Z" fill="#8aa05a" fill-opacity="0.45" stroke="${sepia}" stroke-width="${n(1.1 * svg.s)}"/>`);
  }
  // two tiny workers: one on the deck, one on the ground by the ladder
  for (const [x, y, z] of [[0.35, 1.45, -T + 0.14], [-1.0, 0, -T - 0.5]]) {
    const feet = proj([x, y, z]);
    const sh = proj([x, y + 0.3, z]);
    const head = proj([x, y + 0.38, z]);
    lines.push(`<path d="M${n(feet[0])},${n(feet[1])} L${n(sh[0])},${n(sh[1])}" stroke="${sepia}" stroke-width="${n(2 * svg.s)}"/>`);
    lines.push(`<ellipse cx="${n(sh[0])}" cy="${n(sh[1])}" rx="${n(0.07 * scale)}" ry="${n(0.035 * scale + 0.02 * scale * se)}" fill="none" stroke="${sepia}" stroke-width="${n(1 * svg.s)}"/>`);
    lines.push(`<circle cx="${n(head[0])}" cy="${n(head[1])}" r="${n(0.045 * scale)}" fill="#f1e8d4" stroke="${sepia}" stroke-width="${n(1.1 * svg.s)}"/>`);
  }
  // the plan's furniture: a pencil grid, a north arrow, a fold crease
  if (late > 0) {
    for (let i = 1; i < 12; i++) {
      const v = (i / 12) * S;
      pencil.push(`<line x1="${n(v)}" y1="0" x2="${n(v)}" y2="${S}" stroke="#8a8174" stroke-width="${n(0.6 * svg.s)}" opacity="${n(0.22 * late)}"/>`, `<line x1="0" y1="${n(v)}" x2="${S}" y2="${n(v)}" stroke="#8a8174" stroke-width="${n(0.6 * svg.s)}" opacity="${n(0.22 * late)}"/>`);
    }
    const ax = S * 0.88;
    const ay = S * 0.14;
    const L = S * 0.05;
    lines.push(`<g opacity="${n(late)}"><path d="M${n(ax)},${n(ay - L)} L${n(ax + L * 0.25)},${n(ay + L * 0.4)} L${n(ax)},${n(ay + L * 0.2)} L${n(ax - L * 0.25)},${n(ay + L * 0.4)}Z" fill="${sepia}" opacity="0.8"/><line x1="${n(ax)}" y1="${n(ay + L * 0.2)}" x2="${n(ax)}" y2="${n(ay + L * 0.8)}" stroke="${sepia}" stroke-width="${n(1.2 * svg.s)}"/><path d="M${n(ax - L * 0.12)},${n(ay - L * 1.25)} L${n(ax - L * 0.12)},${n(ay - L * 1.6)} L${n(ax + L * 0.12)},${n(ay - L * 1.25)} L${n(ax + L * 0.12)},${n(ay - L * 1.6)}" fill="none" stroke="${sepia}" stroke-width="${n(1.2 * svg.s)}"/></g>`);
    washes.push(`<rect x="${n(S * 0.5 - 2 * svg.s)}" y="0" width="${n(4 * svg.s)}" height="${S}" fill="#8b7350" opacity="${n(0.12 * late)}" filter="url(#${svg.blur(3)})"/>`, `<line x1="${n(S * 0.5)}" y1="0" x2="${n(S * 0.5)}" y2="${S}" stroke="#fffaf0" stroke-width="${n(1 * svg.s)}" opacity="${n(0.5 * late)}"/>`);
  }
  svg.add(`<g>${pencil.join("")}</g>`, `<g style="mix-blend-mode:multiply">${washes.join("")}</g>`, `<g>${lines.join("")}</g>`);
}

// ---------------------------------------------------------------------------------------------
// coda (89 frames) and share-orange: on flat blue, a woman in white lifts a gilded picking rod to
// a potted orange tree on a plinth; one orange comes free and floats down-left while the camera
// pushes in, she and the tree leave on the right, and it hangs alone, centred: share-orange
// ---------------------------------------------------------------------------------------------

/** The coda's camera, the picked orange and the rod at progress u (0..1). Units: frame fractions. */
function codaState(u, art) {
  const so = art["share-orange"];
  const endR = so.radii.orange; // the orange's radius in share-orange, as a fraction of the width
  // where share-orange's orange lands in the coda's 16:9 frame (share-orange cover-fitted: the
  // square's centre band), in frame fractions
  const target = { x: so.anchors.orange.x, y: (so.anchors.orange.y - (1 - 9 / 16) / 2) * (16 / 9) };
  const pick = smooth(0.0, 0.26, u); // the rod rises to the fruit
  const free = smooth(0.26, 0.36, u); // it comes free
  const travel = smoother(clamp((u - 0.3) / 0.5)); // floats down-left, the camera pushes in; settled by 0.8
  const start = { x: 0.64, y: 0.305, r: 0.02 };
  const end = { x: 0.28, y: 0.5, r: 0.05 };
  const zoomEnd = endR / end.r;
  const zoom = lerp(1, zoomEnd, travel);
  const camEnd = { x: end.x - (target.x - 0.5) / zoomEnd, y: end.y - (target.y - 0.5) / zoomEnd };
  const cam = { x: lerp(0.5, camEnd.x, travel), y: lerp(0.5, camEnd.y, travel), zoom };
  // it drifts left first and sinks later, so it passes over her head rather than across it
  const across = smoother(clamp((u - 0.3) / 0.42));
  const down = smoother(clamp((u - 0.38) / 0.42));
  const o = { x: lerp(start.x, end.x, across), y: lerp(start.y, end.y, down) + free * (1 - travel) * 0.01, r: lerp(start.r, end.r, travel) };
  return { pick, free, travel, cam, o, start };
}

/**
 * The coda is drawn on share-orange's square canvas, its 16:9 frame being the square's centre
 * band, so the last frame is exactly share-orange cover-fitted (same field, texture, vignette).
 */
function codaScene(svg, u, art) {
  const W = svg.W;
  const H = (W * 9) / 16; // the frame's height inside the square
  const top = (svg.H - H) / 2;
  const st = codaState(u, art);
  const { cam } = st;
  codaField(svg);
  // scene coordinates (fractions of the first frame) -> pixels through the camera
  const sx = (x) => (x - cam.x) * cam.zoom * W + W / 2;
  const sy = (y) => (y - cam.y) * cam.zoom * H + H / 2 + top;
  const sl = (v) => v * cam.zoom * W;
  const g = [];
  // the plinth, the urn, the little tree with eight oranges (three gilded)
  g.push(marbleStep(svg, { x0: sx(0.56), x1: sx(0.86), top: sy(0.7), tread: sy(0.725), bottom: sy(1.05), seed: 4, veins: 4 }));
  const urn = svg.linear([[0, "#fbf8f1"], [0.6, C.marble], [1, C.marbleShade]], [0, 0, 1, 0]);
  g.push(`<path d="M${n(sx(0.675))},${n(sy(0.7))} L${n(sx(0.745))},${n(sy(0.7))} Q${n(sx(0.775))},${n(sy(0.62))} ${n(sx(0.76))},${n(sy(0.585))} L${n(sx(0.66))},${n(sy(0.585))} Q${n(sx(0.645))},${n(sy(0.62))} ${n(sx(0.675))},${n(sy(0.7))}Z" fill="url(#${urn})"/>`);
  g.push(`<rect x="${n(sx(0.65))}" y="${n(sy(0.572))}" width="${n(sl(0.12))}" height="${n(sl(0.012))}" fill="${C.marbleTop}"/>`);
  g.push(branch(svg, [sx(0.71), sy(0.58)], [sx(0.705), sy(0.47)], [sx(0.71), sy(0.36)], sl(0.008), sl(0.005)));
  g.push(leafCluster(svg, sx(0.71), sy(0.3), sl(0.085), 70, { seed: 5, len: sl(0.026), spread: 1 }));
  const fruit = [[0.67, 0.25, 0], [0.75, 0.24, 1], [0.79, 0.31, 0], [0.7, 0.35, 0], [0.74, 0.37, 1], [0.66, 0.36, 0], [0.73, 0.2, 0]];
  for (const [x, y, gold] of fruit) g.push(orange(svg, { cx: sx(x), cy: sy(y), r: sl(0.018), gilded: !!gold, seed: 5, leaves: 0, stem: false, rough: false }));
  g.push(leafCluster(svg, sx(0.71), sy(0.27), sl(0.06), 22, { seed: 6, len: sl(0.024) }));
  // the woman in white with a crimson sash, lifting the rod
  const tip = [lerp(0.6, st.start.x - 0.012, st.pick), lerp(0.42, st.start.y + 0.022, st.pick)];
  const handAt = [0.54, lerp(0.56, 0.53, st.pick)];
  const woman = figure(svg, {
    x: sx(0.515), y: sy(0.99), h: sl(0.58 * (H / W)), face: 1, gown: C.white, shade: C.whiteShade, sash: C.crimson, seed: 81,
    arms: [
      { side: "R", to: [sx(handAt[0]), sy(handAt[1])], bend: 1 },
      { side: "L", to: [sx(handAt[0] - 0.012), sy(handAt[1] + 0.07)], bend: 1 },
    ],
  });
  g.push(woman.svg);
  g.push(`<path d="M${n(sx(handAt[0] - 0.02))},${n(sy(handAt[1] + 0.09))} L${n(sx(tip[0]))},${n(sy(tip[1]))}" stroke="${C.gold}" stroke-width="${n(sl(0.0035))}" stroke-linecap="round"/>`);
  g.push(`<path d="M${n(sx(handAt[0] - 0.02))},${n(sy(handAt[1] + 0.09))} L${n(sx(tip[0]))},${n(sy(tip[1]))}" stroke="#fff0b0" stroke-width="${n(sl(0.0012))}" stroke-linecap="round" opacity="0.7" transform="translate(${n(-sl(0.001))} ${n(-sl(0.001))})"/>`);
  // a few leaves scatter as the fruit comes free
  const lr = rng(12);
  for (let i = 0; i < 5; i++) {
    const fall = clamp((u - 0.28 - i * 0.02) / 0.5);
    if (fall <= 0) continue;
    const lx = st.start.x + (lr() - 0.3) * 0.05 - fall * (0.08 + lr() * 0.12);
    const ly = st.start.y + fall * (0.25 + lr() * 0.25);
    g.push(leaf(svg, sx(lx), sy(ly), sl(0.022), lr() * 360 + fall * 400, { tone: "dark" }));
  }
  svg.add(g.join(""));
  // the picked orange is drawn in screen space so its last frames match share-orange exactly
  const ox = sx(st.o.x);
  const oy = sy(st.o.y);
  const orr = sl(st.o.r);
  svg.add(shareOrangeFruit(svg, ox, oy, orr));
}

/** The floating gilded orange with a short stem and one leaf (shared by coda and share-orange). */
function shareOrangeFruit(svg, cx, cy, r) {
  return orange(svg, { cx, cy, r, gilded: true, seed: 6, leaves: 1, leafAngle: 6, leafScale: 1.05 });
}

/** Flat deep blue, a quiet field (the coda's backdrop has no texture). */
function codaField(svg) {
  svg.add(`<rect width="${svg.W}" height="${svg.H}" fill="${C.sky}"/>`);
  sky(svg, { top: "#1d4a96", mid: C.sky, low: "#23529f", seed: 19, mottle: 0.2 });
}

function shareOrangeScene(svg, art) {
  const so = art["share-orange"];
  codaField(svg);
  svg.add(shareOrangeFruit(svg, so.anchors.orange.x * svg.W, so.anchors.orange.y * svg.H, so.radii.orange * svg.W));
}

// ---------------------------------------------------------------------------------------------
// canopy (loop): looking straight up through an orange tree, leaves and a dozen oranges round all
// four edges, the centre half clear sky; the nearest orange sits on its anchor on the first frame
// ---------------------------------------------------------------------------------------------

function canopyLeaves(svg, art, { swayer = true } = {}) {
  const [X, Y] = P(svg);
  const a = art.canopy.anchors.nearestOrange;
  const rNear = art.canopy.radii.nearestOrange;
  const rand = rng(101);
  const inner = (x, y) => ((x - 0.5) / 0.34) ** 2 + ((y - 0.5) / 0.36) ** 2; // < 1: keep clear
  svg.add(`<g filter="url(#${svg.rough(2.5, 0.03, 57)})">`);
  // branches from the edges and corners toward the gap
  const limbs = [
    [[-0.04, -0.06], [0.16, 0.12], [a.x - 0.012, a.y - 0.06]],
    [[0.55, -0.06], [0.58, 0.06], [0.64, 0.14]],
    [[1.04, 0.1], [0.9, 0.2], [0.8, 0.22]],
    [[1.04, 0.86], [0.88, 0.8], [0.78, 0.76]],
    [[0.4, 1.06], [0.42, 0.92], [0.46, 0.85]],
    [[-0.04, 0.75], [0.1, 0.7], [0.2, 0.66]],
    [[-0.04, 0.38], [0.06, 0.42], [0.15, 0.44]],
  ];
  for (const [p0, c, p1] of limbs) svg.add(branch(svg, [X(p0[0]), Y(p0[1])], [X(c[0]), Y(c[1])], [X(p1[0]), Y(p1[1])], X(0.014), X(0.004), C.barkDark));
  svg.add(`</g>`);
  // dark foliage masses round the edges, under the leaves (depth in the canopy)
  const masses = [];
  const massSpots = [];
  for (let i = 0; i < 70; i++) {
    const x = rand() * 1.1 - 0.05;
    const y = rand() * 1.1 - 0.05;
    const k = inner(x, y);
    if (k < 1.5) continue;
    const r = 0.05 + rand() * 0.07;
    massSpots.push([x, y, r]);
    masses.push(`<ellipse cx="${n(X(x))}" cy="${n(Y(y))}" rx="${n(X(r))}" ry="${n(X(r * 0.75))}" transform="rotate(${n(rand() * 180)} ${n(X(x))} ${n(Y(y))})" fill="${rand() < 0.5 ? "#12291a" : "#1c3a20"}"/>`);
  }
  svg.add(`<g filter="url(#${svg.rough(30, 0.012, 58, 3)})" opacity="0.92"><g filter="url(#${svg.blur(6)})">${masses.join("")}</g></g>`);
  // dense leaves round the edges, thinning toward the open centre
  const leaves = [];
  for (let i = 0; i < 1500; i++) {
    const x = rand() * 1.08 - 0.04;
    const y = rand() * 1.08 - 0.04;
    const k = inner(x, y);
    if (k < 1.05) continue;
    if (rand() > clamp((k - 1.05) * 1.4 + 0.15)) continue;
    const back = rand() < 0.18;
    leaves.push(leaf(svg, X(x), Y(y), X(0.026 + rand() * 0.02), rand() * 360, { tone: back ? "lit" : "dark", gloss: !back }));
  }
  // every mass carries leaves of its own, so none shows as a bare shape
  for (const [x, y, r] of massSpots) {
    for (let j = 0; j < 14; j++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * r * 0.9;
      leaves.push(leaf(svg, X(x + Math.cos(a) * d), Y(y) + X(Math.sin(a) * d * 0.75), X(0.026 + rand() * 0.02), rand() * 360, { tone: rand() < 0.15 ? "lit" : "dark" }));
    }
  }
  for (const [p0, , p1] of limbs) {
    for (let t = 0.3; t <= 1.0001; t += 0.1) {
      const x = lerp(p0[0], p1[0], t);
      const y = lerp(p0[1], p1[1], t);
      leaves.push(leaf(svg, X(x), Y(y), X(0.024 + rand() * 0.014), rand() * 360, { tone: rand() < 0.2 ? "lit" : "dark" }));
    }
  }
  svg.add(leaves.join(""));
  // a dozen oranges round the edges, some lit from behind so the peel glows
  const glow = svg.radial([[0, "#ffd27a", 0.6], [0.5, "#ffb347", 0.25], [1, "#ffb347", 0]], {}, "backlit");
  const spots = [[0.12, 0.1], [0.27, 0.07], [0.88, 0.1], [0.94, 0.3], [0.1, 0.55], [0.07, 0.86], [0.24, 0.9], [0.62, 0.92], [0.85, 0.88], [0.95, 0.62], [0.5, 0.05]];
  spots.forEach(([x, y], i) => {
    const r = X(0.028 + (i % 3) * 0.006);
    if (i % 3 === 0) svg.add(`<circle cx="${n(X(x))}" cy="${n(Y(y))}" r="${n(r * 2.2)}" fill="url(#${glow})"/>`);
    svg.add(orange(svg, { cx: X(x), cy: Y(y), r, seed: 5 + i, leaves: 0, stem: false, gilded: i % 3 === 0, rough: false }));
  });
  // the nearest orange, exactly on its anchor, glowing a little
  svg.add(`<circle cx="${n(X(a.x))}" cy="${n(Y(a.y))}" r="${n(X(rNear) * 2)}" fill="url(#${glow})"/>`);
  svg.add(`<path d="M${n(X(a.x))},${n(Y(a.y) - X(rNear))} L${n(X(a.x - 0.004))},${n(Y(a.y - 0.05))}" stroke="${C.barkDark}" stroke-width="${n(X(0.003))}"/>`);
  svg.add(orange(svg, { cx: X(a.x), cy: Y(a.y), r: X(rNear), gilded: true, seed: 9, leaves: 1, leafAngle: 20, stemLen: X(rNear) * 0.25 }));
  if (swayer) svg.add(canopySwayer(svg, 0));
}

/** The orange that sways on its stem (drawn per frame), hanging from the right-hand branch. */
function canopySwayer(svg, angle) {
  const [X, Y] = P(svg);
  const px = X(0.8);
  const py = Y(0.22);
  const len = Y(0.07);
  const r = X(0.03);
  const cx = px;
  const cy = py + len + r;
  return `<g transform="rotate(${n(angle)} ${n(px)} ${n(py)})"><path d="M${n(px)},${n(py)} L${n(cx)},${n(cy - r)}" stroke="${C.barkDark}" stroke-width="${n(X(0.003))}"/>${orange(svg, { cx, cy, r, seed: 13, leaves: 1, leafAngle: -30, stemLen: r * 0.2, rough: false })}</g>`;
}

// ---------------------------------------------------------------------------------------------
// application: a woman in white with a crimson sash on marble steps, seen from behind, pointing up
// at the sky with her fingertip on the anchor; cumulus brightest near her hand; a small gilded
// orange on the top step
// ---------------------------------------------------------------------------------------------

function applicationScene(svg, art) {
  const [X, Y] = P(svg);
  const tip = art.application.anchors.fingertip;
  sky(svg, { seed: 13 });
  // cumulus: large and bright near her hand, thinning toward the top right
  svg.add(cloud(svg, { x: X(0.5), y: Y(0.5), w: X(0.5), h: Y(0.2), seed: 3, light: 0.75 }));
  svg.add(cloud(svg, { x: X(0.8), y: Y(0.62), w: X(0.36), h: Y(0.15), seed: 4, light: 0.65 }));
  svg.add(cloud(svg, { x: X(0.42), y: Y(0.3), w: X(0.36), h: Y(0.24), seed: 1, light: 1 }));
  svg.add(cloud(svg, { x: X(0.66), y: Y(0.24), w: X(0.24), h: Y(0.12), seed: 2, light: 0.7 }));
  svg.add(cloud(svg, { x: X(0.86), y: Y(0.12), w: X(0.14), h: Y(0.05), seed: 5, light: 0.45 }));
  // a brighter bloom right at the fingertip
  svg.add(`<circle cx="${n(X(tip.x + 0.02))}" cy="${n(Y(tip.y + 0.06))}" r="${n(X(0.12))}" fill="url(#${svg.radial([[0, "#fffdf6", 0.55], [1, "#fffdf6", 0]])})"/>`);
  // the flight of steps on the left
  svg.add(marbleStep(svg, { x0: X(-0.01), x1: X(0.62), top: Y(0.945), tread: Y(0.962), bottom: Y(1.01), seed: 5 }));
  svg.add(marbleStep(svg, { x0: X(-0.01), x1: X(0.54), top: Y(0.9), tread: Y(0.918), bottom: Y(0.945), seed: 8 }));
  svg.add(marbleStep(svg, { x0: X(-0.01), x1: X(0.46), top: Y(0.855), tread: Y(0.873), bottom: Y(0.9), seed: 11 }));
  svg.add(`<ellipse cx="${n(X(0.27))}" cy="${n(Y(0.866))}" rx="${n(X(0.07))}" ry="${n(Y(0.01))}" fill="#3b3326" opacity="0.3" filter="url(#${svg.blur(8)})"/>`);
  // her, from behind at three-quarter, right arm raised, index finger on the anchor
  const tipPx = [X(tip.x), Y(tip.y)];
  const h = Y(0.64);
  const woman = figure(svg, {
    x: X(0.215), y: Y(0.868), h, back: true, face: 1, gown: C.white, shade: C.whiteShade, sash: C.crimson, seed: 91, lean: X(0.006),
    arms: [
      { side: "R", to: [tipPx[0] - h * 0.035, tipPx[1] + h * 0.075], bend: 1, hand: "point", tip: tipPx },
      { side: "L", to: [X(0.185), Y(0.57)], bend: -1 },
    ],
  });
  svg.add(woman.svg);
  // the small gilded orange on the top step beside her
  svg.add(orange(svg, { cx: X(0.36), cy: Y(0.842), r: X(0.017), gilded: true, seed: 6, leaves: 1, stemLen: X(0.004) }));
}

// ---------------------------------------------------------------------------------------------
// sapling: a young tree painted small, growing from bare marble at the bottom centre
// ---------------------------------------------------------------------------------------------

function saplingScene(svg, art) {
  const [X, Y] = P(svg);
  const foot = art.sapling.anchors.trunkFoot;
  sky(svg, { seed: 14 });
  svg.add(marbleStep(svg, { x0: X(-0.01), x1: X(1.01), top: Y(foot.y), tread: Y(foot.y + 0.018), bottom: Y(1.01), seed: 6, veins: 5 }));
  const fx = X(foot.x);
  const fy = Y(foot.y + 0.006);
  svg.add(`<ellipse cx="${n(fx + X(0.02))}" cy="${n(fy)}" rx="${n(X(0.04))}" ry="${n(Y(0.006))}" fill="#3b3326" opacity="0.35" filter="url(#${svg.blur(4)})"/>`);
  svg.add(`<g filter="url(#${svg.rough(1.5, 0.05, 63)})">`);
  svg.add(branch(svg, [fx, fy], [fx - X(0.006), Y(0.78)], [fx + X(0.003), Y(0.62)], X(0.0042), X(0.0016)));
  svg.add(branch(svg, [fx - X(0.002), Y(0.74)], [fx - X(0.02), Y(0.7)], [fx - X(0.034), Y(0.66)], X(0.0018), X(0.0009)));
  svg.add(branch(svg, [fx + X(0.001), Y(0.7)], [fx + X(0.02), Y(0.67)], [fx + X(0.03), Y(0.635)], X(0.0016), X(0.0008)));
  svg.add(`</g>`);
  const spots = [[-0.034, 0.66, -150], [-0.026, 0.68, -110], [-0.016, 0.7, -170], [0.003, 0.62, -80], [0.008, 0.64, -40], [-0.006, 0.645, -130], [0.03, 0.635, -30], [0.022, 0.66, 10], [0.012, 0.675, -60], [0.004, 0.72, 20], [-0.004, 0.76, 170], [0.006, 0.79, 30]];
  for (const [dx, y, a] of spots) svg.add(leaf(svg, fx + X(dx), Y(y), X(0.018), a, { tone: "young" }));
  for (const [dx, y] of [[-0.03, 0.68], [0.026, 0.655], [0.009, 0.69]]) svg.add(orange(svg, { cx: fx + X(dx), cy: Y(y), r: X(0.0065), green: true, stem: false, rough: false, dimples: 0.05 }));
}

// ---------------------------------------------------------------------------------------------
// finale (loop): a young tree with five gilded oranges at the centre of the sky; on the left a woman
// in white pours from a brass can at its roots, on the right a young man in green ties up a branch;
// both cropped by the frame; open sky above the tree for the wordmark
// ---------------------------------------------------------------------------------------------

function finaleStatic(svg, art) {
  const [X, Y] = P(svg);
  const roots = art.finale.anchors.roots;
  sky(svg, { seed: 16 });
  svg.add(marbleStep(svg, { x0: X(0.3), x1: X(0.68), top: Y(roots.y), tread: Y(roots.y + 0.025), bottom: Y(1.01), seed: 12, veins: 4 }));
  svg.add(`<ellipse cx="${n(X(roots.x + 0.02))}" cy="${n(Y(roots.y + 0.008))}" rx="${n(X(0.06))}" ry="${n(Y(0.008))}" fill="#3b3326" opacity="0.35" filter="url(#${svg.blur(5)})"/>`);
  svg.add(`<g filter="url(#${svg.rough(2, 0.04, 67)})">`);
  svg.add(branch(svg, [X(roots.x), Y(roots.y + 0.004)], [X(roots.x - 0.008), Y(0.72)], [X(roots.x + 0.004), Y(0.56)], X(0.009), X(0.005)));
  svg.add(branch(svg, [X(roots.x + 0.002), Y(0.64)], [X(roots.x + 0.06), Y(0.6)], [X(0.6), Y(0.54)], X(0.004), X(0.002)));
  svg.add(branch(svg, [X(roots.x - 0.002), Y(0.62)], [X(roots.x - 0.05), Y(0.58)], [X(0.4), Y(0.52)], X(0.004), X(0.002)));
  svg.add(`</g>`);
}

function finaleCrown(svg, art) {
  const [X, Y] = P(svg);
  const roots = art.finale.anchors.roots;
  const cx = X(roots.x);
  svg.add(leafCluster(svg, cx, Y(0.5), X(0.1), 120, { seed: 31, len: X(0.026) }));
  svg.add(leafCluster(svg, cx - X(0.07), Y(0.53), X(0.04), 26, { seed: 32, len: X(0.022) }));
  svg.add(leafCluster(svg, cx + X(0.08), Y(0.54), X(0.04), 26, { seed: 33, len: X(0.022) }));
  for (const [dx, y] of [[-0.06, 0.47], [0.05, 0.43], [0.0, 0.53], [0.075, 0.51], [-0.03, 0.4]]) {
    svg.add(orange(svg, { cx: cx + X(dx), cy: Y(y), r: X(0.017), gilded: true, seed: 6, leaves: 0, stemLen: X(0.004), rough: false }));
  }
  svg.add(leafCluster(svg, cx, Y(0.47), X(0.08), 30, { seed: 34, len: X(0.022), tone: "dark" }));
}

function finaleFigures(svg, art, t) {
  const [X, Y] = P(svg);
  const spout = art.finale.anchors.spout;
  const s = (k, ph) => Math.sin(TAU * k * t + ph);
  const canSize = X(0.068);
  const tip = [X(spout.x), Y(spout.y)];
  const grip = [tip[0] - canSize * 1.27, tip[1] - canSize * 0.82];
  const w = figure(svg, {
    x: X(0.125), y: Y(1.45), h: Y(1.2), face: 1, gown: C.white, shade: C.whiteShade, sash: C.red, seed: 95,
    sway: X(0.004) * s(2, 0.5), lean: X(0.02) + X(0.002) * s(1, 0.2),
    arms: [
      { side: "R", to: grip, bend: 1 },
      { side: "L", to: [tip[0] - canSize * 1.55, tip[1] + canSize * 0.1], bend: 1, front: false },
    ],
  });
  const can = wateringCan(svg, { tip, size: canSize, dir: 1, tilt: 1.6 + 1.6 * s(1, -Math.PI / 2), pivot: grip });
  const knot = [X(0.615) + X(0.005) * Math.cos(TAU * 2 * t), Y(0.55) + Y(0.008) * Math.sin(TAU * 2 * t)];
  const m = figure(svg, {
    x: X(0.875), y: Y(1.4), h: Y(1.15), face: -1, gown: C.velvet, shade: C.velvetDark, lit: C.velvetLight, hair: C.auburn, bun: false, seed: 97,
    sway: X(0.003) * s(2, 1.4), lean: -X(0.085) + X(0.002) * s(1, 1.0), sleeve: C.velvet,
    arms: [
      { side: "L", to: knot, bend: -1 },
      { side: "R", to: [knot[0] + X(0.02), knot[1] + Y(0.03)], bend: 1, front: false },
    ],
  });
  // twine at the knot
  const tw = `<path d="M${n(knot[0] - X(0.01))},${n(knot[1] + Y(0.005))} q${n(X(0.012))},${n(Y(0.012))} ${n(X(0.022))},${n(-Y(0.004))}" fill="none" stroke="${C.raffia}" stroke-width="${n(X(0.0022))}"/>`;
  svg.add(m.svg, tw, w.svg, can);
}

// ---------------------------------------------------------------------------------------------
// Rendering helpers shared by the painters
// ---------------------------------------------------------------------------------------------

async function render(W, H, draw) {
  const svg = new Svg(W, H);
  draw(svg);
  return (await renderSvg(svg)).data;
}

async function heroFrame(art, W, H, t, { labelText = label("hero"), base = null } = {}) {
  const bg = base ?? (await render(W, H, (svg) => heroStatic(svg, art)));
  const figs = await renderSvg((() => {
    const svg = new Svg(W, H);
    heroFigures(svg, art, t);
    return svg;
  })());
  const raw = await over(bg, W, H, [figs]);
  return finish(raw, W, H, { seed: 7, vignette: 0.38, label: labelText });
}

async function graftFrame(art, W, H, { labelText = label("graft") } = {}) {
  const raw = await render(W, H, (svg) => graftScene(svg, art));
  return finish(raw, W, H, { seed: 8, vignette: 0.16, label: labelText, ink: true, vignetteColor: "#5a4526" });
}

// =============================================================================================
// Writers
// =============================================================================================

const tierTargets = (entry, ctx, tiers = entry.tiers) =>
  ctx.tiers.map((t) => {
    const [width, height] = tierSize(t, entry.aspect);
    return { file: publicPath(tiers[t]), width, height };
  });

async function writeStill(entry, ctx, raw, W, H, tiers = entry.tiers) {
  if (ctx.preview) return previewPng(ctx, `${entry.id}${tiers === entry.tiers ? "" : "-last"}`, raw, W, H);
  await writeTiersRaw(raw, W, H, tierTargets(entry, ctx, tiers));
}

async function previewPng(ctx, name, raw, W, H) {
  mkdirSync(ctx.preview, { recursive: true });
  await sharp(raw, { raw: { width: W, height: H, channels: 4 } }).removeAlpha().png().toFile(join(ctx.preview, `${name}.png`));
}

/** Run `fn(i)` for i in 0..count-1 with a few in flight. */
async function pool(count, fn, width = CONCURRENCY) {
  let next = 0;
  const workers = Array.from({ length: Math.min(width, count) }, async () => {
    while (next < count) {
      const i = next++;
      await fn(i);
    }
  });
  await Promise.all(workers);
}

/** Write a frame sequence: `frame(k)` returns RGBA at the 1440 tier's size. */
async function writeSequence(entry, ctx, count, frame) {
  const [W, H] = tierSize("1440", entry.aspect);
  if (ctx.preview) {
    for (const k of [0, Math.round((count - 1) * 0.33), Math.round((count - 1) * 0.66), count - 1]) {
      await previewPng(ctx, `${entry.id}-f${String(k).padStart(3, "0")}`, await frame(k), W, H);
    }
    return;
  }
  for (const t of ctx.tiers) rmSync(publicPath(entry.tierDirs[t]), { recursive: true, force: true });
  await pool(count, async (k) => {
    const raw = await frame(k);
    const targets = ctx.tiers.map((t) => {
      const [width, height] = tierSize(t, entry.aspect);
      return { file: join(publicPath(entry.tierDirs[t]), `f_${String(k).padStart(3, "0")}.jpg`), width, height };
    });
    await writeTiersRaw(raw, W, H, targets);
    if (ctx.progress) ctx.progress(k + 1, count);
  });
  writeFileSync(publicPath(entry.manifest), frameManifestText(ctx.tiers, count));
}

/** Write a loop: `frame(t)` returns RGBA at LOOP_SIZE for loop phase t in [0, 1). */
async function writeLoop(entry, ctx, frame) {
  const [W, H] = LOOP_SIZE;
  const total = LOOP_FPS * LOOP_SECONDS;
  if (ctx.preview) {
    for (const t of [0, 0.25, 0.5]) await previewPng(ctx, `${entry.id}-t${t}`, await frame(t), W, H);
    return;
  }
  const poster = await frame(0);
  await writeJpegRaw(poster, W, H, publicPath(entry.poster));
  if (!loopEncoder()) {
    ctx.warn(`${entry.id}: no H.264 encoder (install ffmpeg); wrote the poster only, ${entry.src} is missing`);
    return;
  }
  const enc = openLoopEncoder(publicPath(entry.src), { width: W, height: H, fps: LOOP_FPS, frames: total, kbps: 2200 });
  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, total - i) }, (_, j) => (i + j === 0 ? poster : frame((i + j) / total))),
    );
    for (const f of batch) await enc.write(f);
    if (ctx.progress) ctx.progress(Math.min(total, i + CONCURRENCY), total);
  }
  await enc.close();
}

// =============================================================================================
// Painters, one per id
// =============================================================================================

const PAINTERS = {
  async hero(entry, ctx) {
    const [W, H] = LOOP_SIZE;
    const base = await render(W, H, (svg) => heroStatic(svg, ctx.art));
    await writeLoop(entry, ctx, (t) => heroFrame(ctx.art, W, H, t, { base }));
  },

  async graft(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    await writeStill(entry, ctx, await graftFrame(ctx.art, W, H), W, H);
  },

  async bridge(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const count = entry.expectedCount;
    // first frame = the hero loop's frame 0, last frame = graft; both without their labels
    const A = await heroFrame(ctx.art, W, H, 0, { labelText: null });
    const B = await graftFrame(ctx.art, W, H, { labelText: null });
    // the plinth's area in A (it darkens toward bark just ahead of the rising edge)
    const plinth = await render(W, H, (svg) => {
      const [X, Y] = P(svg);
      for (const [x0, x1, top, , bottom] of heroSteps(ctx.art)) svg.add(`<rect x="${n(X(x0))}" y="${n(Y(top))}" width="${n(X(x1 - x0))}" height="${n(Y(bottom - top))}" fill="#fff"/>`);
    });
    // the torn edge's noise, at full resolution (one field, two scales)
    const tearA = noiseField(W, H, { scale: 9, octaves: 5, seed: 61 });
    const tearB = noiseField(W, H, { scale: 46, octaves: 2, seed: 62 });
    const tear = new Float32Array(W * H);
    for (let i = 0; i < tear.length; i++) tear[i] = (tearA[i] - 0.5) * 0.3 + (tearB[i] - 0.5) * 0.06;
    const bark = [70, 46, 28];
    const paperRim = [246, 241, 230];
    const frame = async (k) => {
      const t = k / (count - 1);
      const e = smoother(clamp((t - 0.06) / 0.88));
      const front = 1.12 - 1.3 * e; // y (0 top, 1 bottom) of the torn edge, rising
      const out = Buffer.alloc(W * H * 4);
      for (let y = 0; y < H; y++) {
        const fy = y / H;
        for (let x = 0; x < W; x++) {
          const d = fy + tear[y * W + x] - front; // > 0: below the edge
          const i = (y * W + x) * 4;
          const m = clamp(d / 0.01 + 0.5);
          // ahead of the edge the marble darkens toward bark
          const ahead = clamp(1 + d / 0.16) * (1 - m) * (plinth[i] / 255) * 0.85 * Math.min(1, e * 4);
          const rim = Math.exp(-((d / 0.006) ** 2)) * (e > 0 && e < 1 ? 1 : 0);
          for (let c = 0; c < 3; c++) {
            let a = A[i + c];
            a = a + (bark[c] - a) * ahead;
            let v = a + (B[i + c] - a) * m;
            v = v + (paperRim[c] - v) * rim * 0.85;
            out[i + c] = v;
          }
          out[i + 3] = 255;
        }
      }
      return finish(out, W, H, { texture: 0, vignette: 0, label: label("bridge", k), ink: k > count * 0.6 });
    };
    await writeSequence(entry, ctx, count, frame);
  },

  async grove(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const raw = await render(W, H, (svg) => groveScene(svg));
    await writeStill(entry, ctx, await finish(raw, W, H, { seed: 10, vignette: 0.2, label: label("grove"), ink: true, vignetteColor: "#4a4a3a" }), W, H);
  },

  async share(entry, ctx) {
    // two keyframes: "main" (him studying the orange) and "last" (the halves held apart)
    const [W, H] = tierSize("1440", entry.aspect);
    const parts = ctx.parts ?? ["main", "last"];
    if (parts.includes("main")) {
      const first = await render(W, H, (svg) => shareScene(svg));
      await writeStill(entry, ctx, await finish(first, W, H, { seed: 11, vignette: 0.16, label: label("share"), ink: true, vignetteColor: "#5a4526" }), W, H);
    }
    if (parts.includes("last")) {
      const last = await render(W, H, (svg) => shareLastScene(svg, ctx.art));
      await writeStill(entry, ctx, await finish(last, W, H, { seed: 11, vignette: 0.16, label: label("share/last"), ink: true, vignetteColor: "#5a4526" }), W, H, entry.last);
    }
  },

  async plate(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const raw = await render(W, H, (svg) => plateScene(svg));
    await writeStill(entry, ctx, await finish(raw, W, H, { seed: 12, vignette: 0.3, label: label("plate") }), W, H);
  },

  async drawing(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const count = entry.expectedCount;
    await writeSequence(entry, ctx, count, (k) => drawingFrame(W, H, k, count, label("drawing", k)));
  },

  async plan(entry, ctx) {
    // the drawing's last frame, exactly
    const [W, H] = tierSize("1440", entry.aspect);
    const count = ctx.art.drawing.expectedCount;
    await writeStill(entry, ctx, await drawingFrame(W, H, count - 1, count, label("plan")), W, H);
  },

  async coda(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const count = entry.expectedCount;
    const top = Math.round((W - H) / 2);
    await writeSequence(entry, ctx, count, async (k) => {
      const sq = await render(W, W, (svg) => codaScene(svg, k / (count - 1), ctx.art));
      const done = await finish(sq, W, W, codaFinish(null));
      const band = await sharp(done, { raw: { width: W, height: W, channels: 4 } }).extract({ left: 0, top, width: W, height: H }).raw().toBuffer();
      return finish(band, W, H, { texture: 0, vignette: 0, label: label("coda", k) });
    });
  },

  async "share-orange"(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const raw = await render(W, H, (svg) => shareOrangeScene(svg, ctx.art));
    await writeStill(entry, ctx, await finish(raw, W, H, codaFinish(label("share-orange"))), W, H);
  },

  async canopy(entry, ctx) {
    const [W, H] = LOOP_SIZE;
    const skyRaw = await render(W, H, (svg) => sky(svg, { seed: 18 }));
    const leaves = await render(W, H, (svg) => canopyLeaves(svg, ctx.art, { swayer: false }));
    const pivot = [0.8 * W, 0.22 * H];
    const disp = canopyWind(W, H);
    await writeLoop(entry, ctx, async (t) => {
      const warped = t === 0 ? leaves : warp(leaves, W, H, (x, y) => disp(x, y, t), { step: 12 });
      const [dx, dy] = disp(pivot[0], pivot[1], t);
      const sway = await render(W, H, (svg) => svg.add(`<g transform="translate(${n(-dx)} ${n(-dy)})">${canopySwayer(svg, 6 * Math.sin(TAU * 2 * t) + 2 * Math.sin(TAU * 3 * t))}</g>`));
      const raw = await over(skyRaw, W, H, [{ data: warped, width: W, height: H }, { data: sway, width: W, height: H }]);
      return finish(raw, W, H, { seed: 13, vignette: 0.42, label: label("canopy") });
    });
  },

  async application(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const raw = await render(W, H, (svg) => applicationScene(svg, ctx.art));
    await writeStill(entry, ctx, await finish(raw, W, H, { seed: 14, vignette: 0.34, label: label("application") }), W, H);
  },

  async sapling(entry, ctx) {
    const [W, H] = tierSize("1440", entry.aspect);
    const raw = await render(W, H, (svg) => saplingScene(svg, ctx.art));
    await writeStill(entry, ctx, await finish(raw, W, H, { seed: 15, vignette: 0.34, label: label("sapling") }), W, H);
  },

  async finale(entry, ctx) {
    const [W, H] = LOOP_SIZE;
    const base = await render(W, H, (svg) => finaleStatic(svg, ctx.art));
    const crown = await render(W, H, (svg) => finaleCrown(svg, ctx.art));
    const roots = ctx.art.finale.anchors.roots;
    const box = [Math.round((roots.x - 0.16) * W), Math.round(0.28 * H), Math.round((roots.x + 0.16) * W), Math.round(0.66 * H)];
    await writeLoop(entry, ctx, async (t) => {
      const warped = t === 0 ? crown : warp(crown, W, H, (x, y) => crownWind(x, y, t, W, H, roots), { step: 10, box });
      const figs = await render(W, H, (svg) => finaleFigures(svg, ctx.art, t));
      const raw = await over(base, W, H, [{ data: warped, width: W, height: H }, { data: figs, width: W, height: H }]);
      return finish(raw, W, H, { seed: 16, vignette: 0.36, label: label("finale") });
    });
  },
};

/** The coda and share-orange share one finish so the coda's last frame is share-orange's centre band. */
const codaFinish = (labelText) => ({ seed: 19, texture: 0.7, vignette: 0.3, label: labelText, vignetteColor: "#06122e" });

const paperCache = new Map();

async function drawingFrame(W, H, k, count, labelText) {
  const key = `${W}x${H}`;
  if (!paperCache.has(key)) paperCache.set(key, render(W, H, drawingPaper));
  const ground = await paperCache.get(key);
  const ink = await render(W, H, (svg) => drawingScene(svg, k / (count - 1), k === count - 1 ? "final" : k));
  const raw = await over(ground, W, H, [{ data: ink, width: W, height: H }]);
  return finish(raw, W, H, { seed: 20, texture: 0.6, vignette: 0.1, label: labelText, ink: true, vignetteColor: "#6b5330" });
}

/** A light wind through the canopy: zero at t = 0 (so the anchor holds on the first frame), periodic. */
function canopyWind(W, H) {
  const A = 6 * (W / 1920);
  return (x, y, t) => {
    const edge = Math.min(x, W - x, y, H - y);
    const k = smooth(0, 0.3 * H, edge) * 0.8 + 0.2;
    const a = x * 0.004 + y * 0.0027;
    const b = -x * 0.003 + y * 0.005;
    const w = TAU * t;
    return [
      A * k * (Math.sin(a + w) - Math.sin(a) + 0.5 * (Math.sin(b + 2 * w + 1) - Math.sin(b + 1))),
      A * k * 0.7 * (Math.sin(b + w + 2) - Math.sin(b + 2)),
    ];
  };
}

/** Leaves stirring in the finale's crown (more at the rim of the crown than at the trunk). */
function crownWind(x, y, t, W, H, roots) {
  const A = 4 * (W / 1920);
  const d = Math.hypot((x - roots.x * W) / W, (y - 0.5 * H) / H);
  const k = smooth(0.02, 0.12, d);
  const a = x * 0.006 + y * 0.004;
  const w = TAU * t;
  return [A * k * (Math.sin(a + w) - Math.sin(a)), A * k * 0.6 * (Math.sin(a * 1.3 + 2 * w + 1) - Math.sin(a * 1.3 + 1))];
}

// =============================================================================================
// Entry points
// =============================================================================================

/**
 * Paint the placeholder for one id. `ctx` = { art, tiers, parts?, preview?, warn, progress? };
 * `parts` limits share to one of its keyframes ("main" or "last") when the other is real.
 */
export async function paintPlaceholder(id, ctx) {
  const painter = PAINTERS[id];
  if (!painter) throw new Error(`no placeholder painter for "${id}"`);
  await painter(ctx.art[id], ctx);
}

export const PAINTED_IDS = Object.keys(PAINTERS);

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const force = argv.includes("--force");
  const preview = opt("preview");
  const only = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  const { art, ids, tiers } = await loadArt();
  for (const id of only ?? []) if (!ids.includes(id)) throw new Error(`unknown id "${id}" (ids: ${ids.join(", ")})`);
  const warnings = [];
  const ctx = { art, tiers, preview, warn: (m) => warnings.push(m) };
  for (const id of only ?? ids) {
    const src = findSource(id);
    if ((src.still || src.video) && !force && !preview) {
      console.log(`skip   ${id.padEnd(13)} real source in art/source/ (npm run art:import; --force repaints it)`);
      continue;
    }
    const t0 = Date.now();
    await paintPlaceholder(id, ctx);
    console.log(`paint  ${id.padEnd(13)} ${((Date.now() - t0) / 1000).toFixed(1)} s${preview ? ` -> ${preview}` : ""}`);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`art-placeholders: ${err.stack || err.message}`);
    process.exit(1);
  });
}

