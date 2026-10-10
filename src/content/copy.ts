/**
 * Every on-screen string for orange.io, transcribed from the "Copy deck" in docs/STORYBOARD.md.
 * Components read text from here only; never type copy straight into a component.
 * Edit wording here and nowhere else.
 */

import type { SceneId } from "@/scroll/types";

export type ChapterId = "model" | "work" | "terms" | "questions";

export interface Chapter {
  id: ChapterId;
  /** Shown next to the active rule in the ruler, e.g. "The Model". */
  name: string;
  /** Shown on hover, e.g. "Ch. 1". */
  short: string;
}

export interface Beat {
  title: string;
  subtitle?: string;
  tag?: string;
  /** A line that types itself out letter by letter. */
  typed?: string;
}

export interface ServiceCard {
  tag: string;
  title: string;
  body: string;
}

export interface TaggedAside {
  tag: string;
  side: string;
}

export interface Question {
  question: string;
  answer: string;
}

export interface FormField {
  name: "name" | "email" | "grow";
  label: string;
}

export interface ArrowButton {
  label: string;
  /** Where the button scrolls to. */
  target: "apply";
}

export const chrome = {
  /** Accessible names only (not shown on screen). */
  mark: { label: "Orange" },
  gridButton: { label: "Open the chapter menu" },
  /** Title of the chapter menu sheet and accessible name of the ruler. */
  menu: { title: "Chapters" },
  apply: { label: "Apply", target: "apply" } satisfies ArrowButton,
  chapters: [
    { id: "model", name: "The Model", short: "Ch. 1" },
    { id: "work", name: "The Work", short: "Ch. 2" },
    { id: "terms", name: "The Terms", short: "Ch. 3" },
    { id: "questions", name: "Questions", short: "Ch. 4" },
  ] satisfies Chapter[],
  /** Bottom-right scroll readout, e.g. "88%". */
  percent: (value: number) => `${Math.round(value)}%`,
} as const;

export const model = {
  hero: {
    title: "Grown to be found.",
    subtitle: "A growth partner paid from the harvest, not the hours.",
    button: { label: "Start a partnership", target: "apply" } satisfies ArrowButton,
    tag: "What we do",
    paragraph:
      "We build your software, get it ranked where buyers search, and take our pay from the new revenue it brings in. No retainer. No timesheets. If you don't grow, we don't invoice.",
  },
  /** Beat over the pluck. */
  found: {
    title: "We get you found.",
    subtitle: "Search and links that put you in front of the people already looking.",
  } satisfies Beat,
  /** Beat over the robed man. */
  harvest: {
    title: "We split the harvest.",
    tag: "Revenue share",
    typed: "Nothing billed by the hour. We share the outcome, so we share the risk.",
  } satisfies Beat,
} as const;

export const work = {
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
  ] satisfies ServiceCard[],
} as const;

export const terms = {
  block: {
    title: "Nothing upfront. A share of the growth.",
    body: "Starting costs you nothing: no retainer, no project fee, no meter running. We fund the strategy, the build, the content and the links.",
    aside: {
      tag: "In plain terms",
      side: "We earn an agreed percentage of the new revenue the work creates, measured against a starting baseline we can both see. Everything we make stays yours: the code, the content, the rankings. We keep our partner list short, because being paid on results means choosing carefully.",
    } satisfies TaggedAside,
  },
  chapterTitle: "The Terms",
  fit: {
    text: "We work with companies that already sell something real and want more of it from search: online shops, software products, marketplaces and service businesses.",
    aside: {
      tag: "In plain terms",
      side: "If that sounds like you, this page is the whole proposal. If you're pre-revenue, want developers by the hour, or need results by next week, we're not the right fit, and we'll say so on the first call.",
    } satisfies TaggedAside,
  },
} as const;

export const questions = {
  title: "Questions worth asking first.",
  items: [
    {
      question: "What does it cost to start?",
      answer:
        "Nothing upfront and nothing by the hour. We pay for the strategy, the software, the content and the links ourselves, and earn an agreed percentage of the new revenue the work brings in. No growth, no bill.",
    },
    {
      question: "How big is your share?",
      answer:
        "We agree on it before we begin, based on how much needs building. It only ever applies to growth above your current baseline, never to revenue you already earn.",
    },
    {
      question: "Why a revenue share instead of a fee?",
      answer:
        "Hourly billing rewards effort, and a retainer pays the same whether you grow or not. Remove both, and the only way left for us to get paid is to grow your revenue.",
    },
    {
      question: "How do you measure what you've added?",
      answer:
        "Before we start, we agree on your baseline and on how new organic revenue is counted: analytics, orders or bookings, whichever fits your business. We both look at the same dashboard.",
    },
    {
      question: "How soon does it pay off?",
      answer:
        "Search builds slowly, then quickly. Technical and software fixes land in weeks; rankings and revenue usually move within months. The wait costs you nothing, because we're funding the climb.",
    },
  ] satisfies Question[],
  application: {
    tag: "Apply",
    title: "Show us what you sell, and where you want more of it.",
    subtitle: "A person reads every application. If we're a fit, you'll hear back within a week.",
    fields: [
      { name: "name", label: "Your name" },
      { name: "email", label: "Work email" },
      { name: "grow", label: "What should grow?" },
    ] satisfies FormField[],
    submit: { label: "Send application" },
    success: "Received. We'll read it and reply within a week.",
  },
} as const;

export const finale = {
  wordmark: "Orange",
  subtitle: "A growth partner paid from the harvest, not the hours.",
  /** TODO: confirm the real address. */
  email: "hello@orange.io",
  copyright: (year: number) => `© ${year} Orange`,
} as const;

