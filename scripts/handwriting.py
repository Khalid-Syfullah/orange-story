#!/usr/bin/env python3
"""Generate src/content/handwriting.ts: the handwritten "first." of the Questions title.

The word is set in italic Newsreader (the display face of the site). This script reads the font
file that next/font self-hosted into .next/static/media (build once, or pass --font), instances the
variable font at the title's weight and optical size, and writes two things:

  * the exact glyph outlines as SVG paths (the filled letters), and
  * the pen: for each glyph the strokes a hand makes, in the order it makes them. Each stroke is
    traced by eye along the outline (WAYPOINTS, font units) and then snapped to the true centre line
    of the ink (the glyph is rasterised and every sample of the stroke moves along its normal to the
    middle of the ink run it sits in), so the pen follows the letter, not the eye. The stroke is
    fitted with cubic Beziers and given a pen-speed table: fast through the straights, slow at the
    turns.

The page draws the outlines through a mask made of those centre lines with `stroke-dashoffset`
driven by scroll, so the letters are written stroke by stroke and end as the exact typeface.

Run once (the output is committed):

    python3 -m venv /tmp/hw && /tmp/hw/bin/pip install fonttools brotli numpy scipy scikit-image
    /tmp/hw/bin/python scripts/handwriting.py [--font path/to/newsreader-italic.woff2]
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys

import numpy as np
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from skimage.draw import polygon as fill_polygon

TEXT = "first."
WGHT = 300
OPSZ = 72
SCALE = 0.4  # raster pixels per font unit
PAD = 40  # raster padding, px
N_TABLE = 24  # entries in a stroke's pen-speed table
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "content", "handwriting.ts")

# Strokes per glyph in the order a hand writes them: waypoints in the glyph's own font units, y up,
# read off the outline. The full stop has no strokes to trace and is found from its ink.
WAYPOINTS: dict[str, list[tuple[str, list[tuple[int, int]]]]] = {
    "f": [
        # the hook, down the stem and out through the descender's ball
        ("main", [(881, 1343), (876, 1405), (824, 1450), (738, 1462), (643, 1429), (548, 1350), (464, 1207), (417, 1052), (369, 838), (310, 576), (257, 314), (195, 52), (107, -174), (5, -324), (-107, -405), (-214, -405), (-274, -352), (-262, -300)]),
        ("bar", [(138, 1007), (417, 1005), (695, 1012)]),
    ],
    "i": [
        # the lead-in, over the top, down the stem and out along the foot
        ("main", [(67, 719), (150, 826), (257, 921), (364, 986), (455, 988), (425, 890), (352, 695), (281, 481), (210, 267), (150, 100), (135, 45), (160, 10), (230, 12), (320, 60), (412, 171), (490, 295)]),
        ("dot", [(524, 1386), (586, 1386)]),
    ],
    "r": [
        ("main", [(62, 629), (126, 748), (210, 867), (305, 950), (388, 1005), (429, 962), (388, 748), (340, 581), (293, 414), (233, 224), (176, 33)]),
        ("arm", [(364, 545), (429, 695), (524, 824), (633, 919), (733, 974), (817, 981), (824, 914)]),
    ],
    "s": [
        ("main", [(633, 943), (598, 1005), (502, 1033), (383, 1014), (288, 950), (229, 831), (240, 688), (336, 545), (443, 402), (498, 271), (455, 129), (360, 45), (217, 17), (98, 33), (33, 86), (50, 140)]),
    ],
    "t": [
        ("main", [(495, 1257), (452, 1126), (407, 971), (340, 733), (269, 495), (198, 281), (150, 138), (167, 48), (245, 14), (352, 60), (452, 174), (538, 300)]),
        ("bar", [(152, 1010), (412, 1007), (676, 1012)]),
    ],
    ".": [],
}


def find_font() -> str:
    """The latin-subset italic Newsreader among next/font's files."""
    root = os.path.join(os.path.dirname(__file__), "..", ".next", "static", "media")
    best = None
    for path in sorted(glob.glob(os.path.join(root, "*.woff2"))):
        try:
            f = TTFont(path)
        except Exception:
            continue
        name = f["name"].getDebugName(4) or ""
        if "Newsreader" in name and "Italic" in name and "fvar" in f:
            cmap = f.getBestCmap()
            if all(ord(c) in cmap for c in TEXT):
                best = path
                if ".p." in os.path.basename(path):
                    return path
    if best:
        return best
    sys.exit("no italic Newsreader with the needed glyphs found; build once or pass --font")


