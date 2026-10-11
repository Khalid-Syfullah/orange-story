// Small DOM primitives built on the tokens in src/app/globals.css.
// They carry no copy of their own: callers pass strings from src/content/copy.ts.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/** Right-arrow glyph used in the pill's chip. */
export function ArrowIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path d="M1 6h9.2M6.6 2.2 10.4 6 6.6 9.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function Chip() {
  return (
    <span className="pill__chip" aria-hidden="true">
      <ArrowIcon />
    </span>
  );
}

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

/** Pill button: radius 999px, 1px border at 20% foreground, mono label, arrow chip. */
export function PillButton({ children, className, type = "button", ...rest }: PillButtonProps) {
  return (
    <button type={type} className={className ? `pill ${className}` : "pill"} {...rest}>
      <span>{children}</span>
      <Chip />
    </button>
  );
}

type PillLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode };

/** The pill as a link (same look). */
export function PillLink({ children, className, ...rest }: PillLinkProps) {
  return (
    <a className={className ? `pill ${className}` : "pill"} {...rest}>
      <span>{children}</span>
      <Chip />
    </a>
  );
}

/** Tag: radius 4px, 10% tint, mono uppercase. Decorative, never focusable. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `tag ${className}` : "tag"}>{children}</span>;
}

/** The four-point star mark that sits on hairline joints. */
export function StarMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className ? `star ${className}` : "star"}
      style={style}
      viewBox="0 0 11 11"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.5 0 C5.9 3.6 7.4 5.1 11 5.5 C7.4 5.9 5.9 7.4 5.5 11 C5.1 7.4 3.6 5.9 0 5.5 C3.6 5.1 5.1 3.6 5.5 0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** A 1px hairline. `over` picks the tone: 55% milk over paintings, 20% foreground on flat grounds. */
export function Hairline({
  direction,
  over = "flat",
  className,
  style,
}: {
  direction: "h" | "v";
  over?: "flat" | "paint";
  className?: string;
  style?: CSSProperties;
}) {
  const cls = ["hairline", `hairline--${direction}`, over === "paint" ? "hairline--paint" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <span className={cls} style={style} aria-hidden="true" />;
}
