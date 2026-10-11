// Every on-screen string on orange.io, grouped by where it appears.
// Source of truth: docs/COPY.md. Wording here must match it exactly; components never type copy.
//
// Strings that need a value at runtime are small functions (scroll percentage, footer year),
// so the wording still lives here and only the number comes from the caller.

export interface Beat {
  title: string;
  subtitle?: string;
  tag?: string;
  /** Typed character by character by scroll progress. */
  typed?: string;
}

export interface WorkCard {
  tag: string;
  title: string;
  body: string;
}

export interface Question {
  q: string;
  a: string;
}

export interface Chapter {
  /** Anchor id used by the menu and the rail (#model, #work, ...). */
  id: "model" | "work" | "terms" | "questions";
  /** Label on the left rail. */
  label: string;
  /** Label in the chapter menu ("Ch. 1" ...). */
  short: string;
}

export interface FormField {
  name: "name" | "email" | "grow";
  label: string;
}

// ---------------------------------------------------------------------------------------------
// Chrome (always on screen)
// ---------------------------------------------------------------------------------------------

const chapters: readonly Chapter[] = [
  { id: "model", label: "The Model", short: "Ch. 1" },
  { id: "work", label: "The Work", short: "Ch. 2" },
  { id: "terms", label: "The Terms", short: "Ch. 3" },
  { id: "questions", label: "Questions", short: "Ch. 4" },
];

