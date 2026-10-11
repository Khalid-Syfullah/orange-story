"use client";
// Chapter 4's copy layer (docs/COPY.md, docs/STORY.md row 4 · Questions): the title with its last
// word handwritten in, the five question cards and the constellation of hairlines that joins them,
// over the canopy. Text is DOM and SVG, never WebGL, written from the frame subscription with no
// React state per frame. Everything is a function of `p` through passes/canopy/timeline.ts, the
// same numbers the picture and the HUD read:
//
//   - the DOM layer travels at 0.6x the page's scroll; the title is in place while it is written
//     and then rises away, each card crosses the frame, comes in as it crosses the enter line (a
//     60-unit ramp with a 10 px rise, its headline 12 units ahead of its body) and goes at the exit
//     line, so the five are never on screen together;
//   - the title: "Questions worth asking" set in type and "first." in italic Newsreader written in
//     stroke by stroke: the glyph outlines of src/content/handwriting.ts revealed through a mask of
//     the pen's centre lines, `stroke-dashoffset` driven by the writing clock with the pen's own
//     speed (src/stage/handwriting.ts), never linear;
//   - the constellation: one hairline (1px, 55% milk) from a corner of each item toward a corner of
//     the next, a four-point star on each of the two corners (the joints), its length base * (0.55 + 0.75 * (0.5 + 0.5 *
//     sin(p * 0.011 + i * 1.7)) + 0.9 * exp(-|p - y_i| / 190)) where y_i is the line's own scroll
//     position, so a line lengthens as the reader arrives at it and eases away after; the stars'
//     opacity shares the term.
import { useCallback, useId, useRef } from "react";
import { handwriting } from "@/content/handwriting";
import { questions } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { penProgress } from "./handwriting";
import { ZONE_IN_BAND } from "./band";
import { useFrame } from "./hub";
import {
  CANOPY_TUNE,
  CARD_COUNT,
  ITEMS,
  layoutAt,
  LINE_MAX,
  LINE_SPAN_DIV,
  lineAt,
  lineTerm,
  QUESTIONS_UNITS,
  questionsUnits,
  rampIn,
  rampOut,
  writeProgress,
} from "./passes/canopy/timeline";
import styles from "./QuestionsCopy.module.css";

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ opacity: "", transform: "", visibility: "" });

