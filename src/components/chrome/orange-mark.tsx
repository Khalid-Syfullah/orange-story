import { cn } from "@/lib/utils";

/** The Orange mark: the fruit with a single leaf. Decorative unless given a `label`. */
export function OrangeMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="16" cy="18.5" r="10.5" fill="var(--orange)" />
      <path d="M16 8.2c1.1-3.6 4.6-5.6 8.2-5-0.7 3.6-3.8 6-8.2 5z" fill="var(--leaf)" />
      <path d="M16 8.2c-0.2-1.4-0.6-2.6-1.3-3.6" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
