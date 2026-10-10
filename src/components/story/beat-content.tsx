"use client";

import * as React from "react";
import { motion } from "motion/react";

import { finale as finaleCopy, type ArrowButton, type FormField } from "@/content/copy";
import { cn } from "@/lib/utils";
import { SplitReveal } from "@/components/motion/split-reveal";
import { Typewriter } from "@/components/motion/typewriter";
import { useHeroTextReady } from "@/components/stage/hero-intro";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { copyAtUnchecked } from "@/scroll/copy-path";
import { beatLineRanges } from "@/scroll/helpers";
import { ANCHORS } from "@/scroll/script";
import { useOptionalStory } from "@/scroll/story-scroll";
import type { BeatDef, SlotId } from "@/scroll/types";

import { BeatLine, useBeatContext, useBeatPresence } from "./beat";
import { SLOTS, STAGE_COLUMNS } from "./slots";

/**
 * Default content of a beat: its copy key from the script, laid out for its slot. Inside a `Beat`
 * every row is scrubbed (headlines reveal letter by letter, typed lines type and un-type); on the
 * reduced-motion page (`beat` passed in, no surrounding Beat) the same rows render as plain text.
 *
 * Scene phases replace this per beat by passing children to `<Beat>`; the rows here (`BeatLine`,
 * `Headline`, `TypedLine`) are the building blocks to reuse.
 */

/** Secondary text: milk on sky, softened ink on milk (set by the text layer). */
export const SOFT_TEXT = "text-[color:var(--story-soft,var(--milk))]";

type CopyNode = Record<string, unknown>;

const isNode = (v: unknown): v is CopyNode => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export interface BeatContentProps {
  /** The beat to render when outside a `Beat` (static pages). */
  beat?: BeatDef;
  /** Copyright year for the finale (static pages; inside the stage it comes from the story). */
  year?: number | null;
}

