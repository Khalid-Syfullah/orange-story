# Phase 1 of 16: Project setup, fonts, tokens, copy and the deploy contract

You are building orange.io: one continuous scroll story in four chapters (The Model, The Work, The Terms, Questions) with a hero before them and an application and finale after, drawn by one raw WebGL canvas and scrolled as a clock. The whole design is specified in `docs/`. All phases build on each other in one repo; you start with no memory of earlier phases, so the repo and `docs/` are your only context.

## Rules

- **Source of truth:** `docs/STORY.md` (sections, scroll ranges, what is on screen), `docs/COPY.md` (exact copy), `docs/PAINTINGS.md` (assets and their files), `docs/TRANSITIONS.md` (every cut), `docs/MOTION-RULES.md` (how everything moves), `docs/CHECKS.md` (what passing means). Read the parts that apply before writing code.
- **One stage, one canvas:** raw WebGL 1. No Three.js, no React Three Fiber, no GSAP, no Lenis, no animation library for the stage. DOM text may use CSS transitions driven by progress.
- **Scroll is the clock:** everything scroll-driven is a pure function of smoothed progress `p` (0 to 1) and plays backwards exactly when scrolling up. Never key anything to raw `scrollY`, never set React state on every scroll frame.
- **Copy:** every on-screen string comes from `src/content/copy.ts`. Never type copy into components.
- **Art:** every image, video or frame sequence is referenced through the manifest in `src/content/art.ts` and served from `public/art/`. Placeholders exist for everything, so no phase waits for art.
- **Deploy contract (do not break it):** the EC2 deploy runs `npm ci`, `npm run build`, then serves the app with `npm start` on port 3000 under pm2; CI runs `npm run lint`, `npm run typecheck`, `npm run test --if-present` and `npm run build`. Keep all of these green.
- **Git:** do not run `git commit` or `git push` yourself. The skill commits and pushes after the check passes.
- **Finish** with 3 to 6 lines: what now exists, what is still a placeholder, and anything you could not verify.

## Task

Set up the foundation. No stage, no scenes yet.

1. **Stack:** Next.js (App Router, TypeScript, stable release), ESLint via `next lint`, no Tailwind, no component library. Scripts in `package.json`: `dev`, `build`, `start` (binds port 3000), `lint`, `typecheck` (`tsc --noEmit`). Do not add a `test` script yet (CI skips it when absent). `npm run build` must pass before you finish.
2. **Repo state:** the working tree holds only `.git`, `.github/`, `deploy/`, `.env.example`, `.gitignore`, `docs/`, `prompts/`, `skill/` and `.claude/`. A large set of files from the previous build shows as deleted in `git status`; that is intended. Keep `.gitignore` entries for `node_modules`, `.next`, `logs/`, `_to_delete/`, `art/source/`, `.env*` except `.env.example`, `*.tsbuildinfo`, `next-env.d.ts`.
3. **Fonts** with `next/font/google`, `display: swap`, size-adjusted fallbacks: Newsreader (display: optical size axis, weights 200 to 500, italic available), Geist (text, 400 and 500), Geist Mono (labels, 400 and 500). Expose `--font-display`, `--font-text`, `--font-mono`. One file owns font choice.
4. **Tokens** as CSS variables on `:root` in `src/app/globals.css`:
   - Colours: `--sky` #1F4E9C, `--sky-soft` #6F9BD6, `--milk` #F6F3EC, `--ink` #15130F, `--press` #0E0C0A, `--orange` #FF7A00 (the single accent), `--leaf` #476B35, `--marble` #ECE7DD, `--paper` #EFE6D2 (the sheet). Text on sky is `--milk`.
   - Type scale (fluid): `display-xxl` clamp(4rem, 2rem + 9vw, 11rem) Newsreader 300 (the finale wordmark uses 600); `display-xl` clamp(2.75rem, 1rem + 5.3vw, 5.5rem) Newsreader 300, tracking -0.02em, leading 0.95; `display-l` clamp(2rem, 1rem + 2.6vw, 3.25rem); `title` 1.625rem Newsreader 400; `lead` 1.25rem Newsreader 300; `body` 0.8125 to 0.9375rem Geist; `label` 0.6875rem Geist Mono 500 uppercase tracking 0.18em; `meta` 0.75rem Geist Mono uppercase tracking 0.04em.
   - Shapes: pill buttons (radius 999px, 1px border at 20% foreground, mono label, arrow chip); tags (radius 4px, 10% tint, mono uppercase, decorative, not focusable); hairlines 1px at 55% milk over paintings and 20% foreground on flat grounds; one easing curve `cubic-bezier(0.22, 1, 0.36, 1)`.
   - Layout: left hairline at 5.3% of the width (the rail sits on it), right hairline at 94.7%, top rule at 72px, mid rule at 70.5% of the height with a star mark on the left hairline; text column A from about 8% of the width, column B from about 24%; side gutter never under 16px.
5. **Copy module** `src/content/copy.ts`: every string from `docs/COPY.md`, typed and grouped (chrome, hero, model, work, terms, questions, application, finale), wording exactly as written.
6. **Art manifest** `src/content/art.ts`: one typed entry per asset id in `docs/PAINTINGS.md` with kind (`loop`, `still`, `frames`), aspect, tier paths under `/art/<id>/`, frame count for sequences (read from `manifest.json` at runtime), and the painting's anchor points that later phases need (hero glint, can spout, seam point of the `share` keyframe, canopy nearest orange, application fingertip), all in painting coordinates 0..1 with y down, as editable numbers with comments.
7. **Pages:** `src/app/page.tsx` renders a placeholder stage container (full-bleed `--sky` block with the hero title and subtitle in the type scale) so the build and the deploy health check have a page; `src/app/design/page.tsx` (dev only, not linked) shows the type scale, swatches, buttons, tags, hairlines with star marks.
8. **README.md** at the root: what the site is, the stack, the scripts, how the prompt pack and skill build it (`/build-orange`), where art goes (`docs/PAINTINGS.md`), and the deploy flow (link to `deploy/README.md`).
9. Verify `npm run lint`, `npm run typecheck`, `npm run build`, and that `npm start` serves `/` on port 3000.
