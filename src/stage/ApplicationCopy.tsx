"use client";
// The application layer (docs/COPY.md Application, docs/STORY.md rows Application and The rise):
// the form in the sky on the right (tag, title, subtitle, three fields, the button) and the
// constellation whose stars are its fields. Text is DOM and SVG, never WebGL, written from the
// frame subscription with no React state per frame (the form's own state, its values, errors and
// status, is React state and changes only on input and submit). Everything is a function of `p`
// through passes/application/timeline.ts, the same numbers the picture and the HUD read:
//
//   - the pieces come in one after another over the end of the moire (each over 60 scroll units
//     with a 10 px rise) and are all in by the application's first frame; on the rise they go the
//     other way, the last piece first, all gone before any line does;
//   - each field is a star: an SVG circle with a four-point flare at the field's label, measured
//     from the layout (so a message under a field moves the stars below it) and lifted with its
//     piece; hairlines join field to field and the first field to the figure's fingertip, which is
//     `uncover(art.application.fingertip)` every frame with the rest state, so it holds at any
//     viewport; lines and stars breathe with the Questions term, carried on from the chapter;
//   - on the rise the hairlines retract toward the fingertip one at a time, `0.62 / (n - 1)` apart.
//
// The form: client-side validation (name required, email format, grow required) with plain inline
// messages; on submit it POSTs JSON {name, email, grow} to NEXT_PUBLIC_APPLY_ENDPOINT when that is
// set, otherwise it skips the request; the success message takes the form's place, a failed send
// shows a plain inline error. Ids and labels are stable; the Apply pill and the hero button scroll
// here (script.ts ANCHORS.apply).
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { application } from "@/content/copy";
import { PillButton, Tag } from "@/ui/primitives";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import {
  APP_TUNE,
  appUnits,
  breath,
  fingertip,
  FIELD_COUNT,
  formLayout,
  LINE_COUNT,
  lineGrow,
  lineRetract,
  pieceIn,
  pieceOut,
  PIECE_COUNT,
  riseT,
  starKeep,
} from "./passes/application/timeline";
import { segment } from "./script";
import styles from "./ApplicationCopy.module.css";

/** A four-point star centred on the origin, 11 px across (the chrome's star mark, shifted to its centre). */
const FLARE = "M0 -5.5 C0.4 -1.9 1.9 -0.4 5.5 0 C1.9 0.4 0.4 1.9 0 5.5 C-0.4 1.9 -1.9 0.4 -5.5 0 C-1.9 -0.4 -0.4 -1.9 0 -5.5 Z";
/** The star's ring, and how far a hairline stays off the centre of a ring and off the fingertip, px. */
const RING = 6;
const TRIM_STAR = 8;
const TRIM_TIP = 3;
/** The flare's scale at rest (px across = 11 * this) and what the breath adds. */
const FLARE_SCALE = 1.5;

const ENDPOINT = process.env.NEXT_PUBLIC_APPLY_ENDPOINT;

const riseEnd = segment("rise").end;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

interface Written {
  el: Element | null;
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ el: null, opacity: "", transform: "", visibility: "" });