def flatten(pen_value, steps=14):
    """Contours (lists of (x, y) font units) from a recorded outline; curves flattened."""
    contours, cur = [], []
    pos = (0.0, 0.0)
    for op, args in pen_value:
        if op == "moveTo":
            cur = [args[0]]
            pos = args[0]
        elif op == "lineTo":
            cur.append(args[0])
            pos = args[0]
        elif op == "qCurveTo":
            pts = list(args)
            offs, end = pts[:-1], pts[-1]
            p0 = pos
            for i, o in enumerate(offs):
                nxt = offs[i + 1] if i + 1 < len(offs) else end
                on = end if i + 1 == len(offs) else ((o[0] + nxt[0]) / 2, (o[1] + nxt[1]) / 2)
                for k in range(1, steps + 1):
                    t = k / steps
                    cur.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * o[0] + t * t * on[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * o[1] + t * t * on[1]))
                p0 = on
            pos = end
        elif op == "curveTo":
            c1, c2, e = args
            p0 = pos
            for k in range(1, steps + 1):
                t = k / steps
                a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t**3
                cur.append((a * p0[0] + b * c1[0] + c * c2[0] + d * e[0], a * p0[1] + b * c1[1] + c * c2[1] + d * e[1]))
            pos = e
        elif op in ("closePath", "endPath"):
            if cur:
                contours.append(cur)
            cur = []
    return contours


def svg_path(pen_value, ox, base):
    """The recorded outline as an SVG path: x shifted by `ox`, y flipped about the baseline row."""
    def P(p):
        return f"{p[0] + ox:.0f} {base - p[1]:.0f}"

    out = []
    for op, args in pen_value:
        if op == "moveTo":
            out.append("M" + P(args[0]))
        elif op == "lineTo":
            out.append("L" + P(args[0]))
        elif op == "qCurveTo":
            pts = list(args)
            offs, end = pts[:-1], pts[-1]
            for i, o in enumerate(offs):
                nxt = offs[i + 1] if i + 1 < len(offs) else end
                on = end if i + 1 == len(offs) else ((o[0] + nxt[0]) / 2, (o[1] + nxt[1]) / 2)
                out.append("Q" + P(o) + " " + P(on))
        elif op == "curveTo":
            out.append("C" + " ".join(P(p) for p in args))
        elif op in ("closePath", "endPath"):
            out.append("Z")
    return "".join(out)


class Ink:
    """A glyph rasterised (even-odd, so counters stay open) with lookups in font units."""

    def __init__(self, contours):
        xs = [p[0] for c in contours for p in c]
        ys = [p[1] for c in contours for p in c]
        self.x0, self.y1 = min(xs), max(ys)
        w = int((max(xs) - self.x0) * SCALE) + 2 * PAD
        h = int((self.y1 - min(ys)) * SCALE) + 2 * PAD
        self.img = np.zeros((h, w), dtype=bool)
        for c in contours:
            cx = [(p[0] - self.x0) * SCALE + PAD for p in c]
            cy = [(self.y1 - p[1]) * SCALE + PAD for p in c]
            rr, cc = fill_polygon(cy, cx, self.img.shape)
            self.img[rr, cc] ^= True

    def at(self, x, y) -> bool:
        col = int(round((x - self.x0) * SCALE + PAD))
        row = int(round((self.y1 - y) * SCALE + PAD))
        if 0 <= row < self.img.shape[0] and 0 <= col < self.img.shape[1]:
            return bool(self.img[row, col])
        return False