/** Site metadata: built from deck copy (wordmark, hero title and subtitle). */
export const meta = {
  title: `${finale.wordmark}. ${model.hero.title}`,
  description: model.hero.subtitle,
} as const;

/**
 * The fourteen scenes by name, with a short description of each scene's still. They label the
 * placeholder art, describe the stills on the reduced-motion page, and name scenes in dev tools.
 */
export const storyScenes = {
  hero: {
    name: "The raised orange",
    still: "A marble statue on a slender minaret raises a glowing orange to a deep blue sky while robed onlookers look up.",
  },
  ascent: {
    name: "The minaret becomes a tree",
    still: "The minaret keeps rising and its stone turns to bark, splitting into branches and new leaves.",
  },
  graft: {
    name: "The graft",
    still: "Two hands in robe sleeves graft a cutting onto a branch and tie it off with twine.",
  },
  pluck: {
    name: "The pluck and the harvester",
    still: "A hand reaches up through laden branches to pick one orange; a man in a white robe holds it and looks at it.",
  },
  share: {
    name: "The cut and the share",
    still: "A knife cuts the orange in two and a second hand takes one half.",
  },
  work: {
    name: "Services in the clouds",
    still: "Soft clouds drift across a blue sky as a very large orange rises on top of a minaret.",
  },
  blueprint: {
    name: "The blueprint",
    still: "A minaret wrapped in timber scaffolding, where an architect unfolds a drawing of it.",
  },
  site: {
    name: "The building site by the sea",
    still: "Seen from above, builders on a timber stage shape a large orange on a marble platform ringed by tiles.",
  },
  prune: {
    name: "The gardener",
    still: "A gardener on a tall column trims a young orange tree growing in a marble urn.",
  },
  fall: {
    name: "The falling orange",
    still: "An orange falls from a cut branch toward rows of orange trees.",
  },
  faq: {
    name: "The questions",
    still: "Rows of orange trees heavy with fruit line both sides of an open sky.",
  },
  stars: {
    name: "The stargazer",
    still: "An astronomer on a marble platform points at a sky filling with stars.",
  },
  apply: {
    name: "The application",
    still: "Clear blue sky with a soft glow where the application form sits.",
  },
  finale: {
    name: "The orchard keepers",
    still: "A woman waters an orange tree while a man trims it with shears.",
  },
} as const satisfies Record<SceneId, { name: string; still: string }>;

/** Labels for the story outside the copy deck: the finale's part name. */
export const story = {
  /** The finale's part of the story (the ruler has four chapters; the storyboard calls this "End"). */
  endPart: "End",
} as const;

/** Labels for the dev-only story timeline (toggled with the backtick key). */
export const devTimeline = {
  title: "Story timeline",
  hint: "` toggles · 1 to 9 and 0 jump to scenes 1 to 10, Shift with 1 to 4 to scenes 11 to 14 · click a bar to seek",
  views: { story: "Whole story", chapter: "This chapter" },
  rows: { scenes: "Scenes", transitions: "Transitions", camera: "Camera" },
  readout: {
    progress: "Progress",
    screen: "Screen",
    scene: "Scene",
    chapter: "Chapter",
    beats: "Beats",
    velocity: "Velocity",
  },
  none: "none",
  close: "Close the timeline",
  screens: (screen: number, total: number) => `${screen.toFixed(2)} of ${total}`,
  velocity: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} screens/s`,
} as const;

/** Labels used only on the dev-only /design route. */
export const designPage = {
  route: "/design",
  title: "Design system",
  gridCaption: "left 5.3% · right 85.6% · top 5.3vw · column A 8% · column B 24%",
  easeHint: "hover the track",
  intro: "Tokens, type and shapes for orange.io. Development only, not linked from the site.",
  sections: {
    type: "Type scale",
    color: "Palette",
    buttons: "Buttons",
    tags: "Tags",
    hairlines: "Hairlines and grid",
    motion: "Easing",
    playground: "Components on a fake progress",
    plates: "Plates, morph and twinkle",
  },
  plateLab: {
    slider: "Amount",
    hint: "One value drives all three: the morph edge, the plate's tint and blur, and how much of the star field is revealed. Sway and twinkle run on idle time.",
    morph: "MorphPlate · stone to bark through the mask",
    plate: "Plate · sway, tint and blur",
    twinkle: "Twinkle · reveal grows the field",
    readout: (t: number) => t.toFixed(2),
  },
  playground: {
    slider: "Fake progress",
    hint: "Drag the slider or use the arrow keys. The demo ranges below stand in for the scroll script.",
    stage: "Stage with chrome and hairlines",
    splitReveal: "SplitReveal",
    splitRevealInView: "SplitReveal, in view",
    typewriter: "Typewriter",
    blurFade: "BlurFade",
    progressLine: "ProgressLine",
    hairlineCaption: "Exits at each chapter change, viewfinder around the dashed target",
    selected: "Selected",
    readout: (p: number, chapter: string) => `${p.toFixed(3)} · ${chapter}`,
    range: (a: number, b: number) => `${a.toFixed(3)} to ${b.toFixed(3)}`,
    inOut: (enter: readonly [number, number], leave: readonly [number, number]) =>
      `in ${enter[0].toFixed(3)} to ${enter[1].toFixed(3)} · out ${leave[0].toFixed(3)} to ${leave[1].toFixed(3)}`,
    drawErase: (draw: readonly [number, number], erase: readonly [number, number]) =>
      `draw ${draw[0].toFixed(3)} to ${draw[1].toFixed(3)} · erase ${erase[0].toFixed(3)} to ${erase[1].toFixed(3)}`,
  },
} as const;

export const copy = { chrome, model, work, terms, questions, finale, meta } as const;
export default copy;
