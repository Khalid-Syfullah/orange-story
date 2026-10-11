# Copy deck (all on-screen text)

All copy lives in `src/content/copy.ts`, typed and grouped by chapter, so it can be edited in one place. Text in quotes is the exact wording. Never type copy straight into components.

## Chrome (always on screen)

- Top-left: the Orange mark, and a small grid icon button under it (opens the chapter menu).
- Top-right pill button: "Apply" with a right-arrow chip. Scrolls to the application form.
- Left rail chapters: "The Model", "The Work", "The Terms", "Questions". Shown as "Ch. 1" to "Ch. 4" in the menu.
- Bottom-right: scroll percentage, for example "88%".

## Hero and Chapter 1: The Model

- Hero title: "Grown to be found."
- Hero subtitle: "A growth partner paid from the harvest, not the hours."
- Hero button: "Start a partnership" (right-arrow chip). Scrolls to the application form.
- Bottom-left tag: "What we do"
- Bottom-left paragraph: "We build your software, get it ranked where buyers search, and take our pay from the new revenue it brings in. No retainer. No timesheets. If you don't grow, we don't invoice."
- Beat over the grove (picking): title "We get you found." subtitle "Search and links that put you in front of the people already looking."
- Beat over the robed man: title "We split the harvest." tag "Revenue share" typed line "Nothing billed by the hour. We share the outcome, so we share the risk."

## Chapter 2: The Work

- Card 1: tag "Search engine optimization", title "Found, built and ranked by one team.", body "Our engineers and our search specialists are the same people. Every site is shaped for search from the first commit, not patched for it afterwards."
- Card 2: tag "Content and links", title "Pages people search for, links they trust.", body "We write what your buyers are already typing into a search bar, and earn mentions from the places they already read."
- Card 3: tag "Custom software", title "We build the thing that gets ranked.", body "Storefronts, marketplaces, booking flows: the systems a modern business sells through. Speed, structure and clean rendering decide rankings long before the copy does, so we design for them from day one. What we ship loads fast, reads cleanly, and gives search engines nothing to stumble over."

## Chapter 3: The Terms

- Terms block title: "Nothing upfront. A share of the growth."
- Terms block body: "Starting costs you nothing: no retainer, no project fee, no meter running. We fund the strategy, the build, the content and the links."
- Terms tag: "In plain terms"
- Terms side text: "We earn an agreed percentage of the new revenue the work creates, measured against a starting baseline we can both see. Everything we make stays yours: the code, the content, the rankings. We keep our partner list short, because being paid on results means choosing carefully."
- Large chapter title (over the coda): "The Terms"
- Fit text: "We work with companies that already sell something real and want more of it from search: online shops, software products, marketplaces and service businesses."
- Fit tag: "In plain terms"
- Fit side text: "If that sounds like you, this page is the whole proposal. If you're pre-revenue, want developers by the hour, or need results by next week, we're not the right fit, and we'll say so on the first call."

## Chapter 4: Questions

- Section title: "Questions worth asking first." (the last word is the one handwritten in)
- Question 1: "What does it cost to start?" / "Nothing upfront and nothing by the hour. We pay for the strategy, the software, the content and the links ourselves, and earn an agreed percentage of the new revenue the work brings in. No growth, no bill."
- Question 2: "How big is your share?" / "We agree on it before we begin, based on how much needs building. It only ever applies to growth above your current baseline, never to revenue you already earn."
- Question 3: "Why a revenue share instead of a fee?" / "Hourly billing rewards effort, and a retainer pays the same whether you grow or not. Remove both, and the only way left for us to get paid is to grow your revenue."
- Question 4: "How do you measure what you've added?" / "Before we start, we agree on your baseline and on how new organic revenue is counted: analytics, orders or bookings, whichever fits your business. We both look at the same dashboard."
- Question 5: "How soon does it pay off?" / "Search builds slowly, then quickly. Technical and software fixes land in weeks; rankings and revenue usually move within months. The wait costs you nothing, because we're funding the climb."

## Application

- Tag: "Apply"
- Title: "Show us what you sell, and where you want more of it."
- Subtitle: "A person reads every application. If we're a fit, you'll hear back within a week."
- Fields: "Your name", "Work email", "What should grow?"
- Submit button: "Send application" (right-arrow chip)
- Success message: "Received. We'll read it and reply within a week."
- Validation messages: name "Tell us your name."; email "Enter a work email like name@company.com."; grow "Tell us what should grow."
- Send failure (inline, plain): "That did not send. Please try again, or write to us directly."
- Button while the request is in flight: "Sending"
- The form posts JSON (name, email, grow) to `NEXT_PUBLIC_APPLY_ENDPOINT` when set; unset, it validates and shows the success message without sending.

## Finale

- Wordmark: "Orange"
- Subtitle: "A growth partner paid from the harvest, not the hours."
- Footer: "© {year} Orange" and the contact email "hello@orange.io" (TODO: confirm the real address).
