# Home Kicker — Planner-First Landing (Design)

Date: 2026-09-24
Status: approved (mockup reviewed: one-line kicker + pitch placement C)
Scope: replace the 165px marketing hero with a one-line H1 kicker, move the descriptive paragraph
down next to the Practice Exams links, and delete the hero-collapse machinery plus the dead home
tour leftovers. No API, schema, route, or dependency changes.

## 1. Objective

The planner is now the product's front door: for users with no history it opens with a greeting,
three example groups and a tip (welcome gallery, `2026-09-24-welcome-gallery-design.md`). The old
hero above it — H1 plus a four-line description — consumed the first 165px of a 390×844 phone and
pushed the planner to y=264.

Measured before/after at 390×844 (new user):

| Element | Before | After |
| --- | --- | --- |
| Hero / kicker | y 83–248 (165px, H1 60 + sub 97) | y 83–106 (23px, one line) |
| Planner panel | y 264–788 | y 118–641 |
| Composer | y 713–777 | y 566–630 |
| Daily 5 | y 808–852 (below fold) | y 661–705 (above fold) |
| Practice Exams links | below fold | y 721–864 (mostly visible) |
| Pitch paragraph | hero | y 876–939 (with the exam links) |
| Page height | 1437px | 1365px |

Success criteria:

- The H1 ("AI Quiz & Exam Paper Generator for India") stays on one line at 390px and remains the
  only `<h1>` on the page.
- The planner panel starts above y=160 and the composer is fully on the first screen at 390×844.
- The descriptive paragraph remains visible, placed after the Practice Exams links (option C from
  the reviewed mockup) so the keyword copy is honest page content, never hidden.
- Typing no longer moves the kicker or the panel: the hero-collapse machinery is gone.
- Hindi (`/hi`) keeps a localized kicker and pitch.
- Meta title, description, OG/Twitter tags, canonical and the layout JSON-LD are untouched.

## 2. Tech stack

SvelteKit 2 / Svelte 5 runes, existing tokens and scoped CSS. No new dependencies. Playwright E2E
carries the layout contract; the locale-parity test covers the removed keys.

## 3. Changes

- `src/lib/client/pages/HomePage.svelte`
  - `.hero-block` (H1 + `homeSeoIntro` paragraph, 165px) → `h1.home-kicker` (one line, centered).
  - `homeSeoIntro` moves to `p.home-pitch` after the Practice Exams `<nav>` (option C).
  - Remove `heroCollapsed`, `HERO_SCROLL_THRESHOLD`, the collapse-on-state effect and the
    scroll/focus/pointer listeners. Nothing collapses any more; the kicker is static.
  - Styles: drop `.hero-block` / `.hero-heading` / `.hero-sub`, add `.home-kicker` (1.05rem,
    0.95rem under 480px, `text-wrap: balance`) and `.home-pitch` (0.82rem muted, centered).
- Dead onboarding leftovers removed (unused anywhere outside their own files): locale keys
  `welcomeTitle`, `welcomeBody`, `welcomeStep1-3Label/Desc`, `welcomeSummary`, `welcomeShowExample`,
  `welcomeDismiss`, `welcomeReopen`; `STORAGE_KEYS.HOME_TOUR_COMPLETED` (both constants files);
  `APP_EVENTS.OPEN_TOUR`.
- Copy keys are reused, not re-added: `homeH1` (kicker) and `homeSeoIntro` (pitch).

## 4. SEO and accessibility

- Title/description/OG/Twitter/canonical come from the route head and `SeoHead`; unchanged.
- The H1 remains visible and unique; the descriptive paragraph stays visible lower on the page, so
  no cloaking or hidden-text risk. `npm run verify:vercel` stays green (192 sitemap URLs, 190
  prerendered pages).
- The removed collapse animation also removes a layout-shift source between pointerdown and click
  on phones; the planner is the stable top element now.

## 5. Failure modes (written before the code)

1. The kicker wraps to two lines at phone width (the fold gain evaporates).
2. The panel still starts too low, or the composer falls below the fold.
3. The pitch paragraph disappears, moves above the tool, or the page ships more than one `<h1>`.
4. Typing (or a preview commit) shifts the kicker or the panel.
5. `/hi` loses the localized kicker or pitch, or wraps worse than English.
6. Console/hydration errors on the streamed home page.

## 6. Testing

E2E (`tests/e2e/home-layout.e2e.js`), evidence attached to `test-results/e2e-artifact.json`:

1. 390×844, `/`: kicker is one line (≤34px), no `.hero-block`, panel top ≤160, composer bottom
   ≤844 (covers 1, 2).
2. Pitch sits after both the planner and the Practice Exams nav; exactly one `<h1>` (covers 3).
3. Typing does not move the kicker or the panel (≤1px) (covers 4).
4. `/hi`: localized kicker and pitch, panel top ≤200 (covers 5). Case 1 also asserts zero console
   errors (covers 6).

Verification: `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`,
`npm run verify:vercel`.

## 7. Boundaries

- Always: en + hi together, visible copy stays visible, single H1, 44px targets untouched.
- Ask first: route/SEO structure changes (none planned).
- Never: hide the descriptive copy with CSS, break PWA/AdSense, touch the planner protocol.

## 8. Out of scope

- Navigation/header redesign, moving Daily 5, and A/B testing hero variants.
- Removing the descriptive paragraph from the page entirely.
- The results-page hero (separate feature, untouched).

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Kicker wraps on ≤320px screens | Low | 2-line wrap there is acceptable; E2E pins one line at 390 |
| Keyword copy moves below the fold | Low | Still visible, still the page's description text; meta unchanged |
| Removing the tour keys breaks an unseen consumer | Low | grep shows no usage outside locale/constants files; parity test covers en/hi |
