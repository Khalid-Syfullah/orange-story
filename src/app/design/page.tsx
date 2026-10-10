import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { chrome, designPage, finale, model, questions, terms, work } from "@/content/copy";
import { colors, EASE_CSS } from "@/styles/tokens";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: designPage.title,
  robots: { index: false, follow: false },
};

/* Dev-only reference sheet. Not linked from anywhere; 404s in production builds. */

const typeScale = [
  { token: "display-xxl", spec: "clamp(4rem, 2rem + 9vw, 11rem) · Newsreader 600", sample: finale.wordmark, className: "type-display-xxl" },
  { token: "display-xl", spec: "clamp(2.75rem, 1rem + 5.3vw, 5.5rem) · Newsreader 300 · -0.02em · 0.9", sample: model.hero.title, className: "type-display-xl" },
  { token: "display-xl italic", spec: "Newsreader 300 italic", sample: model.found.title, className: "type-display-xl italic" },
  { token: "display-l", spec: "clamp(2rem, 1rem + 2.6vw, 3.25rem) · Newsreader 300", sample: questions.title, className: "type-display-l" },
  { token: "title", spec: "1.625rem · Newsreader 400", sample: work.cards[0].title, className: "type-title" },
  { token: "lead", spec: "1.25rem · Geist", sample: model.hero.subtitle, className: "type-lead" },
  { token: "body", spec: "0.8125 to 0.9375rem · Geist", sample: model.hero.paragraph, className: "type-body max-w-[52ch]" },
  { token: "label", spec: "0.6875rem · Geist Mono 500 · caps · 0.18em", sample: chrome.apply.label, className: "type-label" },
  { token: "meta", spec: "0.75rem · Geist Mono · caps · 0.04em", sample: chrome.percent(88), className: "type-meta" },
] as const;

const swatches = [
  { name: "--sky", hex: colors.sky, className: "bg-sky text-white" },
  { name: "--sky-soft", hex: colors.skySoft, className: "bg-sky-soft text-ink" },
  { name: "--milk", hex: colors.milk, className: "bg-milk text-ink" },
  { name: "--ink", hex: colors.ink, className: "bg-ink text-milk" },
  { name: "--press", hex: colors.press, className: "bg-press text-milk" },
  { name: "--orange", hex: colors.orange, className: "bg-orange text-ink" },
  { name: "--leaf", hex: colors.leaf, className: "bg-leaf text-milk" },
  { name: "--marble", hex: colors.marble, className: "bg-marble text-ink" },
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <span className="type-label">{children}</span>
      <span className="hairline-x flex-1" aria-hidden />
    </div>
  );
}