export const chrome = {
  /** The Orange mark, top-left. */
  mark: "Orange",
  /** Top-right pill button with a right-arrow chip; scrolls to the application form. */
  apply: "Apply",
  /** Left rail chapters (and the chapter menu). */
  chapters,
  /** The chapter menu's Apply entry: the mark that stands where the chapters have "Ch. 1". */
  menuApplyMark: "→",
  /** Bottom-right scroll percentage, for example "88%". */
  percent: (value: number): string => `${Math.round(value)}%`,
  /** Accessible names for icon-only controls (not visible on screen). */
  a11y: {
    home: "Orange, back to the top",
    menuOpen: "Open the chapter menu",
    menuClose: "Close the chapter menu",
    chapters: "Chapters",
    menu: "Chapter menu",
    progress: "Scroll progress",
  },
  /**
   * What the stage's canvas shows, one description per segment of the script (src/stage/script.ts),
   * for the canvas's `role="img"` label. The words on screen are real text in the page; these
   * describe the painting behind them.
   */
  scenes: {
    hero: "A painting of a giant orange on a stepped marble plinth under a cobalt sky, three women in Greek drapery attending it, one tilting a brass watering can.",
    bridge: "The giant orange from the opening painting becomes a real orange growing on a branch, held by two hands.",
    model: "Paintings of hands grafting a branch, a hand reaching for fruit in a grove, and a man in a green coat holding an orange up to the light.",
    split: "An orange is cut in half and the cut opens into a tall painting of the same orange wrapped in scaffold.",
    work: "A tall painting of the giant orange wrapped in timber scaffold, a man polishing its peel and a woman reading a blueprint on a lower stage.",
    parchment: "The camera pushes into the blueprint she holds until the parchment fills the frame.",
    sheet: "A sheet of parchment paper.",
    drawing: "A construction drawing of the orange on the sheet turns from eye level to a plan seen from above.",
    panel: "The drawing rests as a small brushed-edge panel in the margin of the sheet.",
    close: "The sheet burns away from the bottom left into flat blue.",
    coda: "A woman picks an orange from a potted tree with a rod; the orange floats free in a blue field and a halo grows around it.",
    matchcut: "The floating orange becomes one of the oranges hanging in a canopy of leaves.",
    questions: "Looking up through the branches of an orange tree, oranges and leaves round an open patch of blue sky.",
    moire: "The canopy turns into a coarse halftone screen, and a new painting prints in.",
    application: "A woman in a white gown stands on marble steps, her raised finger pointing at the clouds in a blue sky.",
    rise: "A young orange sapling grows from the marble in the blue sky.",
    finale: "A young orange tree with five gilded oranges; a woman waters it from a brass can and a man ties up a branch.",
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------------------------

export const hero = {
  title: "Grown to be found.",
  subtitle: "A growth partner paid from the harvest, not the hours.",
  /** Right-arrow chip; scrolls to the application form. */
  button: "Start a partnership",
  /** Bottom-left tag. */
  tag: "What we do",
  /** Bottom-left paragraph. */
  paragraph:
    "We build your software, get it ranked where buyers search, and take our pay from the new revenue it brings in. No retainer. No timesheets. If you don't grow, we don't invoice.",
} as const;

// ---------------------------------------------------------------------------------------------
// Chapter 1: The Model
// ---------------------------------------------------------------------------------------------

export const model = {
  chapter: chapters[0],
  /** Beat over the grove (picking). */
  grove: {
    title: "We get you found.",
    subtitle: "Search and links that put you in front of the people already looking.",
  } satisfies Beat,
  /** Beat over the robed man (the split orange). */
  share: {
    title: "We split the harvest.",
    tag: "Revenue share",
    typed: "Nothing billed by the hour. We share the outcome, so we share the risk.",
  } satisfies Beat,
} as const;

// ---------------------------------------------------------------------------------------------
// Chapter 2: The Work
// ---------------------------------------------------------------------------------------------

export const work = {
  chapter: chapters[1],
  cards: [
    {
      tag: "Search engine optimization",
      title: "Found, built and ranked by one team.",
      body: "Our engineers and our search specialists are the same people. Every site is shaped for search from the first commit, not patched for it afterwards.",
    },
    {
      tag: "Content and links",
      title: "Pages people search for, links they trust.",
      body: "We write what your buyers are already typing into a search bar, and earn mentions from the places they already read.",
    },
    {
      tag: "Custom software",
      title: "We build the thing that gets ranked.",
      body: "Storefronts, marketplaces, booking flows: the systems a modern business sells through. Speed, structure and clean rendering decide rankings long before the copy does, so we design for them from day one. What we ship loads fast, reads cleanly, and gives search engines nothing to stumble over.",
    },
  ] satisfies readonly WorkCard[],
} as const;

// ---------------------------------------------------------------------------------------------
// Chapter 3: The Terms
// ---------------------------------------------------------------------------------------------

export const terms = {
  chapter: chapters[2],
  block: {
    title: "Nothing upfront. A share of the growth.",
    body: "Starting costs you nothing: no retainer, no project fee, no meter running. We fund the strategy, the build, the content and the links.",
    tag: "In plain terms",
    side: "We earn an agreed percentage of the new revenue the work creates, measured against a starting baseline we can both see. Everything we make stays yours: the code, the content, the rankings. We keep our partner list short, because being paid on results means choosing carefully.",
  },
  /** Large chapter title over the coda. */
  codaTitle: "The Terms",
  fit: {
    text: "We work with companies that already sell something real and want more of it from search: online shops, software products, marketplaces and service businesses.",
    tag: "In plain terms",
    side: "If that sounds like you, this page is the whole proposal. If you're pre-revenue, want developers by the hour, or need results by next week, we're not the right fit, and we'll say so on the first call.",
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Chapter 4: Questions
// ---------------------------------------------------------------------------------------------

export const questions = {
  chapter: chapters[3],
  /** Section title. Its last word is the one handwritten in (see `titleHandwritten`). */
  title: "Questions worth asking first.",
  /** The part of `title` set in type, before the handwritten word. */
  titleSet: "Questions worth asking",
  /** The last word of `title`, handwritten in as the reader arrives. */
  titleHandwritten: "first.",
  items: [
    {
      q: "What does it cost to start?",
      a: "Nothing upfront and nothing by the hour. We pay for the strategy, the software, the content and the links ourselves, and earn an agreed percentage of the new revenue the work brings in. No growth, no bill.",
    },
    {
      q: "How big is your share?",
      a: "We agree on it before we begin, based on how much needs building. It only ever applies to growth above your current baseline, never to revenue you already earn.",
    },
    {
      q: "Why a revenue share instead of a fee?",
      a: "Hourly billing rewards effort, and a retainer pays the same whether you grow or not. Remove both, and the only way left for us to get paid is to grow your revenue.",
    },
    {
      q: "How do you measure what you've added?",
      a: "Before we start, we agree on your baseline and on how new organic revenue is counted: analytics, orders or bookings, whichever fits your business. We both look at the same dashboard.",
    },
    {
      q: "How soon does it pay off?",
      a: "Search builds slowly, then quickly. Technical and software fixes land in weeks; rankings and revenue usually move within months. The wait costs you nothing, because we're funding the climb.",
    },
  ] satisfies readonly Question[],
} as const;

// ---------------------------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------------------------

export const application = {
  tag: "Apply",
  title: "Show us what you sell, and where you want more of it.",
  subtitle: "A person reads every application. If we're a fit, you'll hear back within a week.",
  fields: [
    { name: "name", label: "Your name" },
    { name: "email", label: "Work email" },
    { name: "grow", label: "What should grow?" },
  ] satisfies readonly FormField[],
  /** Right-arrow chip. */
  submit: "Send application",
  success: "Received. We'll read it and reply within a week.",
  /** Plain inline messages: one per field that fails validation, and one for a send that fails. */
  errors: {
    name: "Tell us your name.",
    email: "Enter a work email like name@company.com.",
    grow: "Tell us what should grow.",
    send: "That did not send. Please try again, or write to us directly.",
  },
  /** Shown on the button while the request is in flight. */
  sending: "Sending",
} as const;

// ---------------------------------------------------------------------------------------------
// Finale
// ---------------------------------------------------------------------------------------------

export const finale = {
  wordmark: "Orange",
  subtitle: "A growth partner paid from the harvest, not the hours.",
  /** Footer line, "© {year} Orange". */
  copyright: (year: number): string => `© ${year} Orange`,
  // TODO: confirm the real contact address (docs/COPY.md).
  email: "hello@orange.io",
  /** The copy button beside the email, and what it says once the address is on the clipboard. */
  copyEmail: "Copy",
  copied: "Copied",
  /** Accessible name of the copy button. */
  copyEmailLabel: "Copy the contact email",
} as const;

/** The whole deck, for pages that want one import. */
export const copy = { chrome, hero, model, work, terms, questions, application, finale } as const;

export type Copy = typeof copy;