function write(el: HTMLElement | null, last: Written, alpha: number, lift: number) {
  if (!el) return;
  const next: Written = {
    opacity: alpha.toFixed(3),
    transform: Math.abs(lift) < 0.01 ? "" : `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

/** A four-point star centred on the origin, 11 px across (the chrome's star mark, shifted to its centre). */
const STAR = "M0 -5.5 C0.4 -1.9 1.9 -0.4 5.5 0 C1.9 0.4 0.4 1.9 0 5.5 C-0.4 1.9 -1.9 0.4 -5.5 0 C-1.9 -0.4 -0.4 -1.9 0 -5.5 Z";

const HW = handwriting;
const [, , HW_W, HW_H] = HW.viewBox;

interface CardRefs {
  root: HTMLElement | null;
  panel: HTMLElement | null;
  title: HTMLElement | null;
  body: HTMLElement | null;
}

interface LineRefs {
  line: SVGLineElement | null;
  a: SVGPathElement | null;
  b: SVGPathElement | null;
}

export function QuestionsCopy() {
  const maskId = `hw${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const strokeRefs = useRef<(SVGPathElement | null)[]>([]);
  const cards = useRef<CardRefs[]>(questions.items.map(() => ({ root: null, panel: null, title: null, body: null })));
  const lines = useRef<LineRefs[]>(Array.from({ length: CARD_COUNT }, () => ({ line: null, a: null, b: null })));
  const written = useRef({
    root: "",
    title: blank(),
    titleY: "",
    cards: questions.items.map(() => ({ panel: blank(), title: blank(), body: blank(), pos: "" })),
    strokes: HW.strokes.map(() => ""),
    lines: Array.from({ length: CARD_COUNT }, () => ({ geo: "", opacity: "" })),
    sizeKey: "",
    range: null as Range | null,
  });

  const onFrame = useCallback((f: FrameCtx) => {
    const root = rootRef.current;
    const titleEl = titleRef.current;
    if (!root || !titleEl) return;
    const w = written.current;
    const [W, H] = f.css;
    const u = questionsUnits(f.p);
    // A tall phone: the picture is a band, so the title and the cards stand in one slot under it
    // (their windows already follow one another) and the constellation is left out.
    const stack = f.band < 0.999;
    const slotTop = Math.round(H * ZONE_IN_BAND) - 8;
    const near = u > -2 && u < QUESTIONS_UNITS + 2;
    const state = near ? "on" : "off";
    if (w.root !== state) {
      w.root = state;
      root.style.visibility = near ? "visible" : "hidden";
    }
    if (!near) return;

    // Columns for this frame size: two that follow the sky gap, or one on a tall phone.
    const layout = layoutAt(f.css);
    const key = `${W}x${H}`;
    if (w.sizeKey !== key) {
      w.sizeKey = key;
      titleEl.style.width = `${layout.titleWidth.toFixed(1)}px`;
      cards.current.forEach((c) => {
        if (c.root) c.root.style.width = `${layout.cardWidth.toFixed(1)}px`;
      });
    }

    // Each item's alpha and its box (centre y by the DOM's travel, height from layout: transforms do
    // not move it, so reading it every frame forces nothing).
    const alpha = new Array<number>(ITEMS.length);
    const box: { x: number; y: number; w: number; h: number }[] = new Array(ITEMS.length);

    // The title: one element, in place while it is written, then rising away.
    {
      const it = ITEMS[0];
      const out = rampOut(u, it.outAt);
      const head = rampIn(u, it.inAt) * out;
      const h = titleEl.offsetHeight;
      const y = stack ? slotTop + h / 2 : it.y(u) * H;
      const lift = (1 - rampIn(u, it.inAt)) * CANOPY_TUNE.rise - (1 - out) * CANOPY_TUNE.rise;
      const pos = `translate3d(${layout.titleLeft.toFixed(1)}px, ${(y - h / 2 + lift).toFixed(1)}px, 0)`;
      if (w.titleY !== pos) titleEl.style.transform = w.titleY = pos;
      const op = head.toFixed(3);
      if (w.title.opacity !== op) {
        titleEl.style.opacity = w.title.opacity = op;
        titleEl.style.visibility = w.title.visibility = head < 0.004 ? "hidden" : "visible";
      }
      alpha[0] = head;
      // The constellation joins the corners of the type, not of the box the type wraps in: the
      // range over its contents is as wide as the longest line.
      const range = (w.range ??= document.createRange());
      range.selectNodeContents(titleEl);
      const tight = range.getBoundingClientRect();
      const tightW = tight.width > 0 ? Math.min(layout.titleWidth, tight.width) : layout.titleWidth;
      box[0] = { x: layout.titleLeft, y, w: tightW, h };
    }

    // The word's own clock and each stroke's drawn length.
    const g = f.reduced ? 1 : writeProgress(u);
    HW.strokes.forEach((stroke, i) => {
      const el = strokeRefs.current[i];
      if (!el) return;
      const drawn = penProgress(stroke, g);
      const s = drawn <= 0 ? "0" : (1 - drawn).toFixed(4);
      if (w.strokes[i] !== s) {
        w.strokes[i] = s;
        el.setAttribute("stroke-dashoffset", s);
        el.setAttribute("stroke-opacity", drawn <= 0 ? "0" : "1");
      }
    });

    // The cards.
    cards.current.forEach((c, i) => {
      const it = ITEMS[i + 1];
      const wc = w.cards[i];
      if (!c.root) return;
      const out = rampOut(u, it.outAt);
      const inHead = rampIn(u, it.inAt);
      const inBody = rampIn(u, it.inAt + CANOPY_TUNE.cardLead);
      const head = inHead * out;
      const body = inBody * out;
      const liftHead = (1 - inHead) * CANOPY_TUNE.rise - (1 - out) * CANOPY_TUNE.rise;
      const liftBody = (1 - inBody) * CANOPY_TUNE.rise - (1 - out) * CANOPY_TUNE.rise;
      write(c.panel, wc.panel, head, 0);
      write(c.title, wc.title, head, liftHead);
      write(c.body, wc.body, body, liftBody);
      const h = c.root.offsetHeight;
      const y = stack ? slotTop + h / 2 : it.y(u) * H;
      const pos = `translate3d(${layout.cardLeft[i].toFixed(1)}px, ${(y - h / 2).toFixed(1)}px, 0)`;
      if (wc.pos !== pos) c.root.style.transform = wc.pos = pos;
      alpha[i + 1] = head;
      box[i + 1] = { x: layout.cardLeft[i], y, w: layout.cardWidth, h };
    });

    // The constellation: line i leaves a corner of item i toward a corner of item i + 1.
    for (let i = 0; i < CARD_COUNT; i++) {
      const refs = lines.current[i];
      const wl = w.lines[i];
      if (!refs.line || !refs.a || !refs.b) continue;
      if (stack) {
        if (wl.opacity !== "0|0") {
          wl.opacity = "0|0";
          wl.geo = "";
          refs.line.setAttribute("opacity", "0");
          refs.a.setAttribute("opacity", "0");
          refs.b.setAttribute("opacity", "0");
        }
        continue;
      }
      const a = box[i];
      const b = box[i + 1];
      const fromLeft = layout.narrow || i === 0 || (i - 1) % 2 === 1;
      // From a left-hand item's bottom-right to the right-hand item's top-left, and the mirror.
      const ax = layout.narrow || fromLeft ? a.x + a.w : a.x;
      const ay = a.y + a.h / 2;
      const bx = layout.narrow || fromLeft ? b.x : b.x + b.w;
      const by = b.y - b.h / 2;
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy);
      const term = lineTerm(u, i, lineAt(i));
      const base = dist / LINE_SPAN_DIV;
      const len = Math.min(dist, base * term);
      const tx = dist > 1 ? ax + (dx / dist) * len : ax;
      const ty = dist > 1 ? ay + (dy / dist) * len : ay;
      // Visible while either end is on screen and, either way, as the reader arrives at the line.
      const arrive = Math.exp(-Math.abs(u - lineAt(i)) / CANOPY_TUNE.lineReach);
      const live = Math.min(1, Math.max(alpha[i], alpha[i + 1], 0.9 * arrive));
      const share = Math.min(1, Math.max(0.2, (term - 0.4) / (LINE_MAX * 0.8 - 0.4)));
      const geo = `${ax.toFixed(1)},${ay.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)},${bx.toFixed(1)},${by.toFixed(1)}`;
      if (wl.geo !== geo) {
        wl.geo = geo;
        refs.line.setAttribute("x1", ax.toFixed(1));
        refs.line.setAttribute("y1", ay.toFixed(1));
        refs.line.setAttribute("x2", tx.toFixed(1));
        refs.line.setAttribute("y2", ty.toFixed(1));
        refs.a.setAttribute("transform", `translate(${ax.toFixed(1)} ${ay.toFixed(1)})`);
        refs.b.setAttribute("transform", `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);
      }
      const op = `${live.toFixed(3)}|${(live * share).toFixed(3)}`;
      if (wl.opacity !== op) {
        wl.opacity = op;
        const [lineOp, starOp] = op.split("|");
        refs.line.setAttribute("opacity", lineOp);
        refs.a.setAttribute("opacity", starOp);
        refs.b.setAttribute("opacity", starOp);
      }
    }
  }, []);
  useFrame(onFrame);

  return (
    <div ref={rootRef} className={`on-sky ${styles.questions}`} aria-label={questions.chapter.label} role="region" style={{ visibility: "hidden" }}>
      <svg className={styles.constellation} aria-hidden="true" focusable="false">
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <g key={i}>
            <line
              ref={(el) => {
                lines.current[i].line = el;
              }}
              className={styles.line}
              opacity="0"
            />
            <path
              ref={(el) => {
                lines.current[i].a = el;
              }}
              className={styles.star}
              d={STAR}
              opacity="0"
            />
            <path
              ref={(el) => {
                lines.current[i].b = el;
              }}
              className={styles.star}
              d={STAR}
              opacity="0"
            />
          </g>
        ))}
      </svg>

      <h2 ref={titleRef} className={`display-xl ${styles.title}`}>
        <span className="sr-only">{questions.title}</span>
        <span aria-hidden="true">{questions.titleSet} </span>
        <svg
          className={styles.hand}
          viewBox={`0 0 ${HW_W} ${HW_H}`}
          style={{
            width: `${HW_W / HW.upm}em`,
            height: `${HW_H / HW.upm}em`,
            marginLeft: `${-HW.origin / HW.upm}em`,
            marginRight: `${-(HW_W - HW.origin - HW.advance) / HW.upm}em`,
            verticalAlign: `${-HW.descent / HW.upm}em`,
          }}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={HW_W} height={HW_H}>
              {HW.strokes.map((s, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    strokeRefs.current[i] = el;
                  }}
                  d={s.d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={s.w}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={0}
                  strokeOpacity={0}
                />
              ))}
            </mask>
          </defs>
          <g mask={`url(#${maskId})`} fill="currentColor">
            {HW.glyphs.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
      </h2>

      {questions.items.map((item, i) => (
        <article
          key={item.q}
          ref={(el) => {
            cards.current[i].root = el;
          }}
          className={styles.card}
          aria-label={item.q}
        >
          <span
            ref={(el) => {
              cards.current[i].panel = el;
            }}
            className={styles.panel}
            aria-hidden="true"
          />
          <h3
            ref={(el) => {
              cards.current[i].title = el;
            }}
            className={`title ${styles.piece} ${styles.question}`}
          >
            {item.q}
          </h3>
          <p
            ref={(el) => {
              cards.current[i].body = el;
            }}
            className={`body ${styles.piece} ${styles.answer}`}
          >
            {item.a}
          </p>
        </article>
      ))}
    </div>
  );
}
