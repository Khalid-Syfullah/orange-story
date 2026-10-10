# Technique reference (measured on pear.no)

These notes record *how* the reference site is built and paced, measured by loading and scrolling it. Use them for structure, timing and interaction feel only. Orange uses its own copy, art, fonts and code.

## Stage and pacing
- One tall section (about 53 screens of scrolling) holds a fixed stack of layers: a persistent WebGL canvas, separate canvases for transitions, a flying element and text effects, a 2D hairline canvas, then DOM text and chrome. Scrolling is native.
- Chapters start at fixed fractions of the whole stage: about 0.012, 0.232, 0.400 and 0.628. The ruler label switches exactly there.
- Text beats hold for about 1.3 screens of scrolling, with gaps of about 0.3 screen between them. Only one beat per slot is visible at a time; the next replaces it in the same place. The hero copy leaves within the first screen.
- Long stretches have no text at all while the camera and art move. That is deliberate.

## Chrome
- A left ruler with the chapter list. The active chapter shows its name beside a short rule; the rest show as ticks; hovering reveals all of them as "Ch. N" plus a name.
- A progress line in the ruler built from about 11 SVG segments. Each segment covers one stretch of the stage (its start and end progress are stored on the element), and its length is proportional to that stretch, so short ticks mark beat changes and long segments mark long camera moves. Segments fill with stroke-dashoffset.
- Hairlines are thin SVG paths with a slight hand-drawn wobble, with small four-point stars where they cross. Each line part has an exit direction (left, right, up, down, or a corner); on chapter changes vertical lines slide out sideways, horizontal ones up and down, and the corner crosses travel to the corners and lock there.
- Buttons are pills (fully rounded, 1px border at about 20% white, an inset top highlight, monospace caps with wide tracking, an arrow in a small square chip). Tags are tiny 4px-radius chips at about 10% white with monospace caps.

## Type
- Display: a light (300) high-contrast serif around 56px on desktop, tracking about -0.02em, line-height about 0.88. Section titles 26 to 34px.
- Text: a neutral grotesque at 13 to 20px. Labels: monospace caps 9 to 12px, tracking 0.04em (meta) to 0.18em (buttons).
- Headlines reveal per character (each letter is its own span).

## Text and cards
- Service cards sit in fixed groups in the right column and swap in place as the stage advances; thin line graphics tie the items together.
- Terms blocks are fixed groups that swap the same way.

## Questions
- All five question cards live in one pinned container. One shared SVG connector (a line plus a small square) is re-pointed for each card: the line end stays on a fixed anchor while the square follows the active card's corner.
- Each card has a pair of small four-point sparkle stars.

## Application form
- Fields are pill-shaped, transparent, with a small icon each; a soft glowing orb sits behind the form.
- Focus and hover work by contrast: the active field stays sharp while the others fade and blur (opacity over about 0.3s, blur over about 0.35s, same easing curve as everything else).

## Finale
- A drawn square frame (a viewfinder box) closes in around the wordmark, with small stars and the mark inside.

## Easing
- One curve everywhere: cubic-bezier(0.22, 1, 0.36, 1).