/** Four-point star mark used where hairlines cross. */
function StarMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("absolute size-3 -translate-x-1/2 -translate-y-1/2", className)}
      style={style}
    >
      <path
        d="M6 0 C6.4 3.6 8.4 5.6 12 6 C8.4 6.4 6.4 8.4 6 12 C5.6 8.4 3.6 6.4 0 6 C3.6 5.6 5.6 3.6 6 0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PillDemo({ label, surface }: { label: string; surface: "press" | "sky" }) {
  return (
    <button
      type="button"
      className={cn(
        "pill group cursor-pointer outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring",
        surface === "press" ? "bg-press text-milk hover:bg-ink" : "bg-transparent text-white hover:bg-white/10",
      )}
    >
      {label}
      <span className="pill-chip group-hover:translate-x-0.5">
        <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
      </span>
    </button>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-dvh bg-background pb-32 text-foreground">
      <header className="px-col-a pt-grid-top pb-16">
        <p className="type-label text-muted-foreground">{designPage.route}</p>
        <h1 className="type-display-xl mt-4">{designPage.title}</h1>
        <p className="type-body mt-4 max-w-[52ch] text-muted-foreground">{designPage.intro}</p>
      </header>

      {/* Type scale */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.type}</SectionLabel>
        <div className="flex flex-col gap-10">
          {typeScale.map((row) => (
            <div key={row.token} className="grid gap-3 md:grid-cols-[14rem_1fr] md:gap-10">
              <div>
                <p className="type-label">{row.token}</p>
                <p className="type-meta mt-2 normal-case text-muted-foreground">{row.spec}</p>
              </div>
              <p className={row.className}>{row.sample}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Palette */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.color}</SectionLabel>
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.name} className={cn("flex aspect-[4/3] flex-col justify-end p-4", s.className)}>
              <p className="type-label">{s.name}</p>
              <p className="type-meta mt-1.5 opacity-70">{s.hex}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.buttons}</SectionLabel>
        <div className="grid gap-px md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-4 bg-marble p-10">
            <PillDemo label={chrome.apply.label} surface="press" />
            <PillDemo label={questions.application.submit.label} surface="press" />
          </div>
          <div className="theme-sky flex flex-wrap items-center gap-4 bg-background p-10">
            <PillDemo label={model.hero.button.label} surface="sky" />
            <PillDemo label={chrome.apply.label} surface="sky" />
          </div>
        </div>
      </section>

      {/* Tags */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.tags}</SectionLabel>
        <div className="grid gap-px md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-3 bg-marble p-10">
            <span className="tag">{model.hero.tag}</span>
            <span className="tag">{model.harvest.tag}</span>
            <span className="tag">{terms.block.aside.tag}</span>
          </div>
          <div className="theme-sky flex flex-wrap items-center gap-3 bg-background p-10">
            <span className="tag">{work.cards[0].tag}</span>
            <span className="tag">{work.cards[1].tag}</span>
            <span className="tag">{questions.application.tag}</span>
          </div>
        </div>
      </section>

      {/* Hairlines and grid: a scaled frame of the stage with the real grid fractions. */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.hairlines}</SectionLabel>
        <div className="theme-sky relative aspect-video w-full overflow-hidden bg-background">
          {/* left hairline (ruler) */}
          <span className="hairline-y absolute inset-y-0 left-[5.3%]" aria-hidden />
          {/* right hairline */}
          <span className="hairline-y absolute inset-y-0 left-[85.6%]" aria-hidden />
          {/* top hairline: 5.3% of the frame width, as on the stage */}
          <span className="hairline-x absolute inset-x-0 top-[9.42%]" aria-hidden />
          {/* text columns, shown dashed */}
          <span className="absolute inset-y-0 left-[8%] border-l border-dashed border-white/15" aria-hidden />
          <span className="absolute inset-y-0 left-[24%] border-l border-dashed border-white/15" aria-hidden />
          <StarMark className="text-white" style={{ left: "5.3%", top: "9.42%" }} />
          <StarMark className="text-white" style={{ left: "85.6%", top: "9.42%" }} />
          <div className="absolute top-[22%] left-[8%] max-w-[60%]">
            <p className="type-display-l">{model.hero.title}</p>
          </div>
          <div className="absolute bottom-[10%] left-[8%] flex items-start gap-0">
            <span className="tag">{model.hero.tag}</span>
          </div>
          <p className="type-body absolute bottom-[10%] left-[24%] max-w-[44%] text-milk">{model.hero.paragraph}</p>
          <p className="type-meta absolute right-[3%] bottom-[4%]">{chrome.percent(88)}</p>
        </div>
        <p className="type-meta mt-4 normal-case text-muted-foreground">
          {designPage.gridCaption}
        </p>
      </section>

      {/* Easing */}
      <section className="px-col-a py-12">
        <SectionLabel>{designPage.sections.motion}</SectionLabel>
        <div className="group relative h-16 w-full max-w-xl cursor-default border-y border-border">
          <span className="ease-story absolute top-1/2 left-0 size-4 -translate-y-1/2 rounded-full bg-orange transition-[left] duration-1000 group-hover:left-[calc(100%-1rem)]" />
        </div>
        <p className="type-meta mt-4 normal-case text-muted-foreground">{EASE_CSS} · {designPage.easeHint}</p>
      </section>
    </main>
  );
}