export function BeatContent({ beat: beatProp, year: yearProp }: BeatContentProps) {
  const context = useBeatContext();
  const story = useOptionalStory();
  const beat = context?.beat ?? beatProp;
  if (!beat) return null;

  const node = copyAtUnchecked(beat.copy);
  const year = yearProp ?? story?.year ?? null;

  if (typeof node === "string") return <TitleBlock beat={beat} text={node} />;
  if (!isNode(node)) return null;
  if ("question" in node) return <QuestionPanel beat={beat} question={str(node.question)} answer={str(node.answer)} />;
  if ("wordmark" in node) return <Wordmark beat={beat} node={node} year={year} />;
  if (beat.parts?.includes("fields")) return <FormPreview beat={beat} node={node} />;
  return <TextBlock beat={beat} node={node} />;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

type HeadingTag = "h1" | "h2" | "h3" | "p";

interface RowProps {
  index: number;
  count: number;
  className?: string;
}

/**
 * A headline row. Inside a `reveal` beat its letters rise in one by one (scrubbed); in a `load` beat
 * they play once on page load; elsewhere the row fades with the stagger.
 */
export function Headline({ text, as = "h2", textClassName, index, count, className }: RowProps & { text: string; as?: HeadingTag; textClassName?: string }) {
  const context = useBeatContext();
  const beat = context?.beat;
  const Static = as;
  // The hero title waits for the sky and the statue (see `hero-intro.ts`).
  const ready = useHeroTextReady();

  if (!context || !beat) {
    return (
      <BeatLine index={index} count={count} className={className}>
        <Static className={textClassName}>{text}</Static>
      </BeatLine>
    );
  }

  if (beat.enter === "reveal") {
    const { arrive } = beatLineRanges(beat, index, count);
    const share = (arrive[1] - arrive[0]) / Math.max(1e-6, beat.out - arrive[0]);
    return (
      <BeatLine index={index} count={count} arrive={false} className={className}>
        <SplitReveal as={as} text={text} className={textClassName} progress={context.progress} range={[arrive[0], beat.out]} revealShare={share} hide={false} />
      </BeatLine>
    );
  }

  if (beat.enter === "load" && context.intro) {
    return (
      <BeatLine index={index} count={count} arrive={false} className={className}>
        <SplitReveal as={as} text={text} className={textClassName} trigger="mount" delay={0.15} hold={!ready} />
      </BeatLine>
    );
  }

  return (
    <BeatLine index={index} count={count} className={className}>
      <Static className={textClassName}>{text}</Static>
    </BeatLine>
  );
}

/** A line that types itself out during the beat and un-types when scrolling back. */
export function TypedLine({ text, className }: { text: string; className?: string } & Pick<RowProps, "index" | "count">) {
  const context = useBeatContext();
  if (!context) return <p className={className}>{text}</p>;
  const { beat, progress } = context;
  const start = beat.hold[0] - 0.4 * (beat.hold[0] - beat.in);
  const end = beat.hold[0] + 0.55 * (beat.hold[1] - beat.hold[0]);
  return <Typewriter text={text} progress={progress} range={[start, Math.max(end, start + 1e-4)]} className={className} />;
}

/** "Start a partnership" and friends: scrolls to the form on the stage, links to it elsewhere. */
function ApplyButton({ button }: { button: ArrowButton }) {
  const story = useOptionalStory();
  if (!story) {
    return (
      <Button asChild variant="ghost-pill">
        <a href={`#${button.target}`}>{button.label}</a>
      </Button>
    );
  }
  return (
    <Button variant="ghost-pill" onClick={() => story.scrollTo(ANCHORS[button.target])}>
      {button.label}
    </Button>
  );
}

/**
 * A tag with text beside it: on the bottom-left grid the tag sits in column A and the text in
 * column B (one tab-width to the right); in other slots the text simply follows the tag.
 */
function PairRow({ slot, tag, index, count, className, children }: RowProps & { slot: SlotId; tag: string; children: React.ReactNode }) {
  if (slot === "bottom-left") {
    return (
      <BeatLine index={index} count={count} className={cn(STAGE_COLUMNS, "items-start", className)}>
        <div className="col-start-2 pt-0.5">
          <Tag>{tag}</Tag>
        </div>
        <div className="col-start-3 max-w-[52ch] pr-4">{children}</div>
      </BeatLine>
    );
  }
  return (
    <BeatLine index={index} count={count} className={cn("flex items-start gap-6", className)}>
      <Tag className="mt-0.5 shrink-0">{tag}</Tag>
      <div className="min-w-0 flex-1">{children}</div>
    </BeatLine>
  );
}

/** Rows on the bottom-left grid start in column A; elsewhere the slot column already places them. */
const gridRow = (slot: SlotId) => (slot === "bottom-left" ? STAGE_COLUMNS : undefined);
const gridCell = (slot: SlotId) => (slot === "bottom-left" ? "col-start-2 col-end-4" : undefined);

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function titleStyle(beat: BeatDef): { as: HeadingTag; className: string } {
  if (beat.enter === "load") return { as: "h1", className: "type-display-xl max-w-[12ch]" };
  if (beat.copy.startsWith("work.cards")) return { as: "h3", className: "type-title max-w-[24ch]" };
  if (beat.slot === "right" || beat.slot === "top-left") return { as: "h2", className: "type-display-l max-w-[20ch]" };
  return { as: "h2", className: "type-display-xl max-w-[14ch]" };
}

type Row = { key: string; render: (index: number, count: number) => React.ReactNode };

/** Titles, subtitles, tags, paragraphs, typed lines and asides, in storyboard order. */
function TextBlock({ beat, node }: { beat: BeatDef; node: CopyNode }) {
  const { slot } = beat;
  const show = (field: string) => (!beat.parts || beat.parts.includes(field)) && node[field] != null;
  const pairTag = str(node.tag);
  const rows: Row[] = [];
  const cell = gridCell(slot);

  if (show("tag") && !show("paragraph") && !show("typed")) {
    rows.push({
      key: "tag",
      render: (i, n) => (
        <BeatLine index={i} count={n} className={cn(gridRow(slot), "mb-5")}>
          <div className={cell}>
            <Tag>{pairTag}</Tag>
          </div>
        </BeatLine>
      ),
    });
  }
  if (show("title")) {
    const { as, className } = titleStyle(beat);
    rows.push({
      key: "title",
      render: (i, n) => <Headline index={i} count={n} as={as} text={str(node.title)} className={gridRow(slot)} textClassName={cn(cell, className)} />,
    });
  }
  if (show("subtitle")) {
    rows.push({
      key: "subtitle",
      render: (i, n) => (
        <BeatLine index={i} count={n} as="p" className={cn("type-lead mt-5 max-w-[34ch]", SOFT_TEXT)}>
          {str(node.subtitle)}
        </BeatLine>
      ),
    });
  }
  if (show("button") && isNode(node.button)) {
    const button = node.button as unknown as ArrowButton;
    rows.push({
      key: "button",
      render: (i, n) => (
        <BeatLine index={i} count={n} className="mt-8">
          <ApplyButton button={button} />
        </BeatLine>
      ),
    });
  }
  if (show("text")) {
    rows.push({
      key: "text",
      render: (i, n) => (
        <BeatLine index={i} count={n} className={gridRow(slot)}>
          <p className={cn(cell, "type-lead max-w-[46ch]")}>{str(node.text)}</p>
        </BeatLine>
      ),
    });
  }
  if (show("body")) {
    rows.push({
      key: "body",
      render: (i, n) => (
        <BeatLine index={i} count={n} as="p" className={cn("type-body mt-4 max-w-[48ch]", SOFT_TEXT)}>
          {str(node.body)}
        </BeatLine>
      ),
    });
  }
  if (show("paragraph")) {
    rows.push({
      key: "paragraph",
      render: (i, n) => (
        <PairRow slot={slot} tag={pairTag} index={i} count={n}>
          <p className={cn("type-body", SOFT_TEXT)}>{str(node.paragraph)}</p>
        </PairRow>
      ),
    });
  }
  if (show("typed")) {
    rows.push({
      key: "typed",
      render: (i, n) => (
        <PairRow slot={slot} tag={pairTag} index={i} count={n} className="mt-6">
          <TypedLine index={i} count={n} text={str(node.typed)} className={cn("type-body", SOFT_TEXT)} />
        </PairRow>
      ),
    });
  }
  if (show("aside") && isNode(node.aside)) {
    const aside = node.aside;
    rows.push({
      key: "aside",
      render: (i, n) => (
        <PairRow slot={slot} tag={str(aside.tag)} index={i} count={n} className="mt-7">
          <p className={cn("type-body max-w-[46ch]", SOFT_TEXT)}>{str(aside.side)}</p>
        </PairRow>
      ),
    });
  }

  return (
    <div className={SLOTS[slot].column}>
      {rows.map((row, i) => (
        <React.Fragment key={row.key}>{row.render(i, rows.length)}</React.Fragment>
      ))}
    </div>
  );
}

/** A single string: the docking chapter title, or a section title. */
function TitleBlock({ beat, text }: { beat: BeatDef; text: string }) {
  const large = beat.enter === "dock";
  return (
    <div className={SLOTS[beat.slot].column}>
      <Headline index={0} count={1} text={text} textClassName={large ? "type-display-xl whitespace-nowrap" : "type-display-l"} />
    </div>
  );
}

/** A question card: the question as its title, the answer inside, on a clear glass panel. */
function QuestionPanel({ beat, question, answer }: { beat: BeatDef; question: string; answer: string }) {
  const presence = useBeatPresence();
  return (
    <div className={SLOTS[beat.slot].column}>
      <motion.div
        style={presence ? { opacity: presence } : undefined}
        className="rounded-[1.25rem] border border-white/20 bg-white/[0.07] p-7 backdrop-blur-md sm:p-9"
      >
        <Headline index={0} count={2} as="h3" text={question} textClassName="type-title" />
        <BeatLine index={1} count={2} as="p" className={cn("type-body mt-5", SOFT_TEXT)}>
          {answer}
        </BeatLine>
      </motion.div>
    </div>
  );
}

/**
 * The application form's place on the stage until the real form lands: the three fields as clear
 * glass pills, and the send button as a mail link so the page always offers a way to apply.
 */
function FormPreview({ beat, node }: { beat: BeatDef; node: CopyNode }) {
  const fields = (Array.isArray(node.fields) ? node.fields : []) as FormField[];
  const submit = isNode(node.submit) ? str(node.submit.label) : "";
  const pill = "flex h-12 items-center rounded-pill border border-white/25 bg-white/[0.06] px-5 type-label backdrop-blur-sm";
  return (
    <div className={SLOTS[beat.slot].column}>
      <div className="grid grid-cols-2 gap-3">
        {fields.slice(0, 2).map((field, i) => (
          <BeatLine key={field.name} index={i} count={4}>
            <div className={pill}>{field.label}</div>
          </BeatLine>
        ))}
      </div>
      {fields[2] ? (
        <BeatLine index={2} count={4} className="mt-3">
          <div className={cn(pill, "h-28 items-start rounded-[1.5rem] pt-4")}>{fields[2].label}</div>
        </BeatLine>
      ) : null}
      <BeatLine index={3} count={4} className="mt-6">
        <Button asChild variant="ghost-pill">
          <a href={`mailto:${finaleCopy.email}`}>{submit}</a>
        </Button>
      </BeatLine>
    </div>
  );
}

/** The finale: the wordmark, the subtitle, then the copyright line and the contact email. */
function Wordmark({ beat, node, year }: { beat: BeatDef; node: CopyNode; year: number | null }) {
  const email = str(node.email);
  return (
    <div className={cn(SLOTS[beat.slot].column, "flex flex-col items-center text-center")}>
      <Headline index={0} count={4} text={str(node.wordmark)} textClassName="type-display-xxl" />
      <BeatLine index={1} count={4} as="p" className={cn("type-lead mt-6 max-w-[30ch]", SOFT_TEXT)}>
        {str(node.subtitle)}
      </BeatLine>
      {year !== null ? (
        <BeatLine index={2} count={4} as="p" className="type-meta mt-14">
          {finaleCopy.copyright(year)}
        </BeatLine>
      ) : null}
      <BeatLine index={3} count={4} className="type-meta mt-2">
        <a href={`mailto:${email}`} className="underline-offset-4 hover:underline">
          {email}
        </a>
      </BeatLine>
    </div>
  );
}