function write(el: HTMLElement | null, last: Written, alpha: number, lift: number) {
  if (!el) return;
  if (last.el !== el) {
    last.el = el;
    last.opacity = last.transform = last.visibility = "";
  }
  const next: Written = {
    el,
    opacity: alpha.toFixed(3),
    transform: Math.abs(lift) < 0.01 ? "" : `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

/** An element's offset inside `box`, from layout (transforms on the way do not count). */
function offsetIn(el: HTMLElement, box: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== box) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

type FieldName = (typeof application.fields)[number]["name"];
type Errors = Partial<Record<FieldName | "send", string>>;
type Status = "idle" | "sending" | "success";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: Record<FieldName, string>): Errors {
  const errors: Errors = {};
  if (values.name.trim() === "") errors.name = application.errors.name;
  if (!EMAIL.test(values.email.trim())) errors.email = application.errors.email;
  if (values.grow.trim() === "") errors.grow = application.errors.grow;
  return errors;
}

interface LineRefs {
  line: SVGLineElement | null;
  star: SVGGElement | null;
  flare: SVGPathElement | null;
}

export function ApplicationCopy() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Errors>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLSpanElement>(null);
  const scrimWritten = useRef("");
  const boxRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const pieces = useRef<(HTMLElement | null)[]>(Array.from({ length: PIECE_COUNT }, () => null));
  const anchors = useRef<(HTMLElement | null)[]>(Array.from({ length: FIELD_COUNT }, () => null));
  const stars = useRef<LineRefs[]>(Array.from({ length: LINE_COUNT }, () => ({ line: null, star: null, flare: null })));
  /** Each star's centre inside the stage, from the last measure (kept through the success message). */
  const places = useRef<({ x: number; y: number } | null)[]>(Array.from({ length: FIELD_COUNT }, () => null));
  const written = useRef({
    root: "",
    sizeKey: "",
    live: "",
    pieces: Array.from({ length: PIECE_COUNT }, blank),
    lines: Array.from({ length: LINE_COUNT }, () => ({ geo: "", line: "", star: "", flare: "" })),
  });

  // Where the stars are: the label marks' places in the layout, now. Called when the box changes
  // size (a message under a field, a font arriving, a new frame size) and never per frame.
  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    anchors.current.forEach((el, j) => {
      if (!el) return;
      const o = offsetIn(el, box);
      places.current[j] = { x: r.left + o.x + el.offsetWidth / 2, y: r.top + o.y + el.offsetHeight / 2 };
    });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure, status]);

  const onFrame = useCallback(
    (f: FrameCtx) => {
      const root = rootRef.current;
      const wrap = wrapRef.current;
      if (!root || !wrap) return;
      const w = written.current;
      const u = appUnits(f.p);
      const near = f.p < riseEnd + 0.002 && u > APP_TUNE.pieceFrom[0] - 40;
      const state = near ? "on" : "off";
      if (w.root !== state) {
        w.root = state;
        // The root's opacity goes with its visibility: a piece's own inline `visibility: visible`
        // shows through a hidden parent, so a jump or a fast glide that crosses the form between
        // two frames would leave it on screen (rule 11).
        root.style.visibility = near ? "visible" : "hidden";
        root.style.opacity = near ? "" : "0";
      }
      if (!near) return;

      // The column for this frame size: right-aligned in the sky, or the phone's one column.
      const layout = formLayout(f.css);
      const key = `${f.css[0]}x${f.css[1]}`;
      if (w.sizeKey !== key) {
        w.sizeKey = key;
        wrap.style.left = `${layout.left.toFixed(1)}px`;
        wrap.style.width = `${layout.width.toFixed(1)}px`;
        measure();
      }

      // The pieces: each its arrival times its departure.
      const tr = riseT(f.p);
      const alpha: number[] = [];
      const lift: number[] = [];
      for (let i = 0; i < PIECE_COUNT; i++) {
        const inn = pieceIn(u, i);
        const out = pieceOut(tr, i);
        alpha[i] = inn * out;
        lift[i] = (1 - inn) * APP_TUNE.rise - (1 - out) * APP_TUNE.rise;
        write(pieces.current[i], w.pieces[i], alpha[i], lift[i]);
      }
      // The phone's soft sky behind the column follows its pieces (the stylesheet shows it there only).
      const scrim = scrimRef.current;
      if (scrim) {
        const a = Math.max(...alpha).toFixed(3);
        if (scrimWritten.current !== a) scrim.style.opacity = scrimWritten.current = a;
      }
      // The form takes the pointer only while its fields are on screen.
      const live = Math.min(alpha[3], alpha[4], alpha[5], alpha[PIECE_COUNT - 1]) > 0.5 || (alpha[PIECE_COUNT - 1] > 0.5 && status === "success") ? "on" : "off";
      if (w.live !== live) {
        w.live = live;
        wrap.style.pointerEvents = live === "on" ? "auto" : "none";
      }

      // The constellation: fingertip -> star 0 -> star 1 -> star 2.
      const rest = { tm: f.time * (1 - f.still), mouse: f.mouse, kick: f.kick };
      const tip = fingertip(f.css, rest, tr);
      for (let j = 0; j < LINE_COUNT; j++) {
        const refs = stars.current[j];
        const wl = w.lines[j];
        const to = places.current[j];
        if (!refs.line || !refs.star || !refs.flare) continue;
        const from = j === 0 ? tip : places.current[j - 1];
        if (!to || !from) {
          if (wl.line !== "0|") {
            wl.line = "0|";
            refs.line.setAttribute("opacity", "0");
            refs.star.setAttribute("opacity", "0");
          }
          continue;
        }
        const sy = to.y + lift[APP_TUNE.starPiece + j];
        const fy = j === 0 ? from.y : from.y + lift[APP_TUNE.starPiece + j - 1];
        const dx = to.x - from.x;
        const dy = sy - fy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const trimA = j === 0 ? TRIM_TIP : TRIM_STAR;
        const span = Math.max(0, dist - trimA - TRIM_STAR);
        const shown = span * clamp01(lineGrow(u, j)) * (1 - lineRetract(tr, j));
        const x1 = from.x + ux * trimA;
        const y1 = fy + uy * trimA;
        const x2 = x1 + ux * shown;
        const y2 = y1 + uy * shown;
        const geo = `${x1.toFixed(1)},${y1.toFixed(1)},${x2.toFixed(1)},${y2.toFixed(1)}`;
        if (wl.geo !== geo) {
          wl.geo = geo;
          refs.line.setAttribute("x1", x1.toFixed(1));
          refs.line.setAttribute("y1", y1.toFixed(1));
          refs.line.setAttribute("x2", x2.toFixed(1));
          refs.line.setAttribute("y2", y2.toFixed(1));
        }
        const b = breath(f.p, j);
        const lineOp = shown > 0.5 ? (0.7 + 0.3 * b).toFixed(3) : "0";
        const starOp = (alpha[APP_TUNE.starPiece + j] * starKeep(tr, j) * (0.55 + 0.45 * b)).toFixed(3);
        const flare = (FLARE_SCALE * (0.82 + 0.3 * b)).toFixed(3);
        const at = `translate(${to.x.toFixed(1)} ${sy.toFixed(1)})`;
        if (wl.line !== lineOp) {
          wl.line = lineOp;
          refs.line.setAttribute("opacity", lineOp);
        }
        const star = `${starOp}|${at}`;
        if (wl.star !== star) {
          wl.star = star;
          refs.star.setAttribute("opacity", starOp);
          refs.star.setAttribute("transform", at);
        }
        if (wl.flare !== flare) {
          wl.flare = flare;
          refs.flare.setAttribute("transform", `scale(${flare})`);
        }
      }
    },
    [measure, status],
  );
  useFrame(onFrame);

  // After a successful send the message takes the form's place and holds the screen reader's attention.
  useEffect(() => {
    if (status === "success") successRef.current?.focus({ preventScroll: true });
  }, [status]);

  const fieldValues = (): Record<FieldName, string> => {
    const data = new FormData(formRef.current ?? undefined);
    return {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      grow: String(data.get("grow") ?? ""),
    };
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "sending") return;
    const values = fieldValues();
    const found = validate(values);
    setErrors(found);
    const first = application.fields.find((fl) => found[fl.name]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`#apply-${first.name}`)?.focus();
      return;
    }
    setStatus("sending");
    // Unset, the request is skipped: the form validates and shows its success message (docs/COPY.md).
    if (ENDPOINT) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: values.name.trim(), email: values.email.trim(), grow: values.grow.trim() }),
        });
        if (!res.ok) throw new Error(`apply endpoint answered ${res.status}`);
      } catch {
        setErrors({ send: application.errors.send });
        setStatus("idle");
        return;
      }
    }
    // The message takes the form's place, not its room: the box keeps its height, so the title and
    // the stars stay where they were.
    const box = boxRef.current;
    if (box) box.style.minHeight = `${box.offsetHeight}px`;
    setStatus("success");
  };

  // A field's message goes as soon as the field is touched again.
  const onInput = (name: FieldName) => {
    if (errors[name] || errors.send) setErrors((prev) => ({ ...prev, [name]: undefined, send: undefined }));
  };

  return (
    <div ref={rootRef} className={`on-sky ${styles.application}`} role="region" aria-label={application.tag} style={{ visibility: "hidden" }}>
      <svg className={styles.constellation} aria-hidden="true" focusable="false">
        {Array.from({ length: LINE_COUNT }, (_, j) => (
          <g key={j}>
            <line
              ref={(el) => {
                stars.current[j].line = el;
              }}
              className={styles.line}
              opacity="0"
            />
            <g
              ref={(el) => {
                stars.current[j].star = el;
              }}
              className={styles.star}
              opacity="0"
            >
              <circle r={RING} className={styles.ring} />
              <path
                ref={(el) => {
                  stars.current[j].flare = el;
                }}
                d={FLARE}
                className={styles.flare}
              />
            </g>
          </g>
        ))}
      </svg>

      <div ref={wrapRef} className={styles.wrap} style={{ left: "62%", width: "30%" }}>
        <span ref={scrimRef} className={styles.scrim} aria-hidden="true" />
        <div ref={boxRef} className={styles.box}>
          <div
            ref={(el) => {
              pieces.current[0] = el;
            }}
            className={styles.piece}
          >
            <Tag>{application.tag}</Tag>
          </div>
          <h2
            ref={(el) => {
              pieces.current[1] = el;
            }}
            className={`display-l ${styles.piece} ${styles.title}`}
          >
            {application.title}
          </h2>

          {status === "success" ? (
            <div
              ref={(el) => {
                pieces.current[PIECE_COUNT - 1] = el;
              }}
              className={styles.piece}
            >
              <p ref={successRef} className={`lead ${styles.success}`} role="status" tabIndex={-1}>
                {application.success}
              </p>
            </div>
          ) : (
            <>
              <p
                ref={(el) => {
                  pieces.current[2] = el;
                }}
                className={`body ${styles.piece} ${styles.subtitle}`}
              >
                {application.subtitle}
              </p>
              <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate aria-busy={status === "sending"}>
                {application.fields.map((field, j) => {
                  const id = `apply-${field.name}`;
                  const message = errors[field.name];
                  const common = {
                    id,
                    name: field.name,
                    className: styles.input,
                    "aria-invalid": message ? true : undefined,
                    "aria-describedby": message ? `${id}-error` : undefined,
                    "aria-required": true,
                    onInput: () => onInput(field.name),
                  } as const;
                  return (
                    <div
                      key={field.name}
                      ref={(el) => {
                        pieces.current[3 + j] = el;
                      }}
                      className={`${styles.piece} ${styles.field}`}
                    >
                      <label htmlFor={id} className={`label ${styles.label}`}>
                        <span
                          ref={(el) => {
                            anchors.current[j] = el;
                          }}
                          className={styles.mark}
                          aria-hidden="true"
                        />
                        <span>{field.label}</span>
                      </label>
                      {field.name === "email" ? (
                        <input {...common} type="email" autoComplete="email" inputMode="email" />
                      ) : field.name === "name" ? (
                        <input {...common} type="text" autoComplete="name" />
                      ) : (
                        <textarea {...common} rows={2} />
                      )}
                      {message && (
                        <p id={`${id}-error`} className={`meta ${styles.error}`}>
                          {message}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div
                  ref={(el) => {
                    pieces.current[PIECE_COUNT - 1] = el;
                  }}
                  className={`${styles.piece} ${styles.actions}`}
                >
                  <PillButton type="submit" disabled={status === "sending"}>
                    {status === "sending" ? application.sending : application.submit}
                  </PillButton>
                  {errors.send && (
                    <p className={`meta ${styles.error}`} role="alert">
                      {errors.send}
                    </p>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