def catmull(pts, step=6.0):
    """A Catmull-Rom curve through the points, resampled about every `step` units."""
    p = np.array(pts, dtype=float)
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        n = max(2, int(np.hypot(*(p2 - p1)) / step))
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3))
    out.append(p[-1])
    return np.array(out)


def snap(ink: Ink, pts, reach=170.0):
    """Move each sample of the curve along its normal to the middle of the ink run it sits in.
    Returns the snapped samples and the width of the ink at each (nan where there is none)."""
    n = len(pts)
    tan = np.gradient(pts, axis=0)
    tan /= np.maximum(np.hypot(*tan.T), 1e-9)[:, None]
    nor = np.stack([-tan[:, 1], tan[:, 0]], axis=1)
    offs = np.arange(-reach, reach + 1, 3.0)
    shift = np.zeros(n)
    width = np.full(n, np.nan)
    for i in range(n):
        line = np.array([ink.at(*(pts[i] + nor[i] * o)) for o in offs])
        mid = len(offs) // 2
        if not line[mid]:
            hits = np.nonzero(line)[0]
            if len(hits) == 0:
                shift[i] = np.nan
                continue
            mid = int(hits[np.argmin(np.abs(hits - mid))])
        lo, hi = mid, mid
        while lo > 0 and line[lo - 1]:
            lo -= 1
        while hi < len(offs) - 1 and line[hi + 1]:
            hi += 1
        shift[i] = (offs[lo] + offs[hi]) / 2
        width[i] = offs[hi] - offs[lo] + 3.0
    # where the normal runs along another stroke (a bar crossing a stem) the run is far wider than the
    # stroke itself: those samples carry no information about this stroke's centre
    typical = np.nanmedian(width) if not np.all(np.isnan(width)) else 0.0
    shift[width > 1.8 * typical] = np.nan
    ok = ~np.isnan(shift)
    shift = np.interp(np.arange(n), np.nonzero(ok)[0], shift[ok]) if ok.any() else np.zeros(n)
    # a run that wandered (ink of a neighbouring stroke) is an outlier against its neighbours
    k = 9
    med = np.array([np.median(shift[max(0, i - k // 2) : i + k // 2 + 1]) for i in range(n)])
    shift = np.where(np.abs(shift - med) > 40, med, shift)
    ker = np.ones(7) / 7
    padded = np.concatenate([np.full(3, shift[0]), shift, np.full(3, shift[-1])])
    shift = np.convolve(padded, ker, mode="valid")
    out = pts + nor * shift[:, None]
    # the curve is smoothed once more, ends held (a hand does not jitter)
    sm = out.copy()
    for i in range(2, n - 2):
        sm[i] = out[i - 2 : i + 3].mean(axis=0)
    return sm, width


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab)
    d = np.hypot(*(pts - a).T) if n < 1e-9 else np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        left, right = rdp(pts[: i + 1], eps), rdp(pts[i:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


def to_bezier(pts):
    """Catmull-Rom through the points, as cubic segments (p0, c1, c2, p1)."""
    segs = []
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else pts[i + 1]
        segs.append((p1, p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6, p2))
    return segs


def sample_bezier(segs, per=12):
    out = []
    for p1, c1, c2, p2 in segs:
        for k in range(per):
            t = k / per
            a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t**3
            out.append(a * p1 + b * c1 + c * c2 + d * p2)
    out.append(segs[-1][3])
    return np.array(out)


def pen_table(poly):
    """Share of the stroke's writing time spent by each of N+1 evenly spaced arc fractions: the pen
    runs through straights and slows where the stroke turns."""
    seg = np.hypot(*np.diff(poly, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = float(s[-1])
    ang = np.arctan2(np.diff(poly[:, 1]), np.diff(poly[:, 0]))
    turn = np.abs(np.angle(np.exp(1j * np.diff(ang))))  # radians turned at each interior vertex
    turn = np.concatenate([[0], turn, [0]])
    win = max(3, len(poly) // 10)
    # turning rate per unit length, smoothed, in revolutions over the whole stroke
    rate = np.convolve(turn, np.ones(win), mode="same") / max(np.mean(seg) * win, 1e-6)
    kappa = rate * total / (2 * math.pi)
    speed = 1.0 / (1.0 + 0.9 * kappa)
    dt = np.diff(s) / np.maximum((speed[1:] + speed[:-1]) / 2, 1e-3)
    t = np.concatenate([[0], np.cumsum(dt)])
    t /= t[-1]
    grid = np.linspace(0, 1, N_TABLE + 1)
    return total, [round(float(x), 4) for x in np.interp(grid * total, s, t)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font")
    args = ap.parse_args()
    path = args.font or find_font()
    print("font:", path, file=sys.stderr)
    font = instancer.instantiateVariableFont(TTFont(path), {"wght": WGHT, "opsz": OPSZ})
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]

    glyphs = []
    per_glyph = []
    ox = 0
    y_top, y_bot, x_min, x_max = -1e9, 1e9, 1e9, -1e9
    for ch in TEXT:
        name = cmap[ord(ch)]
        pen = DecomposingRecordingPen(gs)
        gs[name].draw(pen)
        contours = flatten(pen.value)
        xs = [p[0] for c in contours for p in c]
        ys = [p[1] for c in contours for p in c]
        y_top, y_bot = max(y_top, max(ys)), min(y_bot, min(ys))
        x_min, x_max = min(x_min, min(xs) + ox), max(x_max, max(xs) + ox)
        per_glyph.append((ch, pen.value, contours, ox))
        ox += hmtx[name][0]

    # The f's descender hangs left of the origin: the box starts at the leftmost ink.
    pad = 60
    shift = int(math.ceil(-x_min)) + pad if x_min < 0 else pad
    width = int(math.ceil(x_max)) + shift + pad
    asc = int(math.ceil(y_top)) + pad
    desc = int(math.ceil(-y_bot)) + pad
    base = asc

    plan = []
    for ch, pv, contours, gx in per_glyph:
        gx += shift
        glyphs.append(svg_path(pv, gx, base))
        ink = Ink(contours)
        items = []
        for kind, pts in WAYPOINTS[ch]:
            snapped, widths = snap(ink, catmull(pts))
            items.append((kind, snapped, widths))
        if not items:
            # a blob of ink with no stem: a short stroke through its centre as wide as the blob
            ys_, xs_ = np.nonzero(ink.img)
            cx = (xs_.mean() - PAD) / SCALE + ink.x0
            cy = ink.y1 - (ys_.mean() - PAD) / SCALE
            r = math.sqrt(ink.img.sum() / math.pi) / SCALE
            items.append(("dot", np.array([[cx, cy]]), np.array([2 * r])))
        for kind, pts, widths in items:
            if kind == "dot":
                r = float(np.nanmax(widths)) / 2 if len(widths) and not np.all(np.isnan(widths)) else 70.0
                c = pts.mean(axis=0)
                pts = np.array([[c[0] - 0.3 * r, c[1]], [c[0] + 0.3 * r, c[1]]])
                widths = np.array([2 * r])
            flipped = np.stack([pts[:, 0] + gx, base - pts[:, 1]], axis=1)
            simp = rdp(flipped, 4.0) if len(flipped) > 3 else flipped
            if len(simp) < 3:
                simp = np.vstack([simp[0], (simp[0] + simp[-1]) / 2, simp[-1]])
            segs = to_bezier(simp)
            poly = sample_bezier(segs)
            total, table = pen_table(poly)
            d = f"M{segs[0][0][0]:.0f} {segs[0][0][1]:.0f}" + "".join(
                f"C{c1[0]:.0f} {c1[1]:.0f} {c2[0]:.0f} {c2[1]:.0f} {p2[0]:.0f} {p2[1]:.0f}" for _, c1, c2, p2 in segs
            )
            w = widths[~np.isnan(widths)]
            if len(w) > 2:
                w = w[w < 2.5 * np.median(w)]
            thick = float(np.percentile(w, 85)) if len(w) else 120.0
            # a ball terminal is wider than its hairline: the mask must cover it
            mask_w = min(max(1.5 * thick + 30, 90.0 if kind == "bar" else 170.0), 300.0)
            plan.append({"glyph": ch, "kind": kind, "d": d, "len": total, "table": table, "w": round(mask_w)})

    # timeline: each stroke takes time ~ length^0.75, with a pen lift between strokes and a longer
    # beat between letters
    weights = [max(p["len"], 90.0) ** 0.75 for p in plan]
    mean = float(np.mean(weights))
    gaps = [(0.5 if a["glyph"] != b["glyph"] else 0.3) * mean for a, b in zip(plan[:-1], plan[1:])]
    total_t = sum(weights) + sum(gaps)
    cursor = 0.0
    for i, (p, wgt) in enumerate(zip(plan, weights)):
        p["from"] = round(cursor / total_t, 4)
        cursor += wgt
        p["to"] = round(cursor / total_t, 4)
        if i < len(gaps):
            cursor += gaps[i]

    doc = {
        "upm": upm,
        "viewBox": [0, 0, width, asc + desc],
        "baseline": base,
        "origin": shift,
        "advance": ox,
        "descent": desc,
        "glyphs": glyphs,
        "strokes": [{k: p[k] for k in ("glyph", "d", "len", "w", "from", "to", "table")} for p in plan],
    }
    with open(OUT, "w") as fh:
        fh.write(
            "// GENERATED by scripts/handwriting.py: do not edit by hand.\n"
            "//\n"
            f'// "{TEXT}" in italic Newsreader (wght {WGHT}, opsz {OPSZ}) as the exact glyph outlines plus the pen\'s strokes.\n'
            "// Coordinates are font units (`upm` to the em) with y down and the baseline at `baseline`; the first\n"
            "// glyph's origin is at x = `origin` (the f hangs left of it), the word advances `advance`, and the\n"
            "// box reaches `descent` below the baseline. Each stroke\n"
            "// is a centre line (`d`) with the width of the mask stroke that reveals the outline under it (`w`),\n"
            "// its share of the word's writing time (`from`..`to`, pen lifts between) and a pen-speed table:\n"
            "// `table[i]` is the share of the stroke's writing time spent by arc fraction i / (table.length - 1),\n"
            "// steep where the pen runs and shallow where it slows (the turns).\n\n"
            "export interface HandwritingStroke {\n"
            "  glyph: string;\n"
            "  d: string;\n"
            "  len: number;\n"
            "  w: number;\n"
            "  from: number;\n"
            "  to: number;\n"
            "  table: readonly number[];\n"
            "}\n\n"
            "export interface Handwriting {\n"
            "  upm: number;\n"
            "  viewBox: readonly [number, number, number, number];\n"
            "  baseline: number;\n"
            "  origin: number;\n"
            "  advance: number;\n"
            "  descent: number;\n"
            "  glyphs: readonly string[];\n"
            "  strokes: readonly HandwritingStroke[];\n"
            "}\n\n"
            f"export const handwriting: Handwriting = {json.dumps(doc, indent=2)};\n"
        )
    print(f"wrote {OUT}: {len(plan)} strokes, viewBox {doc['viewBox']}", file=sys.stderr)
    for p in plan:
        print(f"  {p['glyph']} {p['kind']:5s} len {p['len']:.0f} w {p['w']} t {p['from']:.3f}-{p['to']:.3f}", file=sys.stderr)


if __name__ == "__main__":
    main()
