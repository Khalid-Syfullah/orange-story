import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /* Orange pills (DESIGN.md, Shapes): hairline border, inset top highlight, mono label, arrow chip. */
        pill: "border-hairline bg-press text-milk shadow-[inset_0_1px_0_color-mix(in_oklab,currentColor_22%,transparent)] hover:bg-ink focus-visible:border-hairline focus-visible:ring-sky/60",
        "ghost-pill":
          "border-hairline bg-transparent text-white shadow-[inset_0_1px_0_color-mix(in_oklab,currentColor_22%,transparent)] hover:bg-white/10 focus-visible:border-hairline focus-visible:ring-milk/60",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        /* Pill geometry; picked automatically for the pill variants. */
        pill: "h-10 gap-3.5 rounded-pill pr-1.25 pl-4.5 font-mono text-label tracking-[0.18em] uppercase focus-visible:ring-offset-0 active:not-aria-[haspopup]:translate-y-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>

const isPill = (variant: ButtonVariant | null | undefined) =>
  variant === "pill" || variant === "ghost-pill"

/** The round arrow chip at the end of a pill. Nudges 2px right on hover and keyboard focus. */
function PillChip({ className }: { className?: string }) {
  return (
    <span
      data-slot="pill-chip"
      aria-hidden
      className={cn(
        "pill-chip group-hover/button:translate-x-0.5 group-focus-visible/button:translate-x-0.5",
        className
      )}
    >
      <ArrowRight className="size-3.5" strokeWidth={1.5} />
    </span>
  )
}

function Button({
  className,
  variant = "default",
  size,
  asChild = false,
  arrow,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Pill variants only: show the arrow chip (default true). */
    arrow?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const pill = isPill(variant)
  const resolvedSize = size ?? (pill ? "pill" : "default")
  const showArrow = pill && arrow !== false

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={resolvedSize}
      className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
      {...props}
    >
      {/* A keyed array, not a fragment: with `asChild`, Slot must see the Slottable as a direct
          child to move the label and the chip into the child element (a fragment would get the
          button props instead). */}
      {showArrow
        ? [<Slot.Slottable key="label">{children}</Slot.Slottable>, <PillChip key="chip" />]
        : children}
    </Comp>
  )
}

export { Button, buttonVariants, PillChip }
