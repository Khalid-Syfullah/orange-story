"use client";
// The finale's DOM (docs/COPY.md, Finale): the subtitle under the wordmark in `lead`, milk on sky,
// ramping in after the last letter, and the footer line along the mid rule in `meta`: "© {year}
// Orange" left of the trunk, the contact email (selectable text) and its copy button right of it.
// The wordmark itself is not here: it is a canvas texture the finale pass prints in
// (passes/finale/wordmark.ts). Alphas are functions of p (passes/finale/timeline.ts), written to
// the elements from the frame subscription.
import { useCallback, useEffect, useRef, useState } from "react";
import { finale } from "@/content/copy";
import type { FrameCtx } from "./frame";
import { useFrame } from "./hub";
import { footerAlpha, subtitleAlpha, wordmarkLayout } from "./passes/finale/timeline";
import { local } from "./script";
import styles from "./FinaleCopy.module.css";

/** How far a piece lifts as it arrives (px). */
const LIFT = 12;
/** The footer takes pointer events from this alpha on. */
const LIVE = 0.6;

interface Written {
  opacity: string;
  transform: string;
  visibility: string;
}
const blank = (): Written => ({ opacity: "", transform: "", visibility: "" });

function write(el: HTMLElement | null, last: Written, alpha: number) {
  if (!el) return;
  const lift = (1 - alpha) * LIFT;
  const next: Written = {
    opacity: alpha.toFixed(3),
    transform: lift < 0.01 ? "" : `translate3d(0, ${lift.toFixed(2)}px, 0)`,
    visibility: alpha < 0.004 ? "hidden" : "visible",
  };
  if (last.opacity !== next.opacity) el.style.opacity = last.opacity = next.opacity;
  if (last.transform !== next.transform) el.style.transform = last.transform = next.transform;
  if (last.visibility !== next.visibility) el.style.visibility = last.visibility = next.visibility;
}

export function FinaleCopy() {
  const subRef = useRef<HTMLParagraphElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLSpanElement>(null);
  const written = useRef({ sub: blank(), foot: blank() });
  const live = useRef("");
  const sizeKey = useRef("");
  const [copied, setCopied] = useState(false);
  const yearRef = useRef<HTMLSpanElement>(null);

  // The year is read on the client so a static build never carries a stale one.
  useEffect(() => {
    if (yearRef.current) yearRef.current.textContent = finale.copyright(new Date().getFullYear());
  }, []);

  const onFrame = useCallback((f: FrameCtx) => {
    const sub = subRef.current;
    if (!sub) return;
    const key = `${f.css[0]}x${f.css[1]}`;
    if (sizeKey.current !== key) {
      sizeKey.current = key;
      sub.style.top = `${(wordmarkLayout(f.css).bottom + 6).toFixed(1)}px`;
    }
    const t = local("finale", f.p);
    write(sub, written.current.sub, t > 0 ? subtitleAlpha(t) : 0);
    const fa = t > 0 ? footerAlpha(t) : 0;
    write(footRef.current, written.current.foot, fa);
    const state = fa >= LIVE ? "on" : "off";
    if (live.current !== state) {
      live.current = state;
      const foot = footRef.current;
      if (foot) foot.style.pointerEvents = state === "on" ? "auto" : "none";
    }
  }, []);
  useFrame(onFrame);

  const select = () => {
    const el = emailRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const copy = () => {
    // The write starts inside the click handler (the browser's user-activation window).
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(finale.email).then(done, select);
    } else {
      select();
      try {
        if (document.execCommand("copy")) done();
      } catch {
        // The address stays selected for the reader to copy.
      }
    }
  };

  return (
    <section className={`on-sky ${styles.finale}`} aria-label={finale.wordmark}>
      <h2 className={styles.wordmark}>{finale.wordmark}</h2>
      <p ref={subRef} className={`lead ${styles.piece} ${styles.subtitle}`}>
        {finale.subtitle}
      </p>
      <div ref={footRef} className={`meta ${styles.piece} ${styles.foot}`}>
        <span ref={yearRef} className={styles.copyright} suppressHydrationWarning />
        <span className={styles.contact}>
          <span ref={emailRef} className={styles.email}>
            {finale.email}
          </span>
          <button type="button" className={styles.copyBtn} aria-label={finale.copyEmailLabel} onClick={copy}>
            {copied ? finale.copied : finale.copyEmail}
          </button>
        </span>
        <span className={styles.status} role="status" aria-live="polite">
          {copied ? finale.copied : ""}
        </span>
      </div>
    </section>
  );
}
